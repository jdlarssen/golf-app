// #1954 A1: når en spiller kan trekke seg selv fra spillets side i appen.
//
// Reglene er webbens, ikke appens egne: spillsiden viser «Trekk deg fra
// spillet» før start for alle påmeldte som ikke er trukket. I en cup-kamp som
// ennå ikke har startet, går veien via cupens egen skjerm (`cup`, #2752): spillet
// alene kan ikke trekkes fra, og kjernen svarer `game_locked`. Under runden vises
// den når formatet kjenner frafall
// (`supportsWithdrawal`, den delte regelen). Selve trekket er kjernen bak
// `POST /api/games/[id]/withdraw-self` — ingenting av den speiles her.
import { withdrawLockedByDelivery } from '../../../../lib/league/leagueMarker';
import {
  supportsWithdrawal,
  type GameMode,
} from '../../../../lib/scoring/modes/types';

export type PlayerWithdrawKind = 'pre-start' | 'active' | 'cup';

interface WithdrawGame {
  status: string;
  gameMode: string;
  tournamentId: string | null;
  /** #2712: a simulator-league flight is `leagueRoundId` + peer approval, as in `isGameOrganiser`. */
  leagueRoundId?: string | null;
  requirePeerApproval?: boolean;
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
  me: { withdrawnAt: string | null; submittedAt?: string | null } | undefined,
  isOrganiser: boolean,
): PlayerWithdrawKind | null {
  if (!me || me.withdrawnAt != null) return null;
  if (game.status === 'draft' || game.status === 'scheduled') {
    return game.tournamentId == null ? 'pre-start' : 'cup';
  }
  if (game.status === 'active' && !isOrganiser && supportsWithdrawal(game.gameMode as GameMode)) {
    // #2712 (owner 31.10): one attempt per round in a simulator league, so no
    // withdrawal once the card is delivered (the server refuses it too).
    const simulatorFlight = game.leagueRoundId != null && game.requirePeerApproval === true;
    return withdrawLockedByDelivery({ simulatorFlight, submittedAt: me.submittedAt ?? null }) ? null : 'active';
  }
  return null;
}
