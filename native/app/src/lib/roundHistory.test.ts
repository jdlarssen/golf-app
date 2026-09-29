// #2256: runde-lista profilen (og #2265) regner fra. Type A.
//
// Suiten kjører med `TZ=UTC` (jest.config.js), så «enhetens lokaltid» er UTC
// her. Nyttårstestene under ville vært en identitet på en norsk maskin; med
// pinnet sone beviser de at året leses i lokaltid og ikke i Oslo-tid.
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';
import {
  buildHistoryRounds,
  localRoundYear,
  type HistoryGameInput,
  type HistoryScoreInput,
} from './roundHistory';

const WON: ResultSummary = { kind: 'placement', rank: 1, fieldSize: 4, isTeam: false };

function game(partial: Partial<HistoryGameInput> & { gameId: string }): HistoryGameInput {
  return {
    scheduledTeeOffAt: '2026-06-01T08:00:00.000Z',
    endedAt: '2026-06-01T13:00:00.000Z',
    gameMode: 'solo_strokeplay',
    resultSummary: null,
    ...partial,
  };
}

function strokes(gameId: string, values: readonly number[]): HistoryScoreInput[] {
  return values.map((value) => ({ gameId, strokes: value }));
}

const EIGHTEEN = [5, 4, 4, 3, 5, 4, 4, 5, 4, 4, 5, 3, 4, 4, 5, 4, 4, 5]; // 76

describe('localRoundYear', () => {
  it.each([
    ['planned tee-off wins over the end time', '2025-12-31T23:30:00.000Z', '2026-01-01T03:00:00.000Z', 2025],
    ['the first minutes of the year belong to the new year', '2026-01-01T00:10:00.000Z', null, 2026],
    ['falls back to the end time', null, '2026-03-02T12:00:00.000Z', 2026],
    ['undated round', null, null, null],
    ['unreadable timestamp', 'ikke en dato', null, null],
  ] as const)('%s', (_label, scheduledTeeOffAt, endedAt, year) => {
    expect(localRoundYear({ scheduledTeeOffAt, endedAt })).toBe(year);
  });
});

describe('buildHistoryRounds', () => {
  it('gives a complete 18-hole round its brutto', () => {
    const [round] = buildHistoryRounds([game({ gameId: 'g1', resultSummary: WON })], strokes('g1', EIGHTEEN));
    expect(round).toEqual({
      gameId: 'g1',
      date: '2026-06-01T08:00:00.000Z',
      year: 2026,
      teamBall: false,
      holeCount: 18,
      completeBrutto: 76,
      resultSummary: WON,
    });
  });

  it('counts a round with 17 strokes, but gives it no complete brutto', () => {
    const [round] = buildHistoryRounds([game({ gameId: 'g1' })], strokes('g1', EIGHTEEN.slice(1)));
    expect(round).toMatchObject({ holeCount: 17, completeBrutto: null });
  });

  it('gives a 9-hole round no complete brutto', () => {
    const [round] = buildHistoryRounds([game({ gameId: 'g1' })], strokes('g1', EIGHTEEN.slice(0, 9)));
    expect(round).toMatchObject({ holeCount: 9, completeBrutto: null });
  });

  it('keeps a round without strokes (withdrawn, or never entered)', () => {
    const [round] = buildHistoryRounds([game({ gameId: 'g1' })], []);
    expect(round).toMatchObject({ holeCount: 0, completeBrutto: null });
  });

  it('treats the team ball as nobody’s own round, even for the captain holding 18 strokes', () => {
    const [round] = buildHistoryRounds(
      [game({ gameId: 'g1', gameMode: 'texas_scramble', resultSummary: WON })],
      strokes('g1', EIGHTEEN),
    );
    expect(round).toMatchObject({ teamBall: true, holeCount: 0, completeBrutto: null, resultSummary: WON });
  });

  it('keeps each game’s strokes to that game', () => {
    const rounds = buildHistoryRounds(
      [game({ gameId: 'a' }), game({ gameId: 'b', scheduledTeeOffAt: '2026-07-01T08:00:00.000Z' })],
      [...strokes('a', EIGHTEEN), ...strokes('b', EIGHTEEN.slice(0, 9))],
    );
    expect(rounds.map((r) => [r.gameId, r.holeCount])).toEqual([
      ['b', 9],
      ['a', 18],
    ]);
  });

  it('lists the newest round first and undated rounds last', () => {
    const rounds = buildHistoryRounds(
      [
        game({ gameId: 'old', scheduledTeeOffAt: '2025-05-01T08:00:00.000Z' }),
        game({ gameId: 'none', scheduledTeeOffAt: null, endedAt: null }),
        game({ gameId: 'new', scheduledTeeOffAt: '2026-08-01T08:00:00.000Z' }),
      ],
      [],
    );
    expect(rounds.map((r) => r.gameId)).toEqual(['new', 'old', 'none']);
    expect(rounds[2]).toMatchObject({ date: null, year: null });
  });

  it('gives an empty list for no games', () => {
    expect(buildHistoryRounds([], [])).toEqual([]);
  });
});
