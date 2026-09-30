/**
 * #2255: fast rekkefølge for «Hull for hull», delt av alle formatene.
 *
 * Motoren beholder rekkefølgen den fikk spillerne i, og den er ikke den samme
 * på webben og i appen. Uten regler her ville samme hull og samme stilling se
 * ulikt ut på de to flatene (funnet side om side på staging, PR 3a).
 *
 * Ren fil, uten Next og uten React: appen importerer den gjennom Metro.
 */

/**
 * Stillingen i fast rekkefølge: plassen, ved delt plass `teamNumber` når
 * formatet har det (Wolf: rotasjonsplassen, samme som motoren og tavla
 * bruker), og til sist `userId`. `userId` betyr ingenting for spilleren, men
 * gir samme liste på begge flatene.
 */
export function inStandingOrder<T extends { userId: string; rank: number; teamNumber?: number | null }>(
  players: readonly T[],
): T[] {
  return [...players].sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.teamNumber != null && b.teamNumber != null ? a.teamNumber - b.teamNumber : 0) ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
}

/**
 * Likt på et hull: den som ligger best an i stillingen står først. `rankedIds`
 * er stillingen i fast rekkefølge (`inStandingOrder`).
 */
export function byStanding(
  rankedIds: readonly string[],
): (a: { userId: string }, b: { userId: string }) => number {
  const place = new Map(rankedIds.map((id, i) => [id, i]));
  const at = (id: string) => place.get(id) ?? Number.POSITIVE_INFINITY;
  return (a, b) => at(a.userId) - at(b.userId);
}
