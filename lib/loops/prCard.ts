// Discord merge-kort (#1159, Del A): ren, testbar logikk for GitHub Action-en
// som poster ett kort med merge-knapp per grønn PR. Runneren
// (scripts/loops/post-pr-card.ts) eier HTTP/env; denne modulen eier
// oppsummering-uttrekk, CI-klassifisering og bygging av Discord-meldingen.
//
// Knappens custom_id (`merge_pr:<N>`) mates til det eksisterende
// interactions-endepunktet (app/api/discord/interactions/route.ts, #1124) —
// samme kontrakt, ingen ny mottaker-kode.

import { type CiRunsLookup } from './ciRuns';

// Dedup-label: settes på PR-en når kortet er postet, så check_suite-fyringer
// etterpå ser den og hopper over (ett kort per PR).
export const CARD_LABEL = 'discord:merge-kort';

// Linjer i PR-body-en som ALDRI er oppsummeringen: issue-referanser,
// markdown-overskrifter, bot-/generert-footere, HTML-kommentarer, co-author.
const ISSUE_REF = /^(closes?|closed|fix(es|ed)?|resolves?d?|refs?|part of)\b/i;

function isSkippableLine(line: string): boolean {
  const t = line.trim();
  if (t === '') return true;
  if (ISSUE_REF.test(t)) return true;
  if (t.startsWith('#')) return true; // markdown-overskrift
  if (t.startsWith('🤖')) return true; // bot-markør / «Generated with»-footer
  if (t.startsWith('<!--')) return true; // HTML-kommentar
  if (/^co-authored-by/i.test(t)) return true;
  return false;
}

/**
 * Trekker den norske oppsummeringen ut av PR-body-en: første meningsbærende
 * linje etter at `Closes #N`, overskrifter og støy er hoppet over. Repoets
 * PR-mal er `Closes #N\n\n<tagline fra CHANGELOG>`, så taglinen er allerede
 * forfattet brukercopy — ingen LLM trengs. Null hvis body-en ikke har noe
 * brukbart (f.eks. kun `Closes #N`).
 */
export function extractPrSummary(body: string | null | undefined): string | null {
  if (!body) return null;
  for (const line of body.split('\n')) {
    if (isSkippableLine(line)) continue;
    const trimmed = line.trim();
    // Kutt evt. ledende list-/sitat-markør så kortet blir rent.
    const cleaned = trimmed.replace(/^[-*>]\s+/, '').trim();
    if (cleaned === '') continue;
    return cleaned.length > 300 ? `${cleaned.slice(0, 297)}…` : cleaned;
  }
  return null;
}

export type CheckRun = { name?: string; status: string; conclusion: string | null };

export type ChecksState = 'pending' | 'red' | 'green';

// Konklusjoner som gjør en check rød (samme sett som merge-endepunktet bruker).
const BAD_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out', 'action_required']);

// Kortets EGEN check: på pull_request-/ready_for_review-fyringer kjører
// kort-workflowen i PR-kontekst, så jobben henger som en check-run på PR-head-en.
// Den er `in_progress` under hele decide-pollingen (den ER decide), og en
// kansellert kortkjøring etterlater `conclusion=cancelled` → uten dette filteret
// klassifiserer kortet enten aldri grønt, eller RØDT for alltid på samme SHA (#1520).
// LOCKSTEP: navnet er jobnavnet i `.github/workflows/discord-pr-card.yml`
// (`jobs.post-card`) — endres jobben der, MÅ konstanten endres her.
export const CARD_CHECK_NAME = 'post-card';

/**
 * Klassifiserer CI-status for en PR-head ut fra check-runs. Kortets egen
 * `post-card`-check filtreres bort først (ett hjem — også merge-endepunktets
 * re-sjekk leser gjennom denne funksjonen).
 * - `pending`: minst én check ikke `completed`, ELLER ingen checks registrert
 *   enda (tom liste → carder aldri en PR uten CI).
 * - `red`: minst én fullført check har en dårlig konklusjon.
 * - `green`: alle checks fullført uten dårlig konklusjon.
 */
export function classifyChecks(allRuns: CheckRun[]): ChecksState {
  const runs = allRuns.filter((r) => r.name !== CARD_CHECK_NAME);
  if (runs.length === 0) return 'pending';
  if (runs.some((r) => r.status !== 'completed')) return 'pending';
  if (runs.some((r) => r.conclusion !== null && BAD_CONCLUSIONS.has(r.conclusion))) return 'red';
  return 'green';
}

// `paths-ignore` i `.github/workflows/ci.yml` (og tvillingen ci-docs-noop.yml).
// LOCKSTEP: mønstrene er låst mot workflow-fila av en test i prCard.test.ts.
export const CI_PATHS_IGNORE = ['**.md', 'docs/**', '.forge/**'] as const;

// Speiler GitHubs filter-SEMANTIKK, ikke mønsterstrengene: `**` krysser `/`, så
// `**.md` matcher enhver `.md` hvor som helst (også `.changes/x.md`, `e2e/notat.md`).
function isCiIgnoredPath(file: string): boolean {
  return file.endsWith('.md') || file.startsWith('docs/') || file.startsWith('.forge/');
}

/**
 * Forventer denne diffen at ci.yml faktisk kjører? Docs-only-PR-er er unntatt av
 * `paths-ignore` — der finnes ingen CI-kjøring å vente på, og en streng gate
 * ville hengt dem for alltid (regresjon av #1477/#1483-flyten).
 * `null` = vi klarte ikke lese endrede filer → gate PÅ (fail-closed).
 */
export function expectsRealCi(changedFiles: string[] | null): boolean {
  if (changedFiles === null) return true;
  return changedFiles.some((f) => !isCiIgnoredPath(f));
}

export type CiGateOpts = {
  /** Check-runs for PR-head-en, som de kom fra API-et. */
  runs: CheckRun[];
  /** `expectsRealCi(endrede filer)` — false slår gaten av (docs-only). */
  expectsCi: boolean;
  /** Slår opp registrerte ci.yml-kjøringer for head-SHA-en (systemgrensen). */
  fetchCiRuns: () => Promise<CiRunsLookup>;
  log?: (msg: string) => void;
};

/**
 * `classifyChecks` + ci.yml-gaten (#1520): grønne check-runs er ikke nok når
 * diffen forventer en ekte CI-kjøring. Tvillingen `ci-docs-noop.yml` rapporterer
 * SAMME jobnavn som ci.yml og fullfører på sekunder, så på en blandet PR ser
 * vinduet før ci.yml-kjøringen er registrert grønt ut. Krev derfor at GitHub har
 * registrert en ci.yml-kjøring for head-SHA-en før grønt slippes gjennom.
 *
 * Fail-closed: HTTP-feil eller «ingen kjøring enda» → `pending`, aldri `green`.
 * Oppslaget gjøres KUN når alt annet allerede er grønt (billig guard sist).
 */
export async function classifyWithCiGate({
  runs,
  expectsCi,
  fetchCiRuns,
  log,
}: CiGateOpts): Promise<ChecksState> {
  const state = classifyChecks(runs);
  if (state !== 'green' || !expectsCi) return state;

  const ci = await fetchCiRuns();
  if (!ci.ok) {
    log?.(`ci.yml-runs HTTP ${ci.status} — behandles som pending`);
    return 'pending';
  }
  if (ci.runs.length === 0) {
    log?.('ingen registrert ci.yml-kjøring for head-SHA-en enda');
    return 'pending';
  }
  return 'green';
}

export type ChecksSettleOpts = {
  /** Henter ferske check-runs for PR-head-en (systemgrensen — injiseres). */
  fetchRuns: () => Promise<CheckRun[]>;
  /** Antall klassifiseringsforsøk før vi gir opp som `pending`. */
  maxAttempts: number;
  /** Pause mellom forsøk (injiseres så tester slipper ekte klokke). */
  sleep: () => Promise<void>;
  log?: (msg: string) => void;
  /**
   * Valgfri klassifiserer i stedet for `classifyChecks` — sømmen decide bruker
   * til å legge ci.yml-run-gaten (#1520) på HVERT pollingforsøk, ikke bare på
   * det siste. Kan være asynkron (gaten slår opp registrerte kjøringer).
   */
  classify?: (runs: CheckRun[]) => ChecksState | Promise<ChecksState>;
};

/**
 * Poller `classifyChecks` til utfallet ikke lenger er `pending`, eller
 * forsøkene er brukt opp. Trengs for dispatch-trigget kort på docs-only-PR-er
 * (#1301): der finnes ingen CI-kjøring å vente på (ci.yml paths-ignore), så
 * dispatch skjer rett etter PR-opprettelse — mens Vercel-sjekkene fortsatt er
 * uregistrerte eller uferdige. Engangs-klassifisering ville alltid gitt
 * `pending` og aldri noe kort.
 */
export async function waitForChecksToSettle({
  fetchRuns,
  maxAttempts,
  sleep,
  log,
  classify = classifyChecks,
}: ChecksSettleOpts): Promise<ChecksState> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) await sleep();
    const state = await classify(await fetchRuns());
    if (state !== 'pending') return state;
    log?.(`checks pending (forsøk ${attempt}/${maxAttempts})`);
  }
  return 'pending';
}

export type PrForCard = {
  number: number;
  title: string;
  html_url: string;
  draft: boolean;
};

// Discord message-component-typer (numeriske per API-kontrakten).
const ACTION_ROW = 1;
const BUTTON = 2;
const BUTTON_STYLE_SUCCESS = 3; // grønn
const BUTTON_STYLE_LINK = 5;

export type DiscordButton =
  | { type: 2; style: 3; label: string; custom_id: string }
  | { type: 2; style: 5; label: string; url: string };

export type DiscordMessage = {
  content: string;
  components: Array<{ type: 1; components: DiscordButton[] }>;
};

const DISCORD_CONTENT_MAX = 2000;

/**
 * Bygger Discord-meldingen for ett PR-kort: tittel (+ draft-merkelapp) +
 * oppsummering + PR-lenke som tekst, og én action-row med grønn merge-knapp
 * (`custom_id: merge_pr:<N>`) + en lenke-knapp til PR-en.
 */
export function buildCardPayload({
  pr,
  summary,
}: {
  pr: PrForCard;
  summary: string | null;
}): DiscordMessage {
  const draftBadge = pr.draft ? '📝 Draft · ' : '';
  const lines = [`${draftBadge}**PR #${pr.number}** — ${pr.title}`];
  if (summary) lines.push(summary);
  lines.push(pr.html_url);
  let content = lines.join('\n');
  if (content.length > DISCORD_CONTENT_MAX) {
    content = `${content.slice(0, DISCORD_CONTENT_MAX - 1)}…`;
  }

  return {
    content,
    components: [
      {
        type: ACTION_ROW,
        components: [
          {
            type: BUTTON,
            style: BUTTON_STYLE_SUCCESS,
            label: `✅ Merge PR #${pr.number}`,
            custom_id: `merge_pr:${pr.number}`,
          },
          {
            type: BUTTON,
            style: BUTTON_STYLE_LINK,
            label: 'Åpne PR',
            url: pr.html_url,
          },
        ],
      },
    ],
  };
}

/**
 * Bygger kvitteringskortet (#1406): når kortet har auto-merget PR-en, poster vi
 * ikke en knapp — bare beskjed om at den er merget + funksjonell-setning + PR-lenke,
 * og KUN lenke-knappen «Åpne PR» (ingen `merge_pr`-knapp; det er ingenting å merge).
 * Funksjonell-setningen faller tilbake til tittelen når body-en ikke ga en tagline.
 */
export function buildReceiptPayload({
  pr,
  summary,
}: {
  pr: PrForCard;
  summary: string | null;
}): DiscordMessage {
  const lines = [`✅ **Merget** — PR #${pr.number}: ${pr.title}`, summary ?? pr.title, pr.html_url];
  let content = lines.join('\n');
  if (content.length > DISCORD_CONTENT_MAX) {
    content = `${content.slice(0, DISCORD_CONTENT_MAX - 1)}…`;
  }

  return {
    content,
    components: [
      {
        type: ACTION_ROW,
        components: [
          {
            type: BUTTON,
            style: BUTTON_STYLE_LINK,
            label: 'Åpne PR',
            url: pr.html_url,
          },
        ],
      },
    ],
  };
}
