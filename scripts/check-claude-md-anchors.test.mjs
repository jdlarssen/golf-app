// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// #2100: CLAUDE.md is loaded on every agent turn, so it is kept a map — the
// procedures it used to hold now live in files read when their trigger fires.
// The move must lose no rule. Each anchor below is a verbatim fragment of one
// rule as CLAUDE.md stated it before the move; the test asserts that every
// anchor still has a home in CLAUDE.md or in one of the files it moved to.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** CLAUDE.md plus every file the move table sends a section to. */
const HOMES = [
  'CLAUDE.md',
  'AGENTS.md',
  'docs/collaboration.md',
  'docs/issue-workflow.md',
  'docs/pr-workflow.md',
  'docs/forge-workflow.md',
  '.changes/README.md',
  'docs/copy-style.md',
  'docs/staging-testing.md',
  'docs/test-discipline.md',
  'docs/agent-discipline/bindings.md',
  'docs/style-and-brand.md',
  'docs/auth-flow.md',
  'lib/sync/AGENTS.md',
  'lib/supabase/AGENTS.md',
  'lib/games/AGENTS.md',
  'lib/scoring/AGENTS.md',
];

/**
 * Line wrapping and bold markers are form, not rule: a paragraph re-wrapped in
 * its new home must still match.
 */
const normalize = (text) => text.replaceAll('**', '').replace(/\s+/g, ' ');

const read = (relative) => {
  const absolute = path.join(ROOT, relative);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
};

const ANCHORS = [
  // Identity, collaboration clauses, never-list, stack, git — stay in CLAUDE.md
  'Ikke fjern `regions` uten å måle',
  'Aldri be brukeren lese kode',
  'Canonical copy lives in the global `~/.claude/CLAUDE.md`',
  "Stay in your lane, but speak up.",
  "Rename Dexie-databasen (heter `'golf-app'` av historisk grunn",
  'Bestille ting brukeren må betale for',
  'middleware-konvensjonen heter `proxy.ts`',
  'IKKE overstyr forfatter',
  'Aldri `--no-verify`, aldri force-push uten god grunn',
  "Dexie database heter `'golf-app'` (historisk) — IKKE rename",
  'Ingen quick-fixes. Bruker har eksplisitt sagt',
  '`TODO.md` er en stub som peker dit',
  '`PUBLIC_PATH_PATTERN` i `proxy.ts`',
  'live DB er fasit',
  'fasit: `npx vitest run lib/scoring`',
  // Samarbeidsmodell
  'Aldri si bare «sett dette i Supabase»',
  'touch .claude/approve-prod',
  'Read-only SELECT mot prod er sanksjonert',
  'Hva du gjør hvis det ikke ser slik ut:',
  // Issue workflow: milestone, flow anchoring, closing comment, null growth
  'Hvert `gh issue create` MÅ ha `--milestone`',
  '-F milestone=<num>',
  'Brukerflytene er sannhetskilden for hva som er core',
  'Presedens: #318',
  'Når en issue lukkes, MÅ det stå en closing-kommentar på den',
  'IKKE post en ny',
  'hovedchatten skriver (eller korrigerer) closing-kommentaren, ikke subagenten',
  'ikke skjul kutt, scope-endringer eller utsatte deler',
  'En PR som lukker et issue oppretter ingen nye.',
  'Scope = mønsteret, ikke stedet.',
  '`## Observert, ikke rørt`',
  'Nye issues: 0',
  'de teller ikke mot ACCEPT',
  'Ingen start-kommentar, ingen self-assign',
  // Branch + PR flow
  'Alt arbeid via PR — aldri direkte push til `main`',
  '`Closes #N` i PR-body er den autoritative auto-close-triggeren',
  '`gh pr ready` er øktas siste handling',
  'Dette er formens ene hjem',
  '2–3 fordeler og 2–3 ulemper ved valgt løsning',
  'Ombyggingskostnad',
  'ingen hast — PR-en venter til du svarer eller merger',
  '`gh pr merge --rebase --delete-branch` — ikke vent på eieren',
  'Rene tekniske valg (implementasjonsdetaljer) er aldri et produktvalg',
  'endringer i selve merge-porten (`lib/loops/`, `scripts/loops/` — #1655)',
  'appens innloggings-, konto- og butikkflater', // #2134: ikke lenger hele native/app/**
  'PR-body-en er den foreskrevne plassen',
  'Prosa uten heading teller ikke',
  // Forge
  'aldri start `/forge:auto`-løkken uten en kontrakt-kommentar på et åpent issue',
  // Versioning / CHANGELOG
  'skal hverken bumpe `package.json` eller redigere `CHANGELOG.md`',
  'Notatfilene har unike navn og kan ikke kollidere',
  'OG alle commits unntatt `chore(release)` som endrer `version`-feltet i `package.json`',
  '`node scripts/weekly-release.mjs --dry-run`',
  '`[no-changelog]` i commit-body-en',
  'Ett ugyldig notat stopper hele ukesslippet',
  // Copy quality
  'kjør `humanizer:humanizer`-skillet før commit',
  '«Sekretariat»-stemmen i admin-flater',
  // Testing — staging, never prod
  'Test ALDRI ved å skrive til prod.',
  'Supabase-ref `snwmueecmfqqdurxedxv`',
  'Bruker-synlige fikser MÅ verifiseres på staging før merge',
  'appen krasjer på Node 20',
  '`preview_start("torny-staging")`',
  '/auth/v1/admin/generate_link',
  'en staging-mintet kode validerer kun mot staging',
  'påfør staging først via Supabase MCP, verifiser, DERETTER prod',
  // Test discipline
  'ÉN chrome-lås per template',
  'vis skjelett på ÉN fil først, vent på eksplisitt go-ahead',
  'Kopier-lim av mock-oppsett mellom filer',
  'Capture log/payload',
  // Execution: subagents vs direct
  'Plan-eksekvering: alltid subagent-drevet.',
  'Sett `model`-parameteren eksplisitt på hvert `Agent`-kall',
  '`/orchestrator:dispatch <N>`',
  '5+ filer eller mer enn 100 LOC',
  // Style and brand
  'Tall i tabeller/leaderboards: ALLTID `tabular-nums`',
  'tap-targets ≥44px',
  '«Tørny — fyr opp golfturneringen på et par minutter»',
  'logo-lockup',
  // Auth flow
  'Bytte fra magic-link skjedde 2026-05-13',
  'gateer `shouldCreateUser` på `email_is_invited` RPC',
  'to mailer per invitasjon',
  'Alle tre Resend-helpers er best-effort med `Promise.allSettled`',
  // Realtime + offline sync
  'Send ALDRI tokenet som argument',
  'argument-løs priming per kanalbygg',
  '`upsert_score_if_newer` RPC',
  'Last-write-wins via `client_updated_at`',
  // RLS
  'Et ferdig spill er altså ikke world-read (#1542)',
  'gaten i ruta ER håndhevelsen',
  'Helper functions er `SECURITY DEFINER`',
  // Server actions and caching
  'cookies fungerer ikke inne i cache-callbacks',
  '(Next.js 16 to-arg-form; single-arg er deprecated)',
  '`courses(...)` / `tee_boxes(...)` joins er IKKE cachet',
  '`revalidateTag` kaster under render-fase',
];

describe('CLAUDE.md rule anchors (#2100)', () => {
  const corpus = HOMES.map((home) => normalize(read(home)));

  it('keeps at least 40 anchors', () => {
    expect(ANCHORS.length).toBeGreaterThanOrEqual(40);
  });

  it.each(ANCHORS)('«%s» still has a home', (anchor) => {
    const needle = normalize(anchor);
    const homes = HOMES.filter((_, i) => corpus[i].includes(needle));
    expect(homes, `no home holds «${anchor}»`).not.toEqual([]);
  });
});

/** Files the #2100 move created: each must be on the map and reached from a trigger. */
const NEW_HOMES = [
  'docs/collaboration.md',
  'docs/issue-workflow.md',
  'docs/pr-workflow.md',
  'docs/staging-testing.md',
  'docs/style-and-brand.md',
  'docs/auth-flow.md',
  'lib/sync/AGENTS.md',
  'lib/games/AGENTS.md',
];

const gitFiles = (pathspec) =>
  execFileSync('git', ['ls-files', '--', pathspec], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

describe('CLAUDE.md is a map (#2100)', () => {
  const claude = read('CLAUDE.md');
  const agentsFiles = gitFiles('*AGENTS.md').filter((file) => path.basename(file) === 'AGENTS.md');
  const topLevelDocs = gitFiles('docs/*.md').filter((file) => file.split('/').length === 2);
  const triggerSources = [
    'docs/agent-discipline/core.md',
    'docs/agent-discipline/bindings.md',
    ...agentsFiles,
  ];

  it('stays under 12 KiB', () => {
    expect(Buffer.byteLength(claude, 'utf8')).toBeLessThan(12_288);
  });

  it.each(NEW_HOMES)('%s exists, is on the map and is reached from a trigger', (home) => {
    expect(existsSync(path.join(ROOT, home))).toBe(true);
    expect(claude).toContain(`\`${home}\``);
    const reachedFrom = triggerSources.filter((source) => source !== home && read(source).includes(home));
    expect(reachedFrom, `no trigger file points at ${home}`).not.toEqual([]);
  });

  it.each([...topLevelDocs, ...agentsFiles])('the map lists %s', (file) => {
    expect(claude).toContain(`\`${file}\``);
  });
});
