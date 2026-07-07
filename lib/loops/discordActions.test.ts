import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  executeAction,
  isTimestampFresh,
  parseCustomId,
  verifyDiscordSignature,
  LOOP_REPO,
  type GitHubClient,
} from './discordActions';

// Ekte ed25519-nøkkelpar per test-kjøring — verifiseringen testes mot ekte
// kryptografi, ikke mot en mock (Discords rå-hex-format utledes fra SPKI-DER).
function makeKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  const publicKeyHex = spki.subarray(spki.length - 32).toString('hex');
  return { publicKeyHex, privateKey };
}

function sign(privateKey: crypto.KeyObject, timestamp: string, body: string): string {
  return crypto.sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');
}

describe('verifyDiscordSignature', () => {
  const ts = '1751980000';
  const body = '{"type":1}';

  it('godtar gyldig signatur', () => {
    const { publicKeyHex, privateKey } = makeKeypair();
    const sig = sign(privateKey, ts, body);
    expect(verifyDiscordSignature(publicKeyHex, sig, ts, body)).toBe(true);
  });

  it('avviser manipulert body', () => {
    const { publicKeyHex, privateKey } = makeKeypair();
    const sig = sign(privateKey, ts, body);
    expect(verifyDiscordSignature(publicKeyHex, sig, ts, '{"type":3}')).toBe(false);
  });

  it('avviser signatur fra feil nøkkel', () => {
    const { privateKey } = makeKeypair();
    const other = makeKeypair();
    const sig = sign(privateKey, ts, body);
    expect(verifyDiscordSignature(other.publicKeyHex, sig, ts, body)).toBe(false);
  });

  it('avviser søppel-hex uten å kaste (fail-closed)', () => {
    expect(verifyDiscordSignature('ikke-hex', 'heller-ikke', ts, body)).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  const now = 1_751_980_000_000;
  it.each([
    ['ferskt', String(1_751_980_000 - 60), true],
    ['akkurat innenfor', String(1_751_980_000 - 300), true],
    ['for gammelt (replay)', String(1_751_980_000 - 301), false],
    ['fra fremtiden utenfor vindu', String(1_751_980_000 + 301), false],
    ['ikke et tall', 'nå nettopp', false],
  ])('%s → %s', (_navn, ts, expected) => {
    expect(isTimestampFresh(ts, now)).toBe(expected);
  });
});

describe('parseCustomId', () => {
  it.each([
    ['merge_pr:1112', { kind: 'merge_pr', pr: 1112 }],
    ['ready_issue:1122', { kind: 'ready_issue', issue: 1122 }],
    ['answer:1104:A', { kind: 'answer', issue: 1104, choice: 'A' }],
    ['answer:1104:B', { kind: 'answer', issue: 1104, choice: 'B' }],
  ])('parser %s', (id, expected) => {
    expect(parseCustomId(id)).toEqual(expected);
  });

  it.each([
    'merge_pr:abc',
    'answer:12:C',
    'delete_repo:1',
    'merge_pr:12;ready_issue:13',
    '',
  ])('avviser %s', (id) => {
    expect(parseCustomId(id)).toBeNull();
  });
});

type Call = { method: string; path: string; body?: unknown };

function mockGh(responses: Array<{ status: number; json?: unknown }>) {
  const calls: Call[] = [];
  let i = 0;
  const next = () => responses[Math.min(i++, responses.length - 1)];
  const gh: GitHubClient = {
    rest: vi.fn(async (method, path, body) => {
      calls.push({ method, path, body });
      const r = next();
      return { status: r.status, json: r.json ?? null };
    }),
    graphql: vi.fn(async (query, variables) => {
      calls.push({ method: 'GRAPHQL', path: query.slice(0, 40), body: variables });
      const r = next();
      return { status: r.status, json: r.json ?? null };
    }),
  };
  return { gh, calls };
}

const greenPr = {
  node_id: 'PR_x',
  draft: false,
  state: 'open',
  head: { sha: 'abc123' },
};
const greenChecks = {
  check_runs: [
    { name: 'verify', status: 'completed', conclusion: 'success' },
    { name: 'e2e', status: 'completed', conclusion: 'skipped' },
  ],
};

describe('executeAction: ready_issue', () => {
  it('setter autonomy:ready-labelen', async () => {
    const { gh, calls } = mockGh([{ status: 200 }]);
    const msg = await executeAction({ kind: 'ready_issue', issue: 1122 }, gh);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: `/repos/${LOOP_REPO}/issues/1122/labels`,
      body: { labels: ['autonomy:ready'] },
    });
    expect(msg).toContain('natt-køen');
  });

  it('feil fra GitHub gir ærlig melding', async () => {
    const { gh } = mockGh([{ status: 404 }]);
    const msg = await executeAction({ kind: 'ready_issue', issue: 9999 }, gh);
    expect(msg).toContain('404');
  });
});

describe('executeAction: answer', () => {
  it('poster eierbeslutningen som kommentar', async () => {
    const { gh, calls } = mockGh([{ status: 201 }]);
    const msg = await executeAction({ kind: 'answer', issue: 1104, choice: 'A' }, gh);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: `/repos/${LOOP_REPO}/issues/1104/comments`,
    });
    expect((calls[0].body as { body: string }).body).toContain('**A**');
    expect(msg).toContain('«A»');
  });
});

describe('executeAction: merge_pr', () => {
  it('grønn ikke-draft PR: henter PR, sjekker CI, rebase-merger', async () => {
    const { gh, calls } = mockGh([
      { status: 200, json: greenPr },
      { status: 200, json: greenChecks },
      { status: 200, json: { merged: true } },
    ]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'PUT']);
    expect(calls[2]).toMatchObject({
      path: `/repos/${LOOP_REPO}/pulls/1112/merge`,
      body: { merge_method: 'rebase' },
    });
    expect(msg).toContain('rebase-merget');
  });

  it('draft-PR tas ut av draft via GraphQL før merge', async () => {
    const { gh, calls } = mockGh([
      { status: 200, json: { ...greenPr, draft: true } },
      { status: 200, json: greenChecks },
      { status: 200, json: { data: {} } },
      { status: 200, json: { merged: true } },
    ]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'GRAPHQL', 'PUT']);
    expect(msg).toContain('rebase-merget');
  });

  it('rød CI → nekter å merge, navngir sjekken', async () => {
    const { gh, calls } = mockGh([
      { status: 200, json: greenPr },
      {
        status: 200,
        json: { check_runs: [{ name: 'verify', status: 'completed', conclusion: 'failure' }] },
      },
    ]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(calls).toHaveLength(2);
    expect(msg).toContain('ikke grønn');
    expect(msg).toContain('verify');
  });

  it('CI fortsatt i gang → vent-melding, ingen merge', async () => {
    const { gh, calls } = mockGh([
      { status: 200, json: greenPr },
      {
        status: 200,
        json: { check_runs: [{ name: 'e2e', status: 'in_progress', conclusion: null }] },
      },
    ]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(calls).toHaveLength(2);
    expect(msg).toContain('kjører fortsatt');
  });

  it('lukket PR → ingenting å merge', async () => {
    const { gh } = mockGh([{ status: 200, json: { ...greenPr, state: 'closed' } }]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(msg).toContain('ikke åpen');
  });

  it('merge-feil fra GitHub videreformidles med grunn', async () => {
    const { gh } = mockGh([
      { status: 200, json: greenPr },
      { status: 200, json: greenChecks },
      { status: 405, json: { message: 'Base branch was modified' } },
    ]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(msg).toContain('Base branch was modified');
  });
});
