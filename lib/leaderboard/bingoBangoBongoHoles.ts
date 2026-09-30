import type { BingoBangoBongoHoleRow, BingoBangoBongoResult } from '@/lib/scoring/modes/types';

/**
 * #2255 PR 3c: «Hull for hull» for Bingo Bango Bongo — ett kort per hull med
 * de tre prestasjonene (bingo, bango, bongo) og hvem som tok dem, eller
 * «ikke satt». Den som tok to av tre står i gull med stjerne, og tok én alle
 * tre, står «Feiet!» i hodet. Et hull uten noen av de tre venter.
 *
 * Regnestykket bodde i webbens `BingoBangoBongoHolesView`. Nå bor det her, og
 * både webben og appen tegner de samme kortene. Hintet under hver prestasjon
 * kommer som katalognøkkel (`leaderboard.bingoBangoBongo.*`), så hver flate
 * oversetter selv. Navnene «Bingo», «Bango» og «Bongo» er hardkodet på begge
 * flatene, og står der.
 *
 * Rekkefølgen: hullene som motoren gir dem (stigende), og prestasjonene alltid
 * bingo, bango, bongo. Ingenting sorteres på spillere, så motorens rekkefølge
 * inn spiller ingen rolle og stillingen trengs ikke. Feieren kan heller ikke
 * bli delt: hullet har tre poeng, så bare én spiller kan ha to eller flere.
 *
 * Poengene kommer fra motoren (`pointsByPlayer`), som bare gir poeng til
 * spillere i runden. En ukjent spiller står med navnet sitt (eller webbens
 * reserve), men feier aldri.
 *
 * Ren fil, uten Next og uten React: appen importerer den gjennom Metro.
 */

export type BingoBangoBongoCategory = 'bingo' | 'bango' | 'bongo';

/** Katalognøkkelen for hintet under prestasjonen (`leaderboard.bingoBangoBongo.*`). */
export type BingoBangoBongoHintKey = 'firstOnGreen' | 'nearestPin' | 'firstInHole';

export interface BingoBangoBongoHoleCardRow {
  category: BingoBangoBongoCategory;
  hintKey: BingoBangoBongoHintKey;
  /** Hvem som tok prestasjonen, `null` = «ikke satt». */
  userId: string | null;
  /** Tok to eller tre av de tre på hullet: stjerne, halvfett navn i gull. */
  isSweeper: boolean;
}

export interface BingoBangoBongoHoleCard {
  holeNumber: number;
  /**
   * Ingen av de tre er satt: «Venter» i hodet, og «Ingen prestasjoner
   * registrert ennå.» i stedet for radene.
   */
  pending: boolean;
  /** Én spiller tok alle tre: «★ Feiet!» i hodet. Aldri på et hull som venter. */
  sweptAll: boolean;
  /** De tre prestasjonene i fast rekkefølge. Tom på et hull som venter. */
  rows: BingoBangoBongoHoleCardRow[];
}

export interface BingoBangoBongoHoleCards {
  holes: BingoBangoBongoHoleCard[];
}

/** De tre prestasjonene per hull, i fast rekkefølge. */
const CATEGORIES: ReadonlyArray<{
  category: BingoBangoBongoCategory;
  hintKey: BingoBangoBongoHintKey;
  winner: (hole: BingoBangoBongoHoleRow) => string | null;
}> = [
  { category: 'bingo', hintKey: 'firstOnGreen', winner: (h) => h.bingoUserId },
  { category: 'bango', hintKey: 'nearestPin', winner: (h) => h.bangoUserId },
  { category: 'bongo', hintKey: 'firstInHole', winner: (h) => h.bongoUserId },
];

/**
 * Den som tok to eller tre av de tre på hullet, med poengene sine. Tre poeng
 * per hull gjør at bare én kan ha to eller flere, så svaret er entydig og
 * uavhengig av rekkefølgen i `pointsByPlayer`.
 */
function sweeperOf(hole: BingoBangoBongoHoleRow): { userId: string; points: number } | null {
  let sweeper: { userId: string; points: number } | null = null;
  for (const [userId, points] of Object.entries(hole.pointsByPlayer)) {
    if (points >= 2 && points > (sweeper?.points ?? 0)) sweeper = { userId, points };
  }
  return sweeper;
}

export function bingoBangoBongoHoleCards(result: BingoBangoBongoResult): BingoBangoBongoHoleCards {
  return {
    holes: result.holes.map((hole) => {
      const pending = CATEGORIES.every((c) => c.winner(hole) == null);
      const sweeper = sweeperOf(hole);
      return {
        holeNumber: hole.holeNumber,
        pending,
        sweptAll: sweeper?.points === 3,
        rows: pending
          ? []
          : CATEGORIES.map(({ category, hintKey, winner }) => {
              const userId = winner(hole);
              return {
                category,
                hintKey,
                userId,
                isSweeper: userId != null && userId === sweeper?.userId,
              };
            }),
      };
    }),
  };
}
