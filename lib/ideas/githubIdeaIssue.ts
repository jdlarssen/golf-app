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

import 'server-only';

import { githubClient, LOOP_REPO } from '@/lib/loops/githubClient';
import type { GitHubClient } from '@/lib/loops/discordActions';

/** Milestone «Backlog — uplanlagt / scale-triggered» (docs/issue-workflow.md). */
export const IDEA_MILESTONE_NUMBER = 9;
export const IDEA_LABELS = ['feedback', 'area:ideas'];
const TITLE_MAX = 70;
const GITHUB_TIMEOUT_MS = 4000;

const EMAIL_RE = /[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[^\s@<>()[\]]+/g;
// Norwegian phone numbers only, with the groupings people write them in:
// 8 / 4+4 / 3+2+3 / 2+2+2+2 digits, with optional +47 or 0047 in front.
// Anything else (score rows, dates, times) is left alone.
const PHONE_RE =
  /(?<![\d.,-])(?:(?:\+|00)47[ -]?)?(?:\d{8}|\d{4} \d{4}|\d{3} \d{2} \d{3}|\d{2} \d{2} \d{2} \d{2})(?![\d.,-])/g;
// Longer international numbers, written with a + in front.
const INTL_PHONE_RE = /\+\d{1,3}(?:[ -]?\d{2,4}){2,4}(?!\d)/g;

export const REDACTED_EMAIL = '[e-post fjernet]';
export const REDACTED_PHONE = '[telefonnummer fjernet]';

/** Cuts e-mail addresses and phone numbers out of free text. */
export function redactContactDetails(text: string): string {
  return text
    .replace(EMAIL_RE, REDACTED_EMAIL)
    .replace(INTL_PHONE_RE, REDACTED_PHONE)
    .replace(PHONE_RE, REDACTED_PHONE);
}

/** `@name` would notify a GitHub user; a zero-width space after the @ stops that. */
function defuseMentions(text: string): string {
  return text.replace(/@(?=[A-Za-z0-9])/g, '@​');
}

/** The text as it is published: contact details cut out, mentions defused. */
function safeText(text: string): string {
  return defuseMentions(redactContactDetails(text.trim()));
}

/**
 * Plain title: no markdown or HTML characters and no `#123` references, so the
 * title shows as written and links to nothing.
 */
export function buildIdeaIssueTitle(text: string): string {
  const oneLine = safeText(text)
    .replace(/\s+/g, ' ')
    .replace(/[`*_~[\]()<>!|\\#]/g, '')
    .replace(/\bGH-(?=\d)/gi, '')
    .trim();
  if (oneLine.length <= TITLE_MAX) return `Idé: ${oneLine}`;
  const cut = oneLine.slice(0, TITLE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > TITLE_MAX / 2 ? cut.slice(0, lastSpace) : cut;
  return `Idé: ${base.replace(/[\s,.;:-]+$/, '')} …`;
}

/** A code fence longer than any run of backticks in the text. */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * The idea goes in a code block, so nothing in it renders: no links, images,
 * HTML, headings or `#123` cross-references. The admin link is ours.
 */
export function buildIdeaIssue(
  text: string,
  adminUrl: string,
): { title: string; body: string } {
  const safe = safeText(text);
  const fence = fenceFor(safe);
  return {
    title: buildIdeaIssueTitle(text),
    body: `${fence}text\n${safe}\n${fence}\n\n[Idéen i admin](${adminUrl})`,
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
