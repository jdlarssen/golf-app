import type { GameStatus } from './status';

export type ScoreVisibility = 'live' | 'reveal';

export type RevealState = 'live-always' | 'reveal-active' | 'reveal-finished';

export function revealState(
  visibility: ScoreVisibility,
  status: GameStatus,
): RevealState {
  if (visibility === 'live') return 'live-always';
  if (status === 'finished') return 'reveal-finished';
  return 'reveal-active';
}

export function shouldHideNetto(state: RevealState): boolean {
  return state === 'reveal-active';
}
