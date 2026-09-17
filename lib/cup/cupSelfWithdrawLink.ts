import type { CupMatchInput } from './computeCupLeaderboard';
import type { CupRoster } from './cupRoster';
import { isDecidedByWithdrawal, isNotStartedCupMatch } from './cupWithdrawalOutcome';

/**
 * Does the cup page show «Trekk meg fra cupen» to this player? (#1814)
 *
 * Only while the cup is active, and only to a participant who still has a
 * match that has not started. A match decided by a withdrawal is nothing left
 * to withdraw from, but one still waiting on the organiser's play-on choice is,
 * so the remaining partner keeps the link (#2033). Withdrawn players stay in
 * the match's user ids, hence the withdrawnUserIds guard: the player who just
 * withdrew lands back on the page in exactly that pending state.
 *
 * The roster guard covers the case the match does not show: when the partner
 * plays on alone the match has no `withdrawal`, yet the withdrawn player's
 * roster row is still flagged (#2052).
 */
export function canSelfWithdrawFromCup({
  userId,
  cupStatus,
  matches,
  roster,
}: {
  userId: string | null;
  cupStatus: string;
  matches: readonly CupMatchInput[];
  roster: CupRoster;
}): boolean {
  if (userId === null || cupStatus !== 'active') return false;
  const me = [...roster.team1, ...roster.team2].find((p) => p.userId === userId);
  if (me?.withdrawn === true) return false;
  return matches.some(
    (m) =>
      isNotStartedCupMatch(m.status) &&
      !isDecidedByWithdrawal(m) &&
      !(m.withdrawal?.withdrawnUserIds.includes(userId) ?? false) &&
      [...(m.team1UserIds ?? []), ...(m.team2UserIds ?? [])].includes(userId),
  );
}
