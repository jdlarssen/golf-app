// #1954 A3: spillerne under «Trukne spillere» på tavla.
//
// Webbens regel, ikke appens egen: seksjonen står under tavla i formatene som
// kjenner frafall (`supportsWithdrawal`, den delte regelen — best ball,
// stableford, modifisert stableford og slagspill, #386), og lista er spillerne
// med `withdrawn_at`, i rosterens rekkefølge, med navnet fra profilen
// (`leaderboard/formats/stableford.tsx`, `soloStrokeplay.tsx` og
// `lib/leaderboard/bestBallInput.ts`).
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
  gameMode: string,
  players: readonly { userId: string; name: string | null; withdrawnAt: string | null }[],
): WithdrawnOnBoard[] {
  if (!supportsWithdrawal(gameMode as GameMode)) return [];
  return players
    .filter((p) => p.withdrawnAt != null)
    .map((p) => ({ userId: p.userId, name: p.name ?? BOARD_COMMON_TEXT.unknownPlayer }));
}
