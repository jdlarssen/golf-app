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
 * Gitignorerte stier (#2185) hoppes over før disken spørres: `.gitignore` er
 * sannhetskilden for «finnes ikke i en klone». Uten regelen slapp
 * `.forge/contracts/` stille gjennom (ingen `.forge/` i rota), mens
 * `.claude/orchestrator/` ble meldt brutt (`.claude/` finnes) — og svaret
 * hang på om kladdeboka tilfeldigvis fantes i arbeidskopien som kjørte.
 *
 * Klassifiseringen er ren og eksportert (`isSkippableRef`, `classifyRef`) så
 * regelen har ett hjem og en egen test-suite; bare `main` rører filsystemet
 * og git.
 *
 * Kjør: node scripts/check-doc-paths.mjs   (exit 1 hvis noe er brutt, eller
 * hvis git-kallet feiler)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
 * sti finnes; `isIgnored` svarer på om `.gitignore` holder refen utenfor
 * repoet.
 *
 * Rekkefølgen:
 *  1. `isSkippableRef` → 'skip'.
 *  2. `isIgnored` → 'ignored', FØR `exists` spørres. En gitignorert sti finnes
 *     ikke i en klone, og om den tilfeldigvis finnes lokalt skal ikke styre
 *     svaret (#2185).
 *  3. Kandidat? Første segment må finnes i repo-rota, ELLER stien må løse
 *     doc-relativt. Uten dette leses hvert kommando-fragment med skråstrek
 *     som en sti.
 *  4. Løs: som gitt, doc-relativt, og med `.ts`/`.tsx` påhengt
 *     (ekstensjonløse modul-refs som `lib/notifications/types`).
 *  5. Fortsatt borte → 'broken' KUN hvis siste segment har en `.` eller refen
 *     slutter på `/`. Ellers er det prosa: `docs/refactor/test/chore/style/
 *     ci/build` er en oppramsing av commit-prefikser, ikke en katalog.
 */
export function classifyRef(ref, docDir, exists, isIgnored = () => false) {
  if (isSkippableRef(ref)) return { verdict: 'skip' };
  if (isIgnored(ref)) return { verdict: 'ignored' };

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

/**
 * Hvilke av `refs` `.gitignore` holder utenfor repoet — ett `git check-ignore`
 * for hele kjøringen. To tiltak holder lokal tilstand utenfor svaret:
 *  - En ref uten skråstrek til slutt sendes også MED skråstrek. Et
 *    katalog-mønster (`.claude/orchestrator/`, `.expo/`) treffer ellers bare
 *    når katalogen tilfeldigvis finnes lokalt.
 *  - `core.excludesFile=` slår av maskinens globale ignore-fil, som ikke
 *    følger med repoet.
 * Hullet som står igjen: `.git/info/exclude` kan ikke slås av. Den deles av
 * alle worktrees i samme klone, men kan avvike mellom kloner.
 * `-z` fordi git ellers setter en sti med ø/æ/å i anførselstegn, og da bommer
 * oppslaget i settet stille.
 */
function gitIgnoredRefs(root, refs) {
  // Tre ref-former får git til å avbryte hele batchen med exit 128: en som
  // peker ut av repoet (`../…`), en som starter med `:` (pathspec-magi,
  // `:!docs/plans/`), og en som går gjennom en lokal symlenke (git avviser
  // «beyond a symbolic link»). De holdes utenfor og regnes som ikke ignorert.
  const throughSymlink = (ref) => {
    const segments = ref.replace(/\/+$/, '').split('/');
    return segments.some((_segment, i) => {
      try {
        return lstatSync(path.join(root, ...segments.slice(0, i + 1))).isSymbolicLink();
      } catch {
        return false;
      }
    });
  };
  const batch = [...new Set(refs)].filter(
    (ref) => !ref.startsWith(':') && !ref.split('/').includes('..') && !throughSymlink(ref),
  );
  const paths = batch.flatMap((ref) => (ref.endsWith('/') ? [ref] : [ref, `${ref}/`]));
  const result = spawnSync(
    'git',
    ['-c', 'core.excludesFile=', 'check-ignore', '--no-index', '-z', '--stdin'],
    { cwd: root, input: paths.map((p) => `${p}\0`).join(''), encoding: 'utf8' },
  );
  // 0 = noen treff, 1 = ingen treff. Alt annet (128: ikke en git-repo) er en
  // feil og skal gi exit ≠ 0 — aldri tolkes som «ingenting ignorert».
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore feilet (exit ${result.status}): ${result.stderr.trim()}`);
  }
  const hits = new Set(result.stdout.split('\0').filter(Boolean));
  return new Set(batch.filter((ref) => hits.has(ref) || hits.has(`${ref}/`)));
}

function main() {
  const root = process.cwd();
  const exists = (relative) => existsSync(path.join(root, relative));

  const refsByDoc = livingDocs(root).map((doc) => ({
    doc,
    docDir: path.posix.dirname(doc) === '.' ? '' : path.posix.dirname(doc),
    refs: extractRefs(readFileSync(path.join(root, doc), 'utf8')),
  }));
  const ignoredRefs = gitIgnoredRefs(
    root,
    refsByDoc.flatMap(({ refs }) => refs).filter((ref) => !isSkippableRef(ref)),
  );
  const isIgnored = (ref) => ignoredRefs.has(ref);

  let checked = 0;
  let ignored = 0;
  const broken = new Set();

  for (const { doc, docDir, refs } of refsByDoc) {
    for (const ref of refs) {
      const { verdict } = classifyRef(ref, docDir, exists, isIgnored);
      if (verdict === 'skip') continue;
      if (verdict === 'ignored') {
        ignored += 1;
        continue;
      }
      checked += 1;
      if (verdict === 'broken') broken.add(`${doc}: ${ref}`);
    }
  }

  for (const entry of [...broken].sort()) console.log(`BRUTT  ${entry}`);
  console.log(`sjekket ${checked}, brutt ${broken.size}, gitignorert ${ignored}`);
  process.exitCode = broken.size > 0 ? 1 : 0;
}

// Kjør kun som script — testene importerer klassifisereren.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
