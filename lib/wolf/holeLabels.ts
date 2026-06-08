import type { WolfChoice, WolfHoleOutcome } from '@/lib/scoring/modes/types';

/**
 * Delte Wolf-per-hull-labels (epic #496). Trukket ut av WolfView slik at både
 * leaderboardets PER HULL og «Hull for hull»-flaten (WolfHolesView) bruker de
 * samme norske strengene — ingen kopi-lim. Rene funksjoner: caller resolver
 * partner-navnet (via `formatRevealName`) og sender det inn.
 */
export function wolfChoiceLabel(
  choice: WolfChoice | null,
  partnerName: string | null,
): string {
  if (choice === null) return 'Venter…';
  if (choice === 'partner') return `Partner: ${partnerName ?? '?'}`;
  if (choice === 'lone') return 'Lone Wolf';
  return 'Blind Wolf';
}

export function wolfOutcomeLabel(outcome: WolfHoleOutcome): string {
  switch (outcome) {
    case 'wolf_side_wins':
      return 'Wolf vant';
    case 'opp_side_wins':
      return 'Andre vant';
    case 'tied':
      return 'Lik';
    default:
      return 'Venter';
  }
}

export function wolfOutcomeClass(outcome: WolfHoleOutcome): string {
  switch (outcome) {
    case 'wolf_side_wins':
      return 'text-accent';
    case 'opp_side_wins':
      return 'text-text';
    case 'tied':
      return 'text-muted';
    default:
      return 'text-muted';
  }
}
