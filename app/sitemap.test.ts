import { describe, it, expect, vi } from 'vitest';
import { MODE_LABELS } from '@/lib/scoring/modes/types';

// Type A per docs/test-discipline.md — asserts the sitemap's URL set and
// hreflang shape (#1264). Course data is mocked at the system boundary
// (listPublicCourseSlugs) so the test never touches the DB.
vi.mock('@/lib/courses/publicCourses', () => ({
  listPublicCourseSlugs: vi.fn(async () => ['miklagard', 'losby']),
}));

import sitemap from './sitemap';

const BASE = 'https://tornygolf.no';

describe('sitemap', () => {
  it('lists every public surface, including one entry per game mode', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    // Core public pages.
    expect(urls).toContain(BASE);
    expect(urls).toContain(`${BASE}/baner`);
    expect(urls).toContain(`${BASE}/spillformater`);
    expect(urls).toContain(`${BASE}/demo`);
    expect(urls).toContain(`${BASE}/finn-turneringer`);
    expect(urls).toContain(`${BASE}/legal/privacy`);

    // Mocked course slugs ride along.
    expect(urls).toContain(`${BASE}/baner/miklagard`);
    expect(urls).toContain(`${BASE}/baner/losby`);

    // One URL per game mode, derived from MODE_LABELS.
    for (const slug of Object.keys(MODE_LABELS)) {
      expect(urls).toContain(`${BASE}/spillformater/${slug}`);
    }
  });

  it('every URL is on the apex host', async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      expect(entry.url.startsWith(BASE)).toBe(true);
    }
  });

  it('every entry carries no / en / x-default hreflang alternates', async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      const languages = entry.alternates?.languages;
      expect(languages).toBeDefined();
      expect(languages).toHaveProperty('no');
      expect(languages).toHaveProperty('en');
      expect(languages).toHaveProperty('x-default');
    }
  });

  it('en alternate is the /en-prefixed variant of the canonical URL', async () => {
    const entries = await sitemap();
    const formats = entries.find(
      (e) => e.url === `${BASE}/spillformater`,
    );
    expect(formats?.alternates?.languages?.en).toBe(`${BASE}/en/spillformater`);
    expect(formats?.alternates?.languages?.no).toBe(`${BASE}/spillformater`);
    expect(formats?.alternates?.languages?.['x-default']).toBe(
      `${BASE}/spillformater`,
    );
  });
});
