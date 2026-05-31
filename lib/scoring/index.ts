// Mode-router for scoring-laget.
//
// Eneste innfallsporten kallsteder bør bruke for å regne ut en leaderboard
// uavhengig av modus. Switcher på `ctx.game.game_mode` og delegerer til
// modul-per-mode i `lib/scoring/modes/`. Returnerer en discriminated
// union `ModeResult` som konsumentene narrower på `kind`.
//
// Dagens innslag:
//   - best_ball        → modes/bestBall.ts
//   - stableford             → modes/stableford.ts (solo + par/4BBB)
//   - singles_matchplay      → modes/singlesMatchplay.ts (epic #45)
//   - solo_strokeplay  → modes/soloStrokeplay.ts (epic #46)
//   - texas_scramble         → modes/texasScramble.ts (issue #44)
//   - fourball_matchplay     → modes/fourballMatchplay.ts (issue #217, fase 2 av #47)
//
// Re-eksporterer felles helpers (computeCourseHandicap, allocateStrokes,
// resolveTiebreak) slik at andre konsumenter kan importere via
// `@/lib/scoring` uten å vite om modul-strukturen under.

import * as bestBall from './modes/bestBall';
import * as stableford from './modes/stableford';
import * as modifiedStableford from './modes/modifiedStableford';
import * as singlesMatchplay from './modes/singlesMatchplay';
import * as soloStrokeplay from './modes/soloStrokeplay';
import * as texasScramble from './modes/texasScramble';
import * as ambrose from './modes/ambrose';
import * as floridaScramble from './modes/floridaScramble';
import * as fourballMatchplay from './modes/fourballMatchplay';
import * as foursomesMatchplay from './modes/foursomesMatchplay';
import * as greensomeMatchplay from './modes/greensomeMatchplay';
import * as chapmanMatchplay from './modes/chapmanMatchplay';
import * as gruesomeMatchplay from './modes/gruesomeMatchplay';
import * as wolf from './modes/wolf';
import * as nassau from './modes/nassau';
import * as skins from './modes/skins';
import * as bingoBangoBongo from './modes/bingoBangoBongo';
import * as nines from './modes/nines';
import * as roundRobin from './modes/roundRobin';
import * as aceyDeucey from './modes/aceyDeucey';
import * as shamble from './modes/shamble';
import * as patsome from './modes/patsome';
import type { ScoringContext, ModeResult } from './modes/types';

export function computeLeaderboard(ctx: ScoringContext): ModeResult {
  switch (ctx.game.game_mode) {
    case 'best_ball':
      return bestBall.compute(ctx);
    case 'stableford':
      return stableford.compute(ctx);
    case 'modified_stableford':
      return modifiedStableford.compute(ctx);
    case 'singles_matchplay':
      return singlesMatchplay.compute(ctx);
    case 'solo_strokeplay':
      return soloStrokeplay.compute(ctx);
    case 'texas_scramble':
      return texasScramble.compute(ctx);
    case 'ambrose':
      return ambrose.compute(ctx);
    case 'florida_scramble':
      return floridaScramble.compute(ctx);
    case 'fourball_matchplay':
      return fourballMatchplay.compute(ctx);
    case 'foursomes_matchplay':
      return foursomesMatchplay.compute(ctx);
    case 'greensome_matchplay':
      return greensomeMatchplay.compute(ctx);
    case 'chapman_matchplay':
      return chapmanMatchplay.compute(ctx);
    case 'gruesome_matchplay':
      return gruesomeMatchplay.compute(ctx);
    case 'wolf':
      return wolf.compute(ctx);
    case 'nassau':
      return nassau.compute(ctx);
    case 'skins':
      return skins.compute(ctx);
    case 'bingo_bango_bongo':
      return bingoBangoBongo.compute(ctx);
    case 'nines':
      return nines.compute(ctx);
    case 'round_robin':
      return roundRobin.compute(ctx);
    case 'acey_deucey':
      return aceyDeucey.compute(ctx);
    case 'shamble':
      return shamble.compute(ctx);
    case 'patsome':
      return patsome.compute(ctx);
  }
}

// Re-eksporter eksisterende helpers for bakoverkompatibilitet og enklere bruk.
export { calculateCourseHandicap, applyAllowance } from './courseHandicap';
export { strokesForHole, allStrokeAllocations } from './strokeAllocation';
export { rankTeams } from './tiebreaker';
export { computeStablefordPoints } from './modes/stableford';
export { computeModifiedStablefordPoints } from './modes/modifiedStableford';
export { isStablefordFamily, isScrambleFamily, isAlternateShotMatchplay } from './modes/types';
export { ambroseDefaultPct } from './modes/ambrose';
export { defaultFloridaHandicapPct } from './modes/floridaScramble';
export { computeMatchResult } from './modes/singlesMatchplay';
export type {
  GameMode,
  GameModeConfig,
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
  ModeResult,
  BestBallResult,
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
  FourballMatchplayResult,
  FourballSide,
  FourballSidePlayer,
  FourballHoleRow,
  FourballPlayerCell,
  FoursomesMatchplayResult,
  FoursomesSide,
  FoursomesSidePlayer,
  FoursomesHoleRow,
  WolfResult,
  WolfChoice,
  WolfHoleOutcome,
  WolfHoleChoice,
  WolfHoleRow,
  WolfPlayerCell,
  WolfPlayerLine,
  NassauResult,
  NassauSection,
  NassauSectionLine,
  NassauUnitLine,
  SkinsResult,
  SkinsHoleRow,
  SkinsPlayerLine,
  SkinsHoleOutcome,
  BingoBangoBongoResult,
  BingoBangoBongoHoleInput,
  BingoBangoBongoHoleRow,
  BingoBangoBongoPlayerLine,
  NinesResult,
  NinesHoleRow,
  NinesPlayerLine,
  RoundRobinResult,
  RoundRobinHoleRow,
  RoundRobinPlayerCell,
  RoundRobinPlayerLine,
  RoundRobinSegmentLine,
  AceyDeuceyResult,
  AceyDeuceyHoleRow,
  AceyDeuceyPlayerLine,
  ShambleResult,
  ShambleHoleRow,
  ShambleHoleTeamCell,
  ShambleTeamLine,
  PatsomeResult,
  PatsomeTeamLine,
  PatsomeHoleRow,
  PatsomePlayerCell,
  PatsomeSegmentSubtotal,
  PatsomeSegment,
} from './modes/types';
