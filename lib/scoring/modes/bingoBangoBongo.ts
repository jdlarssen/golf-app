// Bingo Bango Bongo-scoring (issue #277): tre prestasjons-poeng per hull.
//
// Per hull deles tre poeng ut:
//   - Bingo: første ball på green
//   - Bango: nærmest hullet når alle baller er på green
//   - Bongo: første ball i hull
//
// Poengene er rene prestasjons-poeng og utledes IKKE fra slag. Slag registreres
// via det eksisterende scorekortet (uendret maskineri) men teller ikke for
// BBB-poeng — `ctx.scores` leses ikke av denne modulen.
//
// Input fra `bingoBangoBongoHoles`-feltet på ScoringContext, fylt inn av
// leaderboard/hull-page fra `bingo_bango_bongo_holes`-tabellen i DB. Speiler
// `wolfChoices?`-mønstret fra wolf-modulen.
//
// Tiebreak-kaskade (ikke slag-basert — full 5-tier cascade gjelder ikke):
//   1. totalPoints DESC
//   2. bingos DESC (flest bingos)
//   3. bongos DESC (flest bongos)
//   4. Delt rank (`tiedWith`-array satt) — bangos skiller ikke videre i v1.

import type {
  ScoringContext,
  BingoBangoBongoResult,
  BingoBangoBongoHoleRow,
  BingoBangoBongoPlayerLine,
} from './types';

interface PlayerAccumulator {
  userId: string;
  bingos: number;
  bangos: number;
  bongos: number;
}

/**
 * Beregner Bingo Bango Bongo-leaderboard fra en ScoringContext.
 *
 * For hvert hull 1..18:
 *   - Finn matching input-rad fra `ctx.bingoBangoBongoHoles` (mangler = ingen poeng).
 *   - Gi 1 poeng til bingoUserId, bangoUserId og bongoUserId (null = ingen).
 *   - Samme spiller kan vinne alle tre på ett hull (3 poeng) — lovlig.
 *
 * Aggreger per spiller: bingos/bangos/bongos/totalPoints.
 * Rang på totalPoints desc; tiebreak: bingos desc, bongos desc, deretter delt rank.
 *
 * Pure function — ingen side-effects. `ctx.scores` ignoreres.
 */
export function compute(ctx: ScoringContext): BingoBangoBongoResult {
  // Indekser input-rader per hullnummer for O(1)-lookup.
  const holeInputByNumber = new Map(
    (ctx.bingoBangoBongoHoles ?? []).map((h) => [h.holeNumber, h]),
  );

  // Initialiser akkumulatorer for alle spillere.
  const accByPlayer = new Map<string, PlayerAccumulator>();
  for (const p of ctx.players) {
    accByPlayer.set(p.userId, {
      userId: p.userId,
      bingos: 0,
      bangos: 0,
      bongos: 0,
    });
  }

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const holeRows: BingoBangoBongoHoleRow[] = [];

  for (const hole of holesSorted) {
    const input = holeInputByNumber.get(hole.number);
    const pointsByPlayer: Record<string, number> = {};

    if (!input) {
      // Hull uten registrert rad — ingen poeng deles ut. Lovlig, jf. spec.
      holeRows.push({
        holeNumber: hole.number,
        bingoUserId: null,
        bangoUserId: null,
        bongoUserId: null,
        pointsByPlayer,
      });
      continue;
    }

    // Tildel poeng for bingo, bango og bongo (null = ingen mottaker).
    function awardPoint(
      userId: string | null,
      category: 'bingos' | 'bangos' | 'bongos',
    ): void {
      if (!userId) return;
      const acc = accByPlayer.get(userId);
      if (!acc) return; // ukjent spiller — defensivt hopp
      acc[category] += 1;
      pointsByPlayer[userId] = (pointsByPlayer[userId] ?? 0) + 1;
    }

    awardPoint(input.bingoUserId, 'bingos');
    awardPoint(input.bangoUserId, 'bangos');
    awardPoint(input.bongoUserId, 'bongos');

    holeRows.push({
      holeNumber: hole.number,
      bingoUserId: input.bingoUserId,
      bangoUserId: input.bangoUserId,
      bongoUserId: input.bongoUserId,
      pointsByPlayer,
    });
  }

  // Bygg sortert spiller-liste og rang.
  const accList = [...accByPlayer.values()].map((acc) => ({
    ...acc,
    totalPoints: acc.bingos + acc.bangos + acc.bongos,
  }));

  // Sorter: totalPoints DESC → bingos DESC → bongos DESC.
  accList.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.bingos !== a.bingos) return b.bingos - a.bingos;
    return b.bongos - a.bongos;
  });

  // Beregn rang med delt-rang-støtte (tiedWith-array satt for identiske cascade).
  const players: BingoBangoBongoPlayerLine[] = accList.map((acc, idx) => {
    // Finn alle med eksakt samme cascade-verdier.
    const tiedWith = accList
      .filter(
        (other, j) =>
          j !== idx &&
          other.totalPoints === acc.totalPoints &&
          other.bingos === acc.bingos &&
          other.bongos === acc.bongos,
      )
      .map((o) => o.userId);

    // Shared rank: første index med same cascade som denne spilleren.
    const firstTiedIndex = accList.findIndex(
      (other) =>
        other.totalPoints === acc.totalPoints &&
        other.bingos === acc.bingos &&
        other.bongos === acc.bongos,
    );

    return {
      userId: acc.userId,
      bingos: acc.bingos,
      bangos: acc.bangos,
      bongos: acc.bongos,
      totalPoints: acc.totalPoints,
      rank: firstTiedIndex + 1,
      tiedWith,
    };
  });

  return {
    kind: 'bingo_bango_bongo',
    holes: holeRows,
    players,
  };
}
