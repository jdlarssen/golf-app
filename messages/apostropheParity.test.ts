import { it, expect } from 'vitest';

/**
 * Apostrophe parity guard — #816, N-locale (#845).
 *
 * next-intl only un-escapes ICU `''` → `'` when the string contains a
 * placeholder (`{…}`). Placeholder-less static strings are returned verbatim,
 * so `''` renders as two apostrophes. This is a per-locale property of the
 * rendered catalog, so the scan runs over EVERY locale in `routing.locales`
 * (including the default) — a new `messages/<code>.json` is covered
 * automatically (the N-locale criterion), so a future sv/da/fi catalog can't
 * reintroduce the #816 bug undetected.
 */

import { routing } from '@/i18n/routing';

type MessageObj = Record<string, unknown>;

// Eagerly load every catalog (Vite-native glob) so each locale can be scanned
// by code with no per-case async import. `import.meta.glob` is a Vite/vitest
// feature not in TS's ImportMeta type, so it's accessed via a narrow local cast.
const CATALOGS = (
  import.meta as unknown as {
    glob: (
      pattern: string,
      opts: { eager: true },
    ) => Record<string, { default: MessageObj }>;
  }
).glob('./*.json', { eager: true });

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

it.each(routing.locales)(
  '%s.json has no double-apostrophe in placeholder-less strings',
  (locale) => {
    const mod = CATALOGS[`./${locale}.json`];
    expect(
      mod,
      `messages/${locale}.json must exist for locale '${locale}'`,
    ).toBeDefined();
    const bad = collectBadStrings(mod.default);
    expect(bad).toEqual([]);
  },
);
