import { describe, expect, it } from 'vitest';
import {
  recentCourseCardLine,
  recentCourseCards,
  seasonOf,
  summariseRecentCourses,
  type RecentCourse,
  type RecentGameRow,
} from './recentCourseCards';

/** A finished round on `course`, teed off at `iso`. */
function row(id: string, course: string | null, iso: string | null, extra: Partial<RecentGameRow> = {}): RecentGameRow {
  return {
    id,
    course_id: course,
    status: 'finished',
    scheduled_tee_off_at: iso,
    ended_at: null,
    source_game_id: null,
    withdrawn_at: null,
    ...extra,
  };
}

describe('seasonOf (#2448)', () => {
  it.each([
    ['2026-03-01', 'spring', 2026],
    ['2026-05-31', 'spring', 2026],
    ['2026-06-01', 'summer', 2026],
    ['2026-08-31', 'summer', 2026],
    ['2026-09-01', 'autumn', 2026],
    ['2026-11-30', 'autumn', 2026],
    ['2026-12-01', 'winter', 2026],
    ['2027-01-15', 'winter', 2026],
    ['2027-02-28', 'winter', 2026],
    ['2028-02-29', 'winter', 2027],
  ] as const)('%s → %s %i', (day, season, year) => {
    expect(seasonOf(day)).toEqual({ season, year });
  });
});

describe('summariseRecentCourses (#2448)', () => {
  const today = '2026-10-31';

  it('no rounds → no courses', () => {
    expect(summariseRecentCourses([], today)).toEqual([]);
  });

  it('groups per course, newest first, and counts the rounds this autumn', () => {
    const rows = [
      row('g1', 'byneset', '2026-09-12T08:00:00Z'),
      row('g2', 'byneset', '2026-10-03T08:00:00Z'),
      row('g3', 'trondheim', '2026-10-24T08:00:00Z'),
      row('g4', 'byneset', '2026-08-15T08:00:00Z'), // summer: not counted
    ];
    expect(summariseRecentCourses(rows, today)).toEqual([
      { courseId: 'trondheim', seasonRounds: 1, lastPlayedDay: '2026-10-24' },
      { courseId: 'byneset', seasonRounds: 2, lastPlayedDay: '2026-10-03' },
    ]);
  });

  it('a game you both played and organised counts once', () => {
    const rows = [
      row('g1', 'byneset', '2026-10-03T08:00:00Z'),
      row('g1', 'byneset', '2026-10-03T08:00:00Z', { withdrawn_at: undefined }),
    ];
    expect(summariseRecentCourses(rows, today)).toEqual([
      { courseId: 'byneset', seasonRounds: 1, lastPlayedDay: '2026-10-03' },
    ]);
  });

  it('drafts, withdrawals, derived games and games without a course do not count', () => {
    const rows = [
      row('draft', 'a', '2026-10-30T08:00:00Z', { status: 'draft' }),
      row('withdrawn', 'b', '2026-10-30T08:00:00Z', { withdrawn_at: '2026-10-29T08:00:00Z' }),
      row('derived', 'c', '2026-10-30T08:00:00Z', { source_game_id: 'parent' }),
      row('nocourse', null, '2026-10-30T08:00:00Z'),
      row('ok', 'd', '2026-10-01T08:00:00Z', { status: 'active' }),
    ];
    expect(summariseRecentCourses(rows, today).map((c) => c.courseId)).toEqual(['d']);
  });

  it('a withdrawal on the played row does not hide the organised row of the same game', () => {
    const rows = [
      row('g1', 'a', '2026-10-01T08:00:00Z', { withdrawn_at: '2026-09-30T08:00:00Z' }),
      row('g1', 'a', '2026-10-01T08:00:00Z'),
    ];
    expect(summariseRecentCourses(rows, today)).toEqual([
      { courseId: 'a', seasonRounds: 1, lastPlayedDay: '2026-10-01' },
    ]);
  });

  it('a planned round later this season counts, and sorts the course first', () => {
    const rows = [
      row('past', 'a', '2026-10-24T08:00:00Z'),
      row('planned', 'b', '2026-11-07T08:00:00Z', { status: 'scheduled' }),
    ];
    expect(summariseRecentCourses(rows, today)).toEqual([
      // The planned round is not «last played»: nothing on b lies before today.
      { courseId: 'b', seasonRounds: 1, lastPlayedDay: null },
      { courseId: 'a', seasonRounds: 1, lastPlayedDay: '2026-10-24' },
    ]);
  });

  it('dates a round by the tee-off, else by when it ended; undated courses sort last', () => {
    const rows = [
      row('undated', 'z', null),
      row('ended', 'y', null, { ended_at: '2026-10-10T15:00:00Z' }),
    ];
    expect(summariseRecentCourses(rows, today)).toEqual([
      { courseId: 'y', seasonRounds: 1, lastPlayedDay: '2026-10-10' },
      { courseId: 'z', seasonRounds: 0, lastPlayedDay: null },
    ]);
  });

  it('reads the day on the Oslo calendar: 00:30 on 1 December is winter', () => {
    // 23:30Z on 30 Nov = 00:30 on 1 Dec in Oslo.
    const rows = [row('g', 'a', '2026-11-30T23:30:00Z')];
    expect(summariseRecentCourses(rows, '2026-12-05')).toEqual([
      { courseId: 'a', seasonRounds: 1, lastPlayedDay: '2026-12-01' },
    ]);
    expect(summariseRecentCourses(rows, '2026-11-20')[0].seasonRounds).toBe(0);
  });

  it('the winter spans the new year: December and February are the same season', () => {
    const rows = [
      row('dec', 'a', '2026-12-12T10:00:00Z'),
      row('feb', 'a', '2027-02-06T10:00:00Z'),
      row('lastwinter', 'a', '2026-01-10T10:00:00Z'),
    ];
    expect(summariseRecentCourses(rows, '2027-02-20')[0].seasonRounds).toBe(2);
  });
});

describe('recentCourseCards (#2448)', () => {
  const recent: RecentCourse[] = [
    { courseId: 'a', seasonRounds: 3, lastPlayedDay: '2026-10-24' },
    { courseId: 'b', seasonRounds: 1, lastPlayedDay: '2026-10-03' },
    { courseId: 'c', seasonRounds: 0, lastPlayedDay: '2026-08-12' },
  ];
  const all = ['a', 'b', 'c', 'd'];

  it('the two most recent courses, never more', () => {
    expect(recentCourseCards(recent, all, '').map((c) => c.courseId)).toEqual(['a', 'b']);
  });

  it('a selected course among the two leaves them as they are', () => {
    expect(recentCourseCards(recent, all, 'b')).toEqual([
      { kind: 'recent', ...recent[0] },
      { kind: 'recent', ...recent[1] },
    ]);
  });

  it('a selected course outside the two stands first as «Valgt», with the newest other beside it', () => {
    expect(recentCourseCards(recent, all, 'd')).toEqual([
      { kind: 'chosen', courseId: 'd' },
      { kind: 'recent', ...recent[0] },
    ]);
    // An older course from the history is «Valgt» too.
    expect(recentCourseCards(recent, all, 'c').map((c) => [c.kind, c.courseId])).toEqual([
      ['chosen', 'c'],
      ['recent', 'a'],
    ]);
  });

  it('drops courses the list does not have (deleted or hidden)', () => {
    expect(recentCourseCards(recent, ['b', 'c'], '').map((c) => c.courseId)).toEqual(['b', 'c']);
  });

  it('no history: no cards, or only the selected one', () => {
    expect(recentCourseCards([], all, '')).toEqual([]);
    expect(recentCourseCards([], all, 'd')).toEqual([{ kind: 'chosen', courseId: 'd' }]);
  });

  it('a selected id the list does not have is no selection', () => {
    expect(recentCourseCards(recent, all, 'gone').map((c) => c.courseId)).toEqual(['a', 'b']);
  });
});

describe('recentCourseCardLine (#2448)', () => {
  it('rounds this season, with the season of today', () => {
    expect(
      recentCourseCardLine({ kind: 'recent', courseId: 'a', seasonRounds: 3, lastPlayedDay: '2026-10-24' }, '2026-10-31'),
    ).toEqual({ kind: 'season', count: 3, season: 'autumn' });
    expect(
      recentCourseCardLine({ kind: 'recent', courseId: 'a', seasonRounds: 1, lastPlayedDay: '2027-01-02' }, '2027-01-05'),
    ).toEqual({ kind: 'season', count: 1, season: 'winter' });
  });

  it('none this season: the last day, with the year when it is another year', () => {
    expect(
      recentCourseCardLine({ kind: 'recent', courseId: 'a', seasonRounds: 0, lastPlayedDay: '2026-08-12' }, '2026-10-31'),
    ).toEqual({ kind: 'last', day: '2026-08-12', withYear: false });
    expect(
      recentCourseCardLine({ kind: 'recent', courseId: 'a', seasonRounds: 0, lastPlayedDay: '2025-08-12' }, '2026-10-31'),
    ).toEqual({ kind: 'last', day: '2025-08-12', withYear: true });
  });

  it('nothing to say: no line', () => {
    expect(
      recentCourseCardLine({ kind: 'recent', courseId: 'a', seasonRounds: 0, lastPlayedDay: null }, '2026-10-31'),
    ).toBeNull();
  });

  it('the chosen card says so', () => {
    expect(recentCourseCardLine({ kind: 'chosen', courseId: 'd' }, '2026-10-31')).toEqual({ kind: 'chosen' });
  });
});
