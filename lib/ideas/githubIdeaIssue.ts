// A player's idea becomes a public GitHub issue (owner decision 2026-11-23:
// the whole text, no name, everyone can read it).
//
// Rules this file keeps:
// - The issue holds the idea text and a link to the admin page. Nothing that
//   identifies the player ever reaches this module: it takes the text only.
// - E-mail addresses and phone numbers in the free text are cut out first.
// - Best-effort: any failure returns `{ ok: false }`; the caller keeps the idea
//   (already stored) and falls back to the admin e-mail.
// - Fail closed: no token means no call to GitHub.
//
// The token is its own fine-grained token (Issues read/write on this repo only),
// not GITHUB_LOOP_PAT, which can merge pull requests.

import { githubClient, LOOP_REPO } from '@/lib/loops/githubClient';
import type { GitHubClient } from '@/lib/loops/discordActions';

/** Milestone «Backlog — uplanlagt / scale-triggered» (docs/issue-workflow.md). */
export const IDEA_MILESTONE_NUMBER = 9;
export const IDEA_LABELS = ['feedback', 'area:ideas'];
const TITLE_MAX = 70;
const GITHUB_TIMEOUT_MS = 4000;

const EMAIL_RE = /[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[^\s@<>()[\]]+/g;
// A run that starts like a number and may hold spaces, dots, dashes, brackets.
const NUMBER_RUN_RE = /\+?\d[\d\s().-]{6,}\d/g;
const DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})$/;

export const REDACTED_EMAIL = '[e-post fjernet]';
export const REDACTED_PHONE = '[telefonnummer fjernet]';

/** Cuts e-mail addresses and phone numbers (8+ digits, not dates) out of free text. */
export function redactContactDetails(text: string): string {
  return text.replace(EMAIL_RE, REDACTED_EMAIL).replace(NUMBER_RUN_RE, (run) => {
    const trimmed = run.trim();
    if (DATE_RE.test(trimmed)) return run;
    const digits = trimmed.replace(/\D/g, '').length;
    return digits >= 8 ? REDACTED_PHONE : run;
  });
}

/** `@name` would notify a GitHub user; a zero-width space after the @ stops that. */
function defuseMentions(text: string): string {
  return text.replace(/@(?=[A-Za-z0-9])/g, '@​');
}

export function buildIdeaIssueTitle(redactedText: string): string {
  const oneLine = redactedText.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= TITLE_MAX) return `Idé: ${oneLine}`;
  const cut = oneLine.slice(0, TITLE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > TITLE_MAX / 2 ? cut.slice(0, lastSpace) : cut;
  return `Idé: ${base.replace(/[\s,.;:-]+$/, '')} …`;
}

export function buildIdeaIssue(
  text: string,
  adminUrl: string,
): { title: string; body: string } {
  const safe = defuseMentions(redactContactDetails(text.trim()));
  const quoted = safe
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return {
    title: buildIdeaIssueTitle(redactContactDetails(text)),
    body: `${quoted}\n\n[Idéen i admin](${adminUrl})`,
  };
}

export type CreateIdeaIssueResult =
  | { ok: true; number: number; url: string }
  | { ok: false; reason: 'no-token' | 'github-error' };

export async function createIdeaIssue(
  text: string,
  adminUrl: string,
  deps: { client?: GitHubClient; token?: string | undefined } = {},
): Promise<CreateIdeaIssueResult> {
  const token = deps.token ?? process.env.GITHUB_IDEAS_PAT;
  const client =
    deps.client ?? (token ? githubClient(token, { timeoutMs: GITHUB_TIMEOUT_MS }) : null);
  if (!client) return { ok: false, reason: 'no-token' };

  const { title, body } = buildIdeaIssue(text, adminUrl);
  try {
    const res = await client.rest('POST', `/repos/${LOOP_REPO}/issues`, {
      title,
      body,
      labels: IDEA_LABELS,
      milestone: IDEA_MILESTONE_NUMBER,
    });
    const json = res.json as { number?: unknown; html_url?: unknown } | null;
    if (res.status === 201 && typeof json?.number === 'number' && typeof json.html_url === 'string') {
      return { ok: true, number: json.number, url: json.html_url };
    }
    console.error('[createIdeaIssue] GitHub svarte', res.status);
    return { ok: false, reason: 'github-error' };
  } catch (err) {
    console.error('[createIdeaIssue] kallet feilet', err);
    return { ok: false, reason: 'github-error' };
  }
}
