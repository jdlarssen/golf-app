import type { Database } from '@/lib/database.types';
import { deliveryCounts, type DeliveryCounts } from './organizerDesk';
import { isPubliclyViewable } from './publicSignupVisibility';
import type { StartBlock } from './startBlockReason';
import { STRUCTURAL_BLOCK_REASONS, type StructuralBlockReason } from './startBlockReasons';
import type { GameStatus } from './status';

/**
 * One home for «the games you arranged yourself» (#2489): a cup match or a
 * league flight is created by the organiser too, but it belongs on the cup's
 * or league's page, not in «Det du arrangerer» / «Rundene dine». Pass a
 * `games` query; it comes back with both links filtered to null.
 */
export function onlyStandaloneGames<
  Q extends { is(column: string, value: boolean | null): Q },
>(query: Q): Q {
  return query.is('tournament_id', null).is('league_round_id', null);
}

// «Rundene dine» (#2269): the arranged rounds, grouped by what happens next.
// Pure rules, no reads and no rendering. The reads live in
// `./getArrangedRounds.ts` (and, for admin, `/admin/games`); the view is
// `components/games/ArrangedRoundsView.tsx`.

/** The `games` columns the grouping reads. Snake_case, as PostgREST returns them. */
export type ArrangedGame = {
  id: string;
  name: string;
  status: GameStatus;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  scheduled_tee_off_at: string | null;
  require_peer_approval: boolean;
  registration_mode: Database['public']['Enums']['registration_mode'];
  signups_closed_at: string | null;
  courses: { name: string } | null;
};

/** One `game_players` row, reduced to what the counts read. */
export type ArrangedRosterRow = {
  game_id: string;
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
};

/** `null`: invitation only, so the row says nothing about signing up. */
export type SignupState = 'open' | 'closed' | null;

/**
 * Why a scheduled row will not start by itself. The view looks up the words;
 * this only picks the reason.
 */
export type ScheduledRowNote =
  | { kind: 'missingTeeOff' }
  | { kind: 'blocked'; reason: StructuralBlockReason }
  | null;

export type LiveRound<G> = { game: G; counts: DeliveryCounts };

export type UpcomingRound<G> = {
  game: G;
  /** Players who have not withdrawn: the «8 påmeldt». */
  signedUp: number;
  signups: SignupState;
  missingTeeOff: boolean;
  note: ScheduledRowNote;
};

export type ArrangedRounds<G> = {
  live: LiveRound<G>[];
  upcoming: UpcomingRound<G>[];
  /** `onlyId` is set when there is exactly one draft: the row opens it directly. */
  drafts: { count: number; onlyId: string | null };
  finished: { count: number };
};

export function groupRosterByGame<R extends { game_id: string }>(
  rows: readonly R[],
): Map<string, R[]> {
  const byGame = new Map<string, R[]>();
  for (const row of rows) {
    const list = byGame.get(row.game_id);
    if (list) list.push(row);
    else byGame.set(row.game_id, [row]);
  }
  return byGame;
}

/** ISO timestamps from PostgREST sort as strings; `null` sorts last. */
function compareIsoNullsLast(a: string | null, b: string | null, direction: 1 | -1): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -direction : direction;
}

/**
 * The scheduled rounds in «Neste» order: earliest tee-off first, a round
 * without a tee-off last, then the oldest first.
 */
export function sortedUpcomingGames<G extends ArrangedGame>(games: readonly G[]): G[] {
  return games
    .filter((g) => g.status === 'scheduled')
    .sort(
      (a, b) =>
        compareIsoNullsLast(a.scheduled_tee_off_at, b.scheduled_tee_off_at, 1) ||
        compareIsoNullsLast(a.created_at, b.created_at, 1),
    );
}

/**
 * The scheduled rounds whose start block is worth reading: the ones the view
 * shows (`upcomingLimit`) that have a tee-off. A round without one already has
 * its line, and the read costs a handful of queries per round.
 */
export function upcomingBlockIds(
  games: readonly ArrangedGame[],
  upcomingLimit?: number,
): string[] {
  const shown = sortedUpcomingGames(games).slice(0, upcomingLimit);
  return shown.filter((g) => g.scheduled_tee_off_at != null).map((g) => g.id);
}

/**
 * The line under a scheduled row when the round will not start by itself:
 *
 *  - No tee-off: the cron sweep only picks rounds whose tee-off has passed
 *    (`.lte('scheduled_tee_off_at', …)` in
 *    `app/api/cron/start-scheduled-games/route.ts`), so a round without one is
 *    never started. «Starter ikke av seg selv» is literally true.
 *  - Otherwise the start block, when it is something the organiser can fix
 *    (`STRUCTURAL_BLOCK_REASONS`). A silent block (a decided cup match, a
 *    finished cup) has nothing to fix, so it gets the ordinary line.
 */
export function scheduledRowNote(
  row: { missingTeeOff: boolean },
  block: StartBlock | null,
): ScheduledRowNote {
  if (row.missingTeeOff) return { kind: 'missingTeeOff' };
  if (block && STRUCTURAL_BLOCK_REASONS.has(block.reason)) {
    return { kind: 'blocked', reason: block.reason as StructuralBlockReason };
  }
  return null;
}

function signupState(game: ArrangedGame): SignupState {
  if (isPubliclyViewable(game)) return 'open';
  if (game.signups_closed_at != null) return 'closed';
  return null;
}

/**
 * Groups the arranged rounds: in progress, next, drafts and finished.
 * `rosterByGame` needs rows for the active and scheduled rounds only;
 * `startBlocks` holds the rounds `upcomingBlockIds` named (a missing entry
 * reads as no block).
 */
export function groupArrangedRounds<G extends ArrangedGame>(
  games: readonly G[],
  rosterByGame: ReadonlyMap<string, readonly ArrangedRosterRow[]>,
  opts: { startBlocks?: ReadonlyMap<string, StartBlock | null> } = {},
): ArrangedRounds<G> {
  const rosterOf = (id: string) => rosterByGame.get(id) ?? [];

  const live = games
    .filter((g) => g.status === 'active')
    .sort((a, b) => compareIsoNullsLast(a.started_at, b.started_at, -1))
    .map((game) => ({
      game,
      counts: deliveryCounts(rosterOf(game.id), game.require_peer_approval),
    }));

  const upcoming = sortedUpcomingGames(games).map((game) => {
    const missingTeeOff = game.scheduled_tee_off_at == null;
    return {
      game,
      signedUp: rosterOf(game.id).filter((p) => p.withdrawn_at == null).length,
      signups: signupState(game),
      missingTeeOff,
      note: scheduledRowNote({ missingTeeOff }, opts.startBlocks?.get(game.id) ?? null),
    };
  });

  const drafts = games.filter((g) => g.status === 'draft');
  return {
    live,
    upcoming,
    drafts: { count: drafts.length, onlyId: drafts.length === 1 ? drafts[0].id : null },
    finished: { count: games.filter((g) => g.status === 'finished').length },
  };
}

export type ArrangedListKind = 'drafts' | 'finished';

/** The drafts newest first, or the finished rounds by when they ended. */
export function arrangedList<G extends ArrangedGame>(
  games: readonly G[],
  kind: ArrangedListKind,
): G[] {
  if (kind === 'drafts') {
    return games
      .filter((g) => g.status === 'draft')
      .sort((a, b) => compareIsoNullsLast(a.created_at, b.created_at, -1));
  }
  return games
    .filter((g) => g.status === 'finished')
    .sort((a, b) => compareIsoNullsLast(a.ended_at, b.ended_at, -1));
}

export type ArrangedRoundKind = 'live' | 'upcoming' | 'draft';

/**
 * Where a row leads. An admin goes to the Sekretariat (a live round there is
 * the organiser's desk, #2268, and a draft opens the wizard's «Klar?» step);
 * an organiser goes to the game's own pages. `detailPathFor` in
 * `app/[locale]/games/[id]/spillere/actions.ts` carries the same role rule.
 */
export function arrangedRoundHref(
  kind: ArrangedRoundKind,
  gameId: string,
  isAdmin: boolean,
): string {
  if (isAdmin) {
    return kind === 'draft' ? `/admin/games/${gameId}/edit?step=5` : `/admin/games/${gameId}`;
  }
  if (kind === 'live') return `/games/${gameId}/spillere`;
  if (kind === 'draft') return `/games/${gameId}/rediger?step=5`;
  return `/games/${gameId}`;
}

/** Where «{n} utkast» (more than one) and «Ferdige runder» lead, by the same role rule. */
export function arrangedListHref(kind: ArrangedListKind, isAdmin: boolean): string {
  if (isAdmin) return kind === 'drafts' ? '/admin/games?status=draft' : '/admin/games?status=finished';
  return kind === 'drafts' ? '/klubbhuset?vis=utkast' : '/klubbhuset?vis=ferdige';
}
