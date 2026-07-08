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

// Kandidat-PR: eksplisitt PR_NUMBER (workflow_dispatch / lokal), ellers PR-numrene
// i check_suite-payloaden. Del B behandler ett PR per kjøring (skjermbilde-bootet
// er tungt); vi tar første kandidat.
export function candidatePrNumber(): number | null {
  const explicit = process.env.PR_NUMBER;
  if (explicit) {
    const n = Number(explicit);
    return Number.isFinite(n) ? n : null;
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    const ev = JSON.parse(readFileSync(eventPath, 'utf8')) as {
      check_suite?: { pull_requests?: Array<{ number?: number }> };
    };
    const first = (ev.check_suite?.pull_requests ?? []).find((p) =>
      Number.isFinite(p.number),
    );
    return first?.number ?? null;
  } catch {
    return null;
  }
}
