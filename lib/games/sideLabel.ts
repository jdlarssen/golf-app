/**
 * A side prize's label: «Lengste drive» when the game has one of the kind,
 * «Lengste drive 1» / «2» when it has two. Shared by the prize table, the
 * awards card and the prize-giving on the big screen (#2298).
 */
export function sideLabel(base: string, position: number, total: number): string {
  return total > 1 ? `${base} ${position}` : base;
}
