// The height «Kopier koden til nettsiden» asks for (#2330). Server-side: it
// reads the format rule (`liveBoardCovers`, which pulls in the scoring
// engine), so it is kept out of `snippet.ts`, which the copy button ships to
// the browser. The arithmetic is `compactEmbedHeight`.

import { safeParsePrizes, sponsorStripItems } from '@/lib/games/prizes';
import { liveBoardCovers, type LiveBoardGame } from '@/lib/leaderboard/liveBoard';
import { compactEmbedHeight, EMBED_HEIGHT } from './snippet';

/**
 * The embed frame for a game: the compact card's own height for solo
 * strokeplay and solo stableford, sized by the sponsors the game has now;
 * the full board's 700 px for every other format.
 */
export function embedSnippetHeight(
  game: Pick<LiveBoardGame, 'game_mode' | 'mode_config'> & { prizes?: unknown },
): { compact: boolean; height: number } {
  if (!liveBoardCovers(game)) return { compact: false, height: EMBED_HEIGHT.full };
  const { logos, names } = sponsorStripItems(safeParsePrizes(game.prizes));
  return { compact: true, height: compactEmbedHeight({ logos: logos.length, names }) };
}
