// #2265: dagboka i Rundedagboka — måneder, plassen til høyre og underlinja.
// Type A.
//
// Suiten kjører med `TZ=UTC` (jest.config.js), og dagboka leser enhetens
// lokaltid. Datoene bygges derfor med lokale konstruktører, så «31. august kl.
// 23.30» betyr det i sonen koden faktisk regner i.
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';
import { historyRound as round, localIso as local } from '../test/historyFixtures';
import { diaryResult, diaryRowLabel, diarySubline, groupDiaryByMonth } from './roundDiary';

describe('groupDiaryByMonth', () => {
  it('gives no months for no rounds', () => {
    expect(groupDiaryByMonth([])).toEqual([]);
  });

  it('groups the rounds by month, newest month first, keeping their order', () => {
    const months = groupDiaryByMonth([
      round({ gameId: 'sep20', date: local(8, 20) }),
      round({ gameId: 'sep13', date: local(8, 13) }),
      round({ gameId: 'aug30', date: local(7, 30) }),
    ]);
    expect(months.map((m) => [m.year, m.month, m.rounds.map((r) => r.gameId)])).toEqual([
      [2026, 8, ['sep20', 'sep13']],
      [2026, 7, ['aug30']],
    ]);
  });

  it('keeps a round at 23:30 on 31 August in August', () => {
    const [month] = groupDiaryByMonth([round({ gameId: 'late', date: local(7, 31, 23, 30) })]);
    expect([month.year, month.month]).toEqual([2026, 7]);
  });

  it('puts the undated rounds last, in their own group', () => {
    const months = groupDiaryByMonth([
      round({ gameId: 'none', date: null }),
      round({ gameId: 'jan', date: new Date(2025, 0, 5).toISOString() }),
    ]);
    expect(months.map((m) => [m.year, m.month])).toEqual([
      [2025, 0],
      [null, null],
    ]);
  });
});

describe('diaryResult', () => {
  const placement = (rank: number, isTeam = false): ResultSummary => ({
    kind: 'placement',
    rank,
    fieldSize: 8,
    isTeam,
  });

  it.each([
    [1, 'gold'],
    [2, 'silver'],
    [3, 'bronze'],
    [4, null],
    [12, null],
  ] as const)('gives place %s the medal %s', (rank, medal) => {
    expect(diaryResult(placement(rank))).toEqual({
      kind: 'place',
      rank,
      fieldSize: 8,
      medal,
      spoken: `${rank}. plass av 8`,
    });
  });

  it('speaks a team placement as the web does', () => {
    expect(diaryResult(placement(2, true))).toMatchObject({ medal: 'silver', spoken: 'Laget ble nr 2 av 8' });
  });

  it('gives skins a medal only with skins won', () => {
    expect(diaryResult({ kind: 'skins', skins: 0, rank: 1, fieldSize: 4 })).toMatchObject({
      kind: 'place',
      rank: 1,
      medal: null,
    });
    expect(diaryResult({ kind: 'skins', skins: 3, rank: 1, fieldSize: 4 })).toMatchObject({
      medal: 'gold',
    });
  });

  it('writes the match result out in words', () => {
    expect(diaryResult({ kind: 'matchplay', outcome: 'win', margin: '3&2' })).toEqual({
      kind: 'text',
      text: 'Du vant 3&2',
    });
    expect(diaryResult({ kind: 'matchplay', outcome: 'tie', margin: null })).toEqual({
      kind: 'text',
      text: 'Uavgjort',
    });
  });

  it('gives nothing without a stored result', () => {
    expect(diaryResult(null)).toBeNull();
  });
});

describe('diarySubline', () => {
  it('shows brutto for a complete stroke round, without netto', () => {
    expect(diarySubline(round({ gameId: 'g' }), undefined)).toBe('Byneset North · Slagspill · 86 brutto');
  });

  it('shows the points in a points format', () => {
    expect(diarySubline(round({ gameId: 'g', gameMode: 'stableford' }), 38)).toBe(
      'Byneset North · Stableford · 38 p',
    );
  });

  it('shows no brutto in a points format while the points are unknown', () => {
    expect(diarySubline(round({ gameId: 'g', gameMode: 'stableford' }), undefined)).toBe(
      'Byneset North · Stableford',
    );
    expect(diarySubline(round({ gameId: 'g', gameMode: 'stableford' }), null)).toBe(
      'Byneset North · Stableford',
    );
  });

  it('writes «lag» for a team ball', () => {
    expect(
      diarySubline(round({ gameId: 'g', gameMode: 'texas_scramble', teamBall: true, holeCount: 0, brutto: null, completeBrutto: null }), undefined),
    ).toBe('Byneset North · Texas scramble · lag');
  });

  it('writes «9 hull» instead of the format on a 9-hole round', () => {
    expect(
      diarySubline(round({ gameId: 'g', gameMode: 'stableford', holeSegment: 'back9', holeCount: 9, brutto: 42, completeBrutto: null }), 18),
    ).toBe('Byneset North · 9 hull · 18 p');
    expect(
      diarySubline(round({ gameId: 'g', holeSegment: 'front9', holeCount: 9, brutto: 42, completeBrutto: null }), undefined),
    ).toBe('Byneset North · 9 hull · 42 brutto');
  });

  it('shows only course and format when the round is not complete for its length', () => {
    expect(diarySubline(round({ gameId: 'g', holeCount: 17, brutto: 80, completeBrutto: null }), undefined)).toBe(
      'Byneset North · Slagspill',
    );
  });

  it('leaves out a missing course', () => {
    expect(diarySubline(round({ gameId: 'g', courseName: null }), undefined)).toBe('Slagspill · 86 brutto');
  });
});

describe('diaryRowLabel', () => {
  it('reads the row as one sentence, with commas instead of the middle dots', () => {
    const r = round({
      gameId: 'g',
      gameMode: 'stableford',
      resultSummary: { kind: 'placement', rank: 1, fieldSize: 8, isTeam: false },
    });
    expect(diaryRowLabel(r, 38)).toBe(
      'Lørdag 19. september, Lørdagsrunden, Byneset North, Stableford, 38 poeng, 1. plass av 8',
    );
  });

  it('says «Lagrunde» for a team ball and the match result in words', () => {
    const r = round({
      gameId: 'g',
      gameMode: 'foursomes_matchplay',
      teamBall: true,
      holeCount: 0,
      brutto: null,
      completeBrutto: null,
      resultSummary: { kind: 'matchplay', outcome: 'win', margin: '3&2' },
    });
    expect(diaryRowLabel(r, undefined)).toBe(
      'Lørdag 19. september, Lørdagsrunden, Byneset North, Foursomes, Lagrunde, Du vant 3&2',
    );
  });

  it('reads an undated round without a date', () => {
    expect(diaryRowLabel(round({ gameId: 'g', date: null }), undefined)).toBe(
      'Lørdagsrunden, Byneset North, Slagspill, 86 brutto',
    );
  });
});
