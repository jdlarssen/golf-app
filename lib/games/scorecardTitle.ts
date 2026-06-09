import { isStablefordFamily, type GameMode, type GameModeConfig } from '@/lib/scoring/modes/types';

export interface ScorecardTitle {
  /** TopBar kicker / page heading. */
  title: string;
  /** CTA-label på spilloversiktens lenke-Card til scorekortet. */
  cardLabel: string;
}

/**
 * Per-modus tittel + CTA-label for scorekort-flaten. Single source of
 * truth slik at `app/games/[id]/scorecard/page.tsx` (TopBar) og
 * `app/games/[id]/(home)/page.tsx` (Card-link på spilloversikten) ikke driver
 * ulike norske oversettelser.
 *
 * Regler:
 *  - Matchplay (singles 1v1 og fourball 2v2) → «Match-scorekort»
 *  - Lag-baserte modi (best-ball, par-stableford team_size=2, texas scramble)
 *    → «Lagets scorekort»
 *  - Solo-modi (stableford team_size=1, solo strokeplay) → «Mitt scorekort»
 */
export function scorecardTitle(
  gameMode: GameMode,
  modeConfig: GameModeConfig,
): ScorecardTitle {
  if (
    gameMode === 'singles_matchplay' ||
    gameMode === 'fourball_matchplay' ||
    gameMode === 'chapman_matchplay' ||
    gameMode === 'gruesome_matchplay'
  ) {
    return { title: 'Match-scorekort', cardLabel: 'Match-scorekort' };
  }

  const isTeamMode =
    gameMode === 'best_ball' ||
    gameMode === 'texas_scramble' ||
    gameMode === 'ambrose' ||
    gameMode === 'florida_scramble' ||
    gameMode === 'patsome' ||
    (isStablefordFamily(gameMode) && (modeConfig.kind === 'stableford' || modeConfig.kind === 'modified_stableford') && modeConfig.team_size === 2);

  if (isTeamMode) {
    return { title: 'Lagets scorekort', cardLabel: 'Lagets scorekort' };
  }

  return { title: 'Mitt scorekort', cardLabel: 'Mitt scorekort' };
}
