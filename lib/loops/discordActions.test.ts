import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  executeAction,
  extractLanseringProposal,
  isTimestampFresh,
  parseCustomId,
  verifyDiscordSignature,
  LOOP_REPO,
  type GitHubClient,
  type LanseringDeps,
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
    ['publish_lansering:4938711829', { kind: 'publish_lansering', commentId: 4938711829 }],
    ['drop_issue:1229', { kind: 'drop_issue', issue: 1229 }],
    ['snooze_issue:1229', { kind: 'snooze_issue', issue: 1229 }],
  ])('parser %s', (id, expected) => {
    expect(parseCustomId(id)).toEqual(expected);
  });

  it.each([
    'merge_pr:abc',
    'answer:12:C',
    'delete_repo:1',
    'merge_pr:12;ready_issue:13',
    'publish_lansering:abc',
    'publish_lansering:',
    'drop_issue:abc',
    'snooze_issue:',
    '',
  ])('avviser %s', (id) => {
    expect(parseCustomId(id)).toBeNull();
  });
});

describe('extractLanseringProposal', () => {
  const block = (json: string) => `📣 Ukens lansering\n\n\`\`\`json\n${json}\n\`\`\`\n`;

  it('parser komplett forslag med lenke og knappetekst', () => {
    const result = extractLanseringProposal(
      block('{"title":"Premiebord og sponsorer","body":"Legg inn et premiebord.","link":"/opprett-spill","cta_label":"Sett opp en runde"}'),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        title: 'Premiebord og sponsorer',
        body: 'Legg inn et premiebord.',
        link: '/opprett-spill',
        cta_label: 'Sett opp en runde',
      },
    });
  });

  it('parser forslag uten lenke/knappetekst (null-felter)', () => {
    const result = extractLanseringProposal(
      block('{"title":"Tittel","body":"Brødtekst.","link":null,"cta_label":null}'),
    );
    expect(result).toEqual({
      ok: true,
      value: { title: 'Tittel', body: 'Brødtekst.', link: null, cta_label: null },
    });
  });

  it.each([
    ['ingen json-blokk', 'bare vanlig tekst', 'no_block'],
    ['ugyldig JSON', '```json\n{ikke json}\n```', 'bad_json'],
    ['title er ikke string', '```json\n{"title":42,"body":"x"}\n```', 'bad_json'],
    ['tom title', '```json\n{"title":"  ","body":"x"}\n```', 'title_required'],
    ['ekstern lenke', '```json\n{"title":"T","body":"B","link":"https://evil.example"}\n```', 'link_must_be_internal'],
  ])('%s → %s', (_navn, body, reason) => {
    expect(extractLanseringProposal(body)).toEqual({ ok: false, reason });
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
// CI-porten leser nå Actions-workflow-kjøringen for ci.yml (ikke check-runs).
const greenCi = {
  workflow_runs: [{ id: 1, status: 'completed', conclusion: 'success' }],
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

describe('executeAction: drop_issue', () => {
  it('poster dropp-kommentar FØR lukking, lukker som not_planned', async () => {
    const { gh, calls } = mockGh([{ status: 201 }, { status: 200 }]);
    const msg = await executeAction({ kind: 'drop_issue', issue: 1229 }, gh);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: `/repos/${LOOP_REPO}/issues/1229/comments`,
    });
    expect(calls[1]).toMatchObject({
      method: 'PATCH',
      path: `/repos/${LOOP_REPO}/issues/1229`,
      body: { state: 'closed', state_reason: 'not_planned' },
    });
    expect(msg).toContain('droppet');
  });

  it('kommentar-feil → ærlig melding, issuet lukkes IKKE', async () => {
    const { gh, calls } = mockGh([{ status: 502 }]);
    const msg = await executeAction({ kind: 'drop_issue', issue: 1229 }, gh);
    expect(calls).toHaveLength(1);
    expect(msg).toContain('502');
    expect(msg).toContain('IKKE lukket');
  });

  it('lukke-feil ETTER kommentar → melding navngir at kommentaren står', async () => {
    const { gh, calls } = mockGh([{ status: 201 }, { status: 403 }]);
    const msg = await executeAction({ kind: 'drop_issue', issue: 1229 }, gh);
    expect(calls).toHaveLength(2);
    expect(msg).toContain('403');
    expect(msg).toContain('lukk manuelt');
  });
});

describe('executeAction: snooze_issue', () => {
  it('poster utsett-kommentar, setter parked, fjerner begge needs-labels', async () => {
    const { gh, calls } = mockGh([
      { status: 201 },
      { status: 200 },
      { status: 200 },
      { status: 200 },
    ]);
    const msg = await executeAction({ kind: 'snooze_issue', issue: 1229 }, gh);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: `/repos/${LOOP_REPO}/issues/1229/comments`,
    });
    expect(calls[1]).toMatchObject({
      method: 'POST',
      path: `/repos/${LOOP_REPO}/issues/1229/labels`,
      body: { labels: ['parked'] },
    });
    expect(calls[2]).toMatchObject({
      method: 'DELETE',
      path: `/repos/${LOOP_REPO}/issues/1229/labels/${encodeURIComponent('autonomy:needs-decision')}`,
    });
    expect(calls[3]).toMatchObject({
      method: 'DELETE',
      path: `/repos/${LOOP_REPO}/issues/1229/labels/${encodeURIComponent('autonomy:needs-contract-session')}`,
    });
    expect(msg).toContain('parkert');
  });

  it('404 på label-fjerning tolereres (dobbel-tapp-idempotens)', async () => {
    const { gh } = mockGh([
      { status: 201 },
      { status: 200 },
      { status: 404 },
      { status: 404 },
    ]);
    const msg = await executeAction({ kind: 'snooze_issue', issue: 1229 }, gh);
    expect(msg).toContain('parkert');
    expect(msg).not.toContain('404');
  });

  it('parked-label feiler → ærlig melding om manuell oppfølging', async () => {
    const { gh, calls } = mockGh([{ status: 201 }, { status: 502 }]);
    const msg = await executeAction({ kind: 'snooze_issue', issue: 1229 }, gh);
    expect(calls).toHaveLength(2);
    expect(msg).toContain('502');
    expect(msg).toContain('manuelt');
  });

  it('kommentar-feil → ærlig melding, ingen label-endringer', async () => {
    const { gh, calls } = mockGh([{ status: 502 }]);
    const msg = await executeAction({ kind: 'snooze_issue', issue: 1229 }, gh);
    expect(calls).toHaveLength(1);
    expect(msg).toContain('502');
  });

  it('annen feil enn 404 på label-fjerning → ærlig melding', async () => {
    const { gh } = mockGh([
      { status: 201 },
      { status: 200 },
      { status: 500 },
    ]);
    const msg = await executeAction({ kind: 'snooze_issue', issue: 1229 }, gh);
    expect(msg).toContain('500');
    expect(msg).toContain('manuelt');
  });
});

// Smedens deteksjons-regex (docs/loops/kontrakt-smeden.md) skal fange eier-svar
// og ALDRI dropp-/utsett-kvitteringene — én kanonisk streng, test-låst her.
describe('svar-streng-kontrakten (smedens deteksjons-regex)', () => {
  const DETECTION_RE = /^Eierbeslutning via Discord: \*\*(A|B)\*\*/;

  async function emittedCommentBody(action: Parameters<typeof executeAction>[0]) {
    const { gh, calls } = mockGh([{ status: 201 }, { status: 200 }, { status: 200 }, { status: 200 }]);
    await executeAction(action, gh);
    return (calls[0].body as { body: string }).body;
  }

  it('answer-kommentaren matcher regexen', async () => {
    const body = await emittedCommentBody({ kind: 'answer', issue: 1104, choice: 'A' });
    expect(body).toMatch(DETECTION_RE);
  });

  it('dropp-kommentaren matcher IKKE (ingen falsk A/B-parse)', async () => {
    const body = await emittedCommentBody({ kind: 'drop_issue', issue: 1229 });
    expect(body).not.toMatch(DETECTION_RE);
  });

  it('utsett-kommentaren matcher IKKE (ingen falsk A/B-parse)', async () => {
    const body = await emittedCommentBody({ kind: 'snooze_issue', issue: 1229 });
    expect(body).not.toMatch(DETECTION_RE);
  });
});

describe('executeAction: merge_pr', () => {
  it('grønn ikke-draft PR: henter PR, sjekker CI, rebase-merger', async () => {
    const { gh, calls } = mockGh([
      { status: 200, json: greenPr },
      { status: 200, json: greenCi },
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
      { status: 200, json: greenCi },
      { status: 200, json: { data: {} } },
      { status: 200, json: { merged: true } },
    ]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'GRAPHQL', 'PUT']);
    expect(msg).toContain('rebase-merget');
  });

  it('rød CI → nekter å merge, navngir konklusjonen', async () => {
    const { gh, calls } = mockGh([
      { status: 200, json: greenPr },
      { status: 200, json: { workflow_runs: [{ id: 1, status: 'completed', conclusion: 'failure' }] } },
    ]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(calls).toHaveLength(2);
    expect(msg).toContain('ikke grønn');
    expect(msg).toContain('failure');
  });

  it('velger nyeste CI-kjøring (høyeste id) ved re-kjøring', async () => {
    const { gh } = mockGh([
      { status: 200, json: greenPr },
      {
        status: 200,
        json: {
          workflow_runs: [
            { id: 1, status: 'completed', conclusion: 'failure' }, // gammel
            { id: 2, status: 'completed', conclusion: 'success' }, // nyeste
          ],
        },
      },
      { status: 200, json: { merged: true } },
    ]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(msg).toContain('rebase-merget');
  });

  it('CI fortsatt i gang → vent-melding, ingen merge', async () => {
    const { gh, calls } = mockGh([
      { status: 200, json: greenPr },
      { status: 200, json: { workflow_runs: [{ id: 1, status: 'in_progress', conclusion: null }] } },
    ]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(calls).toHaveLength(2);
    expect(msg).toContain('kjører fortsatt');
  });

  it('ingen CI-kjøring enda → vent-melding, ingen merge', async () => {
    const { gh } = mockGh([
      { status: 200, json: greenPr },
      { status: 200, json: { workflow_runs: [] } },
    ]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(msg).toContain('Fant ingen CI-kjøring');
  });

  it('lukket PR → ingenting å merge', async () => {
    const { gh } = mockGh([{ status: 200, json: { ...greenPr, state: 'closed' } }]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(msg).toContain('ikke åpen');
  });

  it('merge-feil fra GitHub videreformidles med grunn', async () => {
    const { gh } = mockGh([
      { status: 200, json: greenPr },
      { status: 200, json: greenCi },
      { status: 405, json: { message: 'Base branch was modified' } },
    ]);
    const msg = await executeAction({ kind: 'merge_pr', pr: 1112 }, gh);
    expect(msg).toContain('Base branch was modified');
  });
});

// ── publish_lansering (#1207) ────────────────────────────────────────────────

const PROPOSAL_JSON =
  '{"title":"Premiebord og sponsorer","body":"Legg inn et premiebord på runden.","link":"/opprett-spill","cta_label":"Sett opp en runde"}';

const tavleComment = {
  body: `📣 Ukens lansering\n\n\`\`\`json\n${PROPOSAL_JSON}\n\`\`\`\n`,
  issue_url: 'https://api.github.com/repos/jdlarssen/golf-app/issues/1206',
};

function mockDeps(overrides: Partial<LanseringDeps> = {}): LanseringDeps {
  return {
    findPublisherUserId: vi.fn(async () => 'admin-uuid'),
    wasRecentlyPublished: vi.fn(async () => false),
    publish: vi.fn(async () => ({ recipientCount: 18 })),
    countPublishedThisMonth: vi.fn(async () => 2),
    monthLabel: () => 'juli 2026',
    ...overrides,
  };
}

const publishAction = { kind: 'publish_lansering', commentId: 4938711829 } as const;

describe('executeAction: publish_lansering', () => {
  it('uten deps → ærlig melding, ingen GitHub-kall', async () => {
    const { gh, calls } = mockGh([{ status: 200 }]);
    const msg = await executeAction(publishAction, gh);
    expect(msg).toContain('publiser manuelt');
    expect(calls).toHaveLength(0);
  });

  it('happy path: henter kommentar, publiserer, markerer tavla, teller måned', async () => {
    const { gh, calls } = mockGh([
      { status: 200, json: tavleComment },
      { status: 201 }, // ✅-markør
    ]);
    const deps = mockDeps();
    const msg = await executeAction(publishAction, gh, deps);

    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: `/repos/${LOOP_REPO}/issues/comments/4938711829`,
    });
    expect(deps.publish).toHaveBeenCalledWith({
      title: 'Premiebord og sponsorer',
      body: 'Legg inn et premiebord på runden.',
      link: '/opprett-spill',
      cta_label: 'Sett opp en runde',
      createdByUserId: 'admin-uuid',
    });
    expect(calls[1]).toMatchObject({
      method: 'POST',
      path: `/repos/${LOOP_REPO}/issues/1206/comments`,
    });
    expect((calls[1].body as { body: string }).body).toContain('✅ Publisert: Premiebord og sponsorer');
    expect(msg).toContain('18 brukere');
    expect(msg).toContain('nr. 2 i juli 2026');
  });

  it('slettet kommentar (404) → ærlig melding, ingen publisering', async () => {
    const { gh } = mockGh([{ status: 404 }]);
    const deps = mockDeps();
    const msg = await executeAction(publishAction, gh, deps);
    expect(msg).toContain('404');
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it('kommentar uten forslags-blokk → ærlig melding, ingen publisering', async () => {
    const { gh } = mockGh([{ status: 200, json: { body: 'bare tekst', issue_url: tavleComment.issue_url } }]);
    const deps = mockDeps();
    const msg = await executeAction(publishAction, gh, deps);
    expect(msg).toContain('publiser manuelt');
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it('forslag som ikke validerer (ekstern lenke) → navngir feilen, ingen publisering', async () => {
    const badComment = {
      ...tavleComment,
      body: '```json\n{"title":"T","body":"B","link":"https://evil.example"}\n```',
    };
    const { gh } = mockGh([{ status: 200, json: badComment }]);
    const deps = mockDeps();
    const msg = await executeAction(publishAction, gh, deps);
    expect(msg).toContain('link_must_be_internal');
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it('dobbel-tapp: allerede publisert → varsel, publish IKKE kalt', async () => {
    const { gh } = mockGh([{ status: 200, json: tavleComment }]);
    const deps = mockDeps({ wasRecentlyPublished: vi.fn(async () => true) });
    const msg = await executeAction(publishAction, gh, deps);
    expect(msg).toContain('allerede publisert');
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it('ingen admin-bruker → ærlig melding, publish IKKE kalt', async () => {
    const { gh } = mockGh([{ status: 200, json: tavleComment }]);
    const deps = mockDeps({ findPublisherUserId: vi.fn(async () => null) });
    const msg = await executeAction(publishAction, gh, deps);
    expect(msg).toContain('admin');
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it('markør-post feiler ETTER publisering → suksessmelding med caveat', async () => {
    const { gh } = mockGh([
      { status: 200, json: tavleComment },
      { status: 500 },
    ]);
    const deps = mockDeps();
    const msg = await executeAction(publishAction, gh, deps);
    expect(deps.publish).toHaveBeenCalled();
    expect(msg).toContain('Publisert');
    expect(msg).toContain('fikk ikke markert tavla');
  });

  it('markør-post KASTER (nettverksfeil) etter publisering → suksessmelding med caveat', async () => {
    const rest = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, json: tavleComment })
      .mockRejectedValueOnce(new Error('fetch failed'));
    const gh: GitHubClient = { rest, graphql: vi.fn() };
    const deps = mockDeps();
    const msg = await executeAction(publishAction, gh, deps);
    expect(deps.publish).toHaveBeenCalled();
    expect(msg).toContain('Publisert');
    expect(msg).toContain('fikk ikke markert tavla');
  });

  it('månedstelling feiler → publisering rapporteres likevel, uten tall', async () => {
    const { gh } = mockGh([
      { status: 200, json: tavleComment },
      { status: 201 },
    ]);
    const deps = mockDeps({
      countPublishedThisMonth: vi.fn(async () => {
        throw new Error('db nede');
      }),
    });
    const msg = await executeAction(publishAction, gh, deps);
    expect(msg).toContain('18 brukere');
    expect(msg).not.toContain('nr.');
  });
});
