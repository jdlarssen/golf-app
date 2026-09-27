export interface TeamForRanking {
  id: number;
  holes: number[];  // length 18 expected
}

export interface RankedTeam {
  id: number;
  holes: number[];
  rank: number;
  total: number;
  tiedWith: number[];
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function rankTeams(teams: TeamForRanking[]): RankedTeam[] {
  const withTotals = teams.map((t) => ({
    ...t,
    total: sum(t.holes),
    back9: sum(t.holes.slice(9, 18)),
    back6: sum(t.holes.slice(12, 18)),
    back3: sum(t.holes.slice(15, 18)),
    hole18: t.holes[17],
  }));

  withTotals.sort(
    (a, b) =>
      a.total - b.total ||
      a.back9 - b.back9 ||
      a.back6 - b.back6 ||
      a.back3 - b.back3 ||
      a.hole18 - b.hole18,
  );

  return withTotals.map((t, i) => {
    const tiedWith = withTotals
      .filter(
        (other, j) =>
          j !== i &&
          other.total === t.total &&
          other.back9 === t.back9 &&
          other.back6 === t.back6 &&
          other.back3 === t.back3 &&
          other.hole18 === t.hole18,
      )
      .map((o) => o.id);
    // Shared rank for ties: find the first index in withTotals whose all 5 tier
    // values match this team's. That index + 1 is the rank.
    const firstTiedIndex = withTotals.findIndex(
      (other) =>
        other.total === t.total &&
        other.back9 === t.back9 &&
        other.back6 === t.back6 &&
        other.back3 === t.back3 &&
        other.hole18 === t.hole18,
    );
    return {
      id: t.id,
      holes: t.holes,
      total: t.total,
      rank: firstTiedIndex + 1,
      tiedWith,
    };
  });
}

/**
 * Padding-verdi for uspilte hull i ranking-arrays som mates til `rankTeams`.
 *
 * `rankTeams` sorterer stigende (lavest sum vinner) og er format-agnostisk —
 * den vet ikke om et lag/en spiller faktisk har spilt. Uten padding ville en
 * deltaker uten ett eneste registrert hull fått sum 0 (laveste = best) og blitt
 * kåret som vinner (#635). Ved å erstatte uspilte hull med en stor verdi
 * rangeres de som verre enn enhver realistisk score. 999 er trygt: et hull med
 * 999 slag dominerer alle realistiske sammenligninger.
 *
 * `soloStrokeplay`/`nassau` padder ALLE uspilte hull (færre spilte hull
 * rangerer dårligere). Lag-strokeplay-formatene (best ball, texas/ambrose/
 * florida, shamble) padder kun lag som har spilt NULL hull, slik at delvis
 * spilte lag beholder sin eksisterende rangering.
 */
export const UNPLAYED_PADDING = 999;

/**
 * 18-slot ranking array for `rankTeams`, indexed on HOLE NUMBER (#2217 D5).
 * ETT hjem for regelen: best ball-motoren (`bestBall.ts`, #1441 D11) og
 * tavla/drilldownen/CSV-en (`lib/leaderboard.ts`) leser begge herfra.
 *
 * `rankTeams`' tie-break-cascade (back9/back6/back3/hull 18) leser plass 9–17
 * og antar at plass i er hull i+1. Fylt etter POSISJON havnet et back9-spills
 * hull 10–18 på plass 0–8, og alle lag sto likt på 0 i hvert tie-break-trinn.
 *
 * - plass i er hull i+1
 * - hull utenfor scope (ingen rad, f.eks. 1–9 i et back9-spill) får 0 — de er
 *   ikke «manglende» for laget, de er ikke en del av kampen
 * - et manglende hull i scope får 0 når laget har spilt minst ett hull i
 *   scope, ellers `UNPLAYED_PADDING` (#635: sum 0 skal ikke kåre en vinner)
 */
export function rankingHolesByNumber(
  holes: ReadonlyArray<{ holeNumber: number; teamNet: number | null }>,
): number[] {
  const playedAny = holes.some((h) => h.teamNet != null);
  const teamNetByHoleNumber = new Map(holes.map((h) => [h.holeNumber, h.teamNet]));
  return Array.from({ length: 18 }, (_, i) => {
    const holeNumber = i + 1;
    if (!teamNetByHoleNumber.has(holeNumber)) return 0;
    return teamNetByHoleNumber.get(holeNumber) ?? (playedAny ? 0 : UNPLAYED_PADDING);
  });
}
