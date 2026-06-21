import { isStablefordFamily, isScrambleFamily, type GameMode, type GameModeConfig } from '@/lib/scoring/modes/types';

export interface ScorecardTitleKeys {
  /** Key in the `scorecard` namespace — TopBar kicker / page heading. */
  titleKey: string;
  /** Key in the `scorecard` namespace — CTA label on the game-home card link. */
  cardLabelKey: string;
}

/**
 * Per-mode title + CTA-label keys for the scorecard surface. Single source of
 * truth so `app/games/[id]/scorecard/page.tsx` (TopBar) and
 * `app/games/[id]/(home)/page.tsx` (Card-link) resolve from the same catalog.
 *
 * Returns keys within the `scorecard` namespace that callers translate via
 * `t(key)`. Norwegian output remains identical — the catalog values are the
 * same strings that were previously hardcoded.
 *
 * Rules:
 *  - Matchplay (singles 1v1 and fourball 2v2) → 'kickerMatch' / 'cardLabelMatch'
 *  - Team modes (best-ball, par-stableford team_size=2, texas scramble)
 *    → 'kickerTeam' / 'cardLabelTeam'
 *  - Solo modes (stableford team_size=1, solo strokeplay) → 'kickerSolo' / 'cardLabelSolo'
 */
export function scorecardTitle(
  gameMode: GameMode,
  modeConfig: GameModeConfig,
): ScorecardTitleKeys {
  if (
    gameMode === 'singles_matchplay' ||
    gameMode === 'fourball_matchplay' ||
    gameMode === 'chapman_matchplay' ||
    gameMode === 'gruesome_matchplay'
  ) {
    return { titleKey: 'kickerMatch', cardLabelKey: 'cardLabelMatch' };
  }

  const isTeamMode =
    gameMode === 'best_ball' ||
    isScrambleFamily(gameMode) ||
    gameMode === 'patsome' ||
    (isStablefordFamily(gameMode) && (modeConfig.kind === 'stableford' || modeConfig.kind === 'modified_stableford') && modeConfig.team_size === 2);

  if (isTeamMode) {
    return { titleKey: 'kickerTeam', cardLabelKey: 'cardLabelTeam' };
  }

  return { titleKey: 'kickerSolo', cardLabelKey: 'cardLabelSolo' };
}
