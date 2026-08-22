import { describe, expect, it, vi } from 'vitest';
import {
  classifyAutoMerge,
  closeLinkedIssues,
  closingIssueNumbers,
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
    // #1623: mal-teksten i CLAUDE.md foreskrev denne headingen, men regexen
    // krevde at «produktvalg» sto først. PR #1620 — et ekte produktvalg — ble
    // derfor auto-merget forbi eieren. Regresjonslås.
    ['## Alternativer (produktvalg)', true],
    // Prefiks foran ordet er greit (emoji, nummerering).
    ['## ⚖️ Produktvalg', true],
    // Bestemt form er idiomatisk norsk og teller — regelen lover en heading som
    // INNEHOLDER ordet, så en ordgrense her ville latt doccen love mer enn koden gir.
    ['## Produktvalget', true],
    ['## Produktvalgene vi vurderte', true],
    // `#` uten mellomrom foran teksten er ikke en heading, heller ikke når
    // linjeskiftet står imellom (`\s` ville krysset det).
    ['##\nEt produktvalg', false],
    // Bevisst fail-closed: en negasjon holder også merge-porten. Billigere enn
    // å miste en eier-beslutning — ikke «fiks» dette.
    ['## Ingen produktvalg', true],
    // Prosa uten heading = IKKE treff.
    ['Alternativer vurdert: A og B, valgte A.', false],
    ['Vi har et produktvalg her, men bygde A.', false],
    ['#Alternativ A', false], // markdown krever mellomrom etter #
    ['## Alternativ F', false], // utenfor a–e
    // Heading uten ordet «produktvalg» og uten «Alternativ a–e» teller ikke —
    // ellers ville rene tekniske PR-er blitt lest som valg.
    ['## Alternativer vurdert', false],
    ['## Teknisk', false],
  ])('%s → %s', (body, expected) => {
    expect(hasChoiceMarker(body)).toBe(expected);
  });

  it('null/undefined er ikke markør', () => {
    expect(hasChoiceMarker(null)).toBe(false);
    expect(hasChoiceMarker(undefined)).toBe(false);
  });

  it('bruker ikke kvadratisk tid på en body full av mellomrom', () => {
    // Regresjonslås på den atomiske grupperingen i CHOICE_MARKER. Uten den
    // backtracker motoren gjennom mellomrom-løpet for hvert startpunkt, og
    // denne bodyen tar ~3 sekunder i stedet for et brøkdels millisekund.
    // GitHub tillater 65 536 tegn i en PR-body, så taket er reelt.
    const body = `#${' '.repeat(65_536)}x`;

    const start = performance.now();
    const result = hasChoiceMarker(body);
    const elapsedMs = performance.now() - start;

    expect(result).toBe(false);
    // Rikelig margin: faktisk måling er ~0,1 ms, den patologiske varianten ~3000 ms.
    expect(elapsedMs).toBeLessThan(500);
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

// ── closingIssueNumbers ──────────────────────────────────────────────────────

describe('closingIssueNumbers', () => {
  it.each([
    ['Close #7', [7]],
    ['Closes #7', [7]],
    ['closed #7', [7]],
    ['Fix #7', [7]],
    ['fixes #7', [7]],
    ['FIXED #7', [7]],
    ['Resolve #7', [7]],
    ['resolves #7', [7]],
    ['Resolved #7', [7]],
  ])('%s → %s', (body, expected) => {
    expect(closingIssueNumbers(body)).toEqual(expected);
  });

  it.each([
    ['Refs #7'],
    ['refs #7'],
    ['Ref #7'],
    ['Part of #7'],
    // Ordgrense: «prefix #7» er ikke «fix #7».
    ['Se prefix #7'],
    // Nøkkelordet må stå rett foran #N med mellomrom.
    ['Closes issue 7'],
    ['closes#7'],
  ])('%s lukker ikke', (body) => {
    expect(closingIssueNumbers(body)).toEqual([]);
  });

  it('trekker ut alle closing-referanser og hopper over de ikke-lukkende', () => {
    const body = 'Closes #1406\nRefs #1406\nPart of #480\n\nFixes #12 og resolves #7.';
    expect(closingIssueNumbers(body).sort((a, b) => a - b)).toEqual([7, 12, 1406]);
  });

  it('dedupliserer', () => {
    expect(closingIssueNumbers('Closes #7\nfixes #7\nResolved #7')).toEqual([7]);
  });

  it('tom for body uten closing-referanser', () => {
    expect(closingIssueNumbers('Bare en tagline.')).toEqual([]);
    expect(closingIssueNumbers('')).toEqual([]);
    expect(closingIssueNumbers(null)).toEqual([]);
    expect(closingIssueNumbers(undefined)).toEqual([]);
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
    commentBodies: [],
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

  // #1656: doccene har alltid tillatt at alternativ-seksjonen står i en PR-kommentar
  // (nattkjøreren gjengir den DER), men porten leste kun body-en → valget ble
  // auto-merget forbi eieren. Samme utfall som #1623, annen vei inn.
  it('valg-markør kun i en PR-kommentar → card', () => {
    const out = classifyAutoMerge({
      ...base,
      commentBodies: ['🤖 Bygget A.\n\n## Alternativer (produktvalg)\nAnbefaling: A.'],
    });
    expect(out.outcome).toBe('card');
    expect(out.demotedReason).toContain('produktvalg-markør');
  });

  it('valg-markør i én av flere kommentarer → card', () => {
    const out = classifyAutoMerge({
      ...base,
      commentBodies: ['Ser bra ut.', 'Rebaset.', '## Alternativ C\nEn tredje vei.', 'Klar.'],
    });
    expect(out.outcome).toBe('card');
  });

  it('kommentarer uten markør → auto-merge (prosa teller ikke)', () => {
    const out = classifyAutoMerge({
      ...base,
      commentBodies: ['Vurderte alternativer: A og B — rent teknisk valg.', 'CI grønn.'],
    });
    expect(out).toEqual({ outcome: 'auto-merge', demotedReason: null });
  });

  it('markør i body + tomme kommentarer → card (regresjon)', () => {
    const out = classifyAutoMerge({
      ...base,
      body: 'Closes #1\n\n## Produktvalg\nVelg.',
      commentBodies: [],
    });
    expect(out.outcome).toBe('card');
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

  // #1520: re-sjekken deler classifyChecks med kortet, så en kansellert
  // post-card-check (kortets EGEN jobb, kansellert av concurrency) skal ikke
  // lese som rød CI her heller.
  it('kortets egen post-card-check ignoreres i re-sjekken', async () => {
    const { gh, calls } = mockGh([
      { status: 200, json: openPr },
      {
        status: 200,
        json: {
          check_runs: [
            { name: 'verify', status: 'completed', conclusion: 'success' },
            { name: 'post-card', status: 'completed', conclusion: 'cancelled' },
          ],
        },
      },
      { status: 200, json: { merged: true } },
    ]);
    const res = await mergePullRequest({ gh, repo: REPO, prNumber: 1406, headSha: 'abc123' });
    expect(res).toEqual({ ok: true });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'PUT']);
  });
});

// ── closeLinkedIssues (injisert klient) ──────────────────────────────────────

describe('closeLinkedIssues', () => {
  const openIssue = { number: 1600, state: 'open' };
  const closedIssue = { number: 1600, state: 'closed' };

  it('åpent issue: PATCH-er lukket med state_reason completed + poster kommentar', async () => {
    const { gh, calls } = mockGh([
      { status: 200, json: openIssue },
      { status: 200, json: { state: 'closed' } },
      { status: 201, json: {} },
    ]);
    const res = await closeLinkedIssues({ gh, repo: REPO, issues: [1600], prNumber: 1650 });
    expect(res).toEqual({ closed: [1600], alreadyClosed: [], failed: [] });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PATCH', 'POST']);
    expect(calls[1]).toMatchObject({
      path: `/repos/${REPO}/issues/1600`,
      body: { state: 'closed', state_reason: 'completed' },
    });
    expect(calls[2]?.path).toBe(`/repos/${REPO}/issues/1600/comments`);
    const comment = (calls[2]?.body as { body: string }).body;
    expect(comment).toContain('PR #1650');
    expect(comment).toContain('#1634');
    expect(comment).toContain('_Generated by [Claude Code](https://claude.ai/code)_');
  });

  it('allerede lukket issue: ingen PATCH, ingen kommentar (aldri reopen)', async () => {
    const { gh, calls } = mockGh([{ status: 200, json: closedIssue }]);
    const res = await closeLinkedIssues({ gh, repo: REPO, issues: [1600], prNumber: 1650 });
    expect(res).toEqual({ closed: [], alreadyClosed: [1600], failed: [] });
    expect(calls.map((c) => c.method)).toEqual(['GET']);
  });

  it('feilende oppslag/PATCH svelges — løpet fortsetter til neste issue', async () => {
    const logError = vi.fn();
    const { gh, calls } = mockGh([
      { status: 404 }, // #1 — oppslaget feiler
      { status: 200, json: openIssue }, // #2 — åpent
      { status: 403 }, // #2 — PATCH avvises
    ]);
    const res = await closeLinkedIssues({
      gh,
      repo: REPO,
      issues: [1600, 1601],
      prNumber: 1650,
      logError,
    });
    expect(res).toEqual({ closed: [], alreadyClosed: [], failed: [1600, 1601] });
    // Ingen kommentar postes når lukkingen ikke gikk gjennom.
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'PATCH']);
    expect(logError).toHaveBeenCalledTimes(2);
  });

  it('kommentar-feil felles ikke lukkingen', async () => {
    const logError = vi.fn();
    const { gh } = mockGh([
      { status: 200, json: openIssue },
      { status: 200, json: { state: 'closed' } },
      { status: 500 },
    ]);
    const res = await closeLinkedIssues({
      gh,
      repo: REPO,
      issues: [1600],
      prNumber: 1650,
      logError,
    });
    expect(res).toEqual({ closed: [1600], alreadyClosed: [], failed: [] });
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('kastende klient svelges (best-effort, aldri exception)', async () => {
    const logError = vi.fn();
    const gh: GitHubClient = {
      rest: vi.fn(async () => {
        throw new Error('nett nede');
      }),
      graphql: vi.fn(async () => ({ status: 200, json: null })),
    };
    const res = await closeLinkedIssues({
      gh,
      repo: REPO,
      issues: [1600],
      prNumber: 1650,
      logError,
    });
    expect(res).toEqual({ closed: [], alreadyClosed: [], failed: [1600] });
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('tom liste → ingen API-kall', async () => {
    const { gh, calls } = mockGh([{ status: 200, json: openIssue }]);
    const res = await closeLinkedIssues({ gh, repo: REPO, issues: [], prNumber: 1650 });
    expect(res).toEqual({ closed: [], alreadyClosed: [], failed: [] });
    expect(calls).toEqual([]);
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
