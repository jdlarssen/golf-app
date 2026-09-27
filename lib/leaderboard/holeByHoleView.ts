import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * Har formatet sin egen «Hull for hull»-visning (#2217 D1)? Spill-hjem viser
 * lenken bare da, og `holes/page.tsx` sender alle andre format til tavla.
 *
 * Før falt alle format uten egen gren til den generiske best ball-drilldownen.
 * Den gir hver spiller sitt eget banehandicap og rangerer som best ball, så
 * scramble, matchplay, shamble, patsome og lag-stableford fikk andre tall og
 * plasser enn tavla. Hullene for dem står på tavla (matchplay-familien, shamble
 * og patsome har egne hull-rader) eller i lagets scorekort (scramble og
 * lag-stableford).
 *
 * `true`: best ball (den generiske drilldownen er best ball-modellen) og
 * solo-formatene fra epic #496, med stableford/modifisert bare for
 * `team_size === 1`.
 *
 * Uttømmende `switch` med `never`, etter `supportsWithdrawal`: et nytt format
 * må klassifiseres her.
 */
export function hasHoleByHoleView(gameMode: GameMode, modeConfig: GameModeConfig): boolean {
  switch (gameMode) {
    case 'best_ball':
    case 'skins':
    case 'wolf':
    case 'nines':
    case 'round_robin':
    case 'acey_deucey':
    case 'bingo_bango_bongo':
    case 'nassau':
    case 'solo_strokeplay':
      return true;
    case 'stableford':
    case 'modified_stableford':
      return modeConfig.kind === gameMode && modeConfig.team_size === 1;
    case 'singles_matchplay':
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
    case 'greensome_matchplay':
    case 'chapman_matchplay':
    case 'gruesome_matchplay':
    case 'texas_scramble':
    case 'ambrose':
    case 'florida_scramble':
    case 'shamble':
    case 'patsome':
      return false;
    default: {
      // At runtime an unknown mode (older app binary, seed before deploy)
      // lands here: no page of its own, so no link (fail closed, #1887).
      const _exhaustive: never = gameMode;
      return false;
    }
  }
}
