// Acey Deucey (issue #279) — 4-spiller per-hull point-game.
//
// Per hull: sammenlign 4 spilleres effektive score (gross eller net).
//   - Unique lowest («ace»)  → +3 poeng
//   - Unique highest («deuce») → −3 poeng
//   - De to midtre → 0 poeng
//
// Tie-regler (uavhengige):
//   - Delt lavest → ingen ace (0 til alle på den siden)
//   - Delt høyest → ingen deuce (0 til alle på den siden)
//   - Alle like → verken ace eller deuce — alle 0
//
// Hull-prosessering: uavhengig (ikke frys). Et hull der ikke alle 4 spillere
// har score gir 0 til alle det hullet, men neste hull prosesseres normalt
// (Modified Stableford-modellen, ikke Skins-frys-modellen).
//
// Løpende total kan bli negativ (deuce på flere hull).
//
// Brutto/netto-bryter (mode_config.acey_deucey_scoring):
//   'gross' → effective = gross
//   'net'   → effective = gross − strokesForHole(courseHandicap, strokeIndex)
//
// Ranking: total DESC → flest aces DESC → delt rank (tiedWith satt).

import { strokesForHole } from '../strokeAllocation';
import type {
  ScoringContext,
  ScoringPlayer,
  AceyDeuceyHoleRow,
  AceyDeuceyPlayerLine,
  AceyDeuceyResult,
} from './types';

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
  total: number;
  aces: number;
  deuces: number;
}

/**
 * Rank players by total DESC, then aces DESC. Equal on both → shared rank,
 * tiedWith populated.
 */
function rankPlayers(
  players: ScoringPlayer[],
  working: Map<string, PlayerWorkingState>,
): AceyDeuceyPlayerLine[] {
  type Row = { player: ScoringPlayer; state: PlayerWorkingState };
  const rows: Row[] = players.map((p) => ({
    player: p,
    state: working.get(p.userId) ?? { total: 0, aces: 0, deuces: 0 },
  }));

  rows.sort((a, b) => {
    if (b.state.total !== a.state.total) {
      return b.state.total - a.state.total;
    }
    if (b.state.aces !== a.state.aces) {
      return b.state.aces - a.state.aces;
    }
    // Deterministisk fallback for stabil rekkefølge.
    return a.player.userId.localeCompare(b.player.userId);
  });

  return rows.map((row, idx) => {
    const tiedWith = rows
      .filter(
        (other, j) =>
          j !== idx &&
          other.state.total === row.state.total &&
          other.state.aces === row.state.aces,
      )
      .map((o) => o.player.userId);

    const firstTiedIndex = rows.findIndex(
      (other) =>
        other.state.total === row.state.total &&
        other.state.aces === row.state.aces,
    );

    return {
      userId: row.player.userId,
      aces: row.state.aces,
      deuces: row.state.deuces,
      total: row.state.total,
      rank: firstTiedIndex + 1,
      tiedWith,
    };
  });
}

/**
 * Beregner Acey Deucey-leaderboard fra en ScoringContext. Uavhengig
 * hull-prosessering: uferdige hull gir 0 til alle, men stopper ikke
 * prosessering av senere hull.
 *
 * Defensive fallback: hvis mode_config.acey_deucey_scoring mangler/feil
 * shape → fall til 'net' (Tørny HCP-default). Validatoren i
 * lib/games/gamePayload.ts håndhever feltet ved publish.
 */
export function compute(ctx: ScoringContext): AceyDeuceyResult {
  const cfg = ctx.game.mode_config as { acey_deucey_scoring?: 'gross' | 'net' };
  const scoring: 'gross' | 'net' =
    cfg.acey_deucey_scoring === 'gross' || cfg.acey_deucey_scoring === 'net'
      ? cfg.acey_deucey_scoring
      : 'net';

  // Index scores for O(1) lookup per (userId, holeNumber).
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  const working = new Map<string, PlayerWorkingState>();
  for (const p of ctx.players) {
    working.set(p.userId, { total: 0, aces: 0, deuces: 0 });
  }

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const rows: AceyDeuceyHoleRow[] = [];

  for (const hole of holesSorted) {
    // Compute effective scores for each player on this hole.
    const effByPlayer: Array<{ userId: string; eff: number | null }> =
      ctx.players.map((p) => {
        const gross = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;
        const eff =
          gross === null
            ? null
            : effectiveFor(scoring, gross, p.courseHandicap, hole.strokeIndex);
        return { userId: p.userId, eff };
      });

    const allScored = effByPlayer.every((e) => e.eff !== null);

    // Initialize pointsByPlayer to 0 for all players.
    const pointsByPlayer: Record<string, number> = {};
    for (const p of ctx.players) {
      pointsByPlayer[p.userId] = 0;
    }

    let aceUserId: string | null = null;
    let deuceUserId: string | null = null;

    if (allScored) {
      const effs = effByPlayer.map((e) => e.eff as number);
      const minEff = Math.min(...effs);
      const maxEff = Math.max(...effs);

      const aceCandidates = effByPlayer.filter((e) => e.eff === minEff);
      const deuceCandidates = effByPlayer.filter((e) => e.eff === maxEff);

      if (aceCandidates.length === 1) {
        aceUserId = aceCandidates[0].userId;
        pointsByPlayer[aceUserId] = 3;
        const state = working.get(aceUserId);
        if (state) {
          state.total += 3;
          state.aces += 1;
        }
      }

      if (deuceCandidates.length === 1) {
        deuceUserId = deuceCandidates[0].userId;
        pointsByPlayer[deuceUserId] = -3;
        const state = working.get(deuceUserId);
        if (state) {
          state.total -= 3;
          state.deuces += 1;
        }
      }
    }

    // Per-spiller-detalj for «Hull for hull»-flaten (#496 PR 5). Eksponerer
    // gross + effective + poeng som allerede er regnet ut, i ctx.players-
    // rekkefølge. Ren additiv eksponering — ingen endring i poeng/ranking.
    const grossOf = (userId: string) =>
      grossByKey.get(`${userId}#${hole.number}`) ?? null;
    const perPlayer = effByPlayer.map((e) => ({
      userId: e.userId,
      gross: grossOf(e.userId),
      effectiveScore: e.eff,
      points: pointsByPlayer[e.userId] ?? 0,
    }));

    rows.push({
      holeNumber: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      scored: allScored,
      aceUserId,
      deuceUserId,
      pointsByPlayer,
      perPlayer,
    });
  }

  const players = rankPlayers(ctx.players, working);

  return {
    kind: 'acey_deucey',
    scoring,
    holes: rows,
    players,
  };
}
