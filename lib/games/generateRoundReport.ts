import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminClient } from '@/lib/supabase/admin';
import { buildModeResultForGame } from '@/lib/scoring/buildModeResultForGame';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { getGameWithPlayers } from './getGameWithPlayers';
import { buildRoundReportFacts } from './roundReportFacts';
import { buildRoundReportPrompt, sanitizeRoundReport } from './roundReportPrompt';

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 800;
const TIMEOUT_MS = 20_000;
const MAX_RETRIES = 1;
const MIN_SCORED_HOLES = 6;
const PLAYER_FALLBACK = 'Ukjent spiller';

export type RoundReportStatus = 'generated' | 'skipped' | 'failed';

/**
 * Return shape of `generateAndPersistRoundReport`. `report` carries the
 * sanitized text when `status === 'generated'` so callers (the two
 * end-actions) can thread it straight into the game-finished mail blast
 * without re-fetching `games.round_report` — `null` for every other status.
 */
export type RoundReportResult = {
  status: RoundReportStatus;
  report: string | null;
};

/**
 * Generates a short Norwegian AI round-report from a (nettopp) avsluttet
 * spill's final leaderboard facts, and persists it to `games.round_report`
 * (#1008 — Pressetribunen v1). Mirrors `persistResultSummaries`'s shape:
 * admin client, whole-body try/catch, `console.error` + return status,
 * **NEVER throws**.
 *
 * ## VAPID-style silent degrade (#1008 decision 4)
 *
 * No `ANTHROPIC_API_KEY` → returns `'skipped'` WITHOUT constructing the SDK
 * client, same pattern as `lib/notifications/push/vapid.ts`'s
 * `isConfigured()`. No separate feature flag — key presence IS the gate.
 * This is the designed rollout: prod has no key until the owner adds it, so
 * the feature stays dark until then.
 *
 * ## Never contradicts the leaderboard (#1008 decision 9)
 *
 * The LLM never aggregates raw scores — it only sees the deterministic
 * `RoundReportFacts` JSON built by `buildRoundReportFacts` (itself built on
 * `buildShareCardData`, the same shaper the leaderboard/share-card use).
 *
 * ## Thin-data guard (#1008 decision 3)
 *
 * `buildModeResultForGame` returning `null` → `'skipped'` (mirrors the
 * `result_summary` 🏆-fallback contract). Fewer than 6 scored holes →
 * `'skipped'` — there's no story to tell yet.
 *
 * ## Best-effort (#1008 decision throughout)
 *
 * Every failure mode (missing key, thin data, SDK error, sanitizer
 * rejection, 0-row write) is logged with the `[generateRoundReport]` prefix
 * and returns `{ status: 'failed', report: null }` — a report failure must
 * NEVER block the finish flow. Callers (the two end-actions) treat the
 * return value as informational only.
 *
 * Called by both end-actions (chunk 3, not this module):
 *   - `endGame`                (`app/[locale]/admin/games/[id]/actions.ts`)
 *   - `endGameWithSideWinners` (`app/[locale]/admin/games/[id]/avslutt/actions.ts`)
 */
export async function generateAndPersistRoundReport(
  gameId: string,
): Promise<RoundReportResult> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { status: 'skipped', report: null };

    const gwp = await getGameWithPlayers(gameId);
    if (!gwp) {
      console.error('[generateRoundReport] game not found', { gameId });
      return { status: 'failed', report: null };
    }
    const { game, players } = gwp;

    const admin = getAdminClient();

    const result = await buildModeResultForGame(admin, {
      id: game.id,
      game_mode: game.game_mode,
      mode_config: game.mode_config,
      course_id: game.course_id,
    });
    if (result === null) return { status: 'skipped', report: null };

    // WD-spillere er ute av rankingen (samme filtrering som
    // notifyAchievementUnlocks) — de skal aldri dukke opp i referatet.
    const nameByUserId = new Map<string, string>();
    for (const p of players) {
      if (p.withdrawn_at != null || !p.users) continue;
      nameByUserId.set(p.user_id, formatRevealName(p.users.name ?? PLAYER_FALLBACK, p.users.nickname));
    }

    const [courseRes, holesRes] = await Promise.all([
      admin.from('courses').select('name').eq('id', game.course_id).single<{ name: string }>(),
      admin.from('course_holes').select('par_mens').eq('course_id', game.course_id).returns<{ par_mens: number }[]>(),
    ]);
    const courseName = courseRes.data?.name ?? null;
    const coursePar = holesRes.data ? holesRes.data.reduce((sum, h) => sum + h.par_mens, 0) : null;

    const gameMetaRes = await admin
      .from('games')
      .select('ended_at')
      .eq('id', gameId)
      .single<{ ended_at: string | null }>();
    const endedAt = gameMetaRes.data?.ended_at ?? null;

    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameName: game.name,
      courseName,
      endedAt,
      gameMode: game.game_mode,
      coursePar,
    });

    if (facts.scoredHoles < MIN_SCORED_HOLES) return { status: 'skipped', report: null };

    const { system, user } = buildRoundReportPrompt(facts);

    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const rawText = response.content
      .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const sanitized = sanitizeRoundReport(rawText);
    if (sanitized === null) {
      console.error('[generateRoundReport] sanitizer rejected model output', {
        gameId,
        rawLength: rawText.length,
      });
      return { status: 'failed', report: null };
    }

    const updateRes = await admin
      .from('games')
      .update({ round_report: sanitized })
      .eq('id', gameId)
      .select('id');

    if (updateRes.error) {
      console.error('[generateRoundReport] persist failed', { gameId, error: updateRes.error });
      return { status: 'failed', report: null };
    }
    // PostgREST 0-row trap (lib/supabase/AGENTS.md #2): error === null on a
    // write that matched nothing. Treat as failure, not silent success.
    if (!updateRes.data || updateRes.data.length === 0) {
      console.error('[generateRoundReport] update affected 0 rows', { gameId });
      return { status: 'failed', report: null };
    }

    return { status: 'generated', report: sanitized };
  } catch (err) {
    console.error('[generateRoundReport] failed', { gameId, err });
    return { status: 'failed', report: null };
  }
}
