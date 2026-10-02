#!/usr/bin/env node
/**
 * Vakt for `.gitleaksignore` (#2470): hvert fingeravtrykk må peke på en
 * commit som allerede står på main.
 *
 * Hvorfor den finnes: et fingeravtrykk er `<commit>:<fil>:<regel>:<linje>`,
 * altså knyttet til én commit-SHA. Repoet rebase-merger, så commitene på en
 * PR-gren får nye SHA-er når de lander på main. Et fingeravtrykk som ble lagt
 * inn for å slippe PR-ens egen skanning gjennom, matcher derfor ingenting
 * etter merge, og den ukentlige full-historikk-skanningen blir rød på samme
 * funn. Det skjedde 27.09 (#2308, getInviteLoginContext.test.ts) og 02.10
 * (#2470, pushDevice.test.ts). Falske positiver som kommer inn via en PR
 * hører hjemme som verdi-regex i `.gitleaks.toml`, som ikke bryr seg om SHA.
 *
 * Parsingen er ren og eksportert (`parseIgnoreFile`, `findStale`), så regelen
 * har ett hjem og egne tester; bare `main` rører git og filsystemet.
 *
 * Kjør: node scripts/check-gitleaksignore.mjs   (exit 1 ved foreldede eller
 * ugyldige linjer, exit 2 hvis main-refen mangler)
 * Base-ref: GITLEAKSIGNORE_BASE, ellers origin/main.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FINGERPRINT = /^([0-9a-f]{40}):(.+):([^:]+):(\d+)$/;

/**
 * Leser `.gitleaksignore`. Tomme linjer og `#`-kommentarer hoppes over.
 * Hver annen linje blir enten et fingeravtrykk eller en ugyldig linje.
 */
export function parseIgnoreFile(text) {
  const fingerprints = [];
  const malformed = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const match = FINGERPRINT.exec(line);
    if (match) fingerprints.push({ lineNumber: index + 1, sha: match[1], file: match[2], raw: line });
    else malformed.push({ lineNumber: index + 1, raw: line });
  });
  return { fingerprints, malformed };
}

/** Fingeravtrykkene der commiten ikke står på main. */
export function findStale(fingerprints, isOnMain) {
  return fingerprints.filter((fp) => !isOnMain(fp.sha));
}

function main() {
  const base = process.env.GITLEAKSIGNORE_BASE || 'origin/main';
  const hasBase = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  if (hasBase.status !== 0) {
    console.error(`Fant ikke ${base}. Hent hele historikken (fetch-depth: 0) før sjekken.`);
    process.exitCode = 2;
    return;
  }

  const { fingerprints, malformed } = parseIgnoreFile(readFileSync('.gitleaksignore', 'utf8'));
  // `--is-ancestor` gir 0 for ja, 1 for nei og 128 for en ukjent commit.
  // Både 1 og 128 betyr at fingeravtrykket aldri matcher main-historikken.
  const isOnMain = (sha) =>
    spawnSync('git', ['merge-base', '--is-ancestor', sha, base]).status === 0;
  const stale = findStale(fingerprints, isOnMain);

  for (const m of malformed) {
    console.log(`UGYLDIG  .gitleaksignore:${m.lineNumber}  ${m.raw}`);
  }
  for (const fp of stale) {
    console.log(`IKKE PÅ MAIN  .gitleaksignore:${fp.lineNumber}  ${fp.sha.slice(0, 9)} (${fp.file})`);
  }
  if (stale.length > 0) {
    console.log(
      'Commiten finnes ikke på main. Rebase-merge gir PR-commitene nye SHA-er, så ' +
        'fingeravtrykket matcher ingenting etter merge. Legg den falske verdien som ' +
        'regex i .gitleaks.toml i stedet.',
    );
  }
  console.log(`sjekket ${fingerprints.length}, ikke på main ${stale.length}, ugyldige ${malformed.length}`);
  process.exitCode = stale.length + malformed.length > 0 ? 1 : 0;
}

// Kjør kun som script, testene importerer parseren.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
