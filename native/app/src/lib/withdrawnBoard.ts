// #1954 A3: spillerne under «Trukne spillere» på tavla, og når lista vises.
//
// Webbens regel per visning, ikke appens egen:
//  - Stableford, modifisert stableford og slagspill viser lista på alle stier:
//    live, blind runde (bruttovisningen) og før noen har ført et slag
//    (`leaderboard/formats/stableford.tsx` og `soloStrokeplay.tsx`).
//  - Best ball viser den bare på den ferdige tavla (`leaderboardContent.tsx`:
//    visningene `full` og `reveal-finished`), aldri på front 9-tavla eller i
//    blind runde mens spillet pågår.
// Formatene er de som kjenner frafall (`supportsWithdrawal`, den delte regelen).
// Lista er spillerne med `withdrawn_at`, i rosterens rekkefølge, med navnet fra
// profilen. En spiller uten lesbar profil (`users` er null) vises ikke, som på
// webben (`p.users != null`).
import {
  supportsWithdrawal,
  type GameMode,
} from '../../../../lib/scoring/modes/types';
import { BOARD_COMMON_TEXT } from './boardCopy';

export interface WithdrawnOnBoard {
  userId: string;
  name: string;
}

export function withdrawnOnBoard(
  game: { gameMode: string; status: string },
  players: readonly {
    userId: string;
    name: string | null;
    withdrawnAt: string | null;
    /** `false` når profilen ikke kunne leses. Mangler feltet (eldre cache), regnes den som lest. */
    hasProfile?: boolean;
  }[],
): WithdrawnOnBoard[] {
  if (!supportsWithdrawal(game.gameMode as GameMode)) return [];
  if (game.gameMode === 'best_ball' && game.status !== 'finished') return [];
  return players
    .filter((p) => p.withdrawnAt != null && p.hasProfile !== false)
    .map((p) => ({ userId: p.userId, name: p.name ?? BOARD_COMMON_TEXT.unknownPlayer }));
}
