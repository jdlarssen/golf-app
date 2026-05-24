// Mode-router for scoring-laget.
//
// Eneste innfallsporten kallsteder bør bruke for å regne ut en leaderboard
// uavhengig av modus. Switcher på `ctx.game.game_mode` og delegerer til
// modul-per-mode i `lib/scoring/modes/`. Returnerer en discriminated
// union `ModeResult` som konsumentene narrower på `kind`.
//
// Dagens innslag:
//   - best_ball_netto        → modes/bestBallNetto.ts
//   - stableford             → modes/stableford.ts (solo + par/4BBB)
//   - singles_matchplay      → modes/singlesMatchplay.ts (epic #45)
//   - solo_strokeplay_netto  → modes/soloStrokeplayNetto.ts (epic #46)
//   - texas_scramble         → modes/texasScramble.ts (issue #44)
//
// Re-eksporterer felles helpers (computeCourseHandicap, allocateStrokes,
// resolveTiebreak) slik at andre konsumenter kan importere via
// `@/lib/scoring` uten å vite om modul-strukturen under.

import * as bestBallNetto from './modes/bestBallNetto';
import * as stableford from './modes/stableford';
import * as singlesMatchplay from './modes/singlesMatchplay';
import * as soloStrokeplayNetto from './modes/soloStrokeplayNetto';
import * as texasScramble from './modes/texasScramble';
import type { ScoringContext, ModeResult } from './modes/types';

export function computeLeaderboard(ctx: ScoringContext): ModeResult {
  switch (ctx.game.game_mode) {
    case 'best_ball_netto':
      return bestBallNetto.compute(ctx);
    case 'stableford':
      return stableford.compute(ctx);
    case 'singles_matchplay':
      return singlesMatchplay.compute(ctx);
    case 'solo_strokeplay_netto':
      return soloStrokeplayNetto.compute(ctx);
    case 'texas_scramble':
      return texasScramble.compute(ctx);
  }
}

// Re-eksporter eksisterende helpers for bakoverkompatibilitet og enklere bruk.
export { calculateCourseHandicap, applyAllowance } from './courseHandicap';
export { strokesForHole, allStrokeAllocations } from './strokeAllocation';
export { rankTeams } from './tiebreaker';
export { computeStablefordPoints } from './modes/stableford';
export { computeMatchResult } from './modes/singlesMatchplay';
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
  SinglesMatchplayResult,
  MatchplaySide,
  MatchplayHoleRow,
  MatchplayHoleResult,
  MatchplayMatchResult,
  SoloStrokeplayResult,
  SoloStrokeplayPlayerLine,
  TexasScrambleResult,
  TexasScrambleTeamLine,
  TexasScrambleHoleRow,
  TexasScramblePlayerCell,
} from './modes/types';
