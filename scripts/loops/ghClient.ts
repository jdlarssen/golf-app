// Delt GitHub-REST-klient for Discord-PR-kort-runnerne (#1159). Bruker global
// fetch (Node 22) + Bearer-token — ingen ekstra avhengighet, så scriptene kjører
// via `npx --yes tsx` uten npm ci.

import { readFileSync } from 'node:fs';

export type GhResponse = { status: number; json: unknown };

export function ghClient(token: string, repo: string) {
  async function rest(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<GhResponse> {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  return { repo, rest };
}

type WorkflowEvent = {
  workflow_run?: { head_sha?: string; pull_requests?: Array<{ number?: number }> };
  check_suite?: { head_sha?: string; pull_requests?: Array<{ number?: number }> };
};

function readEvent(): WorkflowEvent | null {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    return JSON.parse(readFileSync(eventPath, 'utf8')) as WorkflowEvent;
  } catch {
    return null;
  }
}

// Kandidat-PR: eksplisitt PR_NUMBER (workflow_dispatch / lokal), ellers PR-numrene
// i workflow_run-/check_suite-payloaden. Del B behandler ett PR per kjøring
// (skjermbilde-bootet er tungt); vi tar første kandidat. Er lista tom (kan skje
// selv for same-repo PR-er), faller decide tilbake på head-SHA → API-oppslag.
export function candidatePrNumber(): number | null {
  const explicit = process.env.PR_NUMBER;
  if (explicit) {
    const n = Number(explicit);
    return Number.isFinite(n) ? n : null;
  }
  const ev = readEvent();
  const prs = ev?.workflow_run?.pull_requests ?? ev?.check_suite?.pull_requests ?? [];
  const first = prs.find((p) => Number.isFinite(p.number));
  return first?.number ?? null;
}

// Head-SHA fra eventet — brukes til å slå opp PR-en via API når pull_requests-
// lista er tom (workflow_run gir alltid head_sha).
export function eventHeadSha(): string | null {
  const ev = readEvent();
  return ev?.workflow_run?.head_sha ?? ev?.check_suite?.head_sha ?? null;
}
