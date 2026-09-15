/**
 * Should the leaderboard show how many holes each row played?
 *
 * The "Hull" column (native `ResultView`) and the per-row hole text on the web
 * podiums answer two different questions depending on where the round is:
 *
 *   - **While the round runs** it is *thru* information — "who is where" is
 *     meaningless without it, so it always stays.
 *   - **On the final result** it only carries meaning when the rows disagree.
 *     A finished round where everyone played 18 repeats "18" once per row, and
 *     the subtitle ("Etter 18 hull") already said it once. A round where one
 *     player stopped after 12, or a 9-hole round, still needs it.
 *
 * Hence: true while the game is unfinished, and on a finished game only when
 * the counts vary — plus one exception. A `0` keeps the column even when every
 * row is `0`, so the zero reads as a number a player can trust ("nobody scored")
 * instead of a column that quietly vanished.
 *
 * Empty `counts` on a finished game returns false: nothing varies when there is
 * nothing to vary, and the surfaces have no rows to hang the number on anyway.
 *
 * Deliberately import-free plain TypeScript: this file is shared with the Expo
 * app through Metro's watch on the root `lib/` (same pattern as
 * `formatHolesList.ts`), where a bare import in the shared graph would break
 * the bundle.
 *
 * @param status `games.status` as the surface knows it — only `'finished'` is
 *   special, every other value means the round is still running.
 * @param counts One hole count per rendered row (`holesPlayed`, `holesCounted`
 *   or `holesScored`, depending on the format). Non-negative integers from the
 *   scoring engine. Order does not matter.
 * @returns true when the column/text should be rendered for every row.
 */
export function showHolesColumn(status: string, counts: readonly number[]): boolean {
  if (status !== 'finished') return true;
  if (counts.some((count) => count === 0)) return true;
  // The table never changes shape per row: one differing count shows the
  // column for everyone.
  return new Set(counts).size > 1;
}
