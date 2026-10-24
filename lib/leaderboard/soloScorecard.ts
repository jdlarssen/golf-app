import type {
  SoloStrokeplayResult,
  StablefordSoloResult,
} from '@/lib/scoring/modes/types';
import { byStanding, inStandingOrder } from './standingOrder';
import { formatVsPar, headlineUnit } from './vsPar';

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
  /**
   * #2625: mot par — poeng mot par-tempo (stableford) eller netto mot par
   * (slagspill); `null` uten spilte hull. Stillingen leder med det når
   * `SoloScorecard.ranking` er `'net_to_par'`.
   */
  toPar: number | null;
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
  /**
   * #2625: against the player's own par — points against par pace (stableford)
   * or net − par (strokeplay); `null` when the hole is not played. A game
   * ranked on net to par orders the rows and picks the nine's leader on it.
   */
  toPar: number | null;
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
  /** #2625: in a game ranked on net to par, the best to par over the nine leads. */
  isLeader: boolean;
}

export interface SoloScorecardNine {
  holes: SoloScorecardHole[];
  /** I stillingens rekkefølge. */
  subtotals: SoloScorecardSubtotal[];
}

export interface SoloScorecard {
  /**
   * #2625: regelen stillingen er rangert etter, fra resultatet. Ved
   * `'net_to_par'` viser stillingen `toPar`, så tallet og rekkefølgen stemmer.
   */
  ranking: 'net_to_par' | 'net_total';
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

/**
 * #2625: the number a standing row shows — to par («+3», «E», «−2») or the sum
 * in the view's own form (`plain`: points with U+2212, or net strokes), as
 * `standingUnit` chooses, so the web and the app show the number the order
 * is ranked on.
 */
export function standingTotalText(
  card: Pick<SoloScorecard, 'ranking'>,
  line: Pick<SoloScorecardStanding, 'total' | 'toPar'>,
  plain: (total: number) => string,
): string {
  return standingUnit(card) === 'toPar' ? formatVsPar(line.toPar) : plain(line.total);
}

/**
 * #2625: what the standing leads with — to par in a game ranked on net to par,
 * else the sum. The rule is `headlineUnit`'s; the number
 * (`standingTotalText`) and the heading («Stillingen · mot par») read it here.
 */
export function standingUnit(card: Pick<SoloScorecard, 'ranking'>): 'toPar' | 'total' {
  return headlineUnit(card.ranking);
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

/**
 * #2625: the nine's leader is picked on what the game ranks on — the sum, or
 * in a game ranked on net to par the to par over the played holes, so a player
 * with fewer holes in the nine is not passed over on the smaller sum. The row
 * still shows the sum.
 */
function nine(
  holes: SoloScorecardHole[],
  rankedIds: readonly string[],
  better: 'high' | 'low',
  ranking: SoloScorecard['ranking'],
): SoloScorecardNine {
  const sums = rankedIds.map((userId) => {
    let sum = 0;
    let toPar = 0;
    let played = 0;
    for (const hole of holes) {
      const cell = hole.rows.find((r) => r.userId === userId);
      if (cell && cell.value != null) {
        sum += cell.value;
        toPar += cell.toPar ?? 0;
        played += 1;
      }
    }
    const measure = ranking === 'net_to_par' ? toPar : sum;
    return { userId, sum: played > 0 ? sum : null, measure: played > 0 ? measure : null };
  });
  const measures = sums.map((s) => s.measure).filter((m): m is number => m != null);
  const leader =
    measures.length === 0 ? null : better === 'high' ? Math.max(...measures) : Math.min(...measures);
  return {
    holes,
    subtotals: sums.map(({ userId, sum, measure }) => ({
      userId,
      sum,
      isLeader: measure != null && measure === leader,
    })),
  };
}

function split(
  holes: SoloScorecardHole[],
  rankedIds: readonly string[],
  better: 'high' | 'low',
  ranking: SoloScorecard['ranking'],
): Pick<SoloScorecard, 'front' | 'back'> {
  return {
    front: nine(holes.filter((h) => h.holeNumber <= 9), rankedIds, better, ranking),
    back: nine(holes.filter((h) => h.holeNumber >= 10), rankedIds, better, ranking),
  };
}

/** Solo stableford og modifisert stableford: flest poeng er best. */
export function soloStablefordScorecard(
  result: StablefordSoloResult,
  teeGenderOf: TeeGenderOf,
): SoloScorecard {
  const players = inStandingOrder(result.players);
  const rankedIds = players.map((p) => p.userId);
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
      toPar: c.gross == null ? null : c.toPar,
    }));
    return buildHole(hole, cells, teeGenderOf);
  });
  return {
    ranking: result.ranking,
    standings: players.map((line) => ({
      userId: line.userId,
      rank: line.rank,
      isLeader: line.rank === 1 && line.tiedWith.length === 0,
      total: line.totalPoints,
      toPar: line.toPar,
      holesPlayed: line.holesPlayed,
      totalGross: null,
    })),
    ...split(holes, rankedIds, 'high', result.ranking),
  };
}

/** Solo slagspill: lavest netto er best. */
export function soloStrokeplayScorecard(
  result: SoloStrokeplayResult,
  teeGenderOf: TeeGenderOf,
): SoloScorecard {
  const players = inStandingOrder(result.players);
  const rankedIds = players.map((p) => p.userId);
  const tie = byStanding(rankedIds);
  // #2625: a game ranked on net to par orders the rows on net − own par, the
  // measure the hole winner is picked on, so the ★ row stands first.
  const measure = (c: { net: number | null; par: number }) =>
    c.net == null ? Number.POSITIVE_INFINITY : result.ranking === 'net_to_par' ? c.net - c.par : c.net;
  const holes = result.holes.map((hole) => {
    // Lavest netto først; uspilte (netto null) sist; likt etter stillingen.
    const sorted = [...hole.perPlayer].sort((a, b) => measure(a) - measure(b) || tie(a, b));
    const cells = sorted.map((c) => ({
      userId: c.userId,
      gross: c.gross,
      par: c.par,
      value: c.net,
      isBest: false,
      toPar: c.net == null ? null : c.net - c.par,
    }));
    return buildHole(hole, cells, teeGenderOf);
  });
  return {
    ranking: result.ranking,
    standings: players.map((line) => ({
      userId: line.userId,
      rank: line.rank,
      isLeader: line.rank === 1 && line.tiedWith.length === 0,
      total: line.totalNetStrokes,
      toPar: line.netToPar,
      holesPlayed: line.holesPlayed,
      totalGross: line.totalGrossStrokes,
    })),
    ...split(holes, rankedIds, 'low', result.ranking),
  };
}
