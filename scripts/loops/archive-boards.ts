// Tavle-arkivet (#1996), runner: kopierer forrige måneds kommentarer fra #1110
// og #1208 til docs/loops/logg/, og sletter kommentarer som allerede har en
// verifisert kopi på main. Logikken (format, maskering, slette-dommen) bor i
// lib/loops/boardArchive.ts; her er HTTP, env, flagg og filer.
//
// Kjøres via `npx --yes tsx` UTEN npm ci, fra .github/scripts/tavle-arkiv.sh.
//
//   npx --yes tsx scripts/loops/archive-boards.ts [--phase archive|delete|both]
//     [--month YYYY-MM] [--dry-run] [--logg-dir docs/loops/logg]
//
// Env: GITHUB_TOKEN (påkrevd), GH_REPO (default jdlarssen/golf-app).
//
// Rekkefølge ved `both`: slett først, arkiver etterpå. Slette-fasen skal bare se
// filer som ligger på main, og det er arbeidstreet så lenge ingenting er skrevet.
//
// Fail-loud: avvik, dupliserte nøkler, mislykkede DELETE-kall og alt uventet
// gir exit 1. Selve issue-filingen gjør workflowens failure-steg.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

import { ghClient } from './ghClient';
import {
  ARCHIVE_DIR,
  BOARDS,
  archivePath,
  buildArchive,
  deleteArchivedComments,
  deleteMonths,
  entryKey,
  parseArchive,
  planArchive,
  scanEmailLeaks,
  type LiveComment,
} from '../../lib/loops/boardArchive';

const LOG = '[archive-boards]';
const REPO = process.env.GH_REPO || 'jdlarssen/golf-app';
const TOKEN = process.env.GITHUB_TOKEN;
const MAX_PAGES = 20;

type Phase = 'archive' | 'delete' | 'both';
type Args = { phase: Phase; month?: string; dryRun: boolean; loggDir: string };
type Gh = ReturnType<typeof ghClient>;

function parseArgs(argv: string[]): Args {
  const args: Args = { phase: 'both', dryRun: false, loggDir: ARCHIVE_DIR };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} mangler verdi`);
      return v;
    };
    if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--month') args.month = value() || undefined;
    else if (flag === '--logg-dir') args.loggDir = value();
    else if (flag === '--phase') {
      const p = value();
      if (p !== 'archive' && p !== 'delete' && p !== 'both')
        throw new Error(`ukjent --phase «${p}» (archive | delete | both)`);
      args.phase = p;
    } else throw new Error(`ukjent flagg «${flag}»`);
  }
  return args;
}

type ApiComment = {
  id: number;
  user: { login: string } | null;
  created_at: string;
  body?: string | null;
  html_url: string;
};

async function fetchComments(gh: Gh, issue: number): Promise<LiveComment[]> {
  const out: LiveComment[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await gh.rest('GET', `/repos/${REPO}/issues/${issue}/comments?per_page=100&page=${page}`);
    if (res.status !== 200) throw new Error(`#${issue}: kunne ikke lese kommentarene (HTTP ${res.status})`);
    const batch = (res.json as ApiComment[] | null) ?? [];
    for (const c of batch)
      out.push({
        id: c.id,
        login: c.user?.login ?? 'ghost',
        createdAt: c.created_at,
        body: c.body ?? '',
        htmlUrl: c.html_url,
      });
    if (batch.length < 100) return out;
  }
  // Heller stopp enn å avkorte stille: en halv liste ville sett ut som en ferdig måned.
  throw new Error(`#${issue}: over ${MAX_PAGES * 100} kommentarer — stopper i stedet for å avkorte`);
}

async function runDelete(gh: Gh, args: Args, comments: (issue: number) => Promise<LiveComment[]>): Promise<number> {
  const now = new Date();
  const months = deleteMonths(readdirSync(args.loggDir), now, args.month);
  let problems = 0;
  for (const board of BOARDS) {
    const present = months.filter((m) => existsSync(archivePath(board, m, args.loggDir)));
    if (present.length === 0) {
      console.log(`${LOG} slett #${board.issue}: ingen arkivfil for ${months.join(', ') || '(ingen måneder)'} — ingenting å slette.`);
      continue;
    }
    const archived = present.flatMap((m) => parseArchive(readFileSync(archivePath(board, m, args.loggDir), 'utf8')));
    const r = await deleteArchivedComments({
      gh,
      repo: REPO,
      archived,
      live: await comments(board.issue),
      dryRun: args.dryRun,
      scan: (text) => scanEmailLeaks(text),
      now,
    });

    const done = args.dryRun ? `ville slettet ${r.wouldDelete}` : `slettet ${r.deleted}`;
    console.log(
      `${LOG} slett #${board.issue} (${present.join(', ')}): ${archived.length} i arkivet — ${done}, ${r.missing} borte fra før, ${r.mismatches.length} avvik.`,
    );
    for (const d of r.duplicates)
      console.error(`${LOG} AVVIK #${board.issue}: nøkkelen «${d}» er ikke entydig — ingenting slettet på denne tavla.`);
    for (const m of r.mismatches)
      console.error(`${LOG} AVVIK #${board.issue}: ${entryKey(m)} står igjen — body-en avviker fra arkivfila (${m.htmlUrl}).`);
    for (const f of r.failures) console.error(`${LOG} FEIL #${board.issue}: ${f}`);
    problems += r.duplicates.length + r.mismatches.length + r.failures.length;
  }
  return problems;
}

async function runArchive(args: Args, comments: (issue: number) => Promise<LiveComment[]>): Promise<void> {
  const all: Record<number, LiveComment[]> = {};
  for (const board of BOARDS) all[board.issue] = await comments(board.issue);

  const plan = planArchive({
    comments: all,
    now: new Date(),
    month: args.month,
    dryRun: args.dryRun,
    exists: (board, month) => existsSync(archivePath(board, month, args.loggDir)),
  });
  for (const line of plan.log) console.log(`${LOG} ${line}`);

  // Bygg alt før noe skrives: kaster én tavle, skal ingen halv runde ligge igjen.
  const built = plan.work.map((w) => ({
    ...w,
    path: archivePath(w.board, w.month, args.loggDir),
    archive: buildArchive({ board: w.board, month: w.month, comments: w.comments, scan: (t) => scanEmailLeaks(t) }),
  }));

  for (const b of built) {
    if (!b.archive) continue;
    const n = b.archive.entries.length;
    const masked = b.archive.masked.length > 0 ? `, ${b.archive.masked.length} e-postmønster(e) maskert` : '';
    if (args.dryRun) {
      console.log(`${LOG} ${b.month} #${b.board.issue}: ${n} kommentarer${masked} — ville skrevet ${b.path}`);
      console.log(b.archive.markdown);
    } else {
      writeFileSync(b.path, b.archive.markdown);
      console.log(`${LOG} skrev ${b.path} (${n} kommentarer${masked})`);
    }
  }
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error(`${LOG} mangler GITHUB_TOKEN.`);
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  const gh = ghClient(TOKEN, REPO);
  const cache = new Map<number, Promise<LiveComment[]>>();
  const comments = (issue: number) => {
    if (!cache.has(issue)) cache.set(issue, fetchComments(gh, issue));
    return cache.get(issue)!;
  };

  console.log(`${LOG} fase=${args.phase}${args.month ? ` måned=${args.month}` : ''}${args.dryRun ? ' (dry-run)' : ''}`);

  let exitCode = 0;
  if (args.phase !== 'archive') {
    const problems = await runDelete(gh, args, comments);
    if (problems > 0) exitCode = 1;
  }
  // Ferske tavle-data etter slettingen, så arkiv-fasen ikke planlegger ut fra en
  // liste som nettopp ble endret.
  cache.clear();
  if (args.phase !== 'delete') await runArchive(args, comments);

  console.log(`${LOG} ferdig${exitCode ? ' med avvik (se over)' : ''}.`);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`${LOG} uventet feil: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
