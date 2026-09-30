// #2256: runde-lista profilen (og #2265) regner fra. Type A.
//
// Suiten kjører med `TZ=UTC` (jest.config.js), så «enhetens lokaltid» er UTC
// her. Nyttårstestene under ville vært en identitet på en norsk maskin; med
// pinnet sone beviser de at året leses i lokaltid og ikke i Oslo-tid.
import type { TeeBoxRatings } from '../../../../lib/games/teeRating';
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';
import { computeProfileSeason } from '../../../../lib/stats/profileSeason';
import type { CourseHoleRow } from '../../../../lib/supabase/queryFragments';
import {
  buildHistoryRounds,
  formSeries,
  historyStats,
  localRoundYear,
  type HistoryCourseData,
  type HistoryGameInput,
  type HistoryScoreInput,
} from './roundHistory';

const WON: ResultSummary = { kind: 'placement', rank: 1, fieldSize: 4, isTeam: false };

function game(partial: Partial<HistoryGameInput> & { gameId: string }): HistoryGameInput {
  return {
    name: 'Lørdagsrunden',
    scheduledTeeOffAt: '2026-06-01T08:00:00.000Z',
    endedAt: '2026-06-01T13:00:00.000Z',
    gameMode: 'solo_strokeplay',
    holeSegment: 'full',
    courseId: 'c1',
    courseName: 'Byneset North',
    teeBoxId: 't1',
    teeGender: 'mens',
    courseHandicap: 14,
    scoreDifferential: null,
    resultSummary: null,
    ...partial,
  };
}

function strokes(
  gameId: string,
  values: readonly number[],
  putts: readonly (number | null)[] = [],
): HistoryScoreInput[] {
  return values.map((value, i) => ({
    gameId,
    holeNumber: i + 1,
    strokes: value,
    putts: putts[i] ?? null,
  }));
}

const EIGHTEEN = [5, 4, 4, 3, 5, 4, 4, 5, 4, 4, 5, 3, 4, 4, 5, 4, 4, 5]; // 76

/** Par 4 på alle hull for herrer, par 5 for damer; indeks = hullnummer. */
function courseHoles(): Map<number, CourseHoleRow> {
  return new Map(
    Array.from({ length: 18 }, (_, i) => [
      i + 1,
      { hole_number: i + 1, par_mens: 4, par_ladies: 5, par_juniors: 4, stroke_index: i + 1 },
    ]),
  );
}

const TEE: TeeBoxRatings = {
  slope_mens: 113,
  course_rating_mens: 72,
  par_total_mens: 72,
  slope_ladies: 113,
  course_rating_ladies: 72,
  par_total_ladies: 72,
  slope_juniors: 113,
  course_rating_juniors: 72,
  par_total_juniors: 72,
};

const COURSES: HistoryCourseData = {
  holesByCourse: new Map([['c1', courseHoles()]]),
  teeById: new Map([['t1', TEE]]),
};

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
  it('gives a complete 18-hole round its brutto, netto and the diary fields', () => {
    const [round] = buildHistoryRounds([game({ gameId: 'g1', resultSummary: WON })], strokes('g1', EIGHTEEN));
    expect(round).toMatchObject({
      gameId: 'g1',
      name: 'Lørdagsrunden',
      courseName: 'Byneset North',
      courseId: 'c1',
      gameMode: 'solo_strokeplay',
      holeSegment: 'full',
      date: '2026-06-01T08:00:00.000Z',
      year: 2026,
      teamBall: false,
      holeCount: 18,
      brutto: 76,
      netto: 62,
      completeBrutto: 76,
      resultSummary: WON,
    });
  });

  it('counts a round with 17 strokes, but gives it no complete brutto', () => {
    const [round] = buildHistoryRounds([game({ gameId: 'g1' })], strokes('g1', EIGHTEEN.slice(1)));
    expect(round).toMatchObject({ holeCount: 17, brutto: 71, completeBrutto: null });
  });

  it('gives a 9-hole round its brutto, but no complete brutto', () => {
    const [round] = buildHistoryRounds(
      [game({ gameId: 'g1', holeSegment: 'front9' })],
      strokes('g1', EIGHTEEN.slice(0, 9)),
    );
    expect(round).toMatchObject({ holeSegment: 'front9', holeCount: 9, brutto: 38, completeBrutto: null });
  });

  it('keeps a round without strokes (withdrawn, or never entered)', () => {
    const [round] = buildHistoryRounds([game({ gameId: 'g1' })], []);
    expect(round).toMatchObject({ holeCount: 0, brutto: null, netto: null, completeBrutto: null });
  });

  it('empties the team ball before brutto, holes, putts and the differential, even for the captain holding 18 strokes', () => {
    const [round] = buildHistoryRounds(
      [game({ gameId: 'g1', gameMode: 'texas_scramble', resultSummary: WON, scoreDifferential: 3.2 })],
      strokes('g1', EIGHTEEN, EIGHTEEN.map(() => 2)),
      COURSES,
    );
    expect(round).toMatchObject({
      teamBall: true,
      holeCount: 0,
      brutto: null,
      netto: null,
      completeBrutto: null,
      holes: [],
      putts: [],
      differential: null,
      resultSummary: WON,
    });
  });

  it('gives each hole the par for the player’s tee', () => {
    const [mens, ladies] = buildHistoryRounds(
      [
        game({ gameId: 'm', scheduledTeeOffAt: '2026-06-02T08:00:00.000Z' }),
        game({ gameId: 'l', teeGender: 'ladies' }),
      ],
      [...strokes('m', [4]), ...strokes('l', [4])],
      COURSES,
    );
    expect(mens.holes).toEqual([{ holeNumber: 1, strokes: 4, par: 4 }]);
    expect(ladies.holes).toEqual([{ holeNumber: 1, strokes: 4, par: 5 }]);
  });

  it('gives par 0 when the course is unknown, as the web does', () => {
    const [round] = buildHistoryRounds([game({ gameId: 'g1' })], strokes('g1', [4]));
    expect(round.holes).toEqual([{ holeNumber: 1, strokes: 4, par: 0 }]);
  });

  it('keeps the recorded putts and skips holes without one', () => {
    const [round] = buildHistoryRounds([game({ gameId: 'g1' })], strokes('g1', [4, 5, 3], [2, null, 0]));
    expect(round.putts).toEqual([2, 0]);
  });

  it('prefers the frozen differential, and computes a live one from the course', () => {
    const [frozen, live] = buildHistoryRounds(
      [
        game({ gameId: 'frozen', scheduledTeeOffAt: '2026-06-02T08:00:00.000Z', scoreDifferential: 4.5 }),
        game({ gameId: 'live' }),
      ],
      [...strokes('frozen', EIGHTEEN), ...strokes('live', EIGHTEEN)],
      COURSES,
    );
    expect(frozen.differential).toBe(4.5);
    expect(live.differential).toEqual(expect.any(Number));
  });

  it('has no differential without 18 own strokes', () => {
    const [round] = buildHistoryRounds(
      [game({ gameId: 'g1', scoreDifferential: 4.5 })],
      strokes('g1', EIGHTEEN.slice(1)),
      COURSES,
    );
    expect(round.differential).toBeNull();
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

/** Én runde per dag i juni, nyeste først (samme rekkefølge som lista). */
function june(bruttos: readonly number[]) {
  const games = bruttos.map((_, i) =>
    game({ gameId: `r${i}`, scheduledTeeOffAt: `2026-06-${String(28 - i).padStart(2, '0')}T08:00:00.000Z` }),
  );
  // Slagene over par 72 fordeles ett og ett over hullene, så ingen hull
  // kappes av netto dobbel bogey i differensialen.
  const scores = bruttos.flatMap((total, i) => {
    const holes = Array.from({ length: 18 }, () => 4);
    for (let k = 0; k < total - 72; k++) holes[k % 18] += 1;
    return strokes(`r${i}`, holes);
  });
  return buildHistoryRounds(games, scores, COURSES);
}

describe('formSeries', () => {
  it('lists the complete rounds oldest first, without team balls and 9-hole rounds', () => {
    const rounds = buildHistoryRounds(
      [
        game({ gameId: 'new', scheduledTeeOffAt: '2026-06-03T08:00:00.000Z' }),
        game({ gameId: 'team', scheduledTeeOffAt: '2026-06-02T08:00:00.000Z', gameMode: 'texas_scramble' }),
        game({ gameId: 'nine', scheduledTeeOffAt: '2026-06-02T09:00:00.000Z', holeSegment: 'front9' }),
        game({ gameId: 'old', scheduledTeeOffAt: '2026-06-01T08:00:00.000Z' }),
      ],
      [
        ...strokes('new', EIGHTEEN),
        ...strokes('team', EIGHTEEN),
        ...strokes('nine', EIGHTEEN.slice(0, 9)),
        ...strokes('old', EIGHTEEN.map((v) => v + 1)),
      ],
    );
    expect(formSeries(rounds)).toEqual([94, 76]);
  });
});

describe('historyStats', () => {
  const NOW = new Date('2026-07-01T12:00:00.000Z');

  it('gives the same rounds and best round as the bag tag for the same year', () => {
    const rounds = [
      ...june([90, 86]),
      ...buildHistoryRounds(
        [
          game({ gameId: 'team', gameMode: 'texas_scramble', scheduledTeeOffAt: '2026-05-01T08:00:00.000Z' }),
          game({ gameId: 'nine', holeSegment: 'back9', scheduledTeeOffAt: '2026-05-02T08:00:00.000Z' }),
          game({ gameId: 'last-year', scheduledTeeOffAt: '2025-06-01T08:00:00.000Z' }),
        ],
        [...strokes('team', EIGHTEEN), ...strokes('nine', EIGHTEEN.slice(0, 9)), ...strokes('last-year', EIGHTEEN)],
      ),
    ];
    const stats = historyStats(rounds, NOW);
    const bagTag = computeProfileSeason(
      rounds.map((r) => ({ year: r.year, completeBrutto: r.completeBrutto, resultSummary: r.resultSummary })),
      2026,
    );
    expect(stats.season).toMatchObject({ year: 2026, rounds: bagTag.rounds, bestRound: bagTag.bestRound });
    expect(stats.season).toMatchObject({ rounds: 4, bestRound: 86 });
    expect(stats.seasonAverage).toBe(88);
    expect(stats.seasons.map((s) => s.year)).toEqual([2026, 2025]);
  });

  it('counts a team-ball round as a round, but not its strokes', () => {
    const rounds = buildHistoryRounds(
      [game({ gameId: 'team', gameMode: 'texas_scramble' })],
      strokes('team', [3, ...EIGHTEEN.slice(1)], EIGHTEEN.map(() => 1)),
      COURSES,
    );
    const stats = historyStats(rounds, NOW);
    expect(stats.myStats).toMatchObject({ roundsPlayed: 1, grossAverage: null, bestRound: null });
    expect(stats.myStats.achievements.birdie).toBe(0);
    expect(stats.putts.holesCounted).toBe(0);
    expect(stats.courses).toEqual([]);
  });

  it('has no season without a dated round', () => {
    const rounds = buildHistoryRounds([game({ gameId: 'g', scheduledTeeOffAt: null, endedAt: null })], []);
    const stats = historyStats(rounds, NOW);
    expect(stats.season).toBeNull();
    expect(stats.seasonAverage).toBeNull();
  });

  it('counts the weekly streak in the phone’s local time', () => {
    // 23:32 UTC søndag 14. juni: uke 25 i Oslo, men uke 24 i telefonens tid
    // (UTC i denne suiten).
    const rounds = buildHistoryRounds([game({ gameId: 'late', scheduledTeeOffAt: '2026-06-14T23:32:00.000Z' })], []);
    expect(historyStats(rounds, NOW).streak.lastRoundWeekKey).toBe('2026-W24');
  });

  it('gives the handicap form as the newest 20 differentials, oldest first', () => {
    const rounds = june(Array.from({ length: 22 }, (_, i) => 80 + i));
    const { differentials } = historyStats(rounds, NOW);
    expect(differentials).toHaveLength(20);
    // Nyeste runde (80) er sist; eldste i vinduet er den 20. nyeste (99).
    expect(differentials[19]).toBeLessThan(differentials[0]);
  });
});
