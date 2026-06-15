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
