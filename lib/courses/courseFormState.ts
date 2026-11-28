/**
 * What `createCourse` and `updateCourse` hand back to the course form when a
 * save is refused. The form stays mounted with everything the person typed and
 * shows the message for `error`; before this, every refusal redirected to
 * `?error=` and the page drew an empty form (audit 2026-11-20).
 *
 * Server-safe on purpose (no 'use client'): the actions, the pages and the
 * client form all import it.
 */

/** Every code a course save can return. Each page maps them to its own copy. */
export const COURSE_FORM_ERROR_CODES = [
  'name_required',
  'bad_hole_count',
  'bad_par',
  'bad_si',
  'si_duplicate',
  'tee_required',
  'tee_partial_rating',
  'tee_no_rating',
  'hole_count_locked',
  // #3019: the word filter or the 120-character cap on a course or tee name.
  'blocked_word',
  'text_too_long',
  'db_course',
  'db_load',
] as const;

export type CourseFormErrorCode = (typeof COURSE_FORM_ERROR_CODES)[number];

export type CourseFormState = { error: CourseFormErrorCode | null };

export const COURSE_FORM_IDLE: CourseFormState = { error: null };

/** Thrown by the parser's `fail` inside an action, caught into the state. */
export class CourseFormRefusal extends Error {
  constructor(readonly code: CourseFormErrorCode) {
    super(code);
    this.name = 'CourseFormRefusal';
  }
}

function isCourseFormErrorCode(code: string): code is CourseFormErrorCode {
  return (COURSE_FORM_ERROR_CODES as readonly string[]).includes(code);
}

/** The parser's `fail`: an unknown code becomes the generic `db_course`. */
export function refuseCourseForm(code: string): never {
  throw new CourseFormRefusal(isCourseFormErrorCode(code) ? code : 'db_course');
}

/**
 * The copy for every code, read once on the server so the client form gets
 * plain strings. `resolve` returns `undefined` for a code the page has no text
 * for; that code then shows `fallback`.
 */
export function courseFormErrorMessages(
  resolve: (code: CourseFormErrorCode) => string | undefined,
  fallback: string,
): Record<CourseFormErrorCode, string> {
  return Object.fromEntries(
    COURSE_FORM_ERROR_CODES.map((code) => [code, resolve(code) ?? fallback]),
  ) as Record<CourseFormErrorCode, string>;
}
