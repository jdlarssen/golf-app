import { it, expect } from 'vitest';

/**
 * Apostrophe parity guard — #816.
 *
 * next-intl only un-escapes ICU `''` → `'` when the string contains a
 * placeholder (`{…}`). Placeholder-less static strings are returned verbatim,
 * so `''` is rendered as two apostrophes for English users.
 *
 * This test fails if any en.json string contains `''` while having no `{`
 * and no `<` — the exact pattern that caused #816.
 */

import enMessages from './en.json';

type MessageObj = Record<string, unknown>;

function collectBadStrings(obj: MessageObj, prefix = ''): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      bad.push(...collectBadStrings(v as MessageObj, path));
    } else if (
      typeof v === 'string' &&
      v.includes("''") &&
      !v.includes('{') &&
      !v.includes('<')
    ) {
      bad.push(`${path}: ${JSON.stringify(v)}`);
    }
  }
  return bad;
}

it('en.json has no double-apostrophe in placeholder-less strings', () => {
  const bad = collectBadStrings(enMessages as unknown as MessageObj);
  expect(bad).toEqual([]);
});
