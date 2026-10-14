// #2579: paritets-porten for tavlas tekster, samme mønster som
// `sideTournamentCopy.test.ts`. Den leser `messages/no.json` fra node-siden
// (aldri bundlet) og krever tegn-for-tegn likhet for webbens strenger, og at
// appens egne ikke er en av dem.
import source from '../../../../messages/no.json';
import { BOARD_APP_TEXT, BOARD_COMMON_TEXT, BOARD_TEXT, SIDE_PANEL_TEXT } from './boardCopy';

/** Alle blader i et tre, med punktum-sti. */
function leaves(node: unknown, prefix = ''): [string, string][] {
  if (typeof node === 'string') return [[prefix, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    leaves(value, prefix ? `${prefix}.${key}` : key),
  );
}

const board = source.leaderboard.board;
const sourceLeaves = new Map(leaves(board));

describe('paritet med messages/no.json', () => {
  it.each(leaves(BOARD_TEXT))('leaderboard.board.%s er identisk med kilden', (path, value) => {
    expect(sourceLeaves.get(path)).toBe(value);
  });

  it('tekstene fra leaderboard.common er kildens', () => {
    expect(BOARD_COMMON_TEXT).toStrictEqual({
      holesPlayedCount: source.leaderboard.common.holesPlayedCount,
      unknownPlayerFull: source.leaderboard.common.unknownPlayerFull,
    });
  });

  it('sideturneringens etiketter er panelets', () => {
    const rows: Record<string, string> = source.leaderboard.sideTournament.panel.rows;
    expect(SIDE_PANEL_TEXT).toStrictEqual({
      longestDrive: rows.longestDrive,
      closestToPin: rows.closestToPin,
    });
  });

  it('appens egne tekster er ingen av verdiene i leaderboard.board', () => {
    const web = new Set(sourceLeaves.values());
    expect(Object.values(BOARD_APP_TEXT).filter((value) => web.has(value))).toEqual([]);
  });
});
