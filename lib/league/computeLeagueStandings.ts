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
 * per (round, player) here. `metric` selects which is ranked.
 *
 * A round with no results is ignored entirely. Multiple results for the same
 * player in one round are deduped to the best entry on the active metric.
 *
 * Two independent directions (Fase 4 #452): the PER-ROUND value can be lower-best
 * (mot-par, slagspill) or higher-best (stableford-poeng) via `config.pointsBased`,
 * and that direction governs dedup, points-placement, penalty and Beste-N. The
 * SEASON value direction (`points`-modellen + alle poeng-baserte formater er
 * høyest-best) governs the final sort + countback. For slagspill er begge lavest-
 * best (uendret) bortsett fra `points`-modellen.
 *
 * - total:   sum over all rounds-with-results; missed → penalty (poeng-liga: 0)
 *            or unranked under must_play_all.
 * - average: mean over played rounds; no penalty.
 * - best_n:  sum of the N best of {played} ∪ {penalty per missed round}, N
 *            capped at rounds-with-results.
 * - points:  per round, players are placed by the active metric (best-first per
 *            `pointsBased`) and earn points descending from the field size
 *            (winner = field size, last = 1; ties share the average). Season =
 *            sum of points, missed round = 0. Always higher-is-better.
 */
export function computeLeagueStandings(
  config: LeagueStandingsConfig,
  rounds: LeagueRoundInput[],
  playerIds: string[],
  metric: StandingsMetric = 'net',
): LeagueStandings {
  const metricOf = (s: LeagueRoundPlayerScore): number =>
    metric === 'gross' ? s.gross : s.net;

  // Per-round value direction (stableford points = higher best) vs season-value
  // direction (points model + every points-based format rank high→low).
  const roundHigherIsBetter = config.pointsBased;
  const seasonHigherIsBetter = config.standingsModel === 'points' || config.pointsBased;
  const usePlacementPoints = config.standingsModel === 'points';
  /** a is a strictly better per-round value than b, in the active direction. */
  const betterRound = (a: number, b: number): boolean =>
    roundHigherIsBetter ? a > b : a < b;

  // Dedupe each round's scores to the best entry per player on the active metric.
  const roundMaps = rounds.map((r) => {
    const byUser = new Map<string, LeagueRoundPlayerScore>();
    for (const s of r.scores) {
      const existing = byUser.get(s.userId);
      if (!existing || betterRound(metricOf(s), metricOf(existing))) byUser.set(s.userId, s);
    }
    return { round: r, byUser };
  });

  // Only rounds with at least one result count toward the standing.
  const counting = roundMaps.filter((rm) => rm.byUser.size > 0);

  // Points model: pre-rank each round and award placement points (descending
  // from the field size, ties sharing the average of the placements they span).
  const pointsByRound = new Map<string, Map<string, number>>();
  if (config.standingsModel === 'points') {
    for (const rm of counting) {
      const entries = [...rm.byUser.entries()]
        .map(([uid, s]) => ({ uid, score: metricOf(s) }))
        // best-first: lower mot-par or higher stableford points → better placement.
        .sort((a, b) => (roundHigherIsBetter ? b.score - a.score : a.score - b.score));
      const n = entries.length;
      const pts = new Map<string, number>();
      let i = 0;
      while (i < n) {
        let j = i;
        while (j + 1 < n && entries[j + 1].score === entries[i].score) j++;
        // Positions i..j tie; base points for position k = n - k.
        let sum = 0;
        for (let k = i; k <= j; k++) sum += n - k;
        const avg = sum / (j - i + 1);
        for (let k = i; k <= j; k++) pts.set(entries[k].uid, avg);
        i = j + 1;
      }
      pointsByRound.set(rm.round.roundId, pts);
    }
  }

  const rows: LeagueStandingRow[] = playerIds.map((userId) => {
    const perRound: LeagueStandingCell[] = roundMaps.map((rm) => {
      const s = rm.byUser.get(userId);
      return s
        ? {
            roundId: rm.round.roundId,
            value: metricOf(s),
            points: null,
            penalised: false,
            deliveredOutsideWindow: s.deliveredOutsideWindow,
          }
        : {
            roundId: rm.round.roundId,
            value: null,
            points: null,
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
      // Per-player guard (#703): a player who appeared in zero counting rounds
      // has no standing yet — mirror the total/average/points branches instead
      // of the weaker global `candidates.length === 0` (which only fired when the
      // whole field was empty, letting penalty-fill rank a never-played player).
      if (roundsPlayed === 0) {
        ranked = false;
      } else {
        const n = Math.min(config.bestNCount ?? candidates.length, candidates.length);
        value = candidates
          .slice()
          // best-first so slice(0, n) keeps the N best in the active direction.
          .sort((a, b) => (roundHigherIsBetter ? b - a : a - b))
          .slice(0, n)
          .reduce((a, b) => a + b, 0);
      }
    } else if (config.standingsModel === 'points') {
      let sum = 0;
      for (const rm of counting) {
        const p = pointsByRound.get(rm.round.roundId)?.get(userId);
        if (p === undefined) continue; // didn't play → 0 points, cell stays null
        sum += p;
        const cell = perRound.find((c) => c.roundId === rm.round.roundId)!;
        cell.points = p;
      }
      value = sum;
      if (roundsPlayed === 0) ranked = false;
    } else {
      // total
      // A player who never appeared in any counting round has no standing yet —
      // mirror the same guard used by average/best_n/points models.
      if (roundsPlayed === 0) ranked = false;
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
          cell.value = pen;
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

  // Season-value direction: points model + every points-based format rank
  // high→low; the slagspill mot-par models rank low→high.
  const worst = seasonHigherIsBetter ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  const byValue = (av: number, bv: number): number => (seasonHigherIsBetter ? bv - av : av - bv);

  const cellValue = (row: LeagueStandingRow, roundId: string): number => {
    const cell = row.perRound.find((c) => c.roundId === roundId);
    // Countback compares placement points under the points model, else the raw
    // per-round value — independent of direction (which the worst-sentinel sets).
    const v = cell ? (usePlacementPoints ? cell.points : cell.value) : null;
    // A round the player has no value for counts as worst possible in countback.
    return v == null ? worst : v;
  };

  // Equal under everything except the userId stabiliser → share a rank.
  const tied = (a: LeagueStandingRow, b: LeagueStandingRow): boolean => {
    if (a.value !== b.value || a.roundsPlayed !== b.roundsPlayed) return false;
    return countingIdsNewestFirst.every((id) => cellValue(a, id) === cellValue(b, id));
  };

  const compare = (a: LeagueStandingRow, b: LeagueStandingRow): number => {
    if (a.value !== b.value) return byValue(a.value, b.value);
    for (const id of countingIdsNewestFirst) {
      const av = cellValue(a, id);
      const bv = cellValue(b, id);
      if (av !== bv) return byValue(av, bv);
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
          ? byValue(a.value, b.value)
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
  // Poeng-liga (stableford): en uteblitt runde teller som 0 poeng — den naturlige
  // straffen (du spilte ingenting, du får ingenting). Eieren valgte dette framfor
  // en retnings-snudd «verste − 1»; straffescore-type-valget skjules da i wizard.
  if (config.pointsBased) return 0;
  if (config.penaltyKind === 'fixed') return config.penaltyFixedOverPar ?? 0;
  // Slagspill: dårligste talte mot-par i runden + 1 slag (skalerer med banen).
  const worst = Math.max(...[...byUser.values()].map(metricOf));
  return worst + 1;
}
