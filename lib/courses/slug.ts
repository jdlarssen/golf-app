/**
 * TypeScript mirror of the SQL `slugify_course_name` function
 * (`supabase/migrations/0129_course_slugs.sql`). Used for client-side
 * preview and tests — the DB `BEFORE INSERT` trigger is authoritative at
 * write time (including collision-suffix resolution, which this pure
 * function does not attempt).
 *
 * Must stay byte-for-byte identical to the SQL translation table below or
 * a preview would drift from the persisted slug.
 */

const DIACRITIC_SOURCE = 'äöüéèêëáàâíìîïóòôúùûýñç';
const DIACRITIC_TARGET = 'aoueeeeaaaiiiiooouuuync';
const DIACRITIC_MAP = new Map(
  [...DIACRITIC_SOURCE].map((char, i) => [char, DIACRITIC_TARGET[i]]),
);

export function slugifyCourseName(name: string): string {
  const lowered = (name ?? '')
    .toLowerCase()
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'oe')
    .replaceAll('å', 'aa');
  const folded = [...lowered].map((c) => DIACRITIC_MAP.get(c) ?? c).join('');
  return folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
