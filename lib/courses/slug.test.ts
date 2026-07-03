import { describe, it, expect } from 'vitest';
import { slugifyCourseName } from './slug';

/**
 * TypeScript mirror of the SQL `slugify_course_name` function (migration
 * 0129) — used for client-side preview and tests. The DB trigger is
 * authoritative at insert time; this must stay byte-for-byte identical to
 * the SQL translation table or previews would drift from the persisted slug.
 */
describe('slugifyCourseName', () => {
  it.each([
    ['Byneset North', 'byneset-north'],
    ['Stjørdal Golfbane', 'stjoerdal-golfbane'],
    ['Ålesund GK', 'aalesund-gk'],
    ['Øvrevoll', 'oevrevoll'],
    ['Bjørnstjerne Bæ & Ålesund GK — Test', 'bjoernstjerne-bae-aalesund-gk-test'],
  ])('slugifies %s -> %s', (name, expected) => {
    expect(slugifyCourseName(name)).toBe(expected);
  });

  it('folds common diacritics', () => {
    expect(slugifyCourseName('Äöü Éèêë Áàâ Íìîï Óòô Úùû Ýñ Ç')).toBe(
      'aou-eeee-aaa-iiii-ooo-uuu-yn-c',
    );
  });

  it('is idempotent', () => {
    const once = slugifyCourseName('Bjørnstjerne Bæ & Ålesund GK — Test');
    expect(slugifyCourseName(once)).toBe(once);
  });

  it('returns empty string for empty input', () => {
    expect(slugifyCourseName('')).toBe('');
  });

  it('trims leading and trailing hyphens produced by punctuation', () => {
    expect(slugifyCourseName('  --Stiklestad--  ')).toBe('stiklestad');
  });

  it('collapses runs of non-alphanumeric characters to a single hyphen', () => {
    expect(slugifyCourseName('Trondheim   GK!!')).toBe('trondheim-gk');
  });
});
