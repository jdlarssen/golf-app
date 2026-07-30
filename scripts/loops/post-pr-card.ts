// Discord PR-kort (#1159 + #1406), steg 3 av 3: POST. Leser planen fra decide-
// steget. Tre utfall: 'noop' → ingenting; 'card' → dagens knapp-kort (merge-knapp
// fra #1124-mottakeren); 'auto-merge' → kortet merger selv (fail-closed), poster
// kvittering og dispatcher main-verify. Fester skjermbilder fra screenshot-steget
// (Del B) via multipart. Kjøres via `npx --yes tsx` UTEN npm ci (global fetch/
// FormData + ren lib-import).
//
// Env:
//   GITHUB_TOKEN         — merge + dedup-label + main-verify-dispatch (Actions default token)
//   DISCORD_BOT_TOKEN    — bot-identitet (knapper krever bot, ikke webhook)
//   DISCORD_CHANNEL_ID   — kanalen kortet postes i
//   GH_REPO              — «owner/repo» (default jdlarssen/golf-app)
//   CARD_PLAN_PATH       — planen fra decide-pr-card.ts (default pr-card-plan.json)
//   SHOTS_DIR            — mappe med skjermbilder (default pr-shots)
//   DRY_RUN=1            — logg payload/merge-intensjon i stedet for å skrive
//
// Best-effort for Discord: håndterte post-feil logges og gir exit 0 (Discord er
// tillegg). UNNTAK: en main-verify-dispatch-feil ETTER en fullført merge gir
// exit 1 — #1075-nettet skal aldri dø stille. Uventede exceptions gir non-zero.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { buildCardPayload, buildReceiptPayload, CARD_LABEL } from '../../lib/loops/prCard';
import {
  dispatchMainVerify,
  mergePullRequest,
  shouldDispatchMainVerify,
} from '../../lib/loops/autoMerge';
import { ghClient } from './ghClient';
import { readPlan, type CardPlan, type CardPlanPr } from './cardPlan';

const LOG = '[post-pr-card]';
const REPO = process.env.GH_REPO || 'jdlarssen/golf-app';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const SHOTS_DIR = process.env.SHOTS_DIR || 'pr-shots';
const DRY_RUN = process.env.DRY_RUN === '1';

// Skjermbilder fra Del B-steget (om noen). Sortert så rekkefølgen er stabil.
function collectShots(): string[] {
  if (!existsSync(SHOTS_DIR)) return [];
  return readdirSync(SHOTS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort()
    .map((f) => join(SHOTS_DIR, f));
}

async function postJson(payload: unknown): Promise<boolean> {
  const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`${LOG} Discord (JSON) HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    return false;
  }
  return true;
}

async function postMultipart(payload: object, shots: string[]): Promise<boolean> {
  // Discord: `payload_json` + `files[n]`, referert via `attachments[n].id`.
  const attachments = shots.map((s, i) => ({ id: i, filename: basename(s) }));
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ ...payload, attachments }));
  shots.forEach((s, i) => {
    const buf = readFileSync(s);
    form.append(`files[${i}]`, new Blob([buf], { type: 'image/png' }), basename(s));
  });
  // Ikke sett Content-Type manuelt — fetch setter multipart-boundary selv.
  const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
    body: form,
  });
  if (!res.ok) {
    console.error(`${LOG} Discord (multipart) HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    return false;
  }
  return true;
}

async function addLabel(n: number): Promise<void> {
  const gh = ghClient(GITHUB_TOKEN as string, REPO);
  // Sikre at labelen finnes (idempotent: 201 opprettet / 422 finnes alt).
  await gh.rest('POST', `/repos/${REPO}/labels`, {
    name: CARD_LABEL,
    color: '5865F2',
    description: 'Discord merge-kort postet (dedup)',
  });
  const res = await gh.rest('POST', `/repos/${REPO}/issues/${n}/labels`, { labels: [CARD_LABEL] });
  if (res.status !== 200) {
    console.error(`${LOG} PR #${n}: fikk ikke lagt dedup-label (HTTP ${res.status}) — kan gi dobbelt kort.`);
  }
}

// Poster ett kort (JSON eller multipart om skjermbilder finnes). Returnerer om
// posten gikk gjennom. Best-effort: en kastet feil er `false`, ikke en exception.
async function postCard(payload: object, shots: string[]): Promise<boolean> {
  try {
    return shots.length > 0 ? await postMultipart(payload, shots) : await postJson(payload);
  } catch (err) {
    console.error(`${LOG} posting kastet`, err);
    return false;
  }
}

// 'card'-utfallet: dagens knapp-kort. Post FØRST, label etterpå — aldri stille
// tapt kort (dobbelt-kort-race akseptert).
async function runButtonCard(pr: CardPlanPr, shots: string[]): Promise<void> {
  const payload = buildCardPayload({
    pr: { number: pr.number, title: pr.title, html_url: pr.htmlUrl, draft: pr.draft },
    summary: pr.summary,
  });

  if (DRY_RUN) {
    console.log(`${LOG} DRY_RUN knapp-kort PR #${pr.number} — ${shots.length} skjermbilde(r): ${shots.map((s) => basename(s)).join(', ') || '(ingen)'}`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (!BOT_TOKEN || !CHANNEL_ID) {
    console.log(`${LOG} mangler DISCORD_BOT_TOKEN/DISCORD_CHANNEL_ID — hopper over (best-effort).`);
    return;
  }
  if (!GITHUB_TOKEN) {
    console.error(`${LOG} mangler GITHUB_TOKEN — kan ikke legge dedup-label; poster ikke (unngår dobbelt kort).`);
    return;
  }

  if (!(await postCard(payload, shots))) {
    console.error(`${LOG} PR #${pr.number}: posting feilet — labler ikke (retry ved neste grønn-event).`);
    return;
  }
  await addLabel(pr.number);
  console.log(`${LOG} PR #${pr.number}: knapp-kort postet (${shots.length} skjermbilde(r)).`);
}

// 'auto-merge'-utfallet: merge selv (fail-closed), post kvittering, dispatch
// main-verify, legg dedup-label. Enhver merge-feil → fall tilbake til knapp-kortet
// i samme kjøring (aldri stille drop).
async function runAutoMerge(plan: CardPlan, pr: CardPlanPr, shots: string[]): Promise<void> {
  const receipt = buildReceiptPayload({
    pr: { number: pr.number, title: pr.title, html_url: pr.htmlUrl, draft: pr.draft },
    summary: pr.summary,
  });

  if (DRY_RUN) {
    const dispatchNote = shouldDispatchMainVerify(plan.changedFiles)
      ? 'og dispatchet main-verify'
      : 'uten main-verify-dispatch (docs-only)';
    console.log(
      `${LOG} DRY_RUN auto-merge PR #${pr.number}: ville rebase-merget mot headSha ${plan.headSha ?? '(mangler)'} (sha-guard), postet kvittering ${dispatchNote}. Ingen skriv.`,
    );
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }
  if (!GITHUB_TOKEN || !plan.headSha) {
    console.error(`${LOG} PR #${pr.number}: mangler GITHUB_TOKEN/headSha — kan ikke auto-merge, faller tilbake til knapp-kort.`);
    await runButtonCard(pr, shots);
    return;
  }

  const gh = ghClient(GITHUB_TOKEN, REPO);
  const result = await mergePullRequest({ gh, repo: REPO, prNumber: pr.number, headSha: plan.headSha });
  if (!result.ok) {
    console.error(`${LOG} PR #${pr.number}: auto-merge falt tilbake til knapp-kort — ${result.reason}`);
    await runButtonCard(pr, shots);
    return;
  }
  console.log(`${LOG} PR #${pr.number}: rebase-merget (headSha ${plan.headSha}).`);

  // 1. Post kvittering (best-effort — mergen står uansett; morgenbriefen er backstop).
  let receiptPosted = false;
  if (BOT_TOKEN && CHANNEL_ID) {
    receiptPosted = await postCard(receipt, shots);
    if (!receiptPosted)
      console.error(`${LOG} PR #${pr.number}: kvitteringsposting feilet — mergen står, morgenbriefen er backstop.`);
  } else {
    console.log(`${LOG} mangler DISCORD_BOT_TOKEN/DISCORD_CHANNEL_ID — mergen står, ingen kvittering (best-effort).`);
  }

  // 2. main-verify-dispatch: GITHUB_TOKEN-mergen trigger aldri #1075-nettet via push,
  // så det må dispatches. Feil ETTER merge → exit 1 så failure-alarmen åpner CI-vakt.
  if (shouldDispatchMainVerify(plan.changedFiles)) {
    const dispatch = await dispatchMainVerify(gh, REPO);
    if (!dispatch.ok) {
      console.error(`${LOG} PR #${pr.number}: main-verify-dispatch feilet (HTTP ${dispatch.status}) — mergen står, men #1075-nettet gikk glipp.`);
      process.exit(1);
    }
    console.log(`${LOG} PR #${pr.number}: main-verify dispatchet (ref main).`);
  } else {
    console.log(`${LOG} PR #${pr.number}: docs-only merge — hopper over main-verify-dispatch.`);
  }

  // 3. Dedup-label (etter kvittering, som dagens rekkefølge).
  if (receiptPosted) await addLabel(pr.number);
}

async function main(): Promise<void> {
  const plan = readPlan();
  if (!plan || plan.outcome === 'noop' || !plan.pr) {
    console.log(`${LOG} ingen plan / outcome=noop — ingenting å poste.`);
    return;
  }
  const shots = collectShots();
  if (plan.outcome === 'auto-merge') {
    await runAutoMerge(plan, plan.pr, shots);
    return;
  }
  await runButtonCard(plan.pr, shots);
}

main().catch((err) => {
  console.error(`${LOG} uventet feil`, err);
  process.exit(1);
});
