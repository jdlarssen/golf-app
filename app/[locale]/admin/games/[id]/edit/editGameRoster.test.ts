import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #2323: the player list on the admin edit page must not offer deleted
 * accounts (anonymised «Slettet bruker» rows keep their `users` row). The read
 * lives in `getOptions` inside `page.tsx`, which a page cannot export, so this
 * source test locks the filter on the users read. It also asserts the read is
 * still here: moving it out of the file must fail this test, not pass it.
 */
describe('admin edit-game player list (#2323)', () => {
  const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

  it('reads users once, with the deleted_at filter', () => {
    const starts = [...src.matchAll(/\.from\('users'\)/g)];
    expect(starts).toHaveLength(1);

    const start = starts[0].index!;
    const end = src.indexOf("'edit game users'", start);
    expect(end).toBeGreaterThan(start);

    expect(src.slice(start, end)).toContain(".is('deleted_at', null)");
  });
});
