// Type A: what leaves the server for GitHub. No identity, contact details cut out,
// failures never throw.
import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '@/lib/loops/discordActions';
import {
  buildIdeaIssue,
  buildIdeaIssueTitle,
  createIdeaIssue,
  IDEA_LABELS,
  IDEA_MILESTONE_NUMBER,
  redactContactDetails,
} from './githubIdeaIssue';

// Built at run time so no address is committed to the public repo.
const at = (local: string, domain: string) => `${local}${String.fromCharCode(64)}${domain}`;
const ADMIN = 'https://tornygolf.no/admin/ideer';

function client(res: { status: number; json: unknown } | Error) {
  const rest = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  return { rest, graphql: vi.fn() } as unknown as GitHubClient & { rest: typeof rest };
}

describe('redactContactDetails', () => {
  it('cuts e-mail addresses', () => {
    expect(redactContactDetails(`Skriv til ${at('ola.test+golf', 'example.test')} takk`)).toBe(
      'Skriv til [e-post fjernet] takk',
    );
  });
  it.each(['912 34 567', '+47 912 34 567', '0047 91234567', '91234567', '12 34 56 78', '+4791234567'])(
    'cuts the phone number %s',
    (n) => {
      const out = redactContactDetails(`Ring meg ${n} i dag`);
      expect(out).toContain('[telefonnummer fjernet]');
      expect(out).not.toMatch(/\d{3}/);
    },
  );
  it.each([
    'Den 23.11.2026 og 2026-11-23 spilte jeg 72 slag på hull 7, 18 hull.',
    'Scorekort: par 4 4 3 5 4 4 3 4 5 og 5 4 4 3 5 4 4 3 4',
    'Rundestart 23.11.2026 14.30, ferdig 2026-11-23 18:45',
    'Totalt 1 234 567 kr og 12 345 678 poeng',
  ])('keeps dates, times and score rows: %s', (t) => {
    expect(redactContactDetails(t)).toBe(t);
  });
});

describe('buildIdeaIssue', () => {
  it('holds the idea text and the admin link, nothing else', () => {
    const { title, body } = buildIdeaIssue('Putt-statistikk per hull', ADMIN);
    expect(title).toBe('Idé: Putt-statistikk per hull');
    expect(body).toBe(`\`\`\`text\nPutt-statistikk per hull\n\`\`\`\n\n[Idéen i admin](${ADMIN})`);
  });
  it('redacts contact details in title and body', () => {
    const { title, body } = buildIdeaIssue(`Mail meg på ${at('a', 'b.test')} eller ring 91234567`, ADMIN);
    expect(`${title}\n${body}`).not.toMatch(/a.b\.test|91234567/);
  });
  it('defuses @mentions in body and title', () => {
    const { title, body } = buildIdeaIssue('linje 1\nlinje 2 @jdlarssen', ADMIN);
    expect(body).not.toContain('@jdlarssen');
    expect(title).not.toContain('@jdlarssen');
  });
  it('puts the idea in a code block, so links, images, HTML and headings do not render', () => {
    const { body } = buildIdeaIssue('# Stor\n[x](https://e.test) ![](https://e.test/i.png) <img src=x> #123 GH-45', ADMIN);
    const [fenceOpen, ...rest] = body.split('\n');
    expect(fenceOpen).toBe('```text');
    expect(rest[rest.length - 1]).toBe(`[Idéen i admin](${ADMIN})`);
    // the idea sits between the fences; nothing of it is outside them
    expect(body.split('```')).toHaveLength(3);
  });
  it('uses a fence longer than any backtick run in the idea', () => {
    const { body } = buildIdeaIssue('kode ````` slutt ``` forsøk', ADMIN);
    expect(body.startsWith('``````text\n')).toBe(true);
    expect(body).toContain('\n``````\n');
  });
  it('builds a plain title: no markdown, HTML or issue references', () => {
    const t = buildIdeaIssueTitle('# [Hei](https://e.test) <b>du</b> #123 GH-45 *fet*');
    expect(t).not.toMatch(/[[\]()<>#*]/);
    expect(t).not.toMatch(/GH-\d/i);
  });
  it('trims a long title at a word boundary', () => {
    const t = buildIdeaIssueTitle('ord '.repeat(60));
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t.endsWith('…')).toBe(true);
  });
});

describe('createIdeaIssue', () => {
  it('posts title, body, labels and milestone and returns the issue', async () => {
    const c = client({ status: 201, json: { number: 4001, html_url: 'https://github.com/o/r/issues/4001' } });
    const r = await createIdeaIssue('En idé', ADMIN, { client: c });
    expect(r).toEqual({ ok: true, number: 4001, url: 'https://github.com/o/r/issues/4001' });
    expect(c.rest).toHaveBeenCalledWith(
      'POST',
      '/repos/jdlarssen/golf-app/issues',
      expect.objectContaining({ labels: IDEA_LABELS, milestone: IDEA_MILESTONE_NUMBER }),
    );
  });
  it('fails closed without a token', async () => {
    vi.stubEnv('GITHUB_IDEAS_PAT', '');
    expect(await createIdeaIssue('En idé', ADMIN)).toEqual({ ok: false, reason: 'no-token' });
    vi.unstubAllEnvs();
  });
  it('returns github-error on a bad status', async () => {
    const r = await createIdeaIssue('En idé', ADMIN, { client: client({ status: 422, json: {} }) });
    expect(r).toEqual({ ok: false, reason: 'github-error' });
  });
  it('returns github-error when the call throws', async () => {
    const r = await createIdeaIssue('En idé', ADMIN, { client: client(new Error('timeout')) });
    expect(r).toEqual({ ok: false, reason: 'github-error' });
  });
});
