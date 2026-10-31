/**
 * «SIST BRUKT» on «Hvor og når?» (#2448): which courses you used last, and how
 * many rounds you have had on each this season.
 *
 * Two halves of one rule. The server reads your games (`recentCourses.ts`) and
 * `summariseRecentCourses` folds them into one line per course, so the page
 * carries courses, not games. On the client `recentCourseCards` picks the two
 * cards from those lines and the course you have chosen, so choosing a course
 * redraws the cards without a new read.
 *
 * Every day is an Oslo calendar day, «YYYY-MM-DD» (#648: Vercel runs UTC).
 * Pure and I/O-free (Type A).
 */
import { osloParts } from '@/lib/format/teeOff';
import { effectiveDate } from '@/lib/stats/effectiveDate';

/** A game of yours, as you played it or organised it. */
export type RecentGameRow = {
  id: string;
  course_id: string | null;
  status: string;
  scheduled_tee_off_at: string | null;
  ended_at: string | null;
  source_game_id: string | null;
  /** On the row you played: set when you withdrew. Organised rows have none. */
  withdrawn_at?: string | null;
};

/** One course you have used. */
export type RecentCourse = {
  courseId: string;
  /** Rounds on the course in the season today is in, planned ones included. */
  seasonRounds: number;
  /** The last round on or before today, or `null` when there is none. */
  lastPlayedDay: string | null;
};

export type RecentCourseCard =
  | ({ kind: 'recent' } & RecentCourse)
  /** The course you chose, when it is not one of the two recent cards. */
  | { kind: 'chosen'; courseId: string };

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** What the card says under the name. */
export type RecentCourseCardLine =
  | { kind: 'season'; count: number; season: Season }
  | { kind: 'last'; day: string; withYear: boolean }
  | { kind: 'chosen' }
  | null;

/** The statuses whose rounds count: not drafts. */
const COUNTED_STATUSES = new Set(['scheduled', 'active', 'finished']);

/** The most cards «SIST BRUKT» shows. */
const MAX_CARDS = 2;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The season an Oslo day is in: March–May spring, June–August summer,
 * September–November autumn, December–February winter. Winter starts on
 * 1 December and runs into the next year, so January and February belong to
 * the winter that started the December before: `year` is that December's.
 */
export function seasonOf(day: string): { season: Season; year: number } {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  if (month >= 3 && month <= 5) return { season: 'spring', year };
  if (month >= 6 && month <= 8) return { season: 'summer', year };
  if (month >= 9 && month <= 11) return { season: 'autumn', year };
  return { season: 'winter', year: month === 12 ? year : year - 1 };
}

function sameSeason(a: string, b: string): boolean {
  const sa = seasonOf(a);
  const sb = seasonOf(b);
  return sa.season === sb.season && sa.year === sb.year;
}

/** The round's Oslo day by the rule the profile and the Kavalkade use, or `null`. */
function roundDay(row: RecentGameRow): string | null {
  const date = effectiveDate(row);
  if (!date) return null;
  const { year, month, day } = osloParts(date);
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/**
 * Your games folded into one line per course, the most recent first and
 * undated courses last. A game counts once even when you both played and
 * organised it. Drafts, games you withdrew from, derived games (#1449, as in
 * `getFriendStats`) and games without a course do not count. `today` is the
 * Oslo day the season is read from.
 */
export function summariseRecentCourses(rows: readonly RecentGameRow[], today: string): RecentCourse[] {
  const games = new Map<string, { courseId: string; day: string | null }>();
  for (const row of rows) {
    if (!COUNTED_STATUSES.has(row.status)) continue;
    if (row.source_game_id != null || row.course_id == null || row.withdrawn_at) continue;
    games.set(row.id, { courseId: row.course_id, day: roundDay(row) });
  }

  const courses = new Map<string, RecentCourse & { latest: string | null }>();
  for (const { courseId, day } of games.values()) {
    const course =
      courses.get(courseId) ?? { courseId, seasonRounds: 0, lastPlayedDay: null, latest: null };
    if (day != null) {
      if (sameSeason(day, today)) course.seasonRounds += 1;
      if (course.latest == null || day > course.latest) course.latest = day;
      if (day <= today && (course.lastPlayedDay == null || day > course.lastPlayedDay)) {
        course.lastPlayedDay = day;
      }
    }
    courses.set(courseId, course);
  }

  return [...courses.values()]
    .sort((a, b) => {
      if (a.latest !== b.latest) {
        if (a.latest == null) return 1;
        if (b.latest == null) return -1;
        return a.latest < b.latest ? 1 : -1;
      }
      return a.courseId.localeCompare(b.courseId);
    })
    .map(({ courseId, seasonRounds, lastPlayedDay }) => ({ courseId, seasonRounds, lastPlayedDay }));
}

/**
 * The cards under «SIST BRUKT»: at most two. Courses the list does not have
 * (deleted, or hidden from you) are left out. A chosen course that is not one
 * of the two stands first as «Valgt», with the most recent other course beside
 * it; a chosen id the list does not have counts as no choice.
 */
export function recentCourseCards(
  recent: readonly RecentCourse[],
  courseIds: Iterable<string>,
  selectedCourseId: string,
): RecentCourseCard[] {
  const known = new Set(courseIds);
  const listed = recent.filter((c) => known.has(c.courseId));
  const top = listed.slice(0, MAX_CARDS);
  const selected = known.has(selectedCourseId) ? selectedCourseId : '';
  if (!selected || top.some((c) => c.courseId === selected)) {
    return top.map((c) => ({ kind: 'recent', ...c }));
  }
  return [
    { kind: 'chosen', courseId: selected },
    ...listed
      .filter((c) => c.courseId !== selected)
      .slice(0, MAX_CARDS - 1)
      .map((c): RecentCourseCard => ({ kind: 'recent', ...c })),
  ];
}

/**
 * The line under the name: the rounds this season («3 runder i høst»), else
 * the last day («Sist 12. aug», with the year when it is another year), else
 * nothing. The season is today's, so the count and the word are about the same
 * stretch of time.
 */
export function recentCourseCardLine(card: RecentCourseCard, today: string): RecentCourseCardLine {
  if (card.kind === 'chosen') return { kind: 'chosen' };
  if (card.seasonRounds > 0) {
    return { kind: 'season', count: card.seasonRounds, season: seasonOf(today).season };
  }
  if (card.lastPlayedDay != null) {
    return {
      kind: 'last',
      day: card.lastPlayedDay,
      withYear: card.lastPlayedDay.slice(0, 4) !== today.slice(0, 4),
    };
  }
  return null;
}
