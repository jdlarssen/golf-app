import { describe, it, expect, vi } from 'vitest';
import { MODE_LABELS } from '@/lib/scoring/modes/types';
import sitemap from './sitemap';

/**
 * Type A unit test for the sitemap (#1264). Mocked at the system boundary
 * (`listPublicCourseSlugs`) so the test never touches the DB — the sitemap
 * route itself must stay cacheComponents-safe (no request-time IO), and this
 * suite verifies that property alongside the actual entry shape.
 */
vi.mock('@/lib/courses/publicCourses', () => ({
  listPublicCourseSlugs: async () => ['test-bane'],
}));

const BASE = 'https://tornygolf.no';

describe('sitemap', () => {
  it.each(Object.keys(MODE_LABELS))(
    'includes a /spillformater/%s entry',
    async (mode) => {
      const entries = await sitemap();
      const urls = entries.map((entry) => entry.url);
      expect(urls).toContain(`${BASE}/spillformater/${mode}`);
    },
  );

  it('gives every entry no/en/x-default hreflang alternates', async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.alternates?.languages).toMatchObject({
        no: entry.url,
        en: entry.url.replace(BASE, `${BASE}/en`),
        'x-default': entry.url,
      });
    }
  });

  it('gives every entry an apex-host url', async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      expect(entry.url.startsWith(BASE)).toBe(true);
    }
  });

  it('includes /demo, /finn-turneringer, /legal/privacy and /baner/test-bane', async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain(`${BASE}/demo`);
    expect(urls).toContain(`${BASE}/finn-turneringer`);
    expect(urls).toContain(`${BASE}/legal/privacy`);
    expect(urls).toContain(`${BASE}/baner/test-bane`);
  });
});
