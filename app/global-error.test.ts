import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import noMessages from '@/messages/no.json';

/**
 * Type A (#2287): `global-error.tsx` cannot use next-intl (it replaces the
 * root layout and its provider), so its heading is hardcoded. It must stay the
 * same text as `error.heading`, the error screen's heading. This test holds
 * the two together.
 */
describe('global-error', () => {
  it('has the same heading as error.heading in the catalog', () => {
    const source = readFileSync(path.resolve(__dirname, 'global-error.tsx'), 'utf8');
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(source);
    expect(h1, 'fant ingen <h1> i global-error.tsx').not.toBeNull();
    expect(h1![1].trim()).toBe(noMessages.error.heading);
  });
});
