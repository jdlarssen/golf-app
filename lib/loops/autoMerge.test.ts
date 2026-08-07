import { describe, expect, it, vi } from 'vitest';
import {
  classifyAutoMerge,
  dispatchMainVerify,
  hasChoiceMarker,
  isUserVisibleByCommits,
  linkedIssueNumbers,
  mergePullRequest,
  NEVER_AUTO_MERGE_GLOBS,
  shouldDispatchMainVerify,
  touchesNeverList,
  type AutoMergeInput,
} from './autoMerge';
import { type GitHubClient } from './discordActions';

// ── touchesNeverList / NEVER_AUTO_MERGE_GLOBS ────────────────────────────────

describe('touchesNeverList', () => {
  // Minst én fikstur per punktliste-rad i §3 → treff (skal gi knapp-kort).
  it.each([
    ['supabase/migrations/0142_avstand.sql', 'supabase/**'],
    ['app/[locale]/admin/games/[id]/slett/page.tsx', '**/slett/**'],
    ['app/[locale]/profile/slett-konto/page.tsx', '**/slett-konto/**'],
    ['proxy.ts', 'proxy.ts'],
    ['lib/auth/session.ts', 'lib/auth/**'],
    ['lib/supabase/client.ts', 'lib/supabase/**'],
    ['app/api/discord/interactions/route.ts', 'app/api/**'],
    ['app/[locale]/(auth)/login/page.tsx', 'app/[locale]/(auth)/**'],
    ['app/[locale]/betaling/vipps/page.tsx', '**/betaling/**'],
    ['lib/payment/vipps.ts', 'lib/payment/**'],
    ['.github/workflows/ci.yml', '.github/**'],
    ['.githooks/pre-push', '.githooks/**'],
    ['.claude/hooks/bash-guard.sh', '.claude/**'],
  ])('%s treffer aldri-lista', (file) => {
    expect(touchesNeverList([file])).toBe(true);
  });

  it('vanlige app-/lib-filer treffer ikke', () => {
    expect(
      touchesNeverList([
        'app/[locale]/games/[id]/leaderboard/page.tsx',
        'lib/scoring/courseHandicap.ts',
        'components/ui/Button.tsx',
        'docs/loops/discord-pr-kort.md',
      ]),
    ).toBe(false);
  });

  it('slett-konto matcher ikke **/slett/** ved et uhell (egne rader)', () => {
    // `/slett-konto/` inneholder ikke delstrengen `/slett/` — begge rader trengs.
    expect(touchesNeverList(['app/[locale]/profile/slett-konto/page.tsx'])).toBe(true);
    expect(NEVER_AUTO_MERGE_GLOBS).toContain('**/slett/**');
    expect(NEVER_AUTO_MERGE_GLOBS).toContain('**/slett-konto/**');
  });

  it('tom liste treffer ikke', () => {
    expect(touchesNeverList([])).toBe(false);
  });
});

// ── hasChoiceMarker ──────────────────────────────────────────────────────────

describe('hasChoiceMarker', () => {
  it.each([
    ['## Alternativ A', true],
    ['## Alternativ B', true],
    ['### Alternativ C', true],
    ['## Produktvalg', true],
    ['#### produktvalg (små)', true],
    ['Closes #1406\n\nEn tagline.\n\n## Alternativ B\nB-varianten.', true],
    // Prosa uten heading = IKKE treff.
    ['Alternativer vurdert: A og B, valgte A.', false],
    ['Vi har et produktvalg her, men bygde A.', false],
    ['#Alternativ A', false], // markdown krever mellomrom etter #
    ['## Alternativ F', false], // utenfor a–e
    ['## Teknisk', false],
  ])('%s → %s', (body, expected) => {
    expect(hasChoiceMarker(body)).toBe(expected);
  });

  it('null/undefined er ikke markør', () => {
    expect(hasChoiceMarker(null)).toBe(false);
    expect(hasChoiceMarker(undefined)).toBe(false);
  });
});

// ── linkedIssueNumbers ───────────────────────────────────────────────────────

describe('linkedIssueNumbers', () => {
  it('trekker ut og dedupliserer alle lenkede issue-numre', () => {
    const body = 'Closes #1406\nRefs #1406\nPart of #480\n\nFixes #12 og resolves #7.';
    expect(linkedIssueNumbers(body).sort((a, b) => a - b)).toEqual([7, 12, 480, 1406]);
  });

  it('tom for body uten referanser', () => {
    expect(linkedIssueNumbers('Bare en tagline uten referanser.')).toEqual([]);
    expect(linkedIssueNumbers(null)).toEqual([]);
    expect(linkedIssueNumbers(undefined)).toEqual([]);
  });
});

// ── isUserVisibleByCommits ───────────────────────────────────────────────────

describe('isUserVisibleByCommits', () => {
  it('feat/fix/perf uten [no-changelog] er bruker-synlig', () => {
    expect(isUserVisibleByCommits(['feat: legg til avstand til green'])).toBe(true);
    expect(isUserVisibleByCommits(['fix(scoring): rett stableford-summering'])).toBe(true);
    expect(isUserVisibleByCommits(['perf!: cache leaderboard'])).toBe(true);
  });

  it('ikke-bruker-synlige prefikser teller ikke', () => {
    expect(
      isUserVisibleByCommits(['docs: oppdater readme', 'chore(loops): ryddig', 'refactor: flytt']),
    ).toBe(false);
  });

  it('[no-changelog] i meldingen nuller en ellers bruker-synlig commit', () => {
    expect(isUserVisibleByCommits(['fix: test-only\n\n[no-changelog]'])).toBe(false);
  });

  it('én ren feat uten escape er nok, selv blant [no-changelog]-commits (any-kvantor)', () => {
    expect(
      isUserVisibleByCommits(['fix: intern\n\n[no-changelog]', 'feat: ny knapp for spillere']),
    ).toBe(true);
  });
});

// ── classifyAutoMerge (portrekkefølge) ───────────────────────────────────────

describe('classifyAutoMerge', () => {
  const base: AutoMergeInput = {
    baseRef: 'main',
    title: 'Ryddig loop-endring',
    body: 'Closes #1406\n\nEn tagline.',
    changedFiles: ['docs/loops/x.md'],
    commitMessages: ['chore(loops): ryddig'],
    prLabels: [],
    needsDecisionIssue: false,
  };

  it('ren ikke-bruker-synlig PR mot main → auto-merge', () => {
    expect(classifyAutoMerge(base)).toEqual({ outcome: 'auto-merge', demotedReason: null });
  });

  it('base ≠ main → card (og vinner over alt annet)', () => {
    const out = classifyAutoMerge({ ...base, baseRef: 'staging', title: 'WIP', changedFiles: ['supabase/x.sql'] });
    expect(out.outcome).toBe('card');
    expect(out.demotedReason).toContain('≠ main');
  });

  it('WIP i tittel → card', () => {
    expect(classifyAutoMerge({ ...base, title: 'WIP: halvferdig' }).demotedReason).toBe('WIP i tittel');
    expect(classifyAutoMerge({ ...base, title: '[wip] noe' }).outcome).toBe('card');
  });

  it('aldri-lista → card', () => {
    const out = classifyAutoMerge({ ...base, changedFiles: ['supabase/migrations/1.sql'] });
    expect(out).toEqual({ outcome: 'card', demotedReason: 'endrer fil på aldri-lista' });
  });

  it('valg-markør i body → card', () => {
    const out = classifyAutoMerge({ ...base, body: 'Closes #1\n\n## Alternativ B\nB.' });
    expect(out.demotedReason).toContain('produktvalg-markør');
  });

  it('lenket issue trenger beslutning → card', () => {
    const out = classifyAutoMerge({ ...base, needsDecisionIssue: true });
    expect(out.demotedReason).toContain('needs-decision');
  });

  it('bruker-synlig uten staging-verified → card', () => {
    const out = classifyAutoMerge({ ...base, commitMessages: ['feat: ny flate'] });
    expect(out).toEqual({ outcome: 'card', demotedReason: 'bruker-synlig uten staging-verified' });
  });

  it('bruker-synlig MED staging-verified → auto-merge', () => {
    const out = classifyAutoMerge({
      ...base,
      commitMessages: ['feat: ny flate'],
      prLabels: ['staging-verified'],
    });
    expect(out).toEqual({ outcome: 'auto-merge', demotedReason: null });
  });

  it('aldri-lista slår staging-porten (rekkefølge)', () => {
    // Bruker-synlig OG rører supabase → aldri-lista treffer først.
    const out = classifyAutoMerge({
      ...base,
      commitMessages: ['feat: ny flate'],
      changedFiles: ['supabase/x.sql'],
    });
    expect(out.demotedReason).toBe('endrer fil på aldri-lista');
  });
});

// ── mergePullRequest (injisert klient) ───────────────────────────────────────

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

const REPO = 'jdlarssen/golf-app';
const openPr = { node_id: 'PR_x', state: 'open', draft: false, head: { sha: 'abc123' } };
const greenChecks = { check_runs: [{ status: 'completed', conclusion: 'success' }] };

describe('mergePullRequest', () => {
  it('suksess: åpen + grønn → rebase-merger med sha-guard', async () => {
    const { gh, calls } = mockGh([
      { status: 200, json: openPr },
      { status: 200, json: greenChecks },
      { status: 200, json: { merged: true } },
    ]);
    const res = await mergePullRequest({ gh, repo: REPO, prNumber: 1406, headSha: 'abc123' });
    expect(res).toEqual({ ok: true });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'PUT']);
    expect(calls[2]).toMatchObject({
      path: `/repos/${REPO}/pulls/1406/merge`,
      body: { merge_method: 'rebase', sha: 'abc123' },
    });
  });

  it('draft-PR → fallback-signal, ingen av-draft, ingen merge (#1516)', async () => {
    const { gh, calls } = mockGh([{ status: 200, json: { ...openPr, draft: true } }]);
    const res = await mergePullRequest({ gh, repo: REPO, prNumber: 1406, headSha: 'abc123' });
    expect(res).toEqual({ ok: false, reason: 'PR er draft — økta jobber fortsatt' });
    // Fail-closed: kun PR-oppslaget — aldri GraphQL-av-draft, aldri PUT …/merge.
    expect(calls.map((c) => c.method)).toEqual(['GET']);
  });

  it('409 sha-mismatch (nye commits) → fallback-signal', async () => {
    const { gh } = mockGh([
      { status: 200, json: openPr },
      { status: 200, json: greenChecks },
      { status: 409, json: { message: 'Head branch was modified' } },
    ]);
    const res = await mergePullRequest({ gh, repo: REPO, prNumber: 1406, headSha: 'abc123' });
    expect(res).toEqual({ ok: false, reason: 'merge feilet: Head branch was modified' });
  });

  it('405 konflikt/ikke-mergeable → fallback-signal', async () => {
    const { gh } = mockGh([
      { status: 200, json: openPr },
      { status: 200, json: greenChecks },
      { status: 405, json: { message: 'Pull Request is not mergeable' } },
    ]);
    const res = await mergePullRequest({ gh, repo: REPO, prNumber: 1406, headSha: 'abc123' });
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ reason: expect.stringContaining('not mergeable') });
  });

  it('PR ikke lenger åpen → fallback-signal', async () => {
    const { gh } = mockGh([{ status: 200, json: { ...openPr, state: 'closed' } }]);
    const res = await mergePullRequest({ gh, repo: REPO, prNumber: 1406, headSha: 'abc123' });
    expect(res).toEqual({ ok: false, reason: 'PR ikke lenger åpen (closed)' });
  });

  it('CI ikke grønn ved re-sjekk → fallback-signal', async () => {
    const { gh } = mockGh([
      { status: 200, json: openPr },
      { status: 200, json: { check_runs: [{ status: 'completed', conclusion: 'failure' }] } },
    ]);
    const res = await mergePullRequest({ gh, repo: REPO, prNumber: 1406, headSha: 'abc123' });
    expect(res).toEqual({ ok: false, reason: 'CI red ved re-sjekk' });
  });
});

// ── shouldDispatchMainVerify ─────────────────────────────────────────────────

describe('shouldDispatchMainVerify', () => {
  it('kode-endringer → dispatch', () => {
    expect(shouldDispatchMainVerify(['lib/scoring/x.ts', 'docs/y.md'])).toBe(true);
  });

  it('kun docs/md/.forge → hopp over (kan ikke komponere rød main)', () => {
    expect(shouldDispatchMainVerify(['docs/loops/x.md', 'CHANGELOG.md', '.forge/contracts/1.md'])).toBe(false);
  });

  it('tom liste → hopp over', () => {
    expect(shouldDispatchMainVerify([])).toBe(false);
  });
});

describe('dispatchMainVerify', () => {
  it('POST-er workflow-dispatch og tolker 204 som suksess', async () => {
    const { gh, calls } = mockGh([{ status: 204 }]);
    const res = await dispatchMainVerify(gh, REPO);
    expect(res).toEqual({ ok: true, status: 204 });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: `/repos/${REPO}/actions/workflows/main-verify.yml/dispatches`,
      body: { ref: 'main' },
    });
  });

  it('ikke-204 → ok=false (utløser fail-loud i post-steget)', async () => {
    const { gh } = mockGh([{ status: 403 }]);
    expect(await dispatchMainVerify(gh, REPO)).toEqual({ ok: false, status: 403 });
  });
});
