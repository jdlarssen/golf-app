import 'server-only';
import { getUpcomingClubGames } from '@/lib/games/getUpcomingClubGames';

/**
 * «Neste runde» on each club row in the Klubbhus room (#2493): per club, the
 * first scheduled round whose tee-off is at or after `now`, or `null`.
 *
 * One query per club with a one-row window, in parallel (a player is in few
 * clubs). A shared window across all clubs let one club's old planned rounds
 * push another club's next round out of it, and the row said «ingen runder
 * satt opp» when one was set up.
 *
 * Open or closed signup alike: a full club round with closed signups is still
 * the next round. A scheduled round whose tee-off has passed does NOT count:
 * it either started already or is stuck (it starts when someone opens it, or
 * not at all), and the row promises a date that is coming. Nor does a round
 * without a tee-off: it has no date to show.
 *
 * Service role inside `getUpcomingClubGames`; the gate is the caller's club
 * ids, which must be the viewer's own memberships (`getMyClubs`). Any failed
 * read fails the whole answer (#2490), so no club shows «no rounds» by error.
 */
export async function getNextClubRounds(
  clubIds: string[],
  now: Date,
): Promise<{ ok: true; next: Map<string, string | null> } | { ok: false }> {
  const teeOffFrom = now.toISOString();
  const results = await Promise.all(
    clubIds.map((id) => getUpcomingClubGames([id], { teeOffFrom, limit: 1 })),
  );
  const failed = results.find((r) => r.error);
  if (failed) {
    console.error('[getNextClubRounds]', failed.error);
    return { ok: false };
  }
  return {
    ok: true,
    next: new Map(clubIds.map((id, i) => [id, results[i].data?.[0]?.scheduled_tee_off_at ?? null])),
  };
}
