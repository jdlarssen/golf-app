import { it, expect } from 'vitest';

/**
 * Server-helper hook guard — regression guard for the singles-matchplay
 * leaderboard crash (b7aa8a1a, i18n phase 2a).
 *
 * `useTranslations`/`useLocale`/`useFormatter` are only callable while React
 * is rendering a component. A plain helper function (lowercase name) called
 * directly from an async server component — `return renderX({...})` — runs
 * after the page's awaits, where React's dispatcher is gone. next-intl then
 * throws "`useTranslations` is not callable within an async component" and
 * the whole route 500s in production.
 *
 * The rule this test enforces: in server files (no 'use client' directive),
 * top-level lowercase functions must use `await getTranslations(...)` (and
 * be async), never the hook form. PascalCase components are exempt — sync
 * server components rendered via JSX may call the hooks.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const HOOK_CALL = /\b(useTranslations|useLocale|useFormatter)\(/;
const SCAN_ROOTS = ['app', 'components'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

function isClientFile(source: string): boolean {
  // The directive must sit at the very top of the file (before any code).
  return /^\s*['"]use client['"]/.test(source.trimStart());
}

/** file:line + offending helper name for every hook call in a lowercase fn. */
function findViolations(): string[] {
  const violations: string[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      const source = readFileSync(file, 'utf8');
      if (isClientFile(source)) continue;
      if (!HOOK_CALL.test(source)) continue;

      let enclosing = '(module scope)';
      const lines = source.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Track top-level (column 0) function declarations only — nested
        // closures inherit the rendering context of their top-level owner.
        const decl =
          line.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/) ??
          line.match(/^(?:export\s+)?const\s+(\w+)\s*=/);
        if (decl) enclosing = decl[1];

        if (
          HOOK_CALL.test(line) &&
          !/^\s*(?:import|\*|\/\/)/.test(line) &&
          !line.includes('typeof') &&
          enclosing[0] === enclosing[0].toLowerCase()
        ) {
          violations.push(`${file}:${i + 1} i ${enclosing}()`);
        }
      }
    }
  }
  return violations;
}

it('server helpers never call i18n hooks — use `await getTranslations` instead', () => {
  expect(
    findViolations(),
    'Lowercase helper functions in server files call useTranslations/useLocale/useFormatter. ' +
      'These run outside component rendering and crash at runtime. ' +
      'Make the helper async and use `await getTranslations(...)` (see renderWolf in leaderboard/page.tsx), ' +
      'or convert it to a PascalCase component rendered via JSX.',
  ).toEqual([]);
});
