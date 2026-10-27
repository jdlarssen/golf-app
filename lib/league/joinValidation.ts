/**
 * The decision behind joining a league through its shareable link (#2662).
 *
 * Pure, no I/O: `getLeagueJoinContext` gathers the facts, this decides. The
 * page (`/liga/bli-med/[code]`) needs the answer to pick what to render, the
 * server action to refuse before it writes: two call sites, one rule set
 * (AGENTS.md trap 4). Mirrors `lib/cup/joinValidation.ts` (#1490).
 */

export type LeagueJoinFacts = {
  /**
   * The code hit a league without a club whose link is on. A club league never
   * has a code (`setLeagueJoinLink` refuses it); its members join through
   * `join_club_league` instead.
   */
  leagueExists: boolean;
  /** `leagues.status`: `draft` and `active` are open, `finished` is closed. */
  status: string | null;
  /**
   * A session exists. The page is auth-optional (`proxy.ts`), so a stranger
   * sees the league before logging in; the action redirects to the login
   * first and never reaches `sign_in`.
   */
  signedIn: boolean;
  /** `users.profile_completed_at IS NOT NULL` for the one joining. */
  profileCompleted: boolean;
  /** The player is already in `league_players`. */
  alreadyJoined: boolean;
};

export type LeagueJoinDecision =
  | 'can_join'
  | 'already_joined'
  | 'not_found'
  | 'closed'
  | 'sign_in'
  | 'profile_incomplete';

/**
 * The guards in order. The order is the contract:
 *
 *  1. Does the link lead anywhere? (unknown or switched off → 404)
 *  2. Is the league finished? Then nobody joins, also not someone in it.
 *  3. Logged in? If not, the way on is the login, which brings them back.
 *  4. Already in? Then the way on is the league itself.
 *  5. Completed profile? The flight start needs a handicap, the same
 *     invariant the cup link holds.
 *
 * An active league is open: someone who joins mid-season plays from the next
 * round they can start (owner, 27.10: a round that is still open counts).
 * No cap and no approval: the link is the gate (as the cup link, owner
 * decision 2026-08-07), and the organiser turns it off if it spreads too far.
 */
export function evaluateLeagueJoin(facts: LeagueJoinFacts): LeagueJoinDecision {
  if (!facts.leagueExists) return 'not_found';
  if (facts.status === 'finished') return 'closed';
  if (!facts.signedIn) return 'sign_in';
  if (facts.alreadyJoined) return 'already_joined';
  if (!facts.profileCompleted) return 'profile_incomplete';
  return 'can_join';
}

/**
 * The rounds a late joiner can no longer play: those whose window has closed.
 * A round that is open now is not among them (owner, 27.10: «hvis man har
 * meldt seg på før runde 2 og får spilt runde 1 før runde 1 er ferdig så skal
 * vi tillate det»). Same comparison as the league page's `windowStatus`:
 * closed means strictly after `closesAt`.
 */
export function closedRoundSequences(
  rounds: ReadonlyArray<{ sequence: number; closesAt: string }>,
  nowMs: number,
): number[] {
  return rounds
    .filter((r) => nowMs > Date.parse(r.closesAt))
    .map((r) => r.sequence)
    .sort((a, b) => a - b);
}
