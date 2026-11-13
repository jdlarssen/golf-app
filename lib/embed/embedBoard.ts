// The embed card (#2330): the club website's compact board for solo
// strokeplay and solo stableford — the top five, how many more, who leads and
// a public name. Pure code like `lib/leaderboard/liveBoard.ts`: it takes the
// rows the engine already ranked (live: `computeLiveBoard`, finished:
// `soloResultBoard`) and never ranks by itself.

import { boardShowsPlace, isBoardLeader } from '@/lib/leaderboard/boardRules';
import type { LiveBoardUnit } from '@/lib/leaderboard/liveBoard';
import { formatPublicName } from '@/lib/names/formatPublicName';

/** The fields a live board row and a finished board row share. */
export type EmbedBoardSourceRow = {
  userId: string;
  name: string | null;
  nickname: string | null;
  rank: number;
  tied: boolean;
  total: number | null;
  holesPlayed: number;
};

export type EmbedBoardRow = {
  userId: string;
  rank: number;
  tied: boolean;
  /** The gold disc: rank 1 with a hole played, on a board that shows places. */
  isLeader: boolean;
  holesPlayed: number;
  total: number | null;
  /** «Marte L.»; `null` without a name or nickname (the card says «(ukjent)»). */
  name: string | null;
};

export type EmbedBoard = {
  unit: LiveBoardUnit;
  holesPlayed: number;
  /** Place column and gold (`boardShowsPlace`): never for a league flight. */
  showPlace: boolean;
  /** Every player on the board, also those under the top five. */
  fieldSize: number;
  rows: EmbedBoardRow[];
  /** Players under the top five; «Vis alle N →» shows when this is above 0. */
  moreCount: number;
};

/** The rows the card shows before «Vis alle»: the frame has a fixed height, so no «show all up to six». */
export const EMBED_BOARD_ROWS = 5;

export function buildEmbedBoard(opts: {
  unit: LiveBoardUnit;
  holesPlayed: number;
  leagueFlight: boolean;
  rows: readonly EmbedBoardSourceRow[];
  limit?: number;
}): EmbedBoard {
  const { unit, holesPlayed, leagueFlight, rows, limit = EMBED_BOARD_ROWS } = opts;
  const showPlace = boardShowsPlace({ holesPlayed, leagueFlight });
  return {
    unit,
    holesPlayed,
    showPlace,
    fieldSize: rows.length,
    rows: rows.slice(0, limit).map((r) => ({
      userId: r.userId,
      rank: r.rank,
      tied: r.tied,
      isLeader: showPlace && isBoardLeader(r),
      holesPlayed: r.holesPlayed,
      total: r.total,
      // A public page: first name and the last name's initial (#1022).
      name: formatPublicName({ name: r.name, nickname: r.nickname }),
    })),
    moreCount: Math.max(0, rows.length - limit),
  };
}
