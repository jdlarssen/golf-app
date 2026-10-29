/**
 * «Finnes banen alt?» (#2485): the pure rules around the similar-courses panel
 * on the new-course form. Which names count as similar is not here: that rule
 * has one home, `course_match_key` in the 0222 migration.
 */

/** The panel searches from this many typed characters. */
export const MIN_QUERY_LENGTH = 3;

/** The search sends at most this many characters (the RPC clips at the same 80). */
export const MAX_QUERY_LENGTH = 80;

/** «Nei, legg til «…» som ny bane» shows this many characters of the name. */
export const ADD_ANYWAY_NAME_LENGTH = 12;

/** What the search sends: the typed name without outer spaces, at most 80 characters. */
export function clipQuery(raw: string): string {
  return raw.trim().slice(0, MAX_QUERY_LENGTH);
}

/** True when the typed name is long enough to search on. */
export function isSearchable(raw: string): boolean {
  return clipQuery(raw).length >= MIN_QUERY_LENGTH;
}

/**
 * After «Nei, legg til … som ny bane» the panel stays hidden while the name
 * still starts with what you turned down: one more letter keeps it hidden, a
 * different name brings it back. Case is ignored.
 */
export function isDismissed(query: string, dismissed: string | null): boolean {
  if (dismissed === null) return false;
  return clipQuery(query).toLocaleLowerCase('nb').startsWith(dismissed.toLocaleLowerCase('nb'));
}

/** The name in «Nei, legg til «…» som ny bane»: the first 12 characters, and whether it was cut. */
export function addAnywayName(raw: string): { name: string; clipped: boolean } {
  const name = clipQuery(raw);
  const chars = Array.from(name);
  if (chars.length <= ADD_ANYWAY_NAME_LENGTH) return { name, clipped: false };
  return { name: chars.slice(0, ADD_ANYWAY_NAME_LENGTH).join('').trimEnd(), clipped: true };
}

/**
 * Where «Bruk denne» goes, decided by the door the form was opened from:
 * the wizard (`/opprett-bane`, with or without `?next=`) or the admin's
 * «Ny bane», which opens the course's edit page.
 */
export type SimilarCourseTarget = { kind: 'wizard'; next?: string } | { kind: 'edit' };

/** The wizard's address with `bane=<id>` set, replacing any `bane` already there. */
export function withCourseParam(path: string, courseId: string): string {
  const url = new URL(path, 'https://torny.invalid');
  url.searchParams.set('bane', courseId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The address «Bruk denne» opens for a course. */
export function similarCourseHref(target: SimilarCourseTarget, courseId: string): string {
  if (target.kind === 'edit') return `/admin/courses/${courseId}/edit`;
  return withCourseParam(target.next ?? '/opprett-spill', courseId);
}

/**
 * «Opprett ny bane» under the wizard's course field (#2485): /opprett-bane
 * with the way back to step 3. Today's parameters stay (`intent`, `klubb`,
 * `format` …), or the saved draft would no longer match its context and be
 * dropped. `bane` goes, so turning back without choosing does not put an old
 * deep-link course over the one you picked.
 */
export function courseCreateHref(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete('bane');
  params.delete('skjerm');
  params.set('step', '3');
  return `/opprett-bane?next=${encodeURIComponent(`${pathname}?${params.toString()}`)}`;
}
