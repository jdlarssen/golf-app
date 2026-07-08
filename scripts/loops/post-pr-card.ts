// Discord PR-kort (#1159), steg 3 av 3: POST. Leser planen fra decide-steget,
// bygger kortet (merge-knapp fra #1124-mottakeren), og fester eventuelle
// skjermbilder fra screenshot-steget (Del B) via multipart. Kjøres via
// `npx --yes tsx` UTEN npm ci (kun global fetch/FormData + ren lib-import).
//
// Env:
//   GITHUB_TOKEN         — legg dedup-label etter posting (Actions default token)
//   DISCORD_BOT_TOKEN    — bot-identitet (knapper krever bot, ikke webhook)
//   DISCORD_CHANNEL_ID   — kanalen kortet postes i
//   GH_REPO              — «owner/repo» (default jdlarssen/golf-app)
//   CARD_PLAN_PATH       — planen fra decide-pr-card.ts (default pr-card-plan.json)
//   SHOTS_DIR            — mappe med skjermbilder (default pr-shots)
//   DRY_RUN=1            — logg payload/vedlegg i stedet for å poste
//
// Best-effort: håndterte feil logges og gir exit 0 (Discord er tillegg, aldri
// blokkerende). Kun uventede exceptions gir non-zero → fanges av failure-alarmen.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { buildCardPayload, CARD_LABEL } from '../../lib/loops/prCard';
import { ghClient } from './ghClient';
import { readPlan } from './cardPlan';

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

async function main(): Promise<void> {
  const plan = readPlan();
  if (!plan || !plan.shouldCard || !plan.pr) {
    console.log(`${LOG} ingen plan / shouldCard=false — ingenting å poste.`);
    return;
  }
  const { pr } = plan;
  const payload = buildCardPayload({
    pr: { number: pr.number, title: pr.title, html_url: pr.htmlUrl, draft: pr.draft },
    summary: pr.summary,
  });
  const shots = collectShots();

  if (DRY_RUN) {
    console.log(`${LOG} DRY_RUN PR #${pr.number} — ${shots.length} skjermbilde(r): ${shots.map((s) => basename(s)).join(', ') || '(ingen)'}`);
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

  // Post FØRST, label etterpå: aldri stille tapt kort (dobbelt-kort-race akseptert).
  let posted: boolean;
  try {
    posted = shots.length > 0 ? await postMultipart(payload, shots) : await postJson(payload);
  } catch (err) {
    console.error(`${LOG} PR #${pr.number}: posting kastet`, err);
    posted = false;
  }
  if (!posted) {
    console.error(`${LOG} PR #${pr.number}: posting feilet — labler ikke (retry ved neste grønn-event).`);
    return;
  }
  await addLabel(pr.number);
  console.log(`${LOG} PR #${pr.number}: kort postet (${shots.length} skjermbilde(r)).`);
}

main().catch((err) => {
  console.error(`${LOG} uventet feil`, err);
  process.exit(1);
});
