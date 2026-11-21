/**
 * Backfill for `game_players.full_course_handicap` (migration 0254) and the
 * score differentials it corrects. Owner-ordered audit 20.11, finding F1 in
 * docs/regelbok-gjennomgang.md: the WHS net double bogey uses the full course
 * handicap (NGF 3.1b, s. 31), but rounds frozen before 0254 only stored the
 * playing handicap after the game's share and cap.
 *
 * ## What it does
 *
 * 1. Every roster row in a started round (active or finished) with a frozen
 *    `course_handicap` and no `full_course_handicap` gets the full number from
 *    `planFullCourseHandicap` (lib/games/fullCourseHandicapBackfill.ts): the
 *    frozen number itself when no share or cap could apply, otherwise the
 *    index (handicap_history at the round's start, the profile, older
 *    history) that reproduces the frozen playing handicap exactly. A row stays
 *    null, listed with its reason, when no index reproduces it, when indexes
 *    that reproduce it disagree on the full number (a cap or a low share), or
 *    when the tee has no rating. Rows in rounds not started yet are skipped:
 *    the start freezes them.
 * 2. In finished rounds with a personal differential (not a team-ball
 *    format), a row with a known full number is recomputed with
 *    `computePlayerDifferential`, the function the freeze at the end of a
 *    round uses, when its frozen differential came from a different number
 *    (corrected) or it has none (frozen now: a round that started before the
 *    new code and finished before this run).
 *
 * Without `--write` it only reads and prints the preview. With `--write` it
 * writes exactly the previewed rows, one update per row, each asserted as one
 * row and guarded on the value the preview read (so a row changed in between
 * is refused, not overwritten). Safe to re-run at any time: a second run finds
 * nothing to do. Run it again after each app release, since app builds older
 * than this change start rounds without the full number.
 *
 * ## How to run it
 *
 * **Staging first — always.** `.env.staging.local` points at `torny-staging`.
 * The script checks the database before the first call and prints it.
 * Production needs `.env.local` plus the flag `--prod`, also for the preview
 * (it reads with the service-role key). A production run with `--write` is a
 * write to real data, covered by the prod firewall (#1074): it needs the
 * owner's explicit approval in the session, never on own initiative. Order:
 * migration 0254 first, then the app code, then this script.
 *
 *   npx tsx --env-file=.env.staging.local --tsconfig scripts/tsconfig.json \
 *     scripts/backfillFullCourseHandicap.ts            # preview
 *   npx tsx --env-file=.env.staging.local --tsconfig scripts/tsconfig.json \
 *     scripts/backfillFullCourseHandicap.ts --write    # writes
 *
 * `--tsconfig scripts/tsconfig.json` is required: the lib modules start with
 * `import 'server-only'` (see scripts/tsconfig.json).
 *
 * Needs `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
 */
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import { expectOne } from '@/lib/supabase/affectedRows';
import { scriptTargetRefusal, supabaseTargetOf } from '@/lib/supabaseTarget';
import { getRatingForGender, type TeeBoxRatings, type TeeGender } from '@/lib/games/teeRating';
import {
  indexCandidates,
  planFullCourseHandicap,
  roundStart,
} from '@/lib/games/fullCourseHandicapBackfill';
import { computePlayerDifferential } from '@/lib/games/persistScoreDifferentials';
import { modeCollapsesToTeamCard, type GameMode } from '@/lib/scoring/modes/types';

const PROD_FLAG = '--prod';
const WRITE_FLAG = '--write';

type GameRow = {
  id: string;
  status: string;
  game_mode: string;
  hcp_allowance_pct: number;
  hcp_max_strokes: number | null;
  tee_box_id: string | null;
  course_id: string | null;
  started_at: string | null;
  scheduled_tee_off_at: string | null;
  created_at: string;
};

type PlayerRow = {
  game_id: string;
  user_id: string;
  tee_gender: TeeGender | null;
  course_handicap: number | null;
  full_course_handicap: number | null;
  score_differential: number | null;
};

type HoleRow = {
  course_id: string;
  hole_number: number;
  par_mens: number | null;
  par_ladies: number | null;
  par_juniors: number | null;
  stroke_index: number;
};

const TEE_SELECT =
  'id, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors';

/** First 8 characters of an id: enough to find the row, short enough to read. */
const short = (id: string) => id.slice(0, 8);

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** `.in()` reads in chunks of 100 ids: a long id list overflows the PostgREST URL. */
async function readIn<T>(
  ids: string[],
  read: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  context: string,
): Promise<T[]> {
  const out: T[] = [];
  for (const chunk of chunks(ids, 100)) {
    out.push(...(await selectAllRows((from, to) => read(chunk, from, to), context)));
  }
  return out;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const refusal = scriptTargetRefusal({ url, wantProd: process.argv.includes(PROD_FLAG) });
  if (refusal !== null) throw new Error(refusal);
  const write = process.argv.includes(WRITE_FLAG);
  console.log(
    `[fch] ${write ? 'WRITING to' : 'preview (read-only) of'} ${supabaseTargetOf(url)} (${new URL(url ?? '').host})`,
  );

  const admin = getAdminClient();

  // ── Read ────────────────────────────────────────────────────────────────
  const games = await selectAllRows<GameRow>(
    (from, to) =>
      admin
        .from('games')
        .select(
          'id, status, game_mode, hcp_allowance_pct, hcp_max_strokes, tee_box_id, course_id, started_at, scheduled_tee_off_at, created_at',
        )
        .in('status', ['active', 'finished'])
        .order('id')
        .range(from, to),
    'games',
  );
  const gameById = new Map(games.map((g) => [g.id, g]));

  const players = await readIn<PlayerRow>(
    games.map((g) => g.id),
    (chunk, from, to) =>
      admin
        .from('game_players')
        .select('game_id, user_id, tee_gender, course_handicap, full_course_handicap, score_differential')
        .in('game_id', chunk)
        .not('course_handicap', 'is', null)
        .order('game_id')
        .order('user_id')
        .range(from, to),
    'game_players',
  );

  const teeIds = [...new Set(games.map((g) => g.tee_box_id).filter((id): id is string => !!id))];
  const tees = await readIn<TeeBoxRatings & { id: string }>(
    teeIds,
    (chunk, from, to) => admin.from('tee_boxes').select(TEE_SELECT).in('id', chunk).order('id').range(from, to),
    'tee_boxes',
  );
  const teeById = new Map(tees.map((t) => [t.id, t]));

  const missing = players.filter((p) => p.full_course_handicap === null);
  const userIds = [...new Set(missing.map((p) => p.user_id))];
  const users = await readIn<{ id: string; hcp_index: number | string | null }>(
    userIds,
    (chunk, from, to) => admin.from('users').select('id, hcp_index').in('id', chunk).order('id').range(from, to),
    'users',
  );
  const profileIndex = new Map(users.map((u) => [u.id, u.hcp_index]));
  const history = await readIn<{ user_id: string; hcp_index: number | string; recorded_at: string }>(
    userIds,
    (chunk, from, to) =>
      admin
        .from('handicap_history')
        .select('user_id, hcp_index, recorded_at')
        .in('user_id', chunk)
        .order('id')
        .range(from, to),
    'handicap_history',
  );
  const historyByUser = new Map<string, typeof history>();
  for (const h of history) {
    const list = historyByUser.get(h.user_id) ?? [];
    list.push(h);
    historyByUser.set(h.user_id, list);
  }

  // ── Step 1: the full course handicap per row ────────────────────────────
  const fills: Array<{ row: PlayerRow; full: number; source: string }> = [];
  const unresolved: Array<{ row: PlayerRow; reason: string }> = [];
  for (const row of missing) {
    const game = gameById.get(row.game_id);
    if (!game) continue;
    const tee = game.tee_box_id ? teeById.get(game.tee_box_id) : undefined;
    const rating = tee ? getRatingForGender(tee, row.tee_gender ?? 'mens') : null;
    const plan = planFullCourseHandicap({
      gameMode: game.game_mode,
      storedPct: game.hcp_allowance_pct,
      storedMaxStrokes: game.hcp_max_strokes,
      frozenCourseHandicap: row.course_handicap,
      rating,
      candidates: indexCandidates({
        startedAt: roundStart(game),
        history: historyByUser.get(row.user_id) ?? [],
        profileIndex: profileIndex.get(row.user_id) ?? null,
      }),
    });
    if (plan === null) continue;
    if (plan.status === 'resolved') fills.push({ row, full: plan.fullCourseHandicap, source: plan.source });
    else unresolved.push({ row, reason: plan.reason });
  }
  const fullByRow = new Map<string, number>();
  for (const p of players) {
    if (p.full_course_handicap !== null) fullByRow.set(`${p.game_id}|${p.user_id}`, p.full_course_handicap);
  }
  for (const f of fills) fullByRow.set(`${f.row.game_id}|${f.row.user_id}`, f.full);

  // ── Step 2: differentials in finished own-ball rounds ───────────────────
  const finishedOwnBall = games.filter(
    (g) => g.status === 'finished' && !modeCollapsesToTeamCard(g.game_mode as GameMode, 18),
  );
  const playersByGame = new Map<string, PlayerRow[]>();
  for (const p of players) {
    const list = playersByGame.get(p.game_id) ?? [];
    list.push(p);
    playersByGame.set(p.game_id, list);
  }
  const changes: Array<{ game: GameRow; row: PlayerRow; full: number; next: number }> = [];
  let keptUnresolved = 0;
  for (const game of finishedOwnBall) {
    const roster = playersByGame.get(game.id) ?? [];
    const relevant = roster.filter((p) => {
      const full = fullByRow.get(`${p.game_id}|${p.user_id}`);
      if (full === undefined) {
        // No known full number: a stored differential stays as it is.
        if (p.score_differential !== null) keptUnresolved += 1;
        return false;
      }
      // Corrected when it came from a different number; frozen when missing.
      return p.score_differential === null || full !== p.course_handicap;
    });
    if (relevant.length === 0 || !game.course_id || !game.tee_box_id) continue;
    const tee = teeById.get(game.tee_box_id);
    if (!tee) continue;
    const holes = await selectAllRows<HoleRow>(
      (from, to) =>
        admin
          .from('course_holes')
          .select('course_id, hole_number, par_mens, par_ladies, par_juniors, stroke_index')
          .eq('course_id', game.course_id as string)
          .order('hole_number')
          .range(from, to),
      `course_holes ${short(game.id)}`,
    );
    const scores = await selectAllRows<{ user_id: string; hole_number: number; strokes: number | null }>(
      (from, to) =>
        admin
          .from('scores')
          .select('user_id, hole_number, strokes')
          .eq('game_id', game.id)
          .in('user_id', relevant.map((p) => p.user_id))
          .order('id')
          .range(from, to),
      `scores ${short(game.id)}`,
    );
    for (const row of relevant) {
      const full = fullByRow.get(`${row.game_id}|${row.user_id}`) as number;
      const scoresByHole = new Map(
        scores.filter((s) => s.user_id === row.user_id).map((s) => [s.hole_number, s.strokes]),
      );
      const next = computePlayerDifferential({
        tee,
        holes,
        gender: row.tee_gender ?? 'mens',
        scoresByHole,
        fullCourseHandicap: full,
      });
      if (next !== null && next !== row.score_differential) {
        changes.push({ game, row, full, next });
      }
    }
  }

  // ── Preview ─────────────────────────────────────────────────────────────
  const describeGame = (g: GameRow) =>
    `game ${short(g.id)} ${g.status} ${g.game_mode} ${g.hcp_allowance_pct}%${g.hcp_max_strokes !== null ? ` cap ${g.hcp_max_strokes}` : ''}`;
  const countBy = <T,>(items: T[], key: (item: T) => string) => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
    return counts;
  };
  console.log(
    `[fch] started rounds: ${games.length}; frozen rows: ${players.length}; rows without the full number: ${missing.length}`,
  );
  console.log(`[fch] step 1 — fill full_course_handicap: ${fills.length} row(s)`);
  for (const [source, n] of countBy(fills, (f) => f.source)) console.log(`        ${source}: ${n}`);
  const differs = fills.filter((f) => f.full !== f.row.course_handicap);
  console.log(`        of which full ≠ frozen playing handicap: ${differs.length}`);
  for (const f of differs) {
    console.log(
      `        ${describeGame(gameById.get(f.row.game_id)!)} user ${short(f.row.user_id)}: playing ${f.row.course_handicap} → full ${f.full} (${f.source})`,
    );
  }
  console.log(`[fch] unresolved (stay null): ${unresolved.length} row(s)`);
  for (const [reason, n] of countBy(unresolved, (u) => u.reason)) console.log(`        ${reason}: ${n}`);
  for (const u of unresolved) {
    console.log(
      `        ${describeGame(gameById.get(u.row.game_id)!)} user ${short(u.row.user_id)}: playing ${u.row.course_handicap}, differential ${u.row.score_differential ?? '—'} (${u.reason})`,
    );
  }
  const corrected = changes.filter((c) => c.row.score_differential !== null);
  const frozenNow = changes.filter((c) => c.row.score_differential === null);
  console.log(
    `[fch] step 2 — differentials to write: ${changes.length} row(s) in ${new Set(changes.map((c) => c.game.id)).size} round(s): ${corrected.length} corrected, ${frozenNow.length} frozen now`,
  );
  for (const c of changes) {
    console.log(
      `        ${describeGame(c.game)} user ${short(c.row.user_id)}: playing ${c.row.course_handicap}, full ${c.full}: ${c.row.score_differential ?? '—'} → ${c.next}`,
    );
  }
  console.log(`[fch] stored differentials left as they are (full number unresolved): ${keptUnresolved}`);

  if (!write) {
    console.log('[fch] preview only. Run again with --write to apply.');
    return;
  }

  // ── Write: exactly the previewed rows ───────────────────────────────────
  for (const f of fills) {
    expectOne(
      await admin
        .from('game_players')
        .update({ full_course_handicap: f.full })
        .eq('game_id', f.row.game_id)
        .eq('user_id', f.row.user_id)
        .is('full_course_handicap', null)
        .select('user_id'),
      `fill ${short(f.row.game_id)}/${short(f.row.user_id)}`,
    );
  }
  console.log(`[fch] wrote full_course_handicap on ${fills.length} row(s)`);

  for (const c of changes) {
    const base = admin
      .from('game_players')
      .update({ score_differential: c.next })
      .eq('game_id', c.game.id)
      .eq('user_id', c.row.user_id);
    // Guard on the value the preview read: a row changed in between is refused.
    const guarded =
      c.row.score_differential === null
        ? base.is('score_differential', null)
        : base.eq('score_differential', c.row.score_differential);
    const written = expectOne(
      await guarded.select('score_differential'),
      `differential ${short(c.game.id)}/${short(c.row.user_id)}`,
    );
    if (written.score_differential !== c.next) {
      throw new Error(
        `differential ${short(c.game.id)}/${short(c.row.user_id)}: wrote ${written.score_differential}, expected ${c.next}`,
      );
    }
  }
  console.log(`[fch] done — ${changes.length} differential(s) written and read back as previewed`);
}

main().catch((err) => {
  console.error('[fch] fatal', err);
  process.exitCode = 1;
});
