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
