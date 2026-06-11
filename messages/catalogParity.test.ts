import { it, expect } from 'vitest';

/**
 * Catalog parity guard — i18n Phase 2a (#554).
 *
 * Every key present in no.json (source of truth) MUST also exist in en.json.
 * Missing keys cause raw-key render for English users, which is never
 * acceptable. The fallback (no → missing locale) is intentional for future
 * third locales, NOT for English.
 *
 * Scope: all namespaces added/extended in Phase 2a and later phases.
 * The test is parametrized so adding a new top-level namespace automatically
 * covers it — no maintenance required.
 */

import noMessages from './no.json';
import enMessages from './en.json';

// ── helpers ─────────────────────────────────────────────────────────────────

type MessageObj = Record<string, unknown>;

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

// ── tests ────────────────────────────────────────────────────────────────────

const noKeys = new Set(flattenKeys(noMessages as unknown as MessageObj));
const enKeys = new Set(flattenKeys(enMessages as unknown as MessageObj));

it('every no.json leaf key exists in en.json', () => {
  const missingInEn = [...noKeys].filter((k) => !enKeys.has(k));
  expect(
    missingInEn,
    `${missingInEn.length} key(s) present in no.json but missing in en.json:\n${missingInEn.map((k) => `  ${k}`).join('\n')}`,
  ).toHaveLength(0);
});

it('every en.json leaf key exists in no.json', () => {
  const extraInEn = [...enKeys].filter((k) => !noKeys.has(k));
  expect(
    extraInEn,
    `${extraInEn.length} key(s) present in en.json but missing in no.json:\n${extraInEn.map((k) => `  ${k}`).join('\n')}`,
  ).toHaveLength(0);
});

it('no.json is non-empty', () => {
  expect(noKeys.size).toBeGreaterThan(0);
});
