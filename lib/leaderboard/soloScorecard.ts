import type {
  SoloStrokeplayResult,
  StablefordSoloResult,
} from '@/lib/scoring/modes/types';

/**
 * #2255: «Hull for hull» for solo stableford (også modifisert) og solo
 * slagspill — det klassiske scorekortet med stillingen øverst og Ut/Inn under.
 *
 * Regnestykket bodde i webbens to visninger (`SoloStablefordHolesView`,
 * `SoloStrokeplayHolesView`), som var like bortsett fra verdien de viste og
 * hvilken vei som var best. Nå bor det her, og både webben og appen tegner de
 * samme radene: stillingen, deltotalen per ni med leder, og hvert hull med
 * radene sortert, hullvinneren og par-chippen. Visningene regner ingenting selv.
 *
 * Ren fil, uten Next og uten React: appen importerer den gjennom Metro.
 */

export interface SoloScorecardStanding {
  userId: string;
  rank: number;
  /** Alene på 1. plass. Delt ledelse leder ingen. */
  isLeader: boolean;
  /** Poeng (stableford) eller netto slag (slagspill). */
  total: number;
  holesPlayed: number;
  /** Brutto slag, bare for slagspill; `null` i stableford. */
  totalGross: number | null;
}

export interface SoloScorecardCell {
  userId: string;
  gross: number | null;
  /** Spillerens eget par på hullet (dame-/junior-tee kan ha annet par). */
  par: number;
  /** Poeng (stableford) eller netto (slagspill); `null` når hullet ikke er spilt. */
  value: number | null;
  /** Den ene hullvinneren. Delt beste er ingen vinner. */
  isBest: boolean;
}

export interface SoloScorecardHole {
  holeNumber: number;
  /** Eget par når alle går fra samme tee, ellers hullets (herre-)par. */
  chipPar: number;
  strokeIndex: number;
  /** Noen har spilt hullet. Ellers står det «Venter». */
  scored: boolean;
  /** Beste først, uspilte sist. */
  rows: SoloScorecardCell[];
}

export interface SoloScorecardSubtotal {
  userId: string;
  /** Sum over spilte hull i nien; `null` når spilleren ikke har spilt noen. */
  sum: number | null;
  isLeader: boolean;
}

export interface SoloScorecardNine {
  holes: SoloScorecardHole[];
  /** I stillingens rekkefølge. */
  subtotals: SoloScorecardSubtotal[];
}

export interface SoloScorecard {
  standings: SoloScorecardStanding[];
  /** Hull 1–9. */
  front: SoloScorecardNine;
  /** Hull 10–18. */
  back: SoloScorecardNine;
}

/** Spillerens tee (`game_players.tee_gender`), eller `undefined` ukjent. */
export type TeeGenderOf = (userId: string) => string | undefined;

type GenderPar = { mens: number; ladies: number; juniors: number };

interface HoleInput {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  parByGender?: GenderPar;
  bestUserIds: string[];
}

/** Negative poeng (modifisert stableford) med ekte minustegn, U+2212. */
export function formatSignedPoints(points: number): string {
  return points < 0 ? `−${Math.abs(points)}` : String(points);
}

/** #734: eget par når alle i feltet går fra samme tee, ellers herre-par. */
function chipParFor(hole: HoleInput, userIds: readonly string[], teeGenderOf: TeeGenderOf): number {
  const first = userIds[0] === undefined ? undefined : teeGenderOf(userIds[0]);
  const allSame = userIds.length > 0 && userIds.every((id) => teeGenderOf(id) === first);
  if (allSame && hole.parByGender && first && first in hole.parByGender) {
    return hole.parByGender[first as keyof GenderPar];
  }
  return hole.par;
}

function buildHole(
  hole: HoleInput,
  cells: SoloScorecardCell[],
  teeGenderOf: TeeGenderOf,
): SoloScorecardHole {
  const winner = hole.bestUserIds.length === 1 ? hole.bestUserIds[0] : null;
  const rows = cells.map((cell) => ({ ...cell, isBest: cell.userId === winner }));
  return {
    holeNumber: hole.holeNumber,
    chipPar: chipParFor(hole, rows.map((r) => r.userId), teeGenderOf),
    strokeIndex: hole.strokeIndex,
    scored: hole.bestUserIds.length > 0,
    rows,
  };
}

function nine(
  holes: SoloScorecardHole[],
  rankedIds: readonly string[],
  better: 'high' | 'low',
): SoloScorecardNine {
  const sums = rankedIds.map((userId) => {
    let sum = 0;
    let played = 0;
    for (const hole of holes) {
      const cell = hole.rows.find((r) => r.userId === userId);
      if (cell && cell.value != null) {
        sum += cell.value;
        played += 1;
      }
    }
    return { userId, sum: played > 0 ? sum : null };
  });
  const playedSums = sums.map((s) => s.sum).filter((s): s is number => s != null);
  const leaderSum =
    playedSums.length === 0 ? null : better === 'high' ? Math.max(...playedSums) : Math.min(...playedSums);
  return {
    holes,
    subtotals: sums.map((s) => ({ ...s, isLeader: s.sum != null && s.sum === leaderSum })),
  };
}

function split(
  holes: SoloScorecardHole[],
  rankedIds: readonly string[],
  better: 'high' | 'low',
): Pick<SoloScorecard, 'front' | 'back'> {
  return {
    front: nine(holes.filter((h) => h.holeNumber <= 9), rankedIds, better),
    back: nine(holes.filter((h) => h.holeNumber >= 10), rankedIds, better),
  };
}

/** Solo stableford og modifisert stableford: flest poeng er best. */
/**
 * Likt på et hull: den som ligger best an i stillingen står først. Uten denne
 * regelen arvet radene rekkefølgen motoren fikk spillerne i, og den er ikke
 * den samme på webben og i appen (#2255 PR 3a).
 */
function byStanding(rankedIds: readonly string[]): (a: { userId: string }, b: { userId: string }) => number {
  const place = new Map(rankedIds.map((id, i) => [id, i]));
  const at = (id: string) => place.get(id) ?? Number.POSITIVE_INFINITY;
  return (a, b) => at(a.userId) - at(b.userId);
}

export function soloStablefordScorecard(
  result: StablefordSoloResult,
  teeGenderOf: TeeGenderOf,
): SoloScorecard {
  const rankedIds = result.players.map((p) => p.userId);
  const tie = byStanding(rankedIds);
  const holes = result.holes.map((hole) => {
    // Flest poeng først; uspilte (brutto null) sist; likt etter stillingen.
    const sorted = [...hole.perPlayer].sort((a, b) => {
      if (a.gross == null && b.gross == null) return tie(a, b);
      if (a.gross == null) return 1;
      if (b.gross == null) return -1;
      return b.points - a.points || tie(a, b);
    });
    const cells = sorted.map((c) => ({
      userId: c.userId,
      gross: c.gross,
      par: c.par,
      value: c.gross == null ? null : c.points,
      isBest: false,
    }));
    return buildHole(hole, cells, teeGenderOf);
  });
  return {
    standings: result.players.map((line) => ({
      userId: line.userId,
      rank: line.rank,
      isLeader: line.rank === 1 && line.tiedWith.length === 0,
      total: line.totalPoints,
      holesPlayed: line.holesPlayed,
      totalGross: null,
    })),
    ...split(holes, rankedIds, 'high'),
  };
}

/** Solo slagspill: lavest netto er best. */
export function soloStrokeplayScorecard(
  result: SoloStrokeplayResult,
  teeGenderOf: TeeGenderOf,
): SoloScorecard {
  const rankedIds = result.players.map((p) => p.userId);
  const tie = byStanding(rankedIds);
  const holes = result.holes.map((hole) => {
    // Lavest netto først; uspilte (netto null) sist; likt etter stillingen.
    const sorted = [...hole.perPlayer].sort(
      (a, b) =>
        (a.net ?? Number.POSITIVE_INFINITY) - (b.net ?? Number.POSITIVE_INFINITY) || tie(a, b),
    );
    const cells = sorted.map((c) => ({
      userId: c.userId,
      gross: c.gross,
      par: c.par,
      value: c.net,
      isBest: false,
    }));
    return buildHole(hole, cells, teeGenderOf);
  });
  return {
    standings: result.players.map((line) => ({
      userId: line.userId,
      rank: line.rank,
      isLeader: line.rank === 1 && line.tiedWith.length === 0,
      total: line.totalNetStrokes,
      holesPlayed: line.holesPlayed,
      totalGross: line.totalGrossStrokes,
    })),
    ...split(holes, rankedIds, 'low'),
  };
}
