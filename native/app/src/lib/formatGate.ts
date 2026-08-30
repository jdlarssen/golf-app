// Native N3 (#1825): hvilke spill appen faktisk kan føre.
//
// Tre familier holdes utenfor, alle fordi føringen deres krever noe N3 ikke har
// bygget — og en halvriktig scramble-føring er verre for spilleren enn en ærlig
// henvisning til nettsiden:
//
//  1. **Lag-kollapsede formater** (scramble-familien, alternate shot, patsome
//     fra hull 7): hele laget taster inn i kapteinens rad. Hver telling og hver
//     skriving må da spørre `scoreOwnerForHole` først. N4 eier dem.
//  2. **Segment-spill** (`hole_segment !== 'full'`): front9/back9-halvdelene av
//     en delt cup-dag. Kolonnen er NOT NULL med default `'full'`, så et vanlig
//     spill står ALLTID som `'full'` — gaten må teste mot verdien, ikke mot om
//     feltet er satt. N5 eier dem.
//  3. **Deriverte spill** (`source_game_id` satt): cup-avledninger som aldri
//     føres direkte. N5 eier dem.
import { modeCollapsesToTeamCard } from '../../../../lib/scoring/modes/types';
import type { GameMode } from '../../../../lib/scoring/modes/types';

/** Teksten spilleren får i stedet for en føring-CTA. */
export const UNSUPPORTED_FORMAT_MESSAGE =
  'Dette formatet føres på nettsiden ennå.';

export function isScoringSupported(game: {
  gameMode: string;
  holeSegment: string;
  sourceGameId: string | null;
}): boolean {
  const mode = game.gameMode as GameMode;
  // Hull 1 fanger scramble-familien og alternate shot; hull 7 fanger patsome,
  // som er det ene formatet der svaret avhenger av hullet.
  if (modeCollapsesToTeamCard(mode, 1) || modeCollapsesToTeamCard(mode, 7)) {
    return false;
  }
  if (game.holeSegment !== 'full') return false;
  if (game.sourceGameId != null) return false;
  return true;
}
