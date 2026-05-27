// Wolf-scoring (issue #274): 4-spiller rotating partner-format.
//
// Stub fra Chunk 1 — full implementasjon med TDD-tester kommer i Chunk 2.
// Eksisterer her så scoring/index.ts router-en typer korrekt.

import type { ScoringContext, WolfResult } from './types';

export function compute(ctx: ScoringContext): WolfResult {
  const scoring: 'gross' | 'net' =
    ctx.game.mode_config.kind === 'wolf'
      ? ctx.game.mode_config.wolf_scoring
      : 'net';

  return {
    kind: 'wolf',
    scoring,
    rotation: 'random_with_trailing',
    holes: [],
    players: ctx.players.map((p, idx) => ({
      userId: p.userId,
      teamNumber: p.teamNumber ?? idx + 1,
      totalPoints: 0,
      wolfHolesPlayed: 0,
      blindWolfWins: 0,
      rank: idx + 1,
      tiedWith: [],
    })),
  };
}
