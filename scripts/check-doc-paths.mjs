#!/usr/bin/env node
/**
 * C7-skanneren (#1554): sjekker at de LEVENDE styringsdokumentene bare siterer
 * fil-stier som faktisk finnes.
 *
 * Hvorfor den finnes: dok-avstemmerens C7-rad sa «for hver `sti`-referanse i
 * backticks: test -e», men hver kjøring fant opp heuristikken på nytt. En naiv
 * implementasjon rapporterte 96 «brutte» stier der alle 96 var støy (URL-ruter,
 * npm-spesifikatorer, git-refs, slash-kommandoer, prosa med skråstrek), og
 * tallene fra to kjøringer målte ikke det samme. Her bor reglene i stedet.
 *
 * Levende = dokumenter vi vedlikeholder. Punkt-i-tid-arkiv (.forge/contracts/,
 * docs/plans/, docs/audits/, CHANGELOG — og docs/loops/logg/, som er
 * månedskopier av tavle-kommentarer) skannes IKKE: en gammel kontrakt SKAL
 * kunne nevne en fil som siden er slettet.
 *
 * Klassifiseringen er ren og eksportert (`isSkippableRef`, `classifyRef`) så
 * regelen har ett hjem og en egen test-suite; bare `main` rører filsystemet.
 *
 * Kjør: node scripts/check-doc-paths.mjs   (exit 1 hvis noe er brutt)
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Enkeltdokumenter som skannes. */
export const LIVING_DOC_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'docs/user-flows.md',
  'docs/test-discipline.md',
];

/** Kataloger der ALLE `.md`-filer skannes, rekursivt. */
export const LIVING_DOC_DIRS = ['docs/agent-discipline', 'docs/loops'];

/**
 * Utelatt fra `LIVING_DOC_DIRS`. `docs/loops/logg/` er #1110-tavlas månedlige
 * arkiv (jf. `docs/loops/logg/README.md`) — punkt-i-tid, ikke levende.
 */
export const ARCHIVED_DOC_DIRS = ['docs/loops/logg'];

/**
 * Refs som starter med disse er git-refs, ikke stier. `claude/` er øktenes
 * branch-navnemønster og kolliderer ellers med ingenting i repo-rota.
 */
const GIT_REF_PREFIXES = ['origin/', 'upstream/', 'refs/', 'claude/'];

/**
 * Fjerner ```-blokker. De inneholder kommandoer og SQL, ikke sti-sitater, og
 * en kommando med skråstrek («gh api repos/…/comments») ville ellers måttet
 * filtreres bort én etter én lenger nede.
 */
export function stripFencedBlocks(markdown) {
  const out = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out.join('\n');
}

/**
 * Plukker ut innholdet i alle inline-kode-spenn. Doble backticks tas først:
 * dokumentene bruker `` `sti` ``-formen når de viser fram en backticket sti,
 * og et enkelt-backtick-regex ville lest den som et tomt spenn.
 */
export function extractRefs(markdown) {
  const refs = [];
  const rest = stripFencedBlocks(markdown).replace(/``([\s\S]*?)``/g, (_m, inner) => {
    refs.push(inner.trim().replace(/^`+|`+$/g, '').trim());
    return ' ';
  });
  for (const match of rest.matchAll(/`([^`\n]+)`/g)) refs.push(match[1].trim());
  return refs.filter((ref) => ref !== '');
}

/**
 * Sant for referanser som aldri er fil-stier — avvist før filsystemet røres.
 *
 * - uten `/`: enkeltord, felt- og funksjonsnavn («status», «revalidateTag»)
 * - leder-`/`: URL-ruter (`/admin/cup`) og slash-kommandoer (`/forge:auto`)
 * - leder-`@`: npm-spesifikatorer (`@supabase/ssr`)
 * - git-ref-prefiks: `origin/main`, `claude/dok-skjema-*`
 * - glob- eller plassholder-tegn: `docs/flows/*-fremtid.svg` og
 *   `.changes/<issue>-<slug>.md` er MØNSTRE, ikke stier. «Finnes denne?» er
 *   ikke et meningsfullt spørsmål om et mønster — og for plassholderne er
 *   svaret alltid nei, siden den siterte formen aldri er ment å finnes.
 * - mellomrom: kommando-fragmenter («npm run gen:types»), ikke stier.
 */
export function isSkippableRef(ref) {
  if (!ref || !ref.includes('/')) return true;
  if (ref.startsWith('/') || ref.startsWith('@')) return true;
  if (GIT_REF_PREFIXES.some((prefix) => ref.startsWith(prefix))) return true;
  if (/[*?<>]/.test(ref)) return true;
  if (/\s/.test(ref)) return true;
  return false;
}

/**
 * Klassifiserer én referanse. `docDir` er dokumentets katalog (repo-rot-
 * relativ, '' for rot-dokumenter); `exists` svarer på om en repo-rot-relativ
 * sti finnes.
 *
 * Rekkefølgen:
 *  1. `isSkippableRef` → 'skip'.
 *  2. Kandidat? Første segment må finnes i repo-rota, ELLER stien må løse
 *     doc-relativt. Uten dette leses hvert kommando-fragment med skråstrek
 *     som en sti.
 *  3. Løs: som gitt, doc-relativt, og med `.ts`/`.tsx` påhengt
 *     (ekstensjonløse modul-refs som `lib/notifications/types`).
 *  4. Fortsatt borte → 'broken' KUN hvis siste segment har en `.` eller refen
 *     slutter på `/`. Ellers er det prosa: `docs/refactor/test/chore/style/
 *     ci/build` er en oppramsing av commit-prefikser, ikke en katalog.
 */
export function classifyRef(ref, docDir, exists) {
  if (isSkippableRef(ref)) return { verdict: 'skip' };

  const docRelative = (p) => (docDir ? path.posix.join(docDir, p) : p);
  const trimmed = ref.replace(/\/+$/, '');
  if (trimmed === '') return { verdict: 'skip' };

  const isCandidate = exists(trimmed.split('/')[0]) || exists(docRelative(trimmed));
  if (!isCandidate) return { verdict: 'skip' };

  const attempts = [
    trimmed,
    docRelative(trimmed),
    `${trimmed}.ts`,
    `${trimmed}.tsx`,
    docRelative(`${trimmed}.ts`),
    docRelative(`${trimmed}.tsx`),
  ];
  for (const attempt of attempts) {
    if (exists(attempt)) return { verdict: 'ok', resolved: attempt };
  }

  const lastSegment = trimmed.split('/').pop();
  const looksLikeAPath = lastSegment.includes('.') || ref.endsWith('/');
  return looksLikeAPath ? { verdict: 'broken' } : { verdict: 'skip' };
}

/** Alle levende dokumenter, repo-rot-relative og sortert. */
export function livingDocs(root) {
  const docs = LIVING_DOC_FILES.filter((file) => existsSync(path.join(root, file)));
  for (const dir of LIVING_DOC_DIRS) {
    docs.push(...markdownUnder(root, dir));
  }
  return [...new Set(docs)].sort();
}

function markdownUnder(root, dir) {
  const absolute = path.join(root, dir);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return [];
  if (ARCHIVED_DOC_DIRS.includes(dir)) return [];

  const found = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...markdownUnder(root, relative));
    else if (entry.name.endsWith('.md')) found.push(relative);
  }
  return found;
}

function main() {
  const root = process.cwd();
  const exists = (relative) => existsSync(path.join(root, relative));

  let checked = 0;
  const broken = new Set();

  for (const doc of livingDocs(root)) {
    const docDir = path.posix.dirname(doc) === '.' ? '' : path.posix.dirname(doc);
    for (const ref of extractRefs(readFileSync(path.join(root, doc), 'utf8'))) {
      const { verdict } = classifyRef(ref, docDir, exists);
      if (verdict === 'skip') continue;
      checked += 1;
      if (verdict === 'broken') broken.add(`${doc}: ${ref}`);
    }
  }

  for (const entry of [...broken].sort()) console.log(`BRUTT  ${entry}`);
  console.log(`sjekket ${checked}, brutt ${broken.size}`);
  process.exitCode = broken.size > 0 ? 1 : 0;
}

// Kjør kun som script — testene importerer klassifisereren.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
