import type {
  RoundRobinHoleRow,
  RoundRobinPlayerCell,
  RoundRobinResult,
} from '@/lib/scoring/modes/types';

/**
 * #2255 PR 3c: «Hull for hull» for Round Robin — tre segmenter på seks hull,
 * hvert med konstellasjonen (hvem som er partnere) og ett kort per hull med
 * begge sidene, hver spillers netto, sidens beste og hvem som vant hullet.
 *
 * Regnestykket bodde i webbens `RoundRobinHolesView`. Nå bor det her, og både
 * webben og appen tegner de samme segmentene og kortene. Teksten (hull-spennet
 * og utfallet) kommer som katalognøkler (`leaderboard.roundRobin.*`), så hver
 * flate oversetter selv.
 *
 * Rekkefølgen: segment 1, 2, 3, hullene stigende i hvert, side 1 før side 2,
 * og spillerne på en side slik konstellasjonen står (rotasjonsplassen). Ingen
 * av nøklene kan bli like, så stillingen trengs ikke som siste utvei, og
 * motorens rekkefølge inn spiller ingen rolle.
 *
 * Ren fil, uten Next og uten React: appen importerer den gjennom Metro.
 */

export interface RoundRobinHoleCardRow {
  userId: string;
  /**
   * Hadde sidens beste netto på hullet (også delt): stjerne og halvfett navn.
   * Bare når spilleren har netto.
   */
  isContributor: boolean;
  /** Brutto ved siden av, bare når den er annerledes enn netto. */
  grossShown: number | null;
  /** Netto på hullet, `null` uten score («–»). */
  net: number | null;
}

export interface RoundRobinHoleSide {
  side: 1 | 2;
  /** Vant hullet: gull kant og tone, «Vant hullet» og gull score. */
  isWinner: boolean;
  /** Spillerne slik konstellasjonen står. */
  rows: RoundRobinHoleCardRow[];
}

/** Katalognøkkelen for utfallet i hodet (`leaderboard.roundRobin.*`). */
export type RoundRobinOutcomeKey = 'outcomeChipTied' | 'outcomeChipVenter';

export interface RoundRobinHoleCard {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /**
   * Til høyre i hodet: delt eller venter. `null` når en side vant, for den
   * markeres på selve siden.
   */
  outcomeKey: RoundRobinOutcomeKey | null;
  sides: [RoundRobinHoleSide, RoundRobinHoleSide];
}

/** Katalognøkkelen for hull-spennet i segmentet (`leaderboard.roundRobin.*`). */
export type RoundRobinSegmentHolesKey = 'segmentHoles1' | 'segmentHoles2' | 'segmentHoles3';

export interface RoundRobinSegment {
  segment: 1 | 2 | 3;
  holesKey: RoundRobinSegmentHolesKey;
  /**
   * Konstellasjonen: hvem som er partnere i segmentet. Rotasjonen er den
   * samme på alle seks hull, så den leses fra det første.
   */
  side1PlayerIds: readonly string[];
  side2PlayerIds: readonly string[];
  holes: RoundRobinHoleCard[];
}

export interface RoundRobinHoleCards {
  /** Bare segmentene som har hull (motoren gir ingen uten fire spillere). */
  segments: RoundRobinSegment[];
}

const SEGMENT_HOLES_KEY: Record<1 | 2 | 3, RoundRobinSegmentHolesKey> = {
  1: 'segmentHoles1',
  2: 'segmentHoles2',
  3: 'segmentHoles3',
};

function outcomeKey(result: RoundRobinHoleRow['result']): RoundRobinOutcomeKey | null {
  if (result === 'tied') return 'outcomeChipTied';
  if (result === 'unplayed') return 'outcomeChipVenter';
  return null;
}

/** Plassen i konstellasjonen først; en ukjent spiller bakerst. */
function byConstellation(
  playerIds: readonly string[],
): (a: { userId: string }, b: { userId: string }) => number {
  const at = (userId: string) => {
    const i = playerIds.indexOf(userId);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  return (a, b) => {
    const pa = at(a.userId);
    const pb = at(b.userId);
    return pa === pb ? 0 : pa < pb ? -1 : 1;
  };
}

function sideRows(cells: readonly RoundRobinPlayerCell[], playerIds: readonly string[]): RoundRobinHoleCardRow[] {
  return [...cells].sort(byConstellation(playerIds)).map((cell) => ({
    userId: cell.userId,
    isContributor: cell.isContributor && cell.net != null,
    grossShown: cell.gross != null && cell.net != null && cell.gross !== cell.net ? cell.gross : null,
    net: cell.net,
  }));
}

function holeCard(hole: RoundRobinHoleRow): RoundRobinHoleCard {
  return {
    holeNumber: hole.holeNumber,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    outcomeKey: outcomeKey(hole.result),
    sides: [
      { side: 1, isWinner: hole.result === 'side1_wins', rows: sideRows(hole.side1Players, hole.side1PlayerIds) },
      { side: 2, isWinner: hole.result === 'side2_wins', rows: sideRows(hole.side2Players, hole.side2PlayerIds) },
    ],
  };
}

export function roundRobinHoleCards(result: RoundRobinResult): RoundRobinHoleCards {
  const segments: RoundRobinSegment[] = [];
  for (const segment of [1, 2, 3] as const) {
    const holes = result.holes
      .filter((h) => h.segment === segment)
      .sort((a, b) => a.holeNumber - b.holeNumber);
    const first = holes[0];
    if (!first) continue;
    segments.push({
      segment,
      holesKey: SEGMENT_HOLES_KEY[segment],
      side1PlayerIds: first.side1PlayerIds,
      side2PlayerIds: first.side2PlayerIds,
      holes: holes.map(holeCard),
    });
  }
  return { segments };
}
