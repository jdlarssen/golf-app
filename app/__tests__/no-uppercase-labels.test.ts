import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2728: eieren valgte bort store, sperrede småoverskrifter («PÅGÅR NÅ»)
 * 2026-10-31. Overskrifter står i setningsstil, 12 px halvfet (DESIGN.md
 * `typography.kicker`). Denne vakten feiler hvis mønsteret kommer tilbake,
 * på nettsiden (`uppercase` som klasse) eller i appen (`textTransform:
 * 'uppercase'`). `first-letter:uppercase` gir bare stor forbokstav og er lov.
 */
const ROOT = join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '__snapshots__', '__tests__']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function offenders(dirs: string[], pattern: RegExp): string[] {
  return dirs
    .flatMap((dir) => sourceFiles(join(ROOT, dir)))
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line) && pattern.test(line))
        .map(({ i }) => `${relative(ROOT, file)}:${i + 1}`),
    );
}

describe('ingen store, sperrede småoverskrifter (#2728)', () => {
  it('nettsiden bruker ikke `uppercase` som klasse', () => {
    // Klassen `uppercase` alene, ikke `first-letter:uppercase`.
    expect(offenders(['app', 'components', 'lib'], /(^|[\s"'`])uppercase([\s"'`]|$)/)).toEqual([]);
  });

  it('appen bruker ikke textTransform uppercase', () => {
    expect(offenders(['native/app/src'], /textTransform:\s*['"]uppercase['"]/)).toEqual([]);
  });
});
