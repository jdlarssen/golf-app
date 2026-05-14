# Autonom overvåking — Implementeringsplan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bygg de tre autonome agentene (hourly monitor, PR merge watcher, morning report) som beskrevet i [designdokumentet](2026-05-14-autonomous-monitoring-design.md), med strenge guardrails for auto-push og full sporbarhet via `agent_runs`/`agent_findings`-tabellene.

**Architecture:** Tre scheduled tasks via `mcp__scheduled-tasks__create_scheduled_task`, alle drevet av Sonnet. Hver agent får et system-prompt-fil (markdown, sjekket inn i `agents/`) som dikterer prosedyren. Helpers i `lib/agent-monitor/` (TypeScript, TDD-utviklet) håndterer fingerprinting, blast-radius-kontroll og mail-rendering. Kill-switch via Vercel-env-variabel `MONITORING_ENABLED`.

**Tech Stack:** TypeScript, Vitest, Supabase (migrations + service-role client), Resend, scheduled-tasks MCP, gh CLI, git.

**Subagent-routing:** Implementer-tasks → Sonnet (mekanisk arbeid med tett spec). Agent-prompt-tasks (5, 6, 7) → reviewer på Opus etter implementering (prompt-design krever skjønn). Smoke-test (12, 13) → Sonnet.

---

## Phase 1 — Database foundation

### Task 1: Migration `0023_agent_monitoring.sql`

**Files:**
- Create: `supabase/migrations/0023_agent_monitoring.sql`
- Apply via: `mcp__36be25a6-2d72-41c3-a675-2352133ed510__apply_migration`

**Step 1: Write the migration**

```sql
-- supabase/migrations/0023_agent_monitoring.sql
-- Internal tables for the autonomous monitoring agent.
-- No RLS policies = no access for anon/authenticated.
-- Only service_role can read/write (agent uses service-key).

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  agent_kind text not null check (agent_kind in ('hourly', 'merge_watcher', 'morning_report')),
  duration_ms int,
  findings_count int not null default 0,
  notes text
);

create table public.agent_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  detected_at timestamptz not null default now(),
  source text not null check (source in ('vercel', 'supabase_pg', 'supabase_auth', 'supabase_advisor', 'resend')),
  severity text not null check (severity in ('safe_fix', 'pr_worthy', 'needs_judgment')),
  fingerprint text not null,
  summary text not null,
  raw_payload jsonb,
  action_taken text check (action_taken in ('auto_pushed', 'pr_opened', 'reported', 'skipped_duplicate')),
  action_ref text,
  resolved_at timestamptz
);

create index agent_findings_fingerprint_idx on public.agent_findings (fingerprint, resolved_at);
create index agent_runs_ran_at_idx on public.agent_runs (ran_at desc);

alter table public.agent_runs enable row level security;
alter table public.agent_findings enable row level security;
```

**Step 2: Apply via Supabase MCP**

Use `mcp__36be25a6-2d72-41c3-a675-2352133ed510__apply_migration` with `name: "0023_agent_monitoring"` and the SQL above.

**Step 3: Verify tables exist**

Use `mcp__36be25a6-2d72-41c3-a675-2352133ed510__list_tables` with schema `public`.
Expected: `agent_runs` and `agent_findings` appear in the list.

**Step 4: Commit**

```bash
git add supabase/migrations/0023_agent_monitoring.sql
git commit -m "feat(agent-monitor): add agent_runs and agent_findings tables

Internal tables for the autonomous monitoring agent. No RLS policies
means no access for anon/authenticated — only service_role can touch
them. The fingerprint index supports dedup; the ran_at desc index
supports the morning-report query."
```

Note: this is a feat-commit but it's pure infra (no user-visible behavior), so the commit-msg-hook will block on package.json/CHANGELOG. Use prefix `chore(agent-monitor):` instead — agent-monitoring is internal tooling, not user-facing.

---

## Phase 2 — TypeScript helpers (TDD)

### Task 2: Fingerprint helper

**Files:**
- Create: `lib/agent-monitor/fingerprint.ts`
- Test: `lib/agent-monitor/fingerprint.test.ts`

**Step 1: Write the failing tests**

```typescript
// lib/agent-monitor/fingerprint.test.ts
import { describe, it, expect } from 'vitest';
import { fingerprint } from './fingerprint';

describe('fingerprint', () => {
  it('produces a stable hash for the same input', () => {
    const a = fingerprint({ source: 'vercel', message: 'TypeError: x is undefined' });
    const b = fingerprint({ source: 'vercel', message: 'TypeError: x is undefined' });
    expect(a).toBe(b);
  });

  it('produces a different hash for different sources', () => {
    const a = fingerprint({ source: 'vercel', message: 'same' });
    const b = fingerprint({ source: 'supabase_pg', message: 'same' });
    expect(a).not.toBe(b);
  });

  it('strips timestamps, request IDs, and UUIDs before hashing', () => {
    // Two errors that are "the same bug" but with different request-IDs
    const a = fingerprint({
      source: 'vercel',
      message: 'Error in req_abc123 at 2026-05-14T03:14:22.123Z: user 550e8400-e29b-41d4-a716-446655440000 not found',
    });
    const b = fingerprint({
      source: 'vercel',
      message: 'Error in req_xyz789 at 2026-05-14T04:55:01.000Z: user 6ba7b810-9dad-11d1-80b4-00c04fd430c8 not found',
    });
    expect(a).toBe(b);
  });

  it('strips line/column numbers in stack traces', () => {
    const a = fingerprint({
      source: 'vercel',
      message: 'at /app/lib/foo.ts:42:13\nat /app/lib/bar.ts:18:5',
    });
    const b = fingerprint({
      source: 'vercel',
      message: 'at /app/lib/foo.ts:99:8\nat /app/lib/bar.ts:22:1',
    });
    expect(a).toBe(b);
  });

  it('returns a 16-char hex string', () => {
    const fp = fingerprint({ source: 'vercel', message: 'anything' });
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});
```

**Step 2: Run and verify they fail**

```bash
npx vitest run lib/agent-monitor/fingerprint.test.ts
```

Expected: ALL FAIL with "Cannot find module './fingerprint'".

**Step 3: Implement**

```typescript
// lib/agent-monitor/fingerprint.ts
import { createHash } from 'node:crypto';

export type FingerprintInput = {
  source: 'vercel' | 'supabase_pg' | 'supabase_auth' | 'supabase_advisor' | 'resend';
  message: string;
};

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g;
const REQ_ID_RE = /\breq_[a-z0-9]+\b/gi;
const LINE_COL_RE = /:(\d+):(\d+)\b/g;

function normalize(message: string): string {
  return message
    .replace(UUID_RE, '<uuid>')
    .replace(ISO_DATE_RE, '<ts>')
    .replace(REQ_ID_RE, '<req>')
    .replace(LINE_COL_RE, ':<l>:<c>')
    .trim();
}

export function fingerprint(input: FingerprintInput): string {
  const normalized = `${input.source}|${normalize(input.message)}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
```

**Step 4: Run tests, verify pass**

```bash
npx vitest run lib/agent-monitor/fingerprint.test.ts
```

Expected: 5/5 pass.

**Step 5: Commit**

```bash
git add lib/agent-monitor/fingerprint.ts lib/agent-monitor/fingerprint.test.ts
git commit -m "chore(agent-monitor): add fingerprint helper for dedup

Hashes a finding's source + normalized message so the agent can
detect 'this is the same bug we saw last hour' and skip it.
Strips UUIDs, ISO timestamps, request IDs, and line:col numbers
before hashing so transient identifiers don't fork the fingerprint."
```

---

### Task 3: Blast-radius guardrail

**Files:**
- Create: `lib/agent-monitor/blast-radius.ts`
- Test: `lib/agent-monitor/blast-radius.test.ts`

**Step 1: Write the failing tests**

```typescript
// lib/agent-monitor/blast-radius.test.ts
import { describe, it, expect } from 'vitest';
import { isSafeToAutoPush } from './blast-radius';

describe('isSafeToAutoPush', () => {
  it('rejects diffs touching lib/scoring/', () => {
    const result = isSafeToAutoPush({
      files: ['lib/scoring/bestBall.ts'],
      linesChanged: 3,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('lib/scoring');
  });

  it('rejects diffs touching supabase/migrations/', () => {
    const result = isSafeToAutoPush({
      files: ['supabase/migrations/0024_new.sql'],
      linesChanged: 5,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects diffs touching proxy.ts', () => {
    expect(isSafeToAutoPush({ files: ['proxy.ts'], linesChanged: 1 }).ok).toBe(false);
  });

  it('rejects diffs touching lib/sync/', () => {
    expect(isSafeToAutoPush({ files: ['lib/sync/worker.ts'], linesChanged: 1 }).ok).toBe(false);
  });

  it('rejects diffs touching more than 1 file', () => {
    const result = isSafeToAutoPush({
      files: ['lib/mail/inviteNotification.ts', 'app/page.tsx'],
      linesChanged: 4,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('1 file');
  });

  it('rejects diffs with more than 10 lines changed', () => {
    const result = isSafeToAutoPush({
      files: ['app/page.tsx'],
      linesChanged: 11,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('10 line');
  });

  it('accepts a 1-file, 5-line change to lib/mail/', () => {
    const result = isSafeToAutoPush({
      files: ['lib/mail/inviteNotification.ts'],
      linesChanged: 5,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a copy-typo fix in a tsx file', () => {
    expect(isSafeToAutoPush({ files: ['app/games/page.tsx'], linesChanged: 1 }).ok).toBe(true);
  });
});
```

**Step 2: Run, verify fail**

```bash
npx vitest run lib/agent-monitor/blast-radius.test.ts
```

Expected: 8 FAIL.

**Step 3: Implement**

```typescript
// lib/agent-monitor/blast-radius.ts
//
// Guardrail that decides if a proposed diff is allowed to bypass PR review.
// This is a SAFETY NET, not the primary classifier — the agent itself decides
// "this looks like a copy typo" or "this looks like a retry tweak". The
// guardrail's job is to refuse anything outside the agreed safe-list shape,
// regardless of what the agent thinks.

const NEVER_AUTO_PUSH_PATHS = [
  'lib/scoring/',
  'supabase/migrations/',
  'lib/sync/',
  'proxy.ts',
  'app/api/auth/',
  'app/login/',
  'middleware.ts',
];

const MAX_FILES = 1;
const MAX_LINES = 10;

export type BlastRadiusInput = {
  files: string[];
  linesChanged: number;
};

export type BlastRadiusResult = { ok: true } | { ok: false; reason: string };

export function isSafeToAutoPush(input: BlastRadiusInput): BlastRadiusResult {
  if (input.files.length > MAX_FILES) {
    return { ok: false, reason: `touches ${input.files.length} files (max ${MAX_FILES})` };
  }
  if (input.linesChanged > MAX_LINES) {
    return { ok: false, reason: `${input.linesChanged} lines changed (max ${MAX_LINES})` };
  }
  for (const file of input.files) {
    for (const banned of NEVER_AUTO_PUSH_PATHS) {
      if (file === banned || file.startsWith(banned)) {
        return { ok: false, reason: `touches ${banned} (always PR)` };
      }
    }
  }
  return { ok: true };
}
```

**Step 4: Run tests, verify pass**

```bash
npx vitest run lib/agent-monitor/blast-radius.test.ts
```

Expected: 8/8 pass.

**Step 5: Commit**

```bash
git add lib/agent-monitor/blast-radius.ts lib/agent-monitor/blast-radius.test.ts
git commit -m "chore(agent-monitor): add blast-radius guardrail

Refuses auto-push if a diff touches scoring/migrations/sync/auth,
exceeds 1 file, or exceeds 10 changed lines. The agent itself
decides what to fix; this is the safety net that keeps it inside
the agreed safe-list shape."
```

---

### Task 4: Morning-mail renderer

**Files:**
- Create: `lib/agent-monitor/morning-mail.ts`
- Test: `lib/agent-monitor/morning-mail.test.ts`

**Step 1: Write the failing tests**

```typescript
// lib/agent-monitor/morning-mail.test.ts
import { describe, it, expect } from 'vitest';
import { renderMorningMail, type MorningMailInput } from './morning-mail';

const baseInput: MorningMailInput = {
  fixed: [],
  pending: [],
  needsJudgment: [],
  totalErrorsLogged: 0,
  totalUsersAffected: 0,
};

describe('renderMorningMail', () => {
  it('returns null when there are no findings (quiet night)', () => {
    expect(renderMorningMail(baseInput)).toBeNull();
  });

  it('renders subject with fixed and pending counts', () => {
    const mail = renderMorningMail({
      ...baseInput,
      fixed: [{ time: '02:14', summary: 'Resend retry tweak', ref: 'abc123', refType: 'commit' }],
      pending: [{ time: '04:22', summary: 'Crash in /admin/avslutt', ref: '42', refType: 'pr' }],
    });
    expect(mail?.subject).toBe('Nattlig oppsummering — 1 fixet, 1 venter på deg');
  });

  it('omits sections that are empty', () => {
    const mail = renderMorningMail({
      ...baseInput,
      fixed: [{ time: '02:14', summary: 'Typo fixed', ref: 'def456', refType: 'commit' }],
    });
    expect(mail?.html).toContain('Jeg fikset');
    expect(mail?.html).not.toContain('Venter på din godkjenning');
    expect(mail?.html).not.toContain('Trenger din vurdering');
  });

  it('renders commit links to github.com/jdlarssen/golf-app', () => {
    const mail = renderMorningMail({
      ...baseInput,
      fixed: [{ time: '02:14', summary: 'X', ref: 'abc123', refType: 'commit' }],
    });
    expect(mail?.html).toContain('https://github.com/jdlarssen/golf-app/commit/abc123');
  });

  it('renders PR links to github.com/jdlarssen/golf-app/pull/N', () => {
    const mail = renderMorningMail({
      ...baseInput,
      pending: [{ time: '04:22', summary: 'X', ref: '42', refType: 'pr' }],
    });
    expect(mail?.html).toContain('https://github.com/jdlarssen/golf-app/pull/42');
  });

  it('escapes HTML in summaries', () => {
    const mail = renderMorningMail({
      ...baseInput,
      fixed: [{ time: '02:14', summary: 'Fixed <script>alert(1)</script>', ref: 'a', refType: 'commit' }],
    });
    expect(mail?.html).not.toContain('<script>alert(1)</script>');
    expect(mail?.html).toContain('&lt;script&gt;');
  });

  it('includes the impact footer', () => {
    const mail = renderMorningMail({
      ...baseInput,
      fixed: [{ time: '02:14', summary: 'X', ref: 'a', refType: 'commit' }],
      totalErrorsLogged: 15,
      totalUsersAffected: 0,
    });
    expect(mail?.text).toContain('15 errors logget');
    expect(mail?.text).toContain('0 brukere påvirket');
  });
});
```

**Step 2: Run, verify fail**

```bash
npx vitest run lib/agent-monitor/morning-mail.test.ts
```

Expected: 7 FAIL.

**Step 3: Implement** (use `lib/mail/inviteNotification.ts:42-85` as the HTML template — same Tørny-brand styling)

```typescript
// lib/agent-monitor/morning-mail.ts
//
// Renders the daily monitoring summary mail. Returns null if there's nothing
// to report (quiet night = no mail). HTML follows the Tørny mail brand
// (forest green + champagne + linen) — same template as lib/mail/inviteNotification.ts.

export type FindingRow = {
  time: string;       // "HH:MM"
  summary: string;    // short Norwegian description
  ref: string;        // commit SHA or PR number
  refType: 'commit' | 'pr';
};

export type MorningMailInput = {
  fixed: FindingRow[];
  pending: FindingRow[];
  needsJudgment: FindingRow[];
  totalErrorsLogged: number;
  totalUsersAffected: number;
};

export type RenderedMail = {
  subject: string;
  html: string;
  text: string;
};

const REPO = 'jdlarssen/golf-app';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function refUrl(row: FindingRow): string {
  return row.refType === 'commit'
    ? `https://github.com/${REPO}/commit/${row.ref}`
    : `https://github.com/${REPO}/pull/${row.ref}`;
}

function refLabel(row: FindingRow): string {
  return row.refType === 'commit' ? 'commit' : `PR #${row.ref}`;
}

function renderSection(title: string, emoji: string, rows: FindingRow[]): string {
  if (rows.length === 0) return '';
  const items = rows
    .map(
      (r) =>
        `<li style="margin:0 0 8px;line-height:1.5;"><strong>${escapeHtml(r.time)}</strong> — ${escapeHtml(r.summary)} (<a href="${refUrl(r)}" style="color:#1B4332;">${refLabel(r)}</a>)</li>`,
    )
    .join('');
  return `<h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;margin:24px 0 12px;color:#1A1813;">${emoji} ${escapeHtml(title)}</h3><ul style="margin:0;padding-left:20px;font-size:15px;">${items}</ul>`;
}

function renderTextSection(title: string, emoji: string, rows: FindingRow[]): string {
  if (rows.length === 0) return '';
  const lines = rows.map((r) => `- ${r.time} — ${r.summary} (${refUrl(r)})`).join('\n');
  return `\n${emoji} ${title}:\n${lines}\n`;
}

export function renderMorningMail(input: MorningMailInput): RenderedMail | null {
  const total = input.fixed.length + input.pending.length + input.needsJudgment.length;
  if (total === 0) return null;

  const subject = `Nattlig oppsummering — ${input.fixed.length} fixet, ${input.pending.length} venter på deg`;

  const html = `<!DOCTYPE html><html lang="nb">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1A1813;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">
        <tr><td>
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.1;margin:0 0 8px;color:#1B4332;">Tørny Agent</h1>
          <p style="font-size:13px;color:#5C5347;margin:0 0 24px;">God morgen!</p>
          ${renderSection('Jeg fikset (auto-push)', '🤖', input.fixed)}
          ${renderSection('Venter på din godkjenning (PR)', '⏳', input.pending)}
          ${renderSection('Trenger din vurdering (ikke fixet)', '🤔', input.needsJudgment)}
          <p style="font-size:13px;color:#5C5347;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
            ${input.totalErrorsLogged} errors logget i går, ${input.totalUsersAffected} brukere påvirket.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text =
    `Tørny Agent — ${subject}\n` +
    renderTextSection('Jeg fikset (auto-push)', '🤖', input.fixed) +
    renderTextSection('Venter på din godkjenning (PR)', '⏳', input.pending) +
    renderTextSection('Trenger din vurdering (ikke fixet)', '🤔', input.needsJudgment) +
    `\n${input.totalErrorsLogged} errors logget i går, ${input.totalUsersAffected} brukere påvirket.\n`;

  return { subject, html, text };
}
```

**Step 4: Run tests, verify pass**

```bash
npx vitest run lib/agent-monitor/morning-mail.test.ts
```

Expected: 7/7 pass.

**Step 5: Commit**

```bash
git add lib/agent-monitor/morning-mail.ts lib/agent-monitor/morning-mail.test.ts
git commit -m "chore(agent-monitor): add morning-mail renderer

Renders the daily monitoring summary in Tørny mail-brand style.
Returns null on a quiet night (no findings → no mail). Drops
empty sections, escapes HTML, links commit-shas and PR numbers
to github.com/jdlarssen/golf-app."
```

---

## Phase 3 — Agent prompts

Each agent runs from a markdown prompt-file. The prompt is the source of truth (sjekket inn), and it gets passed to `mcp__scheduled-tasks__create_scheduled_task` during install.

### Task 5: Hourly monitor prompt

**Files:**
- Create: `agents/monitor-hourly.md`

**Step 1: Write the prompt**

```markdown
# Tørny Hourly Monitor

You are the Tørny monitoring agent. You run once per hour on the scheduled-tasks
infrastructure. Your job is to gather errors from prod, classify them, and act
on the safe ones.

## Kill-switch

FIRST: read the env var MONITORING_ENABLED. If it is "false", write a one-line
note to `agent_runs` (kind: hourly, notes: "killswitch active") and EXIT.

## Step 1: Gather (parallel MCP calls)

Run these four in parallel:

1. **Vercel runtime logs** (last 65 min) — use the Vercel MCP `get_runtime_logs`
   tool for project `prj_...` (look it up in the Vercel MCP project list, the
   only project under the configured team). Filter: level ∈ {error, fatal}.

2. **Supabase pg logs + auth logs** (last 65 min) — use Supabase MCP
   `get_logs` with service "postgres" and "auth". Project id:
   `glofubopddkjhymcbaph`.

3. **Supabase advisors** — use `get_advisors` with type "security" then "performance".
   Track which advisor IDs we've seen before via fingerprint.

4. **Resend events** (last 65 min) — call Resend API
   `GET https://api.resend.com/emails?limit=100` with header
   `Authorization: Bearer $RESEND_API_KEY`. Filter to status ∈
   {bounced, rejected, failed}.

If all four return empty → EXIT immediately. No state-writing, no mail. The only
exception: if it is 00:xx UTC, write a heartbeat row to `agent_runs`
(notes: "heartbeat — no findings") so the morning report knows the agent is alive.

## Step 2: Triage

For each finding, compute fingerprint via the algorithm in
`lib/agent-monitor/fingerprint.ts` (source + normalized message →
sha256[:16]). Query `agent_findings` for matching `fingerprint` with
`resolved_at IS NULL` from the last 24 hours. If a match exists → skip
(action_taken: 'skipped_duplicate'), do not act again.

Classify each remaining finding:

- **safe_fix** if it matches one of these patterns:
  1. Resend mail-helper threw rate-limit or transient 5xx (Resend source)
  2. A norwegian copy string in a `.tsx`/`.ts` file has an obvious typo
  3. ESLint warning that is auto-fixable (`prefer-const`, `no-unused-vars`)
  4. Stack trace points to a single `Cannot read property of undefined` line
     and the fix is a defensive `?.` or early-return

- **pr_worthy** if it is fixable but doesn't match safe-list, e.g. a server
  action throwing on invalid input — needs a clear error message instead.

- **needs_judgment** if the root cause is unclear or the fix has ambiguity
  (e.g. Supabase advisor saying "consider an index" — depends on table size).

## Step 3: Act

For each finding, create the row in `agent_findings` first (so we have a run_id
to attach action_ref to).

### If safe_fix:

1. `git clone git@github.com:jdlarssen/golf-app.git /tmp/golf-app-$run_id`
2. Create branch: `agent/safe-fix-{fingerprint[:8]}`
3. Make the minimal change. Stay inside the safe-list shape:
   - Max 1 file changed
   - Max 10 lines changed
   - The diff must round-trip through `lib/agent-monitor/blast-radius.ts:isSafeToAutoPush()`
4. Run `npm run lint && npm test` — if either fails, abandon this branch
   and re-classify as pr_worthy.
5. Bump `package.json` patch version, add CHANGELOG entry with the bold-tagline
   format described in CLAUDE.md.
6. Commit:
   ```
   chore(agent-monitor): auto-fix [short description] [fingerprint:8]

   Detected at [timestamp]. Source: [vercel|supabase|resend].
   Fingerprint: [full]
   ```
   Actually use `fix(...)` prefix since this is user-facing. Hook will then
   require the version bump + CHANGELOG, which step 5 already did.
7. `git push origin main`
8. Update `agent_findings`: action_taken='auto_pushed', action_ref=commit-sha,
   resolved_at=now().

### If pr_worthy:

1. Same clone + branch.
2. Make the change. No size limit but stay focused.
3. Run lint + tests.
4. Commit with `fix(...)` prefix + version bump + CHANGELOG.
5. Push branch.
6. Open PR via `gh pr create --title "..." --body "..." --label "auto:bot"`:
   - Title: short, < 70 chars
   - Body: stack trace (collapsed in `<details>`), root cause analysis,
     diff explanation, link to fingerprint
7. Update `agent_findings`: action_taken='pr_opened', action_ref=PR-number.

### If needs_judgment:

Just log it. action_taken='reported'. Morning report will surface it.

## Step 4: Cost cap

If you have used > 50,000 input tokens in this run, finish the CURRENT finding
and exit. The remaining ones will be picked up next hour (their fingerprints
will dedupe so no duplicate work).

## Step 5: Write agent_runs

Final write:
- agent_kind: 'hourly'
- duration_ms: total run time
- findings_count: number of new findings (excluding skipped dupes)
- notes: short summary, e.g. "1 auto-pushed, 1 PR-opened, 0 needs-judgment"
```

**Step 2: Verify lint**

```bash
# No code in this file, but check the file exists
ls agents/monitor-hourly.md
```

**Step 3: Commit**

```bash
git add agents/monitor-hourly.md
git commit -m "chore(agent-monitor): add hourly-monitor prompt"
```

**Reviewer:** After implementer-subagent (Sonnet) drafts this, spawn a
code-reviewer subagent on **Opus** to vet the prompt for:
- Safety of the safe-list classifier
- Clear step-by-step instructions
- Correct MCP tool names
- Compliance with CLAUDE.md (CHANGELOG, version bumps, conventional commits)

---

### Task 6: PR merge watcher prompt

**Files:**
- Create: `agents/pr-merge-watcher.md`

**Step 1: Write the prompt**

```markdown
# Tørny PR Merge Watcher

You run every 15 minutes. Your job is to merge PRs that have been approved by
@jdlarssen and apply lessons from PRs that were closed without merging.

## Kill-switch

If MONITORING_ENABLED=false → exit immediately.

## Step 1: List open auto-bot PRs

`gh pr list --label "auto:bot" --state open --json number,reviews,closedAt`

## Step 2: For each open PR

Fetch reviews with `gh pr view N --json reviews`. If any review by jdlarssen
has state "APPROVED" with submittedAt newer than the most recent commit:

1. `gh pr merge N --squash --delete-branch`
2. Update `agent_findings` row (where action_ref=N): resolved_at=now()
3. Done. Vercel deploys automatically.

If the PR was closed without merging (state=closed, merged=false), record the
fingerprint in `agent_findings.notes` field: "user closed without merge — do
not retry". The hourly monitor will then keep these fingerprints in the
dedup-skip pool indefinitely.

## Step 3: Write agent_runs

Only if you actually merged or closed something. Otherwise no state-write.
```

**Step 2: Commit**

```bash
git add agents/pr-merge-watcher.md
git commit -m "chore(agent-monitor): add pr-merge-watcher prompt"
```

**Reviewer:** Opus review for prompt clarity.

---

### Task 7: Morning report prompt

**Files:**
- Create: `agents/morning-report.md`

**Step 1: Write the prompt**

```markdown
# Tørny Morning Report

Runs daily at 08:00 Europe/Oslo. Sends a summary mail if anything happened.

## Kill-switch

If MONITORING_ENABLED=false → exit.

## Step 1: Query findings from last 24h

```sql
select
  detected_at,
  source,
  severity,
  summary,
  action_taken,
  action_ref
from public.agent_findings
where detected_at > now() - interval '24 hours'
  and action_taken in ('auto_pushed', 'pr_opened', 'reported')
order by detected_at asc;
```

Also query totals:

```sql
select
  sum(findings_count) as total_findings,
  count(*) as run_count
from public.agent_runs
where ran_at > now() - interval '24 hours'
  and agent_kind = 'hourly';
```

## Step 2: Render

If `total_findings = 0` → exit (no mail).

Otherwise, group findings by action_taken:
- `auto_pushed` → fixed
- `pr_opened` → pending
- `reported` → needs_judgment

Call `renderMorningMail()` from `lib/agent-monitor/morning-mail.ts` with the
groups. Format each row: `{ time: 'HH:MM', summary, ref: action_ref, refType }`.

## Step 3: Send via Resend

POST to https://api.resend.com/emails:

```json
{
  "from": "Tørny Agent <agent@tornygolf.no>",
  "to": "eier@example.com",
  "subject": "<rendered subject>",
  "html": "<rendered html>",
  "text": "<rendered text>"
}
```

Header: `Authorization: Bearer $RESEND_API_KEY`.

## Step 4: Write agent_runs

agent_kind='morning_report', findings_count=total_findings, notes="mail sent to eier@example.com".
```

**Step 2: Commit**

```bash
git add agents/morning-report.md
git commit -m "chore(agent-monitor): add morning-report prompt"
```

**Reviewer:** Opus review.

---

## Phase 4 — Kill-switch and safety docs

### Task 8: Add MONITORING_ENABLED to Vercel env

**This is a user-facing UI step.** Tell Jørgen:

> Gå til Vercel → Project Settings → Environment Variables → Add new.
> - Key: `MONITORING_ENABLED`
> - Value: `true`
> - Environments: Production, Preview, Development
>
> Lagre. Ingen redeploy nødvendig — agentene leser dette via Vercel-CLI når
> de starter.

No code commit for this task. After Jørgen confirms it's set, move on.

---

### Task 9: Document revert procedure in launch-checklist

**Files:**
- Modify: `docs/launch-checklist.md`

**Step 1: Read existing file**

```bash
cat docs/launch-checklist.md
```

**Step 2: Append revert section**

Add a new section at the end:

```markdown
## Rulle tilbake en agent-commit

Hvis agenten har auto-pushet noe som viser seg å være galt:

1. Finn commiten i CHANGELOG eller via `git log --grep "agent-monitor"`.
2. `git revert <sha>` lokalt på main.
3. `git push origin main` → Vercel deployer reverten.
4. Hvis flere agent-commits i samme tidsrom skal rulles tilbake, gjør én revert
   per commit (ikke `git revert -m`).

For å pause agenten:

1. Vercel → Project Settings → Environment Variables → `MONITORING_ENABLED` → set til `false`.
2. Lagre. Neste agent-run vil exiter umiddelbart.

For å fjerne en problematisk fingerprint så agenten ikke fortsetter å logge den:

1. Supabase SQL Editor:
   ```sql
   update public.agent_findings
   set resolved_at = now(), notes = 'manually closed by admin'
   where fingerprint = '<fingerprint-from-mail>';
   ```
```

**Step 3: Commit**

```bash
git add docs/launch-checklist.md
git commit -m "docs(launch-checklist): document revert and pause for agent commits"
```

---

### Task 10: Install scheduled tasks via MCP

**This is the deploy step.** A Claude session (not a subagent) calls
`mcp__scheduled-tasks__create_scheduled_task` three times, one per agent.

For each:
1. Read the prompt file content (`agents/monitor-hourly.md`).
2. Call `mcp__scheduled-tasks__create_scheduled_task` with:
   - `prompt`: full markdown content
   - `schedule`: cron expression
   - `name`: e.g. "tørny-hourly-monitor"

Schedules:
- `agents/monitor-hourly.md` → cron `0 * * * *` (every hour at :00)
- `agents/pr-merge-watcher.md` → cron `*/15 * * * *` (every 15 min)
- `agents/morning-report.md` → cron `0 8 * * *` Europe/Oslo (daily 08:00)

After creating each, verify with `mcp__scheduled-tasks__list_scheduled_tasks`.

No git commit — this is a runtime side-effect, not a code change.

---

## Phase 5 — Smoke test

### Task 11: Manual dry-run with no findings

Trigger the hourly monitor manually (via scheduled-tasks MCP "run now" or
similar). Verify:

1. Agent fetches all 4 sources.
2. Returns "no findings".
3. Exits silently (no row in `agent_runs` unless it was the 00:00 run).

Query verification:

```sql
select * from public.agent_runs order by ran_at desc limit 1;
```

Expected: most recent row should NOT be from this dry-run, unless the run was
at exactly 00:xx UTC.

---

### Task 12: Smoke test with synthetic finding

Inject a fake error into `agent_findings` directly (bypassing the agent):

```sql
insert into public.agent_findings (run_id, source, severity, fingerprint, summary, action_taken)
values (
  (select id from public.agent_runs order by ran_at desc limit 1),
  'vercel',
  'pr_worthy',
  'test-fingerprint-001',
  'TEST: synthetic finding for smoke test',
  'pr_opened'
);
```

Then trigger the morning-report agent manually. Verify:

1. Mail arrives at eier@example.com within 60 seconds.
2. Subject: "Nattlig oppsummering — 0 fixet, 1 venter på deg"
3. Body contains "TEST: synthetic finding for smoke test".

Cleanup:

```sql
delete from public.agent_findings where fingerprint = 'test-fingerprint-001';
```

---

### Task 13: Smoke test the kill-switch

1. Vercel: set `MONITORING_ENABLED=false`.
2. Trigger hourly monitor manually.
3. Verify it writes one row to `agent_runs` with notes "killswitch active" and exits.
4. Vercel: set `MONITORING_ENABLED=true` again.
5. Trigger again. Verify normal operation resumes.

---

## Done criteria

- All three scheduled tasks live and visible in `mcp__scheduled-tasks__list_scheduled_tasks`
- `agent_runs` getting at least 1 row per 24h (heartbeat or real findings)
- One real PR has been opened and merged by Jørgen end-to-end (this is the
  acceptance test — wait for a real prod error to surface, don't fabricate one)
- One safe-fix auto-pushed end-to-end (same — wait for organic occurrence)
- Morning mail received on a day with findings; no mail received on a quiet day

## Out of scope (post-v1)

- Webhook triggers (Resend → Vercel route → wake agent)
- Slow-request / slow-query detection
- App-specific health checks (sync queue, game state consistency)
- Push notifications inside the PWA instead of mail
