// Stableford-scoring per Tørny-spec: standard poeng-tabell etter netto-score.
//
// Standard-tabellen er den vanligste internasjonalt og brukes som default
// for solo-stableford. Modifikatorer (modified, stableford-quota etc) kan
// legges på som egne `points_table`-varianter senere.

import { strokesForHole } from '../strokeAllocation';
import type {
  ScoringContext,
  ScoringHole,
  StablefordResult,
  StablefordPlayerLine,
} from './types';

export interface StablefordPointsInput {
  par: number;
  /** Netto strokes (gross minus extra strokes fra handicap-fordelingen). Null = hull ikke spilt. */
  netStrokes: number | null;
}

/**
 * Konverterer ett hull-resultat til stableford-poeng etter standard-tabellen:
 *   diff (netto − par)    poeng
 *   ≤ −3 (double eagle+)    5
 *   −2 (eagle)              4
 *   −1 (birdie)             3
 *    0 (par)                2
 *   +1 (bogey)              1
 *   ≥ +2 (double-bogey+)    0
 *
 * Null netStrokes (hull ikke spilt) returnerer 0 — samme behandling som
 * "pick up" eller blank på papir-scorekortet.
 */
export function computeStablefordPoints(input: StablefordPointsInput): number {
  if (input.netStrokes === null) return 0;
  const diff = input.netStrokes - input.par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

interface PlayerHolePoints {
  userId: string;
  /** Poeng per hull, indeksert på `holeNumber - 1` (lengde = holes.length). */
  perHole: number[];
  totalPoints: number;
  holesPlayed: number;
}

function computePlayerHolePoints(
  player: { userId: string; courseHandicap: number },
  holesSorted: ScoringHole[],
  grossByKey: Map<string, number | null>,
): PlayerHolePoints {
  const perHole: number[] = [];
  let totalPoints = 0;
  let holesPlayed = 0;

  for (const hole of holesSorted) {
    const gross = grossByKey.get(`${player.userId}#${hole.number}`) ?? null;
    if (gross === null) {
      perHole.push(0);
      continue;
    }
    const extra = strokesForHole(player.courseHandicap, hole.strokeIndex);
    const net = gross - extra;
    const points = computeStablefordPoints({ par: hole.par, netStrokes: net });
    perHole.push(points);
    totalPoints += points;
    holesPlayed += 1;
  }

  return { userId: player.userId, perHole, totalPoints, holesPlayed };
}

/**
 * Beregner stableford-leaderboard fra en ScoringContext. Returnerer
 * spillere sortert med høyest poeng først, med rank assignet naivt
 * (rank = posisjon + 1). Tie-break-cascade legges på i egen task —
 * inntil videre er rad-rekkefølge ved likhet uspesifisert.
 */
export function compute(ctx: ScoringContext): StablefordResult {
  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  const playerPoints = ctx.players.map((p) => computePlayerHolePoints(p, holesSorted, grossByKey));

  const sorted = [...playerPoints].sort((a, b) => b.totalPoints - a.totalPoints);
  const players: StablefordPlayerLine[] = sorted.map((p, i) => ({
    userId: p.userId,
    totalPoints: p.totalPoints,
    holesPlayed: p.holesPlayed,
    rank: i + 1,
    tiedWith: [],
  }));

  return { kind: 'stableford', players };
}
