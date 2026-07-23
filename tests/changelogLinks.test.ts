import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guard for launch-CTA links in CHANGELOG.md (#1327).
 *
 * Utroperen (docs/loops/utroperen.md) lifts the `↳ /lenke · «cta»` line
 * verbatim into a lansering, and `validateProductUpdateInput` only checks that
 * the link starts with `/` — not that it points at a real route. That gap
 * shipped 1.202 «Avstand til green» with `/games` (a non-route), sending 19
 * users to a 404. This test fails CI if any CHANGELOG launch link no longer
 * resolves to a page under `app/[locale]/`, so a dead link can never reach the
 * publish flow again.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');
const APP_DIR = path.join(REPO_ROOT, 'app', '[locale]');
const CHANGELOG = path.join(REPO_ROOT, 'CHANGELOG.md');

const PAGE_FILES = ['page.tsx', 'page.ts', 'page.jsx', 'page.js'];

function dirHasPage(dir: string): boolean {
  return PAGE_FILES.some((f) => fs.existsSync(path.join(dir, f)));
}

function childDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Does `segments` resolve to a route (a directory with a page file) starting at
 * `dir`? Route groups `(name)` are transparent (consume no URL segment);
 * dynamic `[param]` directories match any single segment.
 */
function resolves(dir: string, segments: string[]): boolean {
  if (segments.length === 0) return dirHasPage(dir);
  const [head, ...rest] = segments;
  for (const child of childDirs(dir)) {
    if (child.startsWith('(') && child.endsWith(')')) {
      if (resolves(path.join(dir, child), segments)) return true;
      continue;
    }
    const isDynamic = child.startsWith('[') && child.endsWith(']');
    if (child === head || isDynamic) {
      if (resolves(path.join(dir, child), rest)) return true;
    }
  }
  return false;
}

function routeExists(link: string): boolean {
  const clean = link.split('?')[0].split('#')[0];
  const segments = clean.split('/').filter(Boolean);
  return resolves(APP_DIR, segments);
}

const links = [...fs.readFileSync(CHANGELOG, 'utf8').matchAll(/↳ (\/\S*)/g)].map(
  (match) => match[1],
);
const uniqueLinks = [...new Set(links)];

describe('CHANGELOG launch-CTA links', () => {
  it('finds launch links to check', () => {
    expect(uniqueLinks.length).toBeGreaterThan(0);
  });

  it.each(uniqueLinks)('resolves %s to a real app route', (link) => {
    expect(routeExists(link)).toBe(true);
  });
});
