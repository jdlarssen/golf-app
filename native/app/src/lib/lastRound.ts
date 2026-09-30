// Hjem v2 (#2385): poengene i «Forrige runde», som «34 poeng» i designet.
//
// Ingen ny regel: tallet er det tavla i appen viser for deg i runden
// (`computeGameLeaderboard`, den delte motoren), regnet på bundelen og slagene
// fra enheten. Raden bruker formatets egen enhet, altså den tavla viser:
// poeng i formatene der tavla har en poengkolonne (`ResultView`), og brutto
// som før i alle andre.
import type { GameMode } from '../../../../lib/scoring/modes/types';
import type { LocalScore } from '../data/db';
import type { GameBundle } from '../data/gameBundle';
import { gateReason } from './formatGate';
import { leaderboardVisibility } from './leaderboardModel';
import { computeGameLeaderboard, type ScoringExtras } from './scoringContext';

/**
 * Dine poeng i runden, eller `null` når tavla ikke viser poeng for deg:
 * formatet teller slag, tavla er stengt eller skjult, eller du har ingen slag.
 * Wolf og bingo bango bongo regnes bare med valgene (`extras`), som på tavla.
 */
export function lastRoundPoints(
  bundle: GameBundle,
  scores: readonly LocalScore[],
  userId: string,
  extras: ScoringExtras = {},
): number | null {
  const { game } = bundle;
  if (gateReason(game) !== null) return null;
  if (leaderboardVisibility(game.scoreVisibility, game.status, game.gameMode as GameMode) !== 'full') {
    return null;
  }
  const outcome = computeGameLeaderboard(bundle, scores, extras);
  if (!outcome.ok) return null;
  const { result } = outcome;

  // Bingo bango bongo gir poeng for prestasjoner; alle andre regner fra slagene.
  const played = scores.some((score) => score.userId === userId && score.strokes != null);
  if (result.kind !== 'bingo_bango_bongo' && !played) return null;

  const mine = <T extends { userId: string }>(lines: readonly T[]) =>
    lines.find((line) => line.userId === userId);
  switch (result.kind) {
    case 'stableford':
      return result.variant === 'solo'
        ? (mine(result.players)?.totalPoints ?? null)
        : (result.teams.find((team) => team.playerIds.includes(userId))?.totalPoints ?? null);
    case 'nines':
      return mine(result.players)?.totalPoints ?? null;
    case 'wolf':
      return mine(result.players)?.totalPoints ?? null;
    case 'bingo_bango_bongo':
      return mine(result.players)?.totalPoints ?? null;
    case 'acey_deucey':
      return mine(result.players)?.total ?? null;
    case 'nassau':
      return mine(result.players)?.units ?? null;
    default:
      return null;
  }
}
