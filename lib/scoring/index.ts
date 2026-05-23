// Mode-router for scoring-laget.
//
// Eneste innfallsporten kallsteder bør bruke for å regne ut en leaderboard
// uavhengig av modus. Switcher på `ctx.game.game_mode` og delegerer til
// modul-per-mode i `lib/scoring/modes/`. Returnerer en discriminated
// union `ModeResult` som konsumentene narrower på `kind`.
//
// Dagens innslag (per fase 2):
//   - best_ball_netto → modes/bestBallNetto.ts (eksisterende logikk)
//   - stableford      → modes/stableford.ts (ny i denne fasen)
//
// Re-eksporterer felles helpers (computeCourseHandicap, allocateStrokes,
// resolveTiebreak) slik at andre konsumenter kan importere via
// `@/lib/scoring` uten å vite om modul-strukturen under.

import * as bestBallNetto from './modes/bestBallNetto';
import * as stableford from './modes/stableford';
import type { ScoringContext, ModeResult } from './modes/types';

export function computeLeaderboard(ctx: ScoringContext): ModeResult {
  switch (ctx.game.game_mode) {
    case 'best_ball_netto':
      return bestBallNetto.compute(ctx);
    case 'stableford':
      return stableford.compute(ctx);
  }
}

// Re-eksporter eksisterende helpers for bakoverkompatibilitet og enklere bruk.
export { calculateCourseHandicap, applyAllowance } from './courseHandicap';
export { strokesForHole, allStrokeAllocations } from './strokeAllocation';
export { rankTeams } from './tiebreaker';
export { computeStablefordPoints } from './modes/stableford';
export type {
  GameMode,
  GameModeConfig,
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
  ModeResult,
  BestBallNettoResult,
  BestBallTeamLine,
  BestBallHoleRow,
  BestBallPlayerCell,
  StablefordResult,
  StablefordSoloResult,
  StablefordTeamResult,
  StablefordPlayerLine,
  StablefordPlayerCell,
  StablefordTeamHoleRow,
  StablefordTeamLine,
} from './modes/types';
