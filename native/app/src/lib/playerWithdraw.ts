// #1954 A1: når en spiller kan trekke seg selv fra spillets side i appen.
//
// Reglene er webbens, ikke appens egne: spillsiden viser «Trekk deg fra
// spillet» før start for alle påmeldte som ikke er trukket, men ikke i en
// cup-kamp som ennå ikke har startet (der går veien via cup-siden, og kjernen
// svarer `game_locked`). Under runden vises den når formatet kjenner frafall
// (`supportsWithdrawal`, den delte regelen). Selve trekket er kjernen bak
// `POST /api/games/[id]/withdraw-self` — ingenting av den speiles her.
import {
  supportsWithdrawal,
  type GameMode,
} from '../../../../lib/scoring/modes/types';

export type PlayerWithdrawKind = 'pre-start' | 'active';

interface WithdrawGame {
  status: string;
  gameMode: string;
  tournamentId: string | null;
}

/**
 * Hvilket trekk spilleren kan gjøre, eller `null` når lenka ikke skal vises.
 *
 * Arrangøren har sin egen «Trekk meg» i arrangør-seksjonen i en aktiv runde,
 * så den viser vi ikke to ganger. Før start har arrangør-seksjonen ingen slik
 * knapp, og da får arrangøren lenka som alle andre, som på nettsiden.
 */
export function playerWithdrawKind(
  game: WithdrawGame,
  me: { withdrawnAt: string | null } | undefined,
  isOrganiser: boolean,
): PlayerWithdrawKind | null {
  if (!me || me.withdrawnAt != null) return null;
  if (game.status === 'draft' || game.status === 'scheduled') {
    return game.tournamentId == null ? 'pre-start' : null;
  }
  if (game.status === 'active' && !isOrganiser && supportsWithdrawal(game.gameMode as GameMode)) {
    return 'active';
  }
  return null;
}
