// Hjem v2 (#2385): poengene i «Forrige runde», som «34 poeng» i designet.
//
// Ingen ny regel: tallet er det resultattabellen i appen viser for runden
// (`computeGameLeaderboard`, den delte motoren), regnet på bundelen og slagene
// fra enheten. Bare stableford-familien uten lag teller poeng per spiller; i
// alle andre formater står brutto som før.
import type { LocalScore } from '../data/db';
import type { GameBundle } from '../data/gameBundle';
import { computeGameLeaderboard } from './scoringContext';

/** Dine poeng i runden, eller `null` når formatet ikke teller poeng for deg. */
export function lastRoundPoints(
  bundle: GameBundle,
  scores: readonly LocalScore[],
  userId: string,
): number | null {
  const outcome = computeGameLeaderboard(bundle, scores);
  if (!outcome.ok) return null;
  const { result } = outcome;
  if (result.kind !== 'stableford' || result.variant !== 'solo') return null;
  const line = result.players.find((player) => player.userId === userId);
  return line && line.holesPlayed > 0 ? line.totalPoints : null;
}
