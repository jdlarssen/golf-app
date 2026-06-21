import { it, expect } from 'vitest';

/**
 * Catalog parity guard — i18n Phase 2a (#554), N-locale (#845).
 *
 * Every non-default locale catalog in `routing.locales` MUST have exactly the
 * same leaf keys as no.json (the source of truth). A missing key renders the
 * Norwegian fallback (intentional, per i18n/request.ts), but a SILENT
 * divergence would leave a third catalog's completeness unchecked. So this is
 * parametrized over `routing.locales`: append a locale + its
 * `messages/<code>.json` and it is covered automatically — no edit here (the
 * N-locale criterion). A locale in routing.locales whose JSON is missing fails
 * the dynamic import, which is the intended signal to create it.
 */

import { routing } from '@/i18n/routing';
import noMessages from './no.json';

type MessageObj = Record<string, unknown>;

// Eagerly load every catalog (Vite-native glob) so the parametrized cases can
// look each one up by code with no per-case async import. `import.meta.glob` is
// a Vite/vitest feature not in TS's ImportMeta type, so it's accessed via a
// narrow local cast.
const CATALOGS = (
  import.meta as unknown as {
    glob: (
      pattern: string,
      opts: { eager: true },
    ) => Record<string, { default: MessageObj }>;
  }
).glob('./*.json', { eager: true });

/** Flatten a nested message object to sorted dot-path leaf keys. */
function flattenKeys(obj: MessageObj, prefix = ''): string[] {
  const result: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      result.push(...flattenKeys(v as MessageObj, path));
    } else {
      result.push(path);
    }
  }
  return result.sort();
}

const noKeys = new Set(flattenKeys(noMessages as unknown as MessageObj));
const nonDefaultLocales = routing.locales.filter(
  (l) => l !== routing.defaultLocale,
);

it('no.json (source of truth) is non-empty', () => {
  expect(noKeys.size).toBeGreaterThan(0);
});

it.each(nonDefaultLocales)(
  '%s.json has exactly the same leaf keys as no.json',
  (locale) => {
    const mod = CATALOGS[`./${locale}.json`];
    expect(
      mod,
      `messages/${locale}.json must exist for locale '${locale}' in routing.locales`,
    ).toBeDefined();
    const localeKeys = new Set(flattenKeys(mod.default));

    const missing = [...noKeys].filter((k) => !localeKeys.has(k));
    const extra = [...localeKeys].filter((k) => !noKeys.has(k));

    expect(
      missing,
      `${missing.length} key(s) in no.json missing from ${locale}.json:\n${missing.map((k) => `  ${k}`).join('\n')}`,
    ).toHaveLength(0);
    expect(
      extra,
      `${extra.length} key(s) in ${locale}.json not in no.json:\n${extra.map((k) => `  ${k}`).join('\n')}`,
    ).toHaveLength(0);
  },
);
