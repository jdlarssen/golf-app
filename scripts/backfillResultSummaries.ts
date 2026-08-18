/**
 * Vedlikeholds-script for `game_players.result_summary` (#572, #1509).
 *
 * Bruker `persistResultSummaries` — nøyaktig samme beregning som `endGame` —
 * så script og live-flyt aldri driver fra hverandre. Idempotent: kjør den så
 * mange ganger du vil, hver kjøring overskriver trygt.
 *
 * ## Slik kjører du den
 *
 * **Staging først — alltid.** `.env.staging.local` peker på `torny-staging`;
 * det er den eneste basen scriptet skal møte uten videre. En prod-kjøring
 * (`.env.local`) er en skrivende operasjon mot ekte data og er dekket av
 * prod-brannmuren (#1074) — den krever eksplisitt eier-godkjenning i økten,
 * aldri på eget initiativ.
 *
 * `--tsconfig scripts/tsconfig.json` er ikke valgfritt: lib-modulene starter
 * med `import 'server-only'`, en Next-markør som ikke er en installert pakke,
 * og uten den lokale tsconfig-en dør tsx på `Cannot find module 'server-only'`
 * før første linje kjører. Se `scripts/tsconfig.json`.
 *
 * ## To modi
 *
 * **Standard (uten flagg): full omregning av ALLE avsluttede spill.** Scriptet
 * filtrerer IKKE på `result_summary = null` — hver avsluttet-spill-rad regnes
 * på nytt og overskrives. Det er billig i dagens datasett (~30 spill), men vær
 * klar over bredden før du kjører den. Etter segment-fiksen (#1509) skriver
 * standardmodus også sammendrag for avledede spill (`source_game_id` satt) og
 * segment-spill (front9/back9) — de no-op-et tidligere fordi scriptet regnet
 * dem over feil hull-sett.
 *
 *   npx tsx --env-file=.env.staging.local --tsconfig scripts/tsconfig.json \
 *     scripts/backfillResultSummaries.ts
 *
 * **Reparasjon (`--repair-matchplay-margins`, #1509):** kun spill som har minst
 * én spiller-rad med et `matchplay`-sammendrag der marginen ender på «up»
 * («2up», «1up» — motoren skriver dem uten mellomrom). Uavgjorte matcher lagrer
 * `margin: null` og blir aldri kandidater; `placement`/`skins` har ingen margin
 * og filtreres bort av kind-sjekken. Kandidatene regnes om med samme helper som
 * standardmodus, og scriptet leser `result_summary` FØR og ETTER per rad og
 * logger gammel→ny — loggen er diffen og beviset (`persistResultSummaries`
 * returnerer bare et antall og fanger ikke 0-rad-skriv).
 *
 *   npx tsx --env-file=.env.staging.local --tsconfig scripts/tsconfig.json \
 *     scripts/backfillResultSummaries.ts --repair-matchplay-margins
 *
 * Krever `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` i miljøet.
 */
import { getAdminClient } from '@/lib/supabase/admin';
import { persistResultSummaries } from '@/lib/games/persistResultSummaries';
import type { HoleSegment } from '@/lib/scoring';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import type {
  GameMode,
  GameModeConfig,
} from '@/lib/scoring/modes/types';

const REPAIR_FLAG = '--repair-matchplay-margins';

interface FinishedGameRow {
  id: string;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  course_id: string;
  // #1509: both are required for a correct recompute. Without hole_segment a
  // front9/back9 game computes over all 18 holes; without source_game_id a
  // derived game reads its own (empty) scores. Either way matchplay yields no
  // result → persistResultSummaries writes 0 rows and the run silently no-ops.
  hole_segment: HoleSegment;
  source_game_id: string | null;
}

interface PlayerSummaryRow {
  game_id: string;
  user_id: string;
  result_summary: unknown;
}

const GAME_SELECT =
  'id, game_mode, mode_config, course_id, hole_segment, source_game_id';

/** The one `kind` this script cares about, tied to the real union so it can't drift. */
const MATCHPLAY_KIND: Extract<ResultSummary, { kind: 'matchplay' }>['kind'] =
  'matchplay';

/**
 * A matchplay summary as it is actually stored in jsonb. `outcome` stays
 * `unknown` on purpose: this is arbitrary DB content, and the log prints it
 * raw rather than asserting it into the union — a malformed value should show
 * up in the output, not be laundered by a cast.
 */
interface StoredMatchplaySummary {
  outcome: unknown;
  margin: string | null;
}

/** Narrows a raw jsonb value to a matchplay summary, or null if it is not one. */
function asMatchplaySummary(value: unknown): StoredMatchplaySummary | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== MATCHPLAY_KIND) return null;
  const margin = candidate.margin;
  if (margin !== null && typeof margin !== 'string') return null;
  return { outcome: candidate.outcome, margin };
}

/** True for the exact shape #1509 repairs: a matchplay margin ending in 'up'. */
function hasUpMargin(value: unknown): boolean {
  const summary = asMatchplaySummary(value);
  return summary !== null && summary.margin !== null && summary.margin.endsWith('up');
}

/** One-line rendering of a stored summary, for the before/after log. */
function describeSummary(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  const matchplay = asMatchplaySummary(value);
  if (matchplay !== null) {
    return `${String(matchplay.outcome)} ${matchplay.margin ?? 'AS'}`;
  }
  return JSON.stringify(value);
}

async function fetchFinishedGames(
  admin: ReturnType<typeof getAdminClient>,
): Promise<FinishedGameRow[]> {
  const { data, error } = await admin
    .from('games')
    .select(GAME_SELECT)
    .eq('status', 'finished')
    .returns<FinishedGameRow[]>();

  if (error) throw new Error(`could not list finished games: ${error.message}`);
  return data ?? [];
}

async function fetchPlayerSummaries(
  admin: ReturnType<typeof getAdminClient>,
  gameIds: string[],
): Promise<PlayerSummaryRow[]> {
  if (gameIds.length === 0) return [];
  const { data, error } = await admin
    .from('game_players')
    .select('game_id, user_id, result_summary')
    .in('game_id', gameIds)
    .returns<PlayerSummaryRow[]>();

  if (error) throw new Error(`could not read result summaries: ${error.message}`);
  return data ?? [];
}

/**
 * Default mode: recompute every finished game. Unchanged since #572 apart from
 * the segment fields now flowing through (#1509).
 */
async function runFullBackfill(games: FinishedGameRow[]): Promise<void> {
  console.log(`[backfill] ${games.length} finished game(s) to process`);

  let totalRows = 0;
  for (const game of games) {
    const written = await persistResultSummaries(game);
    totalRows += written;
    console.log(`[backfill] ${game.id} (${game.game_mode}) → ${written} row(s)`);
  }

  console.log(`[backfill] done — ${totalRows} player row(s) updated`);
}

/**
 * Repair mode (#1509): recompute only the games that still carry an 'up'
 * matchplay margin, and prove the effect by logging every player row's stored
 * summary before and after.
 */
async function runMatchplayMarginRepair(
  admin: ReturnType<typeof getAdminClient>,
  games: FinishedGameRow[],
): Promise<void> {
  const before = await fetchPlayerSummaries(
    admin,
    games.map((g) => g.id),
  );

  const candidateGameIds = new Set(
    before.filter((row) => hasUpMargin(row.result_summary)).map((row) => row.game_id),
  );
  const candidates = games.filter((game) => candidateGameIds.has(game.id));

  console.log(
    `[repair] ${candidates.length} candidate game(s) of ${games.length} finished ` +
      `(matchplay summary with an 'up' margin)`,
  );
  if (candidates.length === 0) {
    console.log('[repair] nothing to repair');
    return;
  }

  const beforeByRow = new Map(
    before.map((row) => [`${row.game_id}:${row.user_id}`, row.result_summary]),
  );

  let totalRows = 0;
  const emptyGames: string[] = [];
  const unverifiedGames: string[] = [];
  for (const game of candidates) {
    const written = await persistResultSummaries(game);
    totalRows += written;
    if (written === 0) emptyGames.push(game.id);

    console.log(
      `[repair] ${game.id} (${game.game_mode}, segment=${game.hole_segment}` +
        `${game.source_game_id ? ', derived' : ''}) → ${written} row(s) written`,
    );

    // The after-read is the proof, not the work: if it fails, the recompute
    // for this game has already happened and the remaining candidates still
    // deserve their turn. Log it, mark this game's diff unverifiable, move on.
    let after: PlayerSummaryRow[] | null = null;
    try {
      after = await fetchPlayerSummaries(admin, [game.id]);
    } catch (err) {
      unverifiedGames.push(game.id);
      console.error(`[repair]   after-read failed for ${game.id}`, err);
    }

    if (after === null) {
      for (const row of before.filter((r) => r.game_id === game.id)) {
        const oldText = describeSummary(row.result_summary);
        console.log(`[repair]   ${row.user_id}: ${oldText} → ? (unverifiable)`);
      }
      continue;
    }

    for (const row of after) {
      const oldSummary = beforeByRow.get(`${game.id}:${row.user_id}`);
      const oldText = describeSummary(oldSummary);
      const newText = describeSummary(row.result_summary);
      const marker = oldText === newText ? 'unchanged' : 'CHANGED';
      console.log(`[repair]   ${row.user_id}: ${oldText} → ${newText} (${marker})`);
    }
  }

  if (emptyGames.length > 0) {
    console.log(
      `[repair] ${emptyGames.length} candidate game(s) got 0 rows updated: ` +
        `${emptyGames.join(', ')}. That is either "no result could be computed" ` +
        `or "every row write failed" — persistResultSummaries returns 0 for both. ` +
        `Check the [persistResultSummaries] lines above to tell them apart.`,
    );
  }
  if (unverifiedGames.length > 0) {
    console.log(
      `[repair] ${unverifiedGames.length} candidate game(s) could not be verified ` +
        `(after-read failed): ${unverifiedGames.join(', ')}. Re-run to confirm.`,
    );
  }
  console.log(
    `[repair] done — ${totalRows} player row(s) rewritten across ` +
      `${candidates.length} candidate game(s)`,
  );
}

async function main() {
  const admin = getAdminClient();
  const repairMode = process.argv.includes(REPAIR_FLAG);

  const games = await fetchFinishedGames(admin);

  if (repairMode) {
    await runMatchplayMarginRepair(admin, games);
  } else {
    await runFullBackfill(games);
  }
}

main().catch((err) => {
  console.error('[backfill] fatal', err);
  process.exitCode = 1;
});
