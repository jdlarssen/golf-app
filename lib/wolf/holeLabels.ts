import type { WolfChoice, WolfHoleOutcome } from '@/lib/scoring/modes/types';

/**
 * Delte Wolf-per-hull-labels (epic #496, i18n-refaktor #554). Trukket ut av
 * WolfView slik at både leaderboardets PER HULL og «Hull for hull»-flaten
 * (WolfHolesView) bruker de samme katalog-nøklene — ingen kopi-lim.
 *
 * Funksjonene returnerer nå stabile semantiske nøkler som komponent-siden
 * oversetter via `t('leaderboard.wolf.<key>')`. wolfOutcomeClass returnerer
 * fortsatt CSS-klassenavn (ingen bruker-tekst).
 */

export type WolfChoiceKey =
  | 'choiceWaiting'
  | 'choicePartner'
  | 'choiceLone'
  | 'choiceBlind';

export type WolfOutcomeKey =
  | 'outcomeWolfVant'
  | 'outcomeAndreVant'
  | 'outcomeLik'
  | 'outcomeVenter';

/**
 * Returnerer katalog-nøkkel (under leaderboard.wolf.*) for Wolf-valget.
 * Merk: 'choicePartner' krever ICU-interpolasjon {partnerName} hos kalleren.
 */
export function wolfChoiceKey(choice: WolfChoice | null): WolfChoiceKey {
  if (choice === null) return 'choiceWaiting';
  if (choice === 'partner') return 'choicePartner';
  if (choice === 'lone') return 'choiceLone';
  return 'choiceBlind';
}

/**
 * Returnerer katalog-nøkkel (under leaderboard.wolf.*) for utfallet av et hull.
 */
export function wolfOutcomeKey(outcome: WolfHoleOutcome): WolfOutcomeKey {
  switch (outcome) {
    case 'wolf_side_wins':
      return 'outcomeWolfVant';
    case 'opp_side_wins':
      return 'outcomeAndreVant';
    case 'tied':
      return 'outcomeLik';
    default:
      return 'outcomeVenter';
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
