import crypto from 'node:crypto';

// Discord-knappene (#1124): ren, testbar logikk for interactions-endepunktet.
// Route-handleren (app/api/discord/interactions/route.ts) eier HTTP/env;
// denne modulen eier signaturverifisering, custom_id-parsing og GitHub-kallene.

export const LOOP_REPO = 'jdlarssen/golf-app';

// Discord signerer `timestamp + rawBody` med appens ed25519-nøkkel. Node kan
// verifisere natively, men trenger nøkkelen DER-innpakket (SPKI) — Discord
// utleverer kun de rå 32 bytene som hex.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string,
): boolean {
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(
      null,
      Buffer.from(timestamp + rawBody),
      key,
      Buffer.from(signatureHex, 'hex'),
    );
  } catch {
    // Ugyldig hex/nøkkelform = ugyldig signatur — aldri kast videre (fail-closed).
    return false;
  }
}

// Replay-vern: Discord-signaturen dekker tidsstempelet; eldre enn 5 min avvises.
export function isTimestampFresh(timestamp: string, nowMs = Date.now()): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(nowMs / 1000 - ts) <= 300;
}

export type DiscordAction =
  | { kind: 'merge_pr'; pr: number }
  | { kind: 'ready_issue'; issue: number }
  | { kind: 'answer'; issue: number; choice: 'A' | 'B' };

// custom_id-format (satt av sender-siden, se docs/loops/morgenbriefen.md):
//   merge_pr:<n>  ·  ready_issue:<n>  ·  answer:<n>:<A|B>
export function parseCustomId(customId: string): DiscordAction | null {
  const merge = /^merge_pr:(\d+)$/.exec(customId);
  if (merge) return { kind: 'merge_pr', pr: Number(merge[1]) };

  const ready = /^ready_issue:(\d+)$/.exec(customId);
  if (ready) return { kind: 'ready_issue', issue: Number(ready[1]) };

  const answer = /^answer:(\d+):(A|B)$/.exec(customId);
  if (answer)
    return { kind: 'answer', issue: Number(answer[1]), choice: answer[2] as 'A' | 'B' };

  return null;
}

// Tynn GitHub-klient så executeAction kan enhetstestes med mock. REST-stier er
// relative til https://api.github.com; `graphql` er eget kall.
export interface GitHubClient {
  rest(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }>;
  graphql(query: string, variables: Record<string, unknown>): Promise<{ status: number; json: unknown }>;
}

// CI-porten leser Actions-workflow-kjøringen for denne fila (ci.yml på main) —
// IKKE check-runs: fine-grained PAT-er kan ikke gis Checks-lesetilgang (det
// finnes ikke som PAT-permission), men «Actions: Read» dekker workflow-runs.
// Endres CI-filnavnet, oppdater her.
const CI_WORKFLOW_FILE = 'ci.yml';

type PrInfo = { node_id: string; draft: boolean; state: string; head: { sha: string } };
type WorkflowRuns = {
  workflow_runs: Array<{ id: number; status: string; conclusion: string | null }>;
};

// Utfører handlingen og returnerer meldingen eieren ser i Discord. Feil fra
// GitHub blir ærlige svar («fikk ikke …: <grunn>») — aldri stille.
export async function executeAction(action: DiscordAction, gh: GitHubClient): Promise<string> {
  switch (action.kind) {
    case 'ready_issue': {
      const res = await gh.rest('POST', `/repos/${LOOP_REPO}/issues/${action.issue}/labels`, {
        labels: ['autonomy:ready'],
      });
      if (res.status !== 200)
        return `Fikk ikke merket #${action.issue} (HTTP ${res.status}) — sjekk at issuet finnes og er åpent.`;
      return `🌙 #${action.issue} står i natt-køen — bygges i natt.`;
    }

    case 'answer': {
      const res = await gh.rest('POST', `/repos/${LOOP_REPO}/issues/${action.issue}/comments`, {
        body: `Eierbeslutning via Discord: **${action.choice}**`,
      });
      if (res.status !== 201)
        return `Fikk ikke postet svaret på #${action.issue} (HTTP ${res.status}).`;
      return `✅ Svaret «${action.choice}» er postet på #${action.issue}.`;
    }

    case 'merge_pr': {
      const prRes = await gh.rest('GET', `/repos/${LOOP_REPO}/pulls/${action.pr}`);
      if (prRes.status !== 200) return `Fant ikke PR #${action.pr} (HTTP ${prRes.status}).`;
      const pr = prRes.json as PrInfo;
      if (pr.state !== 'open') return `PR #${action.pr} er ikke åpen (${pr.state}) — ingenting å merge.`;

      const ciRes = await gh.rest(
        'GET',
        `/repos/${LOOP_REPO}/actions/workflows/${CI_WORKFLOW_FILE}/runs?head_sha=${pr.head.sha}&per_page=20`,
      );
      if (ciRes.status !== 200)
        return `Fikk ikke lest CI-status for PR #${action.pr} (HTTP ${ciRes.status}) — ikke merget.`;
      const ciRuns = (ciRes.json as WorkflowRuns).workflow_runs ?? [];
      if (ciRuns.length === 0)
        return `Fant ingen CI-kjøring for PR #${action.pr} enda — prøv igjen når CI har startet.`;
      // Nyeste kjøring (høyeste id) er fasit for head-SHA-en; re-kjøringer gir flere.
      const latest = ciRuns.reduce((a, b) => (b.id > a.id ? b : a));
      if (latest.status !== 'completed')
        return `⏳ CI kjører fortsatt på PR #${action.pr} (${latest.status}) — prøv igjen om litt.`;
      if (latest.conclusion !== 'success')
        return `🔴 CI er ikke grønn på PR #${action.pr} (CI: ${latest.conclusion ?? 'ukjent'}) — ikke merget.`;

      if (pr.draft) {
        const ready = await gh.graphql(
          `mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`,
          { id: pr.node_id },
        );
        if (ready.status !== 200)
          return `Fikk ikke tatt PR #${action.pr} ut av draft (HTTP ${ready.status}) — ikke merget.`;
      }

      // Alltid rebase — squash er forbudt i repoet (mister granulær audit-trail).
      const merge = await gh.rest('PUT', `/repos/${LOOP_REPO}/pulls/${action.pr}/merge`, {
        merge_method: 'rebase',
      });
      if (merge.status !== 200) {
        const detail = (merge.json as { message?: string })?.message ?? `HTTP ${merge.status}`;
        return `Fikk ikke merget PR #${action.pr}: ${detail}`;
      }
      return `✅ PR #${action.pr} er rebase-merget. Issuet med «Closes» lukkes automatisk — closing-kommentaren ligger allerede der.`;
    }
  }
}
