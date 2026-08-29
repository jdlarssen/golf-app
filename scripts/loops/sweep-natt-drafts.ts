// Natt-draft-sweepen (#1769), runner: finner åpne natt-PR-er som ble stående som
// draft etter at leveransen var bokført, flipper dem til ready og legger igjen en
// 🧹-audit-kommentar. Klassifiseringen (og hvorfor hver port finnes) bor i
// lib/loops/draftSweep.ts; her er HTTP og env.
//
// Kjøres via `npx --yes tsx` UTEN npm ci (kun global fetch + rene lib-importer),
// fra .github/workflows/natt-draft-sweep.yml.
//
// Env: GITHUB_TOKEN (MÅ være PR_AUTHOR_PAT — github.token-flipp trigger ikke
// kortets ready_for_review, #1701), GH_REPO.
//
// Fail-loud: manglende token, mislykket oppslag eller mislykket flipp gir exit 1.
// Én PR-feil stopper ikke resten — vi går gjennom hele lista og feiler til slutt,
// så en enkelt sur PR aldri holder de andre igjen. Rød kjøring = CI-vaktas bord.

import { ghClient } from './ghClient';
import {
  buildSweepComment,
  classifyNattDraft,
  preCommentSkipReason,
  type NattDraftFacts,
} from '../../lib/loops/draftSweep';

const LOG = '[sweep-natt-drafts]';
const REPO = process.env.GH_REPO || 'jdlarssen/golf-app';
const TOKEN = process.env.GITHUB_TOKEN;

type PrListItem = {
  number: number;
  node_id: string;
  state: string;
  draft: boolean;
  updated_at: string;
  head: { ref: string };
  labels?: Array<{ name: string }>;
};

// REST kan ikke ta en PR ut av draft (`PATCH /pulls/{n}` har ingen `draft`-felt) —
// GraphQL-mutasjonen er den eneste veien, og den er allerede i bruk i repoet
// (lib/loops/discordActions.ts, eier-gated av-draft).
const READY_MUTATION =
  'mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }';

async function fetchOpenPrs(gh: ReturnType<typeof ghClient>): Promise<PrListItem[]> {
  const prs: PrListItem[] = [];
  // 3 × 100 er langt over repoets normale antall åpne PR-er; taket er kun en brems.
  for (let page = 1; page <= 3; page++) {
    const res = await gh.rest(
      'GET',
      `/repos/${REPO}/pulls?state=open&per_page=100&page=${page}`,
    );
    if (res.status !== 200) throw new Error(`kunne ikke liste åpne PR-er (HTTP ${res.status})`);
    const batch = (res.json as PrListItem[]) ?? [];
    prs.push(...batch);
    if (batch.length < 100) break;
  }
  return prs;
}

// PR-ens issue-kommentarer (PR-er ER issues her). Kastes ved feil: en tom liste
// ville lest som «ingen leveransemarkør» — riktig skip-utfall, men feil grunn, og
// en stille lesefeil er nettopp det fail-loud-regelen skal fange.
async function fetchCommentBodies(gh: ReturnType<typeof ghClient>, n: number): Promise<string[]> {
  const bodies: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await gh.rest(
      'GET',
      `/repos/${REPO}/issues/${n}/comments?per_page=100&page=${page}`,
    );
    if (res.status !== 200)
      throw new Error(`PR #${n}: kunne ikke lese kommentarene (HTTP ${res.status})`);
    const batch = (res.json as Array<{ body?: string | null }>) ?? [];
    for (const c of batch) if (c.body) bodies.push(c.body);
    if (batch.length < 100) break;
  }
  return bodies;
}

// Flipp FØRST, kommentar etterpå: audit-teksten sier «flippet» i fortid, og en
// kommentar om en flipp som ikke skjedde ville vært verre enn en manglende
// kommentar. Etter flippen er PR-en ikke lenger draft, så en senere kjøring
// hopper over den på regel 1 — ingen dedup-label trengs.
async function flipToReady(gh: ReturnType<typeof ghClient>, pr: PrListItem): Promise<void> {
  const res = await gh.graphql(READY_MUTATION, { id: pr.node_id });
  const errors = (res.json as { errors?: unknown[] } | null)?.errors;
  if (res.status !== 200 || (Array.isArray(errors) && errors.length > 0))
    throw new Error(
      `PR #${pr.number}: flipp til ready feilet (HTTP ${res.status}${
        errors ? ` — ${JSON.stringify(errors)}` : ''
      })`,
    );
}

async function postAuditComment(gh: ReturnType<typeof ghClient>, pr: PrListItem): Promise<void> {
  const comment = await gh.rest('POST', `/repos/${REPO}/issues/${pr.number}/comments`, {
    body: buildSweepComment(),
  });
  if (comment.status !== 201)
    throw new Error(
      `PR #${pr.number}: flippet, men audit-kommentaren feilet (HTTP ${comment.status})`,
    );
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error(`${LOG} mangler GITHUB_TOKEN (PR_AUTHOR_PAT) — kan ikke flippe noe.`);
    process.exit(1);
  }
  const gh = ghClient(TOKEN, REPO);
  const now = new Date();

  const prs = await fetchOpenPrs(gh);
  console.log(`${LOG} ${prs.length} åpne PR-er å vurdere.`);

  const failures: string[] = [];
  let flipped = 0;

  for (const pr of prs) {
    const facts: NattDraftFacts = {
      isOpen: pr.state === 'open',
      isDraft: pr.draft,
      headRef: pr.head.ref,
      labels: (pr.labels ?? []).map((l) => l.name),
      updatedAt: pr.updated_at,
    };

    // Kommentarene hentes KUN for PR-er som fortsatt er kandidater etter de
    // kommentarløse portene — samme funksjon klassifisereren selv kaller.
    const pre = preCommentSkipReason(facts, now);
    if (pre) {
      console.log(`${LOG} PR #${pr.number}: hopper over (${pre}).`);
      continue;
    }

    try {
      const decision = classifyNattDraft({ ...facts, commentBodies: await fetchCommentBodies(gh, pr.number) }, now);
      if (decision.action === 'skip') {
        console.log(`${LOG} PR #${pr.number}: hopper over (${decision.reason}).`);
        continue;
      }
      await flipToReady(gh, pr);
      // Telles i det flippen har skjedd — feiler audit-kommentaren under, skal
      // oppsummeringen fortsatt si sannheten om at PR-en ble flippet.
      flipped++;
      await postAuditComment(gh, pr);
      console.log(`${LOG} PR #${pr.number}: flippet til ready — kortet tar den derfra.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG} ${msg}`);
      failures.push(msg);
    }
  }

  console.log(`${LOG} ferdig: ${flipped} flippet, ${failures.length} feilet.`);
  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`${LOG} uventet feil`, err);
  process.exit(1);
});
