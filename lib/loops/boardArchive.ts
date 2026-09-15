// Månedsarkivering av de levende tavlene (#1996): logikken bak
// scripts/loops/archive-boards.ts. Kommentarene på #1110 og #1208 kopieres
// verbatim til docs/loops/logg/, og slettes fra tavla FØRST når kopien ligger på
// main og body-en er verifisert byte-identisk (eierbeslutning 2026-09-06).
//
// Alt her er rent og testbart; HTTP, env og filskriving bor i runneren. Den ene
// systemgrensen er e-postskanneren: regelen har sitt hjem i
// .githooks/scan-emails.sh (#1929), så vi shell-er ut til den i stedet for å
// kopiere regexen.
//
// Kommentarinnholdet er data. Ingenting her tolker det.

import { execFileSync } from 'node:child_process';

import type { GitHubClient } from './discordActions';

export type Board = { issue: number; slug: string; title: string };

export const BOARDS: readonly Board[] = [
  { issue: 1110, slug: 'loop-drift', title: 'Loop-drift — heartbeats og morgenbrief' },
  { issue: 1208, slug: 'utroperen', title: 'Utroperen — lanserings-tavla' },
];

export const ARCHIVE_DIR = 'docs/loops/logg';

export type ArchivedEntry = { login: string; createdAt: string; body: string };
export type LiveComment = ArchivedEntry & { id: number; htmlUrl: string };

// Returnerer de ikke-allowlistede adressene i teksten.
export type LeakScanner = (text: string) => string[];

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const NB_MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

// Den strenge formen er hele grunnen til at parseren tåler bodyer med `---` og
// egne `## `-overskrifter (morgenbriefer, forge-kontrakter). Brukes av både
// render og parse, så formen har ett hjem.
const ENTRY_HEADING = /^## (\S+) · (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)$/;
const ENTRY_TAIL = '\n\n---\n';

const pad = (n: number) => String(n).padStart(2, '0');

export function monthWindow(month: string): {
  startIso: string;
  endIso: string;
  lastDay: string;
  label: string;
} {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`ugyldig måned «${month}» — forventet YYYY-MM`);
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const next = mon === 12 ? `${year + 1}-01` : `${year}-${pad(mon + 1)}`;
  // Dag 0 i neste måned = siste dag i denne. Fast norsk tabell for navnet, ikke
  // Intl: locale-data varierer mellom maskiner.
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    startIso: `${month}-01T00:00:00Z`,
    endIso: `${next}-01T00:00:00Z`,
    lastDay: `${month}-${pad(lastDay)}`,
    label: `${NB_MONTHS[mon - 1]} ${year}`,
  };
}

export function currentMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export function archivePath(board: Board, month: string, dir: string = ARCHIVE_DIR): string {
  return `${dir}/${month}-${board.slug}-${board.issue}.md`;
}

export function entryKey(e: { login: string; createdAt: string }): string {
  return `${e.login} · ${e.createdAt}`;
}

// ── Normalisering + maskering: ÉN pipeline for begge faser ───────────────────

// API-bodyer kan bære CRLF; arkivfilene er LF-only. Trailing whitespace og blanke
// kant-linjer strippes, ellers ville render→parse ikke rundtrippe.
export function normalizeBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

export function maskLeaks(text: string, leaks: string[]): { text: string; masked: string[] } {
  const masked: string[] = [];
  // Lengste først, så en kortere adresse aldri spiser en bit av en lengre.
  for (const leak of [...new Set(leaks)].sort((a, b) => b.length - a.length)) {
    if (!text.includes(leak)) continue;
    const form = leak.replace('@', ' [at] ');
    text = text.split(leak).join(form);
    masked.push(form);
  }
  return { text, masked };
}

// Arkivfila har bare den maskerte formen, så slette-porten kan ikke gjenskape
// rå-adressene derfra. Den kjører i stedet nøyaktig denne funksjonen på den
// ferske body-en, akkurat som arkiv-fasen gjorde.
export function canonicalize(raw: string, scan: LeakScanner): { body: string; masked: string[] } {
  const body = normalizeBody(raw);
  const { text, masked } = maskLeaks(body, body.includes('@') ? scan(body) : []);
  return { body: text, masked };
}

// Exit 0 = rent, exit 1 = adresser på stdout. Alt annet er en riggfeil og skal
// aldri leses som «rent». `root` peker skanneren på en annen allowlist-rot
// (CLAUDE_PROJECT_DIR, skannerens egen konvensjon) — kun for tester.
export function scanEmailLeaks(
  text: string,
  opts: { script?: string; root?: string } = {},
): string[] {
  const script = opts.script ?? '.githooks/scan-emails.sh';
  const env = opts.root ? { ...process.env, CLAUDE_PROJECT_DIR: opts.root } : process.env;
  try {
    execFileSync('bash', [script], { input: text, encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe'] });
    return [];
  } catch (err) {
    const e = err as { status?: number | null; stdout?: string };
    if (e.status === 1) return (e.stdout ?? '').split('\n').filter(Boolean);
    throw new Error(`scan-emails.sh feilet (exit ${e.status ?? '?'}) — riggfeil, ikke «rent»`);
  }
}

// ── Format ────────────────────────────────────────────────────────────────────

export function renderArchive(a: {
  board: Board;
  month: string;
  entries: ArchivedEntry[];
  masked: string[];
}): string {
  const { board, month, entries, masked } = a;
  if (entries.length === 0) throw new Error(`tomt arkiv for ${month} #${board.issue}`);
  const { lastDay, label } = monthWindow(month);
  const count = entries.length === 1 ? '1 kommentar' : `${entries.length} kommentarer`;
  const first = entries[0].createdAt.slice(0, 10);
  const last = entries[entries.length - 1].createdAt.slice(0, 10);

  let header =
    `# Arkiv: ${board.title} (#${board.issue}) — ${label} (t.o.m. ${lastDay})\n\n` +
    `Månedlig arkivering per konvensjonen i issue #${board.issue} («arkiveres månedlig til\n` +
    `docs/loops/logg/ og nullstilles»). Kommentarene under er kopiert verbatim fra\n` +
    `tavla og deretter slettet der; issue-body-en er urørt. ${count},\n` +
    `periode ${first} – ${last}.\n`;
  if (masked.length > 0) {
    const what = masked.length === 1 ? 'ett e-postmønster' : `${masked.length} e-postmønstre`;
    header +=
      `\nEneste avvik fra verbatim: ${what} som ikke står på allowlista er maskert\n` +
      `med «[at]»: ${masked.map((m) => `«${m}»`).join(', ')}. Repoet er offentlig, og\n` +
      `pre-commit-vakta (#1929) tillater ikke e-postmønstre i nye linjer.\n`;
  }

  const body = entries
    .map((e) => `## ${e.login} · ${e.createdAt}\n\n${e.body}${ENTRY_TAIL}`)
    .join('\n');
  return `${header}\n---\n\n${body}`;
}

export function parseArchive(markdown: string): ArchivedEntry[] {
  const lines = markdown.split('\n');
  const headings: Array<{ line: number; login: string; createdAt: string }> = [];
  lines.forEach((l, i) => {
    const m = ENTRY_HEADING.exec(l);
    if (m) headings.push({ line: i, login: m[1], createdAt: m[2] });
  });

  return headings.map((h, k) => {
    const end = k + 1 < headings.length ? headings[k + 1].line : lines.length;
    // Oppføringen er "\n" + body + "\n\n---\n" — både midt i fila (der join-en
    // legger en blank linje før neste heading) og sist (fila slutter på "---\n").
    const segment = lines.slice(h.line + 1, end).join('\n');
    if (
      segment.length < 1 + ENTRY_TAIL.length ||
      !segment.startsWith('\n') ||
      !segment.endsWith(ENTRY_TAIL)
    ) {
      throw new Error(`arkivfila har en oppføring med uventet form: ${entryKey(h)}`);
    }
    return {
      login: h.login,
      createdAt: h.createdAt,
      body: segment.slice(1, segment.length - ENTRY_TAIL.length),
    };
  });
}

// ── Arkiv-fasen ───────────────────────────────────────────────────────────────

export function planArchive(a: {
  comments: Partial<Record<number, LiveComment[]>>;
  now: Date;
  month?: string;
  dryRun: boolean;
  exists: (board: Board, month: string) => boolean;
}): { work: Array<{ board: Board; month: string; comments: LiveComment[] }>; log: string[] } {
  const current = currentMonth(a.now);
  if (a.month !== undefined) {
    monthWindow(a.month);
    if (!a.dryRun && a.month >= current)
      throw new Error(
        `${a.month} er inneværende (eller en framtidig) måned — ekte kjøring nekter, bruk --dry-run for å se den.`,
      );
  }

  const months =
    a.month !== undefined
      ? [a.month]
      : [
          ...new Set(
            BOARDS.flatMap((b) => (a.comments[b.issue] ?? []).map((c) => c.createdAt.slice(0, 7))),
          ),
        ]
          .filter((m) => m < current)
          .sort();
  if (months.length === 0)
    return { work: [], log: [`ingen kommentarer før ${current} — ingenting å arkivere.`] };

  const work: Array<{ board: Board; month: string; comments: LiveComment[] }> = [];
  const log: string[] = [];
  for (const month of months) {
    const { startIso, endIso } = monthWindow(month);
    for (const board of BOARDS) {
      const inMonth = (a.comments[board.issue] ?? []).filter(
        (c) => c.createdAt >= startIso && c.createdAt < endIso,
      );
      if (a.exists(board, month)) log.push(`${month} #${board.issue}: fil finnes — hopper over.`);
      else if (inMonth.length === 0) log.push(`${month} #${board.issue}: ingen kommentarer — ingen fil.`);
      else work.push({ board, month, comments: inMonth });
    }
  }
  return { work, log };
}

export function buildArchive(a: {
  board: Board;
  month: string;
  comments: LiveComment[];
  scan: LeakScanner;
}): { entries: ArchivedEntry[]; masked: string[]; markdown: string } | null {
  const { startIso, endIso } = monthWindow(a.month);
  const inMonth = a.comments
    .filter((c) => c.createdAt >= startIso && c.createdAt < endIso)
    .sort((x, y) => (x.createdAt === y.createdAt ? x.id - y.id : x.createdAt < y.createdAt ? -1 : 1));
  if (inMonth.length === 0) return null;

  const masked = new Set<string>();
  const entries = inMonth.map((c) => {
    const canon = canonicalize(c.body, a.scan);
    canon.masked.forEach((m) => masked.add(m));
    return { login: c.login, createdAt: c.createdAt, body: canon.body };
  });
  const markdown = renderArchive({ board: a.board, month: a.month, entries, masked: [...masked] });

  // Fila må leses tilbake til nøyaktig de samme oppføringene. En body med en
  // linje på overskriftsformen ville ellers gitt en fil slette-fasen kvelner på
  // (eller en fantom-oppføring) hver måned etter.
  let roundTrips = false;
  try {
    roundTrips = JSON.stringify(parseArchive(markdown)) === JSON.stringify(entries);
  } catch {
    roundTrips = false;
  }
  if (!roundTrips)
    throw new Error(
      `arkivet for ${a.month} #${a.board.issue} leses ikke tilbake likt (en body har trolig en linje på overskriftsformen) — skriver ingenting`,
    );

  // Siste port: hele fila skannes på nytt. Hooks kjører ikke i Actions, så dette
  // er det eneste som står mellom en adresse og et offentlig repo. Adressen
  // skrives ikke i feilmeldingen.
  const leftover = a.scan(markdown);
  if (leftover.length > 0)
    throw new Error(
      `arkivet for ${a.month} #${a.board.issue} er ikke rent etter maskering (${leftover.length} treff) — skriver ingenting`,
    );
  return { entries, masked: [...masked], markdown };
}

// ── Slette-fasen ──────────────────────────────────────────────────────────────

const ARCHIVE_FILE_RE = /^(\d{4}-(?:0[1-9]|1[0-2]))-.+-\d+\.md$/;

// Uten --month: de to nyeste månedene før inneværende som har arkivfil. Eldre
// filer er uansett ferdig slettet, og taket holder kjøretiden flat når arkivet
// vokser. Inneværende (og framtidig) måned gir tom liste i stedet for å kaste,
// så en dry-run av inneværende måned med fase `both` fortsatt viser arkiv-
// forhåndsvisningen; deleteArchivedComments sperrer den i tillegg.
export function deleteMonths(files: string[], now: Date, month?: string): string[] {
  const current = currentMonth(now);
  if (month !== undefined) {
    monthWindow(month);
    return month < current ? [month] : [];
  }
  const months = new Set<string>();
  for (const f of files) {
    const m = ARCHIVE_FILE_RE.exec(f);
    if (m && m[1] < current) months.add(m[1]);
  }
  return [...months].sort().reverse().slice(0, 2);
}

export function deleteVerdict(
  archived: ArchivedEntry,
  live: { body: string } | undefined,
  scan: LeakScanner,
): 'match' | 'mismatch' | 'missing' {
  if (!live) return 'missing';
  return canonicalize(live.body, scan).body === archived.body ? 'match' : 'mismatch';
}

export type DeleteResult = {
  deleted: number;
  wouldDelete: number;
  missing: number;
  mismatches: Array<{ login: string; createdAt: string; htmlUrl: string }>;
  duplicates: string[];
  failures: string[];
};

// Sletter kun kommentarer hvis ferske body er byte-identisk med kopien. Avvik
// returneres i stedet for å kastes — kalleren bestemmer exit-koden, og
// workflowens failure-steg filer issuet.
export async function deleteArchivedComments(a: {
  gh: GitHubClient;
  repo: string;
  archived: ArchivedEntry[];
  live: LiveComment[];
  dryRun: boolean;
  scan: LeakScanner;
  now: Date;
}): Promise<DeleteResult> {
  const result: DeleteResult = {
    deleted: 0,
    wouldDelete: 0,
    missing: 0,
    mismatches: [],
    duplicates: [],
    failures: [],
  };

  // Matching skjer på (login, created_at). Er nøkkelen ikke entydig, vet vi ikke
  // hvilken kommentar kopien hører til — da røres ingenting på denne tavla.
  const dups = new Set<string>();
  const wanted = new Set<string>();
  for (const e of a.archived) {
    const key = entryKey(e);
    if (wanted.has(key)) dups.add(key);
    wanted.add(key);
  }
  const liveByKey = new Map<string, LiveComment>();
  for (const c of a.live) {
    const key = entryKey(c);
    if (!wanted.has(key)) continue;
    if (liveByKey.has(key)) dups.add(key);
    else liveByKey.set(key, c);
  }
  if (dups.size > 0) {
    result.duplicates = [...dups];
    return result;
  }

  const currentStart = monthWindow(currentMonth(a.now)).startIso;
  for (const entry of a.archived) {
    const key = entryKey(entry);
    // Inneværende måned røres aldri, heller ikke med byte-lik kopi: da ligger
    // det en fil der den ikke skal (håndcommit eller feil ref), og det er et funn.
    if (entry.createdAt >= currentStart) {
      result.failures.push(`${key}: inneværende måned — røres ikke`);
      continue;
    }
    const comment = liveByKey.get(key);
    const verdict = deleteVerdict(entry, comment, a.scan);
    if (verdict === 'missing' || !comment) {
      result.missing++;
    } else if (verdict === 'mismatch') {
      result.mismatches.push({ login: entry.login, createdAt: entry.createdAt, htmlUrl: comment.htmlUrl });
    } else if (a.dryRun) {
      result.wouldDelete++;
    } else {
      const res = await a.gh.rest('DELETE', `/repos/${a.repo}/issues/comments/${comment.id}`);
      // 204 er det eneste som betyr «slettet» (trap 2: fravær av feil er ikke suksess).
      if (res.status === 204) result.deleted++;
      else result.failures.push(`${key}: DELETE svarte HTTP ${res.status}`);
    }
  }
  return result;
}
