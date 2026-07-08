// Discord merge-kort (#1159, Del A): runner for GitHub Action-en. Poster ett
// kort med merge-knapp per PR som er blitt CI-grønn — uansett opphav
// (natt-runner, CI-vakt, dok-avstemmer, interaktiv økt). Mottaker-siden er
// det eksisterende interactions-endepunktet (#1124); denne runneren er kun
// sender-siden.
//
// Env:
//   GITHUB_TOKEN         — les PR/checks, legg dedup-label (Actions default token)
//   DISCORD_BOT_TOKEN    — bot-identitet (knapper krever bot, ikke webhook)
//   DISCORD_CHANNEL_ID   — kanalen kortet postes i
//   GH_REPO              — «owner/repo» (default jdlarssen/golf-app)
//   PR_NUMBER            — eksplisitt PR (workflow_dispatch / lokal dry-run)
//   GITHUB_EVENT_PATH    — check_suite-payload (Actions setter denne)
//   DRY_RUN=1            — logg payload i stedet for å poste (lokal verifisering)
//
// Best-effort: håndterte feil logges og gir exit 0 (Discord er tillegg, aldri
// blokkerende). Kun uventede exceptions gir non-zero → fanges av failure-alarmen.

import { readFileSync } from 'node:fs';
// Relativ import (ikke `@/`-alias): runneren kjøres via `npx --yes tsx` UTEN
// npm ci i Action-en, så vi unngår all tsconfig-path-oppløsning i CI.
import {
  buildCardPayload,
  CARD_LABEL,
  classifyChecks,
  extractPrSummary,
  type CheckRun,
} from '../../lib/loops/prCard';

const LOG = '[post-pr-card]';
const REPO = process.env.GH_REPO || 'jdlarssen/golf-app';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const DRY_RUN = process.env.DRY_RUN === '1';

type GhResponse = { status: number; json: unknown };

async function gh(method: 'GET' | 'POST', path: string, body?: unknown): Promise<GhResponse> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// Kandidat-PR-er: eksplisitt PR_NUMBER vinner; ellers PR-numrene i
// check_suite-payloaden. Andre event-typer / tom payload → ingen kandidater.
function candidatePrNumbers(): number[] {
  const explicit = process.env.PR_NUMBER;
  if (explicit) {
    const n = Number(explicit);
    return Number.isFinite(n) ? [n] : [];
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return [];
  try {
    const ev = JSON.parse(readFileSync(eventPath, 'utf8')) as {
      check_suite?: { pull_requests?: Array<{ number?: number }> };
    };
    const prs = ev.check_suite?.pull_requests ?? [];
    return prs.map((p) => p.number).filter((n): n is number => Number.isFinite(n));
  } catch (err) {
    console.error(`${LOG} kunne ikke lese GITHUB_EVENT_PATH`, err);
    return [];
  }
}

type PrPayload = {
  state: string;
  draft: boolean;
  title: string;
  html_url: string;
  body: string | null;
  head: { sha: string };
  labels: Array<{ name: string }>;
};

async function ensureLabelExists(): Promise<void> {
  // Idempotent: 201 = opprettet, 422 = finnes allerede — begge OK.
  const res = await gh('POST', `/repos/${REPO}/labels`, {
    name: CARD_LABEL,
    color: '5865F2',
    description: 'Discord merge-kort postet (dedup)',
  });
  if (res.status !== 201 && res.status !== 422) {
    console.error(`${LOG} kunne ikke sikre label «${CARD_LABEL}» (HTTP ${res.status})`);
  }
}

async function postCard(payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`${LOG} Discord svarte HTTP ${res.status}: ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`${LOG} Discord-posting kastet`, err);
    return false;
  }
}

async function handlePr(n: number): Promise<void> {
  const prRes = await gh('GET', `/repos/${REPO}/pulls/${n}`);
  if (prRes.status !== 200) {
    console.error(`${LOG} PR #${n}: fikk ikke PR (HTTP ${prRes.status}) — hopper over.`);
    return;
  }
  const pr = prRes.json as PrPayload;

  if (pr.state !== 'open') {
    console.log(`${LOG} PR #${n}: ikke åpen (${pr.state}) — hopper over.`);
    return;
  }
  if ((pr.labels ?? []).some((l) => l.name === CARD_LABEL)) {
    console.log(`${LOG} PR #${n}: allerede kortet — hopper over.`);
    return;
  }

  const checksRes = await gh('GET', `/repos/${REPO}/commits/${pr.head.sha}/check-runs?per_page=100`);
  if (checksRes.status !== 200) {
    console.error(`${LOG} PR #${n}: fikk ikke check-runs (HTTP ${checksRes.status}) — hopper over.`);
    return;
  }
  const runs = ((checksRes.json as { check_runs?: CheckRun[] }).check_runs ?? []).map((r) => ({
    status: r.status,
    conclusion: r.conclusion,
  }));
  const state = classifyChecks(runs);
  if (state !== 'green') {
    console.log(`${LOG} PR #${n}: CI ${state} — venter (${runs.length} checks).`);
    return;
  }

  const summary = extractPrSummary(pr.body);
  const payload = buildCardPayload({
    pr: { number: n, title: pr.title, html_url: pr.html_url, draft: pr.draft },
    summary,
  });

  if (DRY_RUN) {
    console.log(`${LOG} DRY_RUN PR #${n} — kort som VILLE blitt postet:`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  // Post FØRST, label etterpå: aldri stille tapt kort. En sjelden dobbelt-post
  // (to suiter grønne samtidig) er mildt; et tapt kort er verre.
  const posted = await postCard(payload);
  if (!posted) {
    console.error(`${LOG} PR #${n}: posting feilet — labler ikke (retry ved neste grønn-event).`);
    return;
  }
  const labelRes = await gh('POST', `/repos/${REPO}/issues/${n}/labels`, { labels: [CARD_LABEL] });
  if (labelRes.status !== 200) {
    console.error(`${LOG} PR #${n}: fikk ikke lagt dedup-label (HTTP ${labelRes.status}) — kan gi dobbelt kort.`);
  }
  console.log(`${LOG} PR #${n}: kort postet${labelRes.status === 200 ? ' + merket' : ''}.`);
}

async function main(): Promise<void> {
  if (!GITHUB_TOKEN) {
    console.error(`${LOG} mangler GITHUB_TOKEN — kan ikke lese PR/checks.`);
    return;
  }
  if (!DRY_RUN && (!BOT_TOKEN || !CHANNEL_ID)) {
    console.log(`${LOG} mangler DISCORD_BOT_TOKEN/DISCORD_CHANNEL_ID — hopper over (best-effort).`);
    return;
  }

  const prNumbers = candidatePrNumbers();
  if (prNumbers.length === 0) {
    console.log(`${LOG} ingen kandidat-PR-er i eventet — ferdig.`);
    return;
  }

  if (!DRY_RUN) await ensureLabelExists();
  for (const n of prNumbers) await handlePr(n);
}

main().catch((err) => {
  // Uventet: la Action-en bli rød så failure-alarmen fyrer.
  console.error(`${LOG} uventet feil`, err);
  process.exit(1);
});
