import type {
  LeagueRoundInput,
  LeagueRoundPlayerScore,
  LeagueStandingCell,
  LeagueStandingRow,
  LeagueStandings,
  LeagueStandingsConfig,
  StandingsMetric,
} from './types';

/**
 * Pure season-standings aggregator for a league (#453, epic #452). Mirrors
 * `lib/cup/computeCupLeaderboard` — zero IO. The caller (`getLigaSnapshot`)
 * runs the strokeplay scoring per flight-game and passes net- AND gross-to-par
 * per (round, player) here. `metric` selects which is ranked; lower is better.
 *
 * Fase 2a handles 'total', 'average' and 'best_n'. A round with no results is
 * ignored entirely (no penalty, null cells). Multiple results for the same
 * player in one round are deduped to the best (lowest) on the active metric —
 * a defensive guard so a replay never inflates a standing.
 *
 * - total:   sum over all rounds-with-results; missed → penalty (or unranked
 *            under must_play_all).
 * - average: mean over played rounds; no penalty.
 * - best_n:  sum of the N lowest of {played scores} ∪ {penalty per missed round},
 *            N capped at the number of rounds-with-results. Penalty-fill keeps a
 *            short-season player ranked (last); per-round cells stay played-or-null.
 */
export function computeLeagueStandings(
  config: LeagueStandingsConfig,
  rounds: LeagueRoundInput[],
  playerIds: string[],
  metric: StandingsMetric = 'net',
): LeagueStandings {
  const metricOf = (s: LeagueRoundPlayerScore): number =>
    metric === 'gross' ? s.grossToPar : s.netToPar;

  // Dedupe each round's scores to the best entry per player on the active metric.
  const roundMaps = rounds.map((r) => {
    const byUser = new Map<string, LeagueRoundPlayerScore>();
    for (const s of r.scores) {
      const existing = byUser.get(s.userId);
      if (!existing || metricOf(s) < metricOf(existing)) byUser.set(s.userId, s);
    }
    return { round: r, byUser };
  });

  // Only rounds with at least one result count toward the standing.
  const counting = roundMaps.filter((rm) => rm.byUser.size > 0);

  const rows: LeagueStandingRow[] = playerIds.map((userId) => {
    const perRound: LeagueStandingCell[] = roundMaps.map((rm) => {
      const s = rm.byUser.get(userId);
      return s
        ? {
            roundId: rm.round.roundId,
            toPar: metricOf(s),
            penalised: false,
            deliveredOutsideWindow: s.deliveredOutsideWindow,
          }
        : {
            roundId: rm.round.roundId,
            toPar: null,
            penalised: false,
            deliveredOutsideWindow: false,
          };
    });

    const roundsPlayed = counting.filter((rm) => rm.byUser.has(userId)).length;

    let ranked = true;
    let value = 0;

    if (config.standingsModel === 'average') {
      const played = counting
        .filter((rm) => rm.byUser.has(userId))
        .map((rm) => metricOf(rm.byUser.get(userId)!));
      if (played.length === 0) {
        ranked = false;
      } else {
        value = played.reduce((a, b) => a + b, 0) / played.length;
      }
    } else if (config.standingsModel === 'best_n') {
      // Candidate per counting round: the played score, else the round's penalty.
      const candidates = counting.map((rm) => {
        const s = rm.byUser.get(userId);
        return s ? metricOf(s) : penaltyForRound(config, rm.byUser, metricOf);
      });
      if (candidates.length === 0) {
        ranked = false;
      } else {
        const n = Math.min(config.bestNCount ?? candidates.length, candidates.length);
        value = candidates
          .slice()
          .sort((a, b) => a - b)
          .slice(0, n)
          .reduce((a, b) => a + b, 0);
      }
    } else {
      // total
      let sum = 0;
      let missingAny = false;
      for (const rm of counting) {
        const s = rm.byUser.get(userId);
        if (s) {
          sum += metricOf(s);
          continue;
        }
        missingAny = true;
        if (config.missedRoundPolicy === 'penalty') {
          const pen = penaltyForRound(config, rm.byUser, metricOf);
          sum += pen;
          const cell = perRound.find((c) => c.roundId === rm.round.roundId)!;
          cell.toPar = pen;
          cell.penalised = true;
        }
      }
      value = sum;
      if (config.missedRoundPolicy === 'must_play_all' && missingAny) ranked = false;
    }

    return { userId, value, roundsPlayed, ranked, rank: null, perRound };
  });

  const countingIdsNewestFirst = counting
    .slice()
    .sort((a, b) => b.round.sequence - a.round.sequence)
    .map((rm) => rm.round.roundId);

  const cellValue = (row: LeagueStandingRow, roundId: string): number => {
    const cell = row.perRound.find((c) => c.roundId === roundId);
    // A round the player has no value for counts as worst possible in countback.
    return cell && cell.toPar !== null ? cell.toPar : Number.POSITIVE_INFINITY;
  };

  // Equal under everything except the userId stabiliser → share a rank.
  const tied = (a: LeagueStandingRow, b: LeagueStandingRow): boolean => {
    if (a.value !== b.value || a.roundsPlayed !== b.roundsPlayed) return false;
    return countingIdsNewestFirst.every((id) => cellValue(a, id) === cellValue(b, id));
  };

  const compare = (a: LeagueStandingRow, b: LeagueStandingRow): number => {
    if (a.value !== b.value) return a.value - b.value;
    for (const id of countingIdsNewestFirst) {
      const av = cellValue(a, id);
      const bv = cellValue(b, id);
      if (av !== bv) return av - bv;
    }
    if (a.roundsPlayed !== b.roundsPlayed) return b.roundsPlayed - a.roundsPlayed;
    return a.userId.localeCompare(b.userId);
  };

  const ranked = rows.filter((r) => r.ranked).sort(compare);
  const unranked = rows
    .filter((r) => !r.ranked)
    .sort((a, b) =>
      a.roundsPlayed !== b.roundsPlayed
        ? b.roundsPlayed - a.roundsPlayed
        : a.value !== b.value
          ? a.value - b.value
          : a.userId.localeCompare(b.userId),
    );

  ranked.forEach((row, i) => {
    if (i === 0) {
      row.rank = 1;
    } else {
      const prev = ranked[i - 1];
      row.rank = tied(prev, row) ? prev.rank : i + 1;
    }
  });

  return { rows: [...ranked, ...unranked] };
}

function penaltyForRound(
  config: LeagueStandingsConfig,
  byUser: Map<string, LeagueRoundPlayerScore>,
  metricOf: (s: LeagueRoundPlayerScore) => number,
): number {
  if (config.penaltyKind === 'fixed') return config.penaltyFixedOverPar ?? 0;
  const worst = Math.max(...[...byUser.values()].map(metricOf));
  return worst + 1;
}
