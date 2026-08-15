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

/**
 * Høyere trinn-skala for podier som bærer en ekstra innholdslinje under
 * lag-/spillernavnet — medlemsnavn (Shamble, Texas scramble), partnernavn
 * (Patsome, lag-stableford) eller unit-badge-raden (Nassau). Uten de 20 ekstra
 * pikslene per trinn presser den linja tallet ut av trinnet. Samme forhold
 * mellom slottene som `SLOT_HEIGHTS`.
 */
export const SLOT_HEIGHTS_TALL: Record<PodiumSlot, string> = {
  1: 'min-h-[200px]',
  2: 'min-h-[170px]',
  3: 'min-h-[150px]',
};

/**
 * Trinn-farge per tier. Delt av alle podium-flatene (#1591) — verdiene var
 * byte-identiske i alle 13 fil-lokale kopiene før de ble samlet her.
 */
export const TIER_ACCENT: Record<PodiumTier, string> = {
  // Champagne: forest-tinted bg + champagne border + champagne tekst-accent.
  champagne:
    'border-accent bg-accent/[0.08] shadow-[0_2px_14px_rgba(201,169,97,0.18)]',
  // Silver: en hårfin dempet ring. Mer dempet enn champagne for å la 1.-plassen
  // dominere visuelt.
  silver: 'border-muted/40 bg-surface',
  // Bronse: varmere brun-tone via warning-tokenen. Tørny har ikke en dedikert
  // bronze-token, så warning er nærmeste varme accent.
  bronze: 'border-warning/40 bg-surface',
};
