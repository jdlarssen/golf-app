/**
 * Rank→presentasjon-mapping for podium-flatene (#1372/#1573).
 *
 * Podiene layouter etter SLOT (grid-posisjon: 1 = midten/høyest trinn,
 * 2 = venstre, 3 = høyre) men presenterer etter faktisk RANK fra
 * tiebreaker-kaskaden. Ved delt plassering har flere spillere/lag samme
 * rank, og medaljong/farge/delt-badge skal følge ranken — ikke posisjonen
 * i den sorterte lista. Høyde, stagger og testid forblir slot-baserte.
 */

export type PodiumPlace = 1 | 2 | 3;

/** Grid-posisjon: 1 = midten (høyest trinn), 2 = venstre, 3 = høyre. */
export type PodiumSlot = 1 | 2 | 3;

export type PodiumTier = 'champagne' | 'silver' | 'bronze';

/**
 * Snevrer den brede `rank: number` inn til medaljong-domenet 1|2|3. På et
 * topp-3-podium er rank alltid ≤ 3 i runtime (rank = første-tied-indeks + 1),
 * så clampen nedover til 3 er rent defensiv.
 */
export function podiumPlace(rank: number): PodiumPlace {
  if (rank <= 1) return 1;
  if (rank === 2) return 2;
  return 3;
}

/** Farge-tier følger faktisk plass (delt rank → samme tier på flere trinn). */
export const PLACE_TIER: Record<PodiumPlace, PodiumTier> = {
  1: 'champagne',
  2: 'silver',
  3: 'bronze',
};

/**
 * Trinnhøyde følger slotten — midten er alltid høyest, også når to trinn
 * deler samme rank. Layout er posisjon; presentasjon er rank.
 */
export const SLOT_HEIGHTS: Record<PodiumSlot, string> = {
  1: 'min-h-[180px]',
  2: 'min-h-[150px]',
  3: 'min-h-[130px]',
};
