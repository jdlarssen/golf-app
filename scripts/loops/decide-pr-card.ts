// Discord PR-kort (#1159), steg 1 av 3: AVGJØR. Gater PR-en (åpen · CI grønn ·
// ikke allerede kortet), avgjør om diffen er visuell, og skriver en plan de to
// neste stegene leser. Kjøres via `npx --yes tsx` UTEN npm ci (kun global fetch
// + rene lib-importer).
//
// Env: GITHUB_TOKEN, GH_REPO, PR_NUMBER (eller GITHUB_EVENT_PATH), CARD_PLAN_PATH,
// WAIT_FOR_CHECKS ('true' ved workflow_dispatch — vent på at checkene lander, #1301).
// Skriver `outcome` ('auto-merge'|'card'|'noop') + `is_gui` til $GITHUB_OUTPUT så
// workflowen kan gate stegene (#1406).

import { appendFileSync } from 'node:fs';
import { candidatePrNumber, eventHeadSha, ghClient } from './ghClient';
import {
  CARD_LABEL,
  classifyWithCiGate,
  expectsRealCi,
  extractPrSummary,
  waitForChecksToSettle,
  type CheckRun,
  type ChecksState,
} from '../../lib/loops/prCard';
import { fetchCiRunsForSha } from '../../lib/loops/ciRuns';
import {
  classifyAutoMerge,
  closingIssueNumbers,
  linkedIssueNumbers,
  NEEDS_DECISION_LABEL,
} from '../../lib/loops/autoMerge';
import { isVisualChange } from '../../lib/loops/prScreenshots';
import { writePlan, type CardPlan } from './cardPlan';

const LOG = '[decide-pr-card]';
const REPO = process.env.GH_REPO || 'jdlarssen/golf-app';
const TOKEN = process.env.GITHUB_TOKEN;
const WAIT_FOR_CHECKS = process.env.WAIT_FOR_CHECKS === 'true';

function ghOutput(key: string, value: string): void {
  const f = process.env.GITHUB_OUTPUT;
  if (f) appendFileSync(f, `${key}=${value}\n`);
}

function emit(plan: CardPlan): void {
  writePlan(plan);
  ghOutput('outcome', plan.outcome);
  ghOutput('is_gui', plan.isGui ? 'true' : 'false');
}

const NO_CARD: CardPlan = {
  outcome: 'noop',
  isGui: false,
  headSha: null,
  pr: null,
  changedFiles: [],
  closesIssues: [],
};

type PrPayload = {
  state: string;
  draft: boolean;
  title: string;
  html_url: string;
  body: string | null;
  base: { ref: string };
  head: { sha: string };
  labels: Array<{ name: string }>;
};

// Slår opp PR-en for en head-SHA når eventet ikke ga et PR-nummer direkte
// (workflow_run.pull_requests kan være tom). Foretrekker en åpen PR.
async function prForSha(gh: ReturnType<typeof ghClient>, sha: string): Promise<number | null> {
  const res = await gh.rest('GET', `/repos/${REPO}/commits/${sha}/pulls`);
  if (res.status !== 200) return null;
  const prs = (res.json as Array<{ number: number; state: string }>) ?? [];
  return (prs.find((p) => p.state === 'open') ?? prs[0])?.number ?? null;
}

// `null` = oppslaget feilet (HTTP ≠ 200) — MÅ skilles fra `[]` (tom diff), ellers
// slås ci.yml-gaten stille AV og aldri-lista i classifyAutoMerge ser en tom
// fil-liste (#1520). Taket på 3×100 filer er kjent og dokumentert i kontrakten.
async function fetchChangedFiles(
  gh: ReturnType<typeof ghClient>,
  n: number,
): Promise<string[] | null> {
  const files: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await gh.rest('GET', `/repos/${REPO}/pulls/${n}/files?per_page=100&page=${page}`);
    if (res.status !== 200) return null;
    const batch = (res.json as Array<{ filename?: string }>) ?? [];
    for (const f of batch) if (f.filename) files.push(f.filename);
    if (batch.length < 100) break;
  }
  return files;
}

// Commit-meldingene på PR-en (samme paginering som fetchChangedFiles) — auto-merge-
// klassifiseringen leser dem for bruker-synlig-porten (feat|fix|perf uten
// [no-changelog], §T7). Feiler oppslaget, behandles PR-en som ikke-bruker-synlig.
async function fetchCommitMessages(
  gh: ReturnType<typeof ghClient>,
  n: number,
): Promise<string[]> {
  const messages: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await gh.rest('GET', `/repos/${REPO}/pulls/${n}/commits?per_page=100&page=${page}`);
    if (res.status !== 200) break;
    const batch = (res.json as Array<{ commit?: { message?: string } }>) ?? [];
    for (const c of batch) if (c.commit?.message) messages.push(c.commit.message);
    if (batch.length < 100) break;
  }
  return messages;
}

// Slår opp om ett av de lenkede issue-ene har autonomy:needs-decision — den andre
// valg-markøren (ved siden av body-headingen). Fail-open: klarer vi ikke lese
// labelene, stoler vi på body-headingen (maskin-markøren sesjonene MÅ sette).
async function anyLinkedIssueNeedsDecision(
  gh: ReturnType<typeof ghClient>,
  body: string | null,
): Promise<boolean> {
  for (const issue of linkedIssueNumbers(body)) {
    const res = await gh.rest('GET', `/repos/${REPO}/issues/${issue}`);
    if (res.status !== 200) continue;
    const labels = ((res.json as { labels?: Array<{ name: string }> }).labels ?? []).map((l) => l.name);
    if (labels.includes(NEEDS_DECISION_LABEL)) return true;
  }
  return false;
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error(`${LOG} mangler GITHUB_TOKEN`);
    emit(NO_CARD);
    return;
  }
  const gh = ghClient(TOKEN, REPO);
  const noCard = (reason: string) => {
    console.log(`${LOG} ${reason} — ingen kort.`);
    emit(NO_CARD);
  };

  // PR-nummer direkte fra eventet/PR_NUMBER; ellers via head-SHA → API-oppslag.
  let n = candidatePrNumber();
  if (n === null) {
    const sha = eventHeadSha();
    if (sha) n = await prForSha(gh, sha);
  }
  if (n === null) return noCard('ingen kandidat-PR i eventet');

  const prRes = await gh.rest('GET', `/repos/${REPO}/pulls/${n}`);
  if (prRes.status !== 200) return noCard(`PR #${n}: fikk ikke PR (HTTP ${prRes.status})`);
  const pr = prRes.json as PrPayload;

  if (pr.state !== 'open') return noCard(`PR #${n} ikke åpen (${pr.state})`);
  // Draft = «økta jobber fortsatt» (#1516): ingen kort, ingen dedup-label, ingen merge —
  // uansett trigger. Økta signaliserer ferdig med `gh pr ready`; ready_for_review-
  // triggeren i workflowen tar det derfra.
  if (pr.draft) return noCard(`PR #${n} er draft — økta jobber fortsatt`);
  if ((pr.labels ?? []).some((l) => l.name === CARD_LABEL)) return noCard(`PR #${n} allerede kortet`);

  // Endrede filer hentes FØR klassifiseringen: ci.yml-gaten under trenger å vite
  // om diffen i det hele tatt forventer en CI-kjøring (#1520). Feilet oppslaget,
  // stopper vi her — både gaten og aldri-lista i classifyAutoMerge ville ellers
  // jobbet på en falsk tom fil-liste (fail-closed: aldri kort, aldri merge).
  const changedFiles = await fetchChangedFiles(gh, n);
  if (changedFiles === null) return noCard(`PR #${n}: fikk ikke lest endrede filer`);
  const needsCiRun = expectsRealCi(changedFiles);

  const fetchCheckRuns = async (): Promise<CheckRun[] | null> => {
    const res = await gh.rest('GET', `/repos/${REPO}/commits/${pr.head.sha}/check-runs?per_page=100`);
    if (res.status !== 200) {
      console.log(`${LOG} PR #${n}: check-runs HTTP ${res.status}`);
      return null;
    }
    const runs = (res.json as { check_runs?: CheckRun[] }).check_runs ?? [];
    return runs.map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion }));
  };

  // Grønne check-runs alene er ikke nok når diffen forventer ci.yml (#1520) —
  // gaten (og hvorfor) bor i classifyWithCiGate.
  const classify = (runs: CheckRun[]): Promise<ChecksState> =>
    classifyWithCiGate({
      runs,
      expectsCi: needsCiRun,
      fetchCiRuns: () => fetchCiRunsForSha(gh, REPO, pr.head.sha),
      log: (msg) => console.log(`${LOG} PR #${n}: ${msg}`),
    });

  let state: ChecksState;
  if (WAIT_FOR_CHECKS) {
    // Dispatch-trigget (docs-only-PR-er, #1301): i dispatch-øyeblikket er checkene
    // typisk uregistrerte eller uferdige — vent til de lander (30 s × 21 ≈ 10 min).
    // HTTP-feil underveis behandles som pending og prøves igjen.
    state = await waitForChecksToSettle({
      fetchRuns: async () => (await fetchCheckRuns()) ?? [],
      classify,
      maxAttempts: 21,
      sleep: () => new Promise((resolve) => setTimeout(resolve, 30_000)),
      log: (msg) => console.log(`${LOG} PR #${n}: ${msg}`),
    });
  } else {
    const runs = await fetchCheckRuns();
    if (runs === null) return noCard(`PR #${n}: check-runs-oppslag feilet`);
    state = await classify(runs);
  }
  if (state !== 'green') return noCard(`PR #${n}: CI ${state}`);

  const isGui = isVisualChange(changedFiles);

  // Tre-utfalls-klassifisering (#1406): ren PR mot main uten produktvalg/aldri-liste/
  // manglende staging-bevis → auto-merge; ellers knapp-kort som før.
  const commitMessages = await fetchCommitMessages(gh, n);
  const needsDecisionIssue = await anyLinkedIssueNeedsDecision(gh, pr.body);
  const { outcome, demotedReason } = classifyAutoMerge({
    baseRef: pr.base.ref,
    title: pr.title,
    body: pr.body,
    changedFiles,
    commitMessages,
    prLabels: (pr.labels ?? []).map((l) => l.name),
    needsDecisionIssue,
  });

  const plan: CardPlan = {
    outcome,
    isGui,
    headSha: pr.head.sha,
    demotedReason,
    pr: {
      number: n,
      title: pr.title,
      htmlUrl: pr.html_url,
      draft: pr.draft,
      summary: extractPrSummary(pr.body),
    },
    changedFiles,
    // Kun closing-nøkkelordene (#1634) — post-steget lukker disse etter merge.
    closesIssues: closingIssueNumbers(pr.body),
  };
  emit(plan);
  console.log(
    `${LOG} PR #${n}: outcome=${outcome}${demotedReason ? ` (${demotedReason})` : ''}, isGui=${isGui} (${changedFiles.length} filer).`,
  );
}

main().catch((err) => {
  console.error(`${LOG} uventet feil`, err);
  process.exit(1);
});
