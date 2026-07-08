// Discord PR-kort (#1159), steg 1 av 3: AVGJØR. Gater PR-en (åpen · CI grønn ·
// ikke allerede kortet), avgjør om diffen er visuell, og skriver en plan de to
// neste stegene leser. Kjøres via `npx --yes tsx` UTEN npm ci (kun global fetch
// + rene lib-importer).
//
// Env: GITHUB_TOKEN, GH_REPO, PR_NUMBER (eller GITHUB_EVENT_PATH), CARD_PLAN_PATH.
// Skriver `should_card`/`is_gui` til $GITHUB_OUTPUT så workflowen kan gate stegene.

import { appendFileSync } from 'node:fs';
import { candidatePrNumber, eventHeadSha, ghClient } from './ghClient';
import { CARD_LABEL, classifyChecks, extractPrSummary, type CheckRun } from '../../lib/loops/prCard';
import { isVisualChange } from '../../lib/loops/prScreenshots';
import { writePlan, type CardPlan } from './cardPlan';

const LOG = '[decide-pr-card]';
const REPO = process.env.GH_REPO || 'jdlarssen/golf-app';
const TOKEN = process.env.GITHUB_TOKEN;

function ghOutput(key: string, value: string): void {
  const f = process.env.GITHUB_OUTPUT;
  if (f) appendFileSync(f, `${key}=${value}\n`);
}

function emit(plan: CardPlan): void {
  writePlan(plan);
  ghOutput('should_card', plan.shouldCard ? 'true' : 'false');
  ghOutput('is_gui', plan.isGui ? 'true' : 'false');
}

const NO_CARD: CardPlan = { shouldCard: false, isGui: false, pr: null, changedFiles: [] };

type PrPayload = {
  state: string;
  draft: boolean;
  title: string;
  html_url: string;
  body: string | null;
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

async function fetchChangedFiles(
  gh: ReturnType<typeof ghClient>,
  n: number,
): Promise<string[]> {
  const files: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await gh.rest('GET', `/repos/${REPO}/pulls/${n}/files?per_page=100&page=${page}`);
    if (res.status !== 200) break;
    const batch = (res.json as Array<{ filename?: string }>) ?? [];
    for (const f of batch) if (f.filename) files.push(f.filename);
    if (batch.length < 100) break;
  }
  return files;
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
  if ((pr.labels ?? []).some((l) => l.name === CARD_LABEL)) return noCard(`PR #${n} allerede kortet`);

  const checksRes = await gh.rest('GET', `/repos/${REPO}/commits/${pr.head.sha}/check-runs?per_page=100`);
  if (checksRes.status !== 200) return noCard(`PR #${n}: check-runs HTTP ${checksRes.status}`);
  const runs = (checksRes.json as { check_runs?: CheckRun[] }).check_runs ?? [];
  const state = classifyChecks(runs.map((r) => ({ status: r.status, conclusion: r.conclusion })));
  if (state !== 'green') return noCard(`PR #${n}: CI ${state}`);

  const changedFiles = await fetchChangedFiles(gh, n);
  const isGui = isVisualChange(changedFiles);
  const plan: CardPlan = {
    shouldCard: true,
    isGui,
    pr: {
      number: n,
      title: pr.title,
      htmlUrl: pr.html_url,
      draft: pr.draft,
      summary: extractPrSummary(pr.body),
    },
    changedFiles,
  };
  emit(plan);
  console.log(`${LOG} PR #${n}: shouldCard=true, isGui=${isGui} (${changedFiles.length} filer).`);
}

main().catch((err) => {
  console.error(`${LOG} uventet feil`, err);
  process.exit(1);
});
