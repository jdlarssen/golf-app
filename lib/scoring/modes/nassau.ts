// Nassau (issue #276): tre konkurranser i én runde — front 9, back 9, total 18.
//
// Hver seksjon er sin egen strokeplay-rangering (lavest sum av effective-
// strokes vinner). En spiller som vinner en seksjon alene får 1 unit; tied
// seksjon = push (ingen unit deles ut, klassisk Nassau-regel). En spiller som
// tar alle tre kalles en sweep (units = 3).
//
// Strukturelt er Nassau tre lag av soloStrokeplay-scoring stablet oppå
// hverandre, så vi gjenbruker padding-strategien og rankTeams-cascaden derfra.
//
// Gross/net-toggle som Wolf: `mode_config.nassau_scoring` ('gross' | 'net').
//   - 'net':   effective = gross − strokesForHole(courseHandicap, strokeIndex)
//   - 'gross': effective = gross (HCP ignoreres)
//
// Padding-strategi (lik soloStrokeplay): unplayed-hull padder med
// UNPLAYED_PADDING = 999 i ranking-arrayet før rankTeams. For front 9 og
// back 9 padder vi opp til 18 elementer slik at rankTeams sin back-9/back-6/
// back-3/hole-18-indeksering fortsatt fungerer (cascaden bryter på første
// posisjon der spillerne differerer, så det er trygt — padding-verdiene er
// like for begge så de bryter ingenting).

import { strokesForHole } from '../strokeAllocation';
import { rankTeams } from '../tiebreaker';
import type {
  NassauResult,
  NassauSection,
  NassauSectionLine,
  NassauUnitLine,
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
} from './types';

/**
 * Padding-konstant for unplayed-hull i tie-break-cascaden. Samme verdi som
 * soloStrokeplay — se JSDoc der for full begrunnelse.
 */
const UNPLAYED_PADDING = 999;

interface PlayerSectionStrokes {
  userId: string;
  /** Effective-strokes per hull i seksjonen, UNPLAYED_PADDING for unplayed. */
  perHoleEffectiveForRanking: number[];
  /** Sum av effective-strokes for spilte hull. */
  totalEffectiveStrokes: number;
  /** Sum av gross-strokes for spilte hull. */
  totalGrossStrokes: number;
  holesPlayed: number;
}

function effectiveFor(
  scoringMode: 'gross' | 'net',
  gross: number,
  courseHandicap: number,
  strokeIndex: number,
): number {
  if (scoringMode === 'gross') return gross;
  return gross - strokesForHole(courseHandicap, strokeIndex);
}

function computeSectionStrokes(
  player: ScoringPlayer,
  sectionHoles: ScoringHole[],
  grossByKey: Map<string, number | null>,
  scoringMode: 'gross' | 'net',
): PlayerSectionStrokes {
  const perHoleEffectiveForRanking: number[] = [];
  let totalEffectiveStrokes = 0;
  let totalGrossStrokes = 0;
  let holesPlayed = 0;

  for (const hole of sectionHoles) {
    const gross = grossByKey.get(`${player.userId}#${hole.number}`) ?? null;
    if (gross === null) {
      perHoleEffectiveForRanking.push(UNPLAYED_PADDING);
      continue;
    }
    const effective = effectiveFor(
      scoringMode,
      gross,
      player.courseHandicap,
      hole.strokeIndex,
    );
    perHoleEffectiveForRanking.push(effective);
    totalEffectiveStrokes += effective;
    totalGrossStrokes += gross;
    holesPlayed += 1;
  }

  return {
    userId: player.userId,
    perHoleEffectiveForRanking,
    totalEffectiveStrokes,
    totalGrossStrokes,
    holesPlayed,
  };
}

/**
 * Padder ranking-arrayet til 18 elementer med UNPLAYED_PADDING. Front 9 og
 * back 9 har naturlig 9 elementer; padding til 18 sikrer at rankTeams sin
 * back-9/back-6/back-3/hole-18-indeksering ikke crasher. Padding-verdier er
 * like for alle spillere så de bryter ingen tie-cascade.
 */
function padTo18(perHole: number[]): number[] {
  if (perHole.length >= 18) return perHole.slice(0, 18);
  return [...perHole, ...Array(18 - perHole.length).fill(UNPLAYED_PADDING)];
}

function computeSection(
  name: 'front9' | 'back9' | 'total18',
  sectionHoles: ScoringHole[],
  players: ScoringPlayer[],
  grossByKey: Map<string, number | null>,
  scoringMode: 'gross' | 'net',
): NassauSection {
  const holeNumbers = sectionHoles.map((h) => h.number);
  const expectedHoleCount = sectionHoles.length;

  const playerStrokes = players.map((p) =>
    computeSectionStrokes(p, sectionHoles, grossByKey, scoringMode),
  );

  const teamsForRanking = playerStrokes.map((p, i) => ({
    id: i,
    holes: padTo18(p.perHoleEffectiveForRanking),
  }));

  const ranked = rankTeams(teamsForRanking);

  const sectionPlayers: NassauSectionLine[] = ranked.map((r) => {
    const source = playerStrokes[r.id];
    const tiedWithUserIds = r.tiedWith.map((idx) => playerStrokes[idx].userId);
    return {
      userId: source.userId,
      totalEffectiveStrokes: source.totalEffectiveStrokes,
      totalGrossStrokes: source.totalGrossStrokes,
      holesPlayed: source.holesPlayed,
      rank: r.rank,
      tiedWith: tiedWithUserIds,
    };
  });

  // Pending: ingen spiller har spilt alle hull i seksjonen ennå.
  const isPending = !playerStrokes.some(
    (p) => p.holesPlayed === expectedHoleCount,
  );

  // Vinner-utdeling skjer kun når seksjonen ikke er pending. Da plukkes alle
  // spillere med rank=1 etter cascade. Lengde 1 = ren vinner (får unit),
  // lengde >1 = push (ingen unit deles ut).
  const winnerUserIds = isPending
    ? []
    : sectionPlayers.filter((p) => p.rank === 1).map((p) => p.userId);

  return {
    name,
    holeNumbers,
    players: sectionPlayers,
    winnerUserIds,
    isPending,
  };
}

/**
 * Beregner Nassau-leaderboard fra en ScoringContext. Lager tre stacked
 * strokeplay-rangeringer (front 9, back 9, total 18) og en aggregert
 * unit-ranking på topp.
 *
 * Defensive fallbacks:
 *  - Hvis `mode_config.nassau_scoring` mangler/feil shape → fall til 'net'.
 *    Speiler fourball/foursomes allowance_pct-pattern. Validatoren i
 *    `lib/games/gamePayload.ts` håndhever feltet ved publish, men draft-state
 *    eller migrerte data kan mangle det.
 */
export function compute(ctx: ScoringContext): NassauResult {
  // Defensive fallback: mode_config kan være ufullstendig i draft-state.
  const cfg = ctx.game.mode_config as { nassau_scoring?: 'gross' | 'net' };
  const scoringMode: 'gross' | 'net' =
    cfg.nassau_scoring === 'gross' || cfg.nassau_scoring === 'net'
      ? cfg.nassau_scoring
      : 'net';

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  const front9Holes = holesSorted.filter(
    (h) => h.number >= 1 && h.number <= 9,
  );
  const back9Holes = holesSorted.filter(
    (h) => h.number >= 10 && h.number <= 18,
  );
  const total18Holes = holesSorted;

  const front9 = computeSection(
    'front9',
    front9Holes,
    ctx.players,
    grossByKey,
    scoringMode,
  );
  const back9 = computeSection(
    'back9',
    back9Holes,
    ctx.players,
    grossByKey,
    scoringMode,
  );
  const total18 = computeSection(
    'total18',
    total18Holes,
    ctx.players,
    grossByKey,
    scoringMode,
  );

  // Aggregate units. En spiller får 1 unit per seksjon hvor de står alene
  // som rank 1 (winnerUserIds.length === 1). Push = ingen unit.
  const playersAggregated: NassauUnitLine[] = ctx.players.map((p) => {
    const wonFront9 =
      front9.winnerUserIds.length === 1 &&
      front9.winnerUserIds[0] === p.userId;
    const wonBack9 =
      back9.winnerUserIds.length === 1 &&
      back9.winnerUserIds[0] === p.userId;
    const wonTotal18 =
      total18.winnerUserIds.length === 1 &&
      total18.winnerUserIds[0] === p.userId;
    const units = (wonFront9 ? 1 : 0) + (wonBack9 ? 1 : 0) + (wonTotal18 ? 1 : 0);

    const total18Line = total18.players.find((pl) => pl.userId === p.userId);
    const total18EffectiveStrokes = total18Line?.totalEffectiveStrokes ?? 0;

    return {
      userId: p.userId,
      units,
      unitBreakdown: {
        front9: wonFront9,
        back9: wonBack9,
        total18: wonTotal18,
      },
      total18EffectiveStrokes,
      rank: 0, // settes etter sortering
      tiedWith: [], // settes etter sortering
    };
  });

  // Ranking: units desc, så total18EffectiveStrokes asc, så userId asc
  // (deterministisk tiebreaker når alt annet er likt).
  playersAggregated.sort((a, b) => {
    if (a.units !== b.units) return b.units - a.units;
    if (a.total18EffectiveStrokes !== b.total18EffectiveStrokes) {
      return a.total18EffectiveStrokes - b.total18EffectiveStrokes;
    }
    return a.userId.localeCompare(b.userId);
  });

  // Tildel rank med shared-rank-håndtering: spillere med samme (units,
  // total18EffectiveStrokes) deler rank og refererer hverandre i tiedWith.
  for (let i = 0; i < playersAggregated.length; i++) {
    const cur = playersAggregated[i];
    const firstTiedIndex = playersAggregated.findIndex(
      (other) =>
        other.units === cur.units &&
        other.total18EffectiveStrokes === cur.total18EffectiveStrokes,
    );
    cur.rank = firstTiedIndex + 1;
    cur.tiedWith = playersAggregated
      .filter(
        (other, j) =>
          j !== i &&
          other.units === cur.units &&
          other.total18EffectiveStrokes === cur.total18EffectiveStrokes,
      )
      .map((other) => other.userId);
  }

  return {
    kind: 'nassau',
    scoring: scoringMode,
    sections: { front9, back9, total18 },
    players: playersAggregated,
  };
}
