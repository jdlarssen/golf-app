// Nines / Split Sixes (issue #278): individuelt 3-spiller poeng-format.
//
// Hvert hull deler ut en fast pott etter effective-score-rangering:
//   - Nines:       9 poeng per hull — lavest 5, nest 3, høyest 1
//   - Split Sixes: 6 poeng per hull — lavest 4, nest 2, høyest 0
//
// Poeng-fordeling (split ved tie):
//   Sortér spillere etter effectiveScore ASC. Walk grupper av EKSAKT lik
//   effectiveScore. En gruppe som opptar sorterte posisjoner [i..i+size-1]
//   får gjennomsnitt av pot[i..i+size-1] (out-of-range → 0). Poengene
//   summerer alltid opp til pot-total for et fullt spilt hull.
//
//   Eksempel (Nines, pot=[5,3,1]):
//   - Alle ulike: lavest → 5, midt → 3, høyest → 1.
//   - To delt lavest: (5+3)/2=4 each, tredje → 1.
//   - To delt høyest: lavest → 5, (3+1)/2=2 each.
//   - Alle tre like: (5+3+1)/3=3 each.
//
// Pending: mangler minst én spillers gross → hullet deler ikke ut poeng (alle
// 0). INGEN carryover — hvert hull er UAVHENGIG. Senere hull avgjøres normalt
// (forskjell fra Skins der ett pending hull fryser alle påfølgende).
//
// Net vs gross (effectiveFor — identisk mønster som skins.ts):
//   - 'gross': effectiveScore = gross (HCP ignoreres).
//   - 'net':   effectiveScore = gross − strokesForHole(courseHandicap, SI).
//
// Ranking: totalPoints DESC, deterministisk userId.localeCompare-fallback.
// Full 5-tier-cascade utelates i v1 (samme avgjørelse som Wolf/Skins).

import { strokesForHole } from '../strokeAllocation';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  NinesHoleRow,
  NinesPlayerLine,
  NinesResult,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function effectiveFor(
  scoringMode: 'gross' | 'net',
  gross: number,
  courseHandicap: number,
  strokeIndex: number,
): number {
  if (scoringMode === 'gross') return gross;
  return gross - strokesForHole(courseHandicap, strokeIndex);
}

interface PlayerWorkingState {
  totalPoints: number;
  holesScored: number;
}

/**
 * Rank-en spillerne etter totalPoints DESC, userId.localeCompare ASC som
 * deterministisk fallback. Shared rank for spillere med EKSAKT samme
 * totalPoints. `tiedWith` lister userIds med akkurat samme totalPoints.
 */
function rankPlayers(
  players: ScoringPlayer[],
  working: Map<string, PlayerWorkingState>,
): NinesPlayerLine[] {
  type Row = { player: ScoringPlayer; state: PlayerWorkingState };
  const rows: Row[] = players.map((p) => ({
    player: p,
    state: working.get(p.userId) ?? { totalPoints: 0, holesScored: 0 },
  }));

  rows.sort((a, b) => {
    if (b.state.totalPoints !== a.state.totalPoints) {
      return b.state.totalPoints - a.state.totalPoints;
    }
    // Deterministisk fallback når alt er likt.
    return a.player.userId.localeCompare(b.player.userId);
  });

  return rows.map((row, idx) => {
    const tiedWith = rows
      .filter(
        (other, j) =>
          j !== idx && other.state.totalPoints === row.state.totalPoints,
      )
      .map((o) => o.player.userId);

    const firstTiedIndex = rows.findIndex(
      (other) => other.state.totalPoints === row.state.totalPoints,
    );

    return {
      userId: row.player.userId,
      totalPoints: row.state.totalPoints,
      holesScored: row.state.holesScored,
      rank: firstTiedIndex + 1,
      tiedWith,
    };
  });
}

// ---------------------------------------------------------------------------
// Main compute
// ---------------------------------------------------------------------------

/**
 * Beregner Nines/Split-Sixes-leaderboard fra en ScoringContext.
 *
 * Designet for nøyaktig 3 spillere (validatoren i `lib/games/gamePayload.ts`
 * håndhever dette), men degraderer trygt for n≠3 — pot[k] indekseres med
 * ?? 0 for out-of-range posisjoner, slik at summer alltid er korrekte for
 * det antallet spillere som faktisk er med.
 *
 * Defensive fallback: hvis `mode_config.nines_variant`/`nines_scoring` mangler
 * eller har feil shape → variant='nines', scoring='net'. Speiler skins.ts-mønstret.
 */
export function compute(ctx: ScoringContext): NinesResult {
  const cfg = ctx.game.mode_config as {
    nines_variant?: 'nines' | 'split_sixes';
    nines_scoring?: 'gross' | 'net';
  };
  const variant: 'nines' | 'split_sixes' =
    cfg.nines_variant === 'split_sixes' ? 'split_sixes' : 'nines';
  const scoring: 'gross' | 'net' =
    cfg.nines_scoring === 'gross' || cfg.nines_scoring === 'net'
      ? cfg.nines_scoring
      : 'net';

  const pot: number[] = variant === 'nines' ? [5, 3, 1] : [4, 2, 0];

  // Indekser scores for O(1)-lookup per (userId, holeNumber).
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  const working = new Map<string, PlayerWorkingState>();
  for (const p of ctx.players) {
    working.set(p.userId, { totalPoints: 0, holesScored: 0 });
  }

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);

  const holeRows: NinesHoleRow[] = [];

  for (const hole of holesSorted) {
    const cells = buildCells(hole, ctx.players, grossByKey, scoring);

    const pending = cells.some((c) => c.gross === null);

    if (pending) {
      const pointsByPlayer: Record<string, number> = {};
      for (const c of cells) pointsByPlayer[c.userId] = 0;
      holeRows.push({
        holeNumber: hole.number,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
        pending: true,
        perPlayer: cells.map((c) => ({ ...c, points: 0 })),
        pointsByPlayer,
      });
      continue;
    }

    // Sort a COPY ascending by effectiveScore to compute points.
    const sorted = [...cells].sort(
      (a, b) => (a.effectiveScore as number) - (b.effectiveScore as number),
    );

    const pointsMap = new Map<string, number>();

    // Walk groups of equal effectiveScore.
    let i = 0;
    while (i < sorted.length) {
      const groupScore = sorted[i].effectiveScore as number;
      let j = i;
      // Extend group while effectiveScore is identical.
      while (j < sorted.length && (sorted[j].effectiveScore as number) === groupScore) {
        j++;
      }
      // Group occupies sorted positions [i .. j-1].
      const size = j - i;
      let sumPot = 0;
      for (let k = i; k < j; k++) {
        sumPot += pot[k] ?? 0;
      }
      const share = sumPot / size;
      for (let k = i; k < j; k++) {
        pointsMap.set(sorted[k].userId, share);
      }
      i = j;
    }

    // Build pointsByPlayer in original ctx.players order.
    const pointsByPlayer: Record<string, number> = {};
    for (const p of ctx.players) {
      pointsByPlayer[p.userId] = pointsMap.get(p.userId) ?? 0;
    }

    // Update working totals.
    for (const p of ctx.players) {
      const state = working.get(p.userId);
      if (state) {
        state.totalPoints += pointsByPlayer[p.userId];
        state.holesScored += 1;
      }
    }

    holeRows.push({
      holeNumber: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      pending: false,
      perPlayer: cells.map((c) => ({
        ...c,
        points: pointsByPlayer[c.userId],
      })),
      pointsByPlayer,
    });
  }

  const players = rankPlayers(ctx.players, working);

  return {
    kind: 'nines',
    variant,
    scoring,
    holes: holeRows,
    players,
  };
}

// ---------------------------------------------------------------------------
// buildCells — per-hull per-spiller gross + effectiveScore
// ---------------------------------------------------------------------------

function buildCells(
  hole: ScoringHole,
  players: ScoringPlayer[],
  grossByKey: Map<string, number | null>,
  scoring: 'gross' | 'net',
): Array<{ userId: string; gross: number | null; effectiveScore: number | null }> {
  return players.map((p) => {
    const gross = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;
    const effectiveScore =
      gross === null
        ? null
        : effectiveFor(scoring, gross, p.courseHandicap, hole.strokeIndex);
    return { userId: p.userId, gross, effectiveScore };
  });
}
