import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import {
  NARRATIVE_ATTEMPTS,
  NARRATIVE_EFFORT,
  NARRATIVE_MAX_RETRIES,
  NARRATIVE_MAX_TOKENS,
  NARRATIVE_MODEL,
  NARRATIVE_RETRY_MIN_MS,
  NARRATIVE_TIMEOUT_MS,
} from '@/lib/ai/narrative';
import { getAdminClient } from '@/lib/supabase/admin';
import { buildModeResultForGame } from '@/lib/scoring/buildModeResultForGame';
import { readAiAllowedUserIds } from '@/lib/ai/consent';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { buildFlightLeagueFacts, type FlightLeagueFacts } from '@/lib/league/flightLeagueFacts';
import { getGameWithPlayers } from './getGameWithPlayers';
import { buildRoundReportFacts, factsShowAnyPlayer, reportName } from './roundReportFacts';
import { gameNameMentions } from '@/lib/ai/gameNameGuard';
import { buildRoundReportPrompt, checkRoundReport } from './roundReportPrompt';
import { holeCountForSegment, isHoleInSegment } from './holeScope';

// Modell, innsats, token-tak, timeout og retries deles med Kavalkadens
// innledning (#2128) — `lib/ai/narrative.ts` er hjemmet, så de to AI-tekstene
// ikke driver fra hverandre neste gang noen bytter modell.
const MIN_SCORED_HOLES = 6;

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

    // #1441 (D3): a derived game (e.g. a back9 singles match) is never its
    // own report subject — the AI referat is generated for the HOST only
    // (endGame/endGameWithSideWinners call this with the host's id; the
    // derived-game fan-out in finishDerivedGames deliberately does not call
    // this at all). Guard defensively in case some future call-site ever
    // passes a derived game's id directly.
    if (game.source_game_id) {
      return { status: 'skipped', report: null };
    }

    const admin = getAdminClient();

    const result = await buildModeResultForGame(admin, {
      id: game.id,
      game_mode: game.game_mode,
      mode_config: game.mode_config,
      course_id: game.course_id,
      hole_segment: game.hole_segment,
    });
    if (result === null) return { status: 'skipped', report: null };

    // WD-spillere er ute av rankingen (samme filtrering som
    // notifyAchievementUnlocks) — de skal aldri dukke opp i referatet.
    // #2983: a league flight names players as the league's news story does.
    const leagueFlight = game.league_round_id != null;
    const activePlayers = players.filter((p) => p.withdrawn_at == null);
    const nameByUserId = new Map<string, string>();
    for (const p of activePlayers) {
      if (!p.users) continue;
      nameByUserId.set(p.user_id, reportName(p.users, leagueFlight));
    }

    // #2561 PR B: only players who said yes reach the model. Nobody → no
    // report and no model call. A read error reads as nobody (fail closed).
    // Everyone in the game is read, withdrawn players too: they are not in
    // the facts, but the game name may name them.
    const aiAllowedUserIds = await readAiAllowedUserIds(
      admin,
      players.map((p) => p.user_id),
    );
    if (aiAllowedUserIds.size === 0) return { status: 'skipped', report: null };
    // The game name is free text and may name someone who said no («Olas
    // 50-årsdag»). Everyone in the game counts, withdrawn players too.
    const unconsenting = players
      .filter((p) => !aiAllowedUserIds.has(p.user_id))
      .map((p) => ({ name: p.users?.name ?? null, nickname: p.users?.nickname ?? null }));

    const [courseRes, holesRes] = await Promise.all([
      admin.from('courses').select('name').eq('id', game.course_id).single<{ name: string }>(),
      admin
        .from('course_holes')
        .select('hole_number, par_mens')
        .eq('course_id', game.course_id)
        .returns<{ hole_number: number; par_mens: number }[]>(),
    ]);
    const courseName = courseRes.data?.name ?? null;
    // #1441: only the holes in the game's segment — a segment host's par
    // should read as ~36 (its own 9 holes), not the full 72. Per hole, so the
    // vs-par labels count only the holes a competitor played (#2217).
    const scopedHoles = (holesRes.data ?? []).filter((h) =>
      isHoleInSegment(h.hole_number, game.hole_segment),
    );
    const parByHole = new Map(scopedHoles.map((h) => [h.hole_number, h.par_mens]));

    // #2983: how the flight stands in the league right now. Null without it.
    const league =
      game.league_round_id != null
        ? await readFlightLeague(
            admin,
            gameId,
            game.league_round_id,
            activePlayers.map((p) => p.user_id),
            aiAllowedUserIds,
          )
        : null;

    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameName: gameNameMentions(game.name, unconsenting) ? null : game.name,
      courseName,
      gameMode: game.game_mode,
      parByHole,
      totalHoles: holeCountForSegment(game.hole_segment),
      // #2712: a league flight crowns nobody.
      leagueFlight,
      activePlayerCount: activePlayers.length,
      league,
      aiAllowedUserIds,
    });

    if (facts.scoredHoles < MIN_SCORED_HOLES) return { status: 'skipped', report: null };
    // #2561: someone said yes, but nobody the facts may show did.
    const shownNames = new Set(
      [...aiAllowedUserIds].flatMap((id) => nameByUserId.get(id) ?? []),
    );
    if (!factsShowAnyPlayer(facts, shownNames)) return { status: 'skipped', report: null };

    const client = new Anthropic({
      apiKey,
      timeout: NARRATIVE_TIMEOUT_MS,
      maxRetries: NARRATIVE_MAX_RETRIES,
    });
    // #2983: a draft the check drops gets one more attempt, told why, within
    // the same deadline (as the league's news story, `roundNews.ts`).
    const deadline = Date.now() + NARRATIVE_TIMEOUT_MS;
    let fault: string | null = null;
    let sanitized: string | null = null;
    for (let attempt = 1; attempt <= NARRATIVE_ATTEMPTS; attempt++) {
      const timeLeft = deadline - Date.now();
      if (attempt > 1 && timeLeft < NARRATIVE_RETRY_MIN_MS) break;

      const { system, user } = buildRoundReportPrompt(facts, fault);
      const response = await client.messages.create(
        {
          model: NARRATIVE_MODEL,
          max_tokens: NARRATIVE_MAX_TOKENS,
          output_config: { effort: NARRATIVE_EFFORT },
          system,
          messages: [{ role: 'user', content: user }],
        },
        { timeout: timeLeft },
      );
      console.log('[generateRoundReport] model call', {
        gameId,
        attempt,
        stopReason: response.stop_reason,
        usage: response.usage,
      });

      // A stop at the token cap (or a refusal) leaves a cut-off or empty text;
      // the check only reads a finished text, so check the stop here.
      if (response.stop_reason !== 'end_turn') {
        console.error('[generateRoundReport] model stopped early', {
          gameId,
          attempt,
          stopReason: response.stop_reason,
        });
        fault = 'Utkastet ble avbrutt før det var ferdig.';
        continue;
      }

      const rawText = response.content
        .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
      const check = checkRoundReport(rawText, facts);
      if (check.report !== null) {
        sanitized = check.report;
        break;
      }
      fault = check.fault;
      console.error('[generateRoundReport] the draft is dropped', { gameId, attempt, fault });
    }
    if (sanitized === null) return { status: 'failed', report: null };

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

/**
 * #2983: the league block for a league flight's report, or null. Reads the
 * round's league and the league snapshot with a baseline without this
 * flight's cards (`getLigaSnapshot`). The flight is finished when this runs,
 * so its cards are in the table «now». Never throws: a failed read is logged
 * and the report is written as before, without the league.
 */
async function readFlightLeague(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
  roundId: string,
  flightUserIds: string[],
  aiAllowedUserIds: ReadonlySet<string>,
): Promise<FlightLeagueFacts | null> {
  try {
    const { data, error } = await admin
      .from('league_rounds')
      .select('league_id')
      .eq('id', roundId)
      .single<{ league_id: string }>();
    if (error || !data) throw error ?? new Error(`league round ${roundId} not found`);
    const snapshot = await getLigaSnapshot(data.league_id, { baseline: { withoutGameId: gameId } });
    if (!snapshot) return null;
    // The players passed are in the league, not in the flight: their answer
    // is read too (found on staging 27.11). A read error reads as nobody.
    const others = snapshot.participants.map((p) => p.userId).filter((id) => !flightUserIds.includes(id));
    const leagueAllowed = new Set([...aiAllowedUserIds, ...(await readAiAllowedUserIds(admin, others))]);
    return buildFlightLeagueFacts({ snapshot, roundId, flightUserIds, aiAllowedUserIds: leagueAllowed });
  } catch (err) {
    console.error('[generateRoundReport] league read failed, the report goes without it', { gameId, err });
    return null;
  }
}

