/**
 * A finished cup stands (#2214). Once the organiser has finished the cup and
 * the winner is named, no match in it starts or reopens: not by the cron
 * sweep, the E1 fallback, the admin button, the app, or «Gjenåpne». A match
 * that never started stays `scheduled` for good and leaves the home lists.
 *
 * Dependency-free on purpose: the native app imports this file by relative
 * path (as `homeList.ts` does with `activeCardState`), and Metro resolves bare
 * imports from the requiring file.
 */
export function finishedCupBlocksPlay(tournamentStatus: string | null | undefined): boolean {
  return tournamentStatus === 'finished';
}
