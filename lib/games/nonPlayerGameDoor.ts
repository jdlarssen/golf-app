import type { GameStatus } from '@/lib/games/status';

/**
 * Where a viewer WITHOUT a row on the game's roster goes (#2202). The one home
 * for «who organises a game without playing it, and where they are sent»
 * (AGENTS.md trap 4); the game pages call it instead of a bare `notFound()`.
 *
 * - `home` (`/games/[id]`): a global admin goes to the Sekretariat (admin wins
 *   over creator), the creator gets the organiser view, anyone else a 404.
 * - `player_page` (scorecard, holes, approve, submit, putter): admin or
 *   creator is sent to `/games/[id]`, which then resolves the `home` door;
 *   anyone else a 404.
 * - `board` (the leaderboard and its hole drilldown): a finished board is
 *   open to everyone signed in (#1456/#1468) and admin may always look; the
 *   creator follows a running round like a player does (owner's choice C,
 *   see `organiserFollowsLiveBoard`) and is sent to `/games/[id]` before the
 *   start; anyone else a 404. `resultReadUsesServiceRole` serves exactly the
 *   viewers this surface admits.
 *
 * Call it only when the viewer has no `game_players` row. Pure, no DB access:
 * the caller reads `is_admin` and `games.created_by`.
 */
export type NonPlayerDoor =
  | { kind: 'redirect'; href: string }
  | { kind: 'organiser_view' }
  | { kind: 'board' }
  | { kind: 'not_found' };

type DoorInput = { gameId: string; isAdmin: boolean; isCreator: boolean } & (
  | { surface: 'home' | 'player_page' }
  | { surface: 'board'; status: GameStatus }
);

export function nonPlayerGameDoor(input: DoorInput): NonPlayerDoor {
  const { gameId, isAdmin, isCreator } = input;
  if (input.surface === 'board') {
    if (isAdmin || input.status === 'finished') return { kind: 'board' };
    if (isCreator && input.status === 'active') return { kind: 'board' };
    return isCreator ? { kind: 'redirect', href: `/games/${gameId}` } : { kind: 'not_found' };
  }
  if (input.surface === 'player_page') {
    return isAdmin || isCreator
      ? { kind: 'redirect', href: `/games/${gameId}` }
      : { kind: 'not_found' };
  }
  if (isAdmin) return { kind: 'redirect', href: `/admin/games/${gameId}` };
  if (isCreator) return { kind: 'organiser_view' };
  return { kind: 'not_found' };
}

/**
 * Owner's choice C (#2202): the game's organiser follows a running round on
 * the leaderboard and the hole drilldown like a player does. True when the
 * viewer created this game and it is being played. The `board` door admits
 * them on this condition, and `getResultReadClient` reads the results with the
 * service role on the same one (RLS only serves participants). A participant
 * reads every score of a live or reveal game anyway, so the organiser sees
 * what a player sees, and the reveal rules on the board apply to both.
 */
export function organiserFollowsLiveBoard({
  status,
  createdBy,
  viewerId,
}: {
  status: GameStatus;
  createdBy: string | null;
  viewerId: string | null;
}): boolean {
  return status === 'active' && !!viewerId && createdBy === viewerId;
}

/**
 * Whether a game's results are read with the service role (#1542, #2202):
 * a finished game for everyone the board lets in, and a running one for its
 * organiser. `getResultReadClient` applies it; the `board` door admits the
 * same viewers, and a test locks that the two agree.
 */
export function resultReadUsesServiceRole(input: {
  status: GameStatus;
  createdBy: string | null;
  viewerId: string | null;
}): boolean {
  return input.status === 'finished' || organiserFollowsLiveBoard(input);
}

/**
 * Where a match card on `/admin/cup/[id]` leads (#2202). That page also lets
 * in a personal cup's creator and a club cup's club admin, but
 * `/admin/games/[id]` is admin-only and sends anyone else to `/`.
 *
 * - admin: the Sekretariat, as before.
 * - the match's own creator (`games.created_by`) or a player in it:
 *   `/games/[id]`, which shows them the organiser view or the player's view.
 *   Ownership is read from the match, never from the cup: a global admin may
 *   have generated the matches of someone else's cup.
 * - anyone else: a finished match links to its leaderboard (open to everyone
 *   signed in, back arrow to this page); an unfinished one is a plain card,
 *   since `/games/[id]` would 404 for them.
 */
export function adminCupMatchHref({
  gameId,
  status,
  tournamentId,
  viewerId,
  viewerIsAdmin,
  createdBy,
  playerIds,
}: {
  gameId: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  tournamentId: string;
  viewerId: string;
  viewerIsAdmin: boolean;
  createdBy: string | null;
  playerIds: readonly string[];
}): string | null {
  if (viewerIsAdmin) return `/admin/games/${gameId}`;
  if (createdBy === viewerId || playerIds.includes(viewerId)) return `/games/${gameId}`;
  return status === 'finished'
    ? `/games/${gameId}/leaderboard?from=/admin/cup/${tournamentId}`
    : null;
}
