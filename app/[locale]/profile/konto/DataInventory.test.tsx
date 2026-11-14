import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import messages from '@/messages/no.json';
import DataPage from './page';
import { DATA_ROWS } from './DataInventory';

/**
 * Type C (#2332): «Dine data» on the website — structure only. The words are
 * locked by the app's parity test against `profile.data`
 * (`native/app/src/lib/profileCopy.test.ts`), so nothing here asserts copy.
 *
 * One render of the page: one `h1`, a `h2` per section, one `dt`/`dd` pair per
 * row in `DATA_ROWS` order, and the delete row on its own after the rest.
 */
describe('«Dine data» (/profile/konto)', () => {
  it('has the rows in catalogue order, the headings and the links in their places', async () => {
    render(await DataPage());

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);

    // The list follows the catalogue the app mirrors, so a row added there
    // without a place here (or the other way round) turns this red.
    expect([...DATA_ROWS]).toEqual(Object.keys(messages.profile.data.rows));
    const rows = screen.getAllByTestId(/^data-row-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual(DATA_ROWS.map((id) => `data-row-${id}`));
    for (const row of rows) {
      expect(row.parentElement?.tagName).toBe('DL');
      expect(within(row).getAllByRole('term')).toHaveLength(1);
      expect(within(row).getAllByRole('definition')).toHaveLength(1);
    }

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/profile/export', '/legal/privacy', '/profile/slett-konto']));
    // Sletting står sist, alene.
    expect(hrefs.at(-1)).toBe('/profile/slett-konto');
    const download = screen.getAllByRole('link').find((link) => link.getAttribute('href') === '/profile/export');
    expect(download?.hasAttribute('download')).toBe(true);
  });
});
