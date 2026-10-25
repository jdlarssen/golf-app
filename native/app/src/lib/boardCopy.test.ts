// #2579: paritets-porten for tavlas tekster, samme mønster som
// `sideTournamentCopy.test.ts`. Den leser `messages/no.json` fra node-siden
// (aldri bundlet) og krever tegn-for-tegn likhet for webbens strenger, og at
// appens egne ikke er en av dem.
import source from '../../../../messages/no.json';
import {
  BOARD_APP_TEXT,
  BOARD_COMMON_TEXT,
  BOARD_TEAM_TEXT,
  BOARD_TEXT,
  ROUND_REPORT_APP_TEXT,
  ROUND_REPORT_TEXT,
  SIDE_PANEL_TEXT,
  STATE35_TEXT,
  WITHDRAWN_BOARD_TEXT,
} from './boardCopy';

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
      unknownPlayer: source.leaderboard.common.unknownPlayer,
      teamLabel: source.leaderboard.common.teamLabel,
      poengLabel: source.leaderboard.common.poengLabel,
      vsParLabel: source.leaderboard.common.vsParLabel,
    });
  });

  it('best balls første halvdel og låskortet er state35-tekstene', () => {
    const state35 = source.leaderboard.state35;
    expect(STATE35_TEXT).toStrictEqual({
      segmentHalfLabel: state35.segmentHalfLabel,
      lockedHeading: state35.lockedHeading,
      lockedSub: state35.lockedSub,
    });
  });

  it('overskriften over historien er leaderboard.roundReport.heading (#2632)', () => {
    expect(ROUND_REPORT_TEXT).toStrictEqual({ heading: source.leaderboard.roundReport.heading });
  });

  it('sideturneringens etiketter er panelets', () => {
    const rows: Record<string, string> = source.leaderboard.sideTournament.panel.rows;
    expect(SIDE_PANEL_TEXT).toStrictEqual({
      longestDrive: rows.longestDrive,
      closestToPin: rows.closestToPin,
    });
  });

  it.each([
    ['BOARD_APP_TEXT', BOARD_APP_TEXT],
    ['BOARD_TEAM_TEXT', BOARD_TEAM_TEXT],
    ['ROUND_REPORT_APP_TEXT', ROUND_REPORT_APP_TEXT],
  ])('appens egne tekster (%s) er ingen av verdiene i leaderboard.board', (_name, block) => {
    const web = new Set(sourceLeaves.values());
    expect(Object.values(block).filter((value) => web.has(value))).toEqual([]);
  });
});

describe('WITHDRAWN_BOARD_TEXT (#1954 A3)', () => {
  it('er leaderboard.withdrawn fra kilden', () => {
    expect(WITHDRAWN_BOARD_TEXT).toStrictEqual(source.leaderboard.withdrawn);
  });
});

