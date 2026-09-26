import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { DARK_ATTR, DARK_MEDIA, ROOT, readVar } from './cssTokens';

/**
 * Type A (#2240) — `DESIGN.md` er designsystemet skrevet for agenter (Google
 * Stitch-formatet som «Awesome Design»-samlingen bruker). Tokenverdiene har
 * fortsatt ett hjem, `app/globals.css` (AGENTS.md felle 4); DESIGN.md og
 * `docs/style-and-brand.md` gjengir dem bare. Testen låser gjengivelsene til
 * hjemmet, så en fargeendring i globals.css som glemmer dokumentene blir rød
 * i stedet for å lære neste agent en utdatert palett.
 */

const read = (file: string) =>
  readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

const DESIGN_MD = read('DESIGN.md');
const STYLE_AND_BRAND = read('docs/style-and-brand.md');

/** `key: "value"`-linjene under en toppnivånøkkel i YAML-frontmatteren. */
function frontmatterMap(key: string): Record<string, string> {
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(DESIGN_MD)?.[1];
  if (!frontmatter) throw new Error('DESIGN.md mangler YAML-frontmatter');
  const lines = frontmatter.split('\n');
  const start = lines.indexOf(`${key}:`);
  if (start === -1) throw new Error(`Frontmatteren mangler «${key}:»`);
  const map: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    const entry = /^ {2}([\w-]+):\s*"([^"]+)"\s*$/.exec(line);
    if (!entry) break;
    map[entry[1]] = entry[2];
  }
  return map;
}

const LIGHT = frontmatterMap('colors');
const DARK = frontmatterMap('colors-dark');

describe('DESIGN.md følger app/globals.css (#2240)', () => {
  // En parser som stille returnerer {} ville gjort alle løkkene under grønne
  // uten å sjekke noe (I3) — merkevare-trioen må være med.
  it('gjengir merkevare-trioen i begge moduser', () => {
    for (const name of ['primary', 'accent', 'bg']) {
      expect(LIGHT[name], `colors.${name}`).toBeDefined();
      expect(DARK[name], `colors-dark.${name}`).toBeDefined();
    }
  });

  it('hver lys farge har samme verdi som i :root', () => {
    for (const [name, value] of Object.entries(LIGHT)) {
      expect(readVar(ROOT, name)?.toLowerCase(), `--${name}`).toBe(
        value.toLowerCase(),
      );
    }
  });

  it('hver mørk farge har samme verdi i begge dark-blokkene', () => {
    for (const [name, value] of Object.entries(DARK)) {
      expect(readVar(DARK_ATTR, name)?.toLowerCase(), `--${name}`).toBe(
        value.toLowerCase(),
      );
      expect(readVar(DARK_MEDIA, name)?.toLowerCase(), `--${name}`).toBe(
        value.toLowerCase(),
      );
    }
  });
});

describe('docs/style-and-brand.md følger app/globals.css (#2240)', () => {
  it.each([
    ['Primary', 'primary'],
    ['Accent', 'accent'],
    ['Bg', 'bg'],
  ])('%s-fargen i Stil-lista er --%s', (label, token) => {
    const quoted = new RegExp(`${label}: \`(#[0-9a-fA-F]{6})\``).exec(
      STYLE_AND_BRAND,
    );
    expect(quoted, `«${label}:» i docs/style-and-brand.md`).not.toBeNull();
    expect(quoted![1].toLowerCase()).toBe(readVar(ROOT, token)?.toLowerCase());
  });
});
