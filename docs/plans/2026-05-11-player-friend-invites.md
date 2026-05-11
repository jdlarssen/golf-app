# Player-to-Friend Invitations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let any authenticated player invite friends to Tørny via a personalised magic-link email, with a silent 10/24h rolling quota and a disabled-state Card on `/profile` linking to a dedicated `/invite` page.

**Architecture:** Reuse the existing `signInWithOtp` flow and `invitations` table; `game_id IS NULL` discriminates friend-invites from admin/game-scoped ones. A new RLS policy lets authenticated users insert friend-invites attributed to themselves. The existing Supabase Auth Magic Link template is extended with Go-template conditionals on `{{ .Data.inviter_name }}` so a single template covers login, admin invites, and friend invites. App-level quota check is primary enforcement.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), TypeScript, Tailwind v4, Supabase (`@supabase/ssr`), Vitest (unit), `vitest run` test runner.

**Design doc reference:** [docs/plans/2026-05-11-player-friend-invites-design.md](2026-05-11-player-friend-invites-design.md)

---

## Pre-flight check

Run these once at the start to confirm baseline state:

```bash
git status                # working tree clean on claude/festive-wescoff-8513fa
npm test                  # all existing tests green (40 scoring tests)
```

If anything is red, stop and surface it before starting.

---

## Task 1: RLS migration for player friend-invites

**Files:**
- Create: `supabase/migrations/0008_player_friend_invites_rls.sql`

**Step 1: Write the migration**

```sql
-- Allow authenticated users to insert friend-invites (game_id NULL).
-- App-level quota is the primary enforcement; this policy only ensures
-- the row truthfully attributes itself to the inviter and is not
-- game-scoped (game-scoped invites remain admin-only via the existing
-- "invitations admin write" policy).
create policy "invitations player friend-invite insert" on public.invitations
  for insert
  with check (
    invited_by = auth.uid()
    and game_id is null
  );

-- Allow inviter to read their own outgoing friend-invites — needed for
-- the /profile quota state lookup and a potential future "pending
-- invites" listing.
create policy "invitations select own outgoing" on public.invitations
  for select
  using (invited_by = auth.uid() and game_id is null);
```

**Step 2: Commit**

```bash
git add supabase/migrations/0008_player_friend_invites_rls.sql
git commit -m "feat: RLS policies for player friend-invites

Adds two policies that let any authenticated user create and read
their own friend-invites (game_id NULL). Game-scoped invites remain
admin-only via the existing 'invitations admin write' policy.
App-level quota enforcement remains primary; this is defence in
depth against direct DB tampering."
```

**Step 3: Manual step (defer — user runs this later)**

Note in plan output that when ready to deploy, user will paste this SQL into Supabase SQL Editor. Don't block execution on this — DB changes can be applied after code lands since the worktree branch isn't merged yet.

---

## Task 2: `formatTimeUntil` helper (TDD)

**Files:**
- Create: `lib/invitations/quota.ts`
- Create: `lib/invitations/quota.test.ts`

**Step 1: Write the failing test**

`lib/invitations/quota.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTimeUntil } from './quota';

describe('formatTimeUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "snart" when the target is now or past', () => {
    expect(formatTimeUntil(new Date('2026-05-11T10:00:00Z'))).toBe('snart');
    expect(formatTimeUntil(new Date('2026-05-11T09:00:00Z'))).toBe('snart');
  });

  it('returns minutes when under 1 hour away', () => {
    expect(formatTimeUntil(new Date('2026-05-11T10:30:00Z'))).toBe('30 min');
    expect(formatTimeUntil(new Date('2026-05-11T10:01:00Z'))).toBe('1 min');
  });

  it('returns hours (floored) when 1 hour or more away', () => {
    expect(formatTimeUntil(new Date('2026-05-11T15:00:00Z'))).toBe('5 t');
    expect(formatTimeUntil(new Date('2026-05-11T11:00:00Z'))).toBe('1 t');
    // 5h 59min still rounds down to 5 hours
    expect(formatTimeUntil(new Date('2026-05-11T15:59:00Z'))).toBe('5 t');
  });

  it('ceils minutes (so 30s remaining shows as 1 min, not 0)', () => {
    expect(formatTimeUntil(new Date('2026-05-11T10:00:30Z'))).toBe('1 min');
  });
});
```

**Step 2: Run test, confirm it fails**

```bash
npx vitest run lib/invitations/quota.test.ts
```

Expected: FAIL with "Cannot find module './quota'" or "formatTimeUntil is not a function".

**Step 3: Implement minimal `formatTimeUntil`**

`lib/invitations/quota.ts`:

```ts
export function formatTimeUntil(target: Date): string {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return 'snart';
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours >= 1) return `${hours} t`;
  const minutes = Math.ceil(diffMs / (60 * 1000));
  return `${minutes} min`;
}
```

**Step 4: Run test, confirm pass**

```bash
npx vitest run lib/invitations/quota.test.ts
```

Expected: PASS, all 4 tests green.

**Step 5: Commit**

```bash
git add lib/invitations/quota.ts lib/invitations/quota.test.ts
git commit -m "feat: formatTimeUntil helper for friend-invite quota UI

Returns 'snart' / 'X min' / 'X t' for a future Date. Used by
/profile's invite-Card and /invite's defensive disabled state."
```

---

## Task 3: `getQuotaState` helper (TDD)

**Files:**
- Modify: `lib/invitations/quota.ts`
- Modify: `lib/invitations/quota.test.ts`

**Step 1: Add failing test**

Append to `lib/invitations/quota.test.ts`:

```ts
import { getQuotaState, DAILY_INVITE_LIMIT, QUOTA_WINDOW_MS } from './quota';

type FakeSupabase = {
  from: ReturnType<typeof vi.fn>;
};

function makeMockClient(rows: { created_at: string }[]) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(builder),
  } as unknown as FakeSupabase;
}

describe('getQuotaState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('reports not-exhausted when under the limit', async () => {
    // 5 invites in last 24h
    const rows = Array.from({ length: 5 }, (_, i) => ({
      created_at: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
    }));
    const client = makeMockClient(rows);

    const state = await getQuotaState(client as never, 'user-1');

    expect(state.count).toBe(5);
    expect(state.limit).toBe(DAILY_INVITE_LIMIT);
    expect(state.isExhausted).toBe(false);
    expect(state.nextSlotAt).toBeNull();
  });

  it('reports exhausted with nextSlotAt = oldest + 24h when at limit', async () => {
    // 10 invites, oldest at 23h ago
    const oldest = new Date('2026-05-10T11:00:00Z');
    const rows = [
      { created_at: oldest.toISOString() },
      ...Array.from({ length: 9 }, (_, i) => ({
        created_at: new Date(
          Date.now() - (i + 1) * 30 * 60 * 1000,
        ).toISOString(),
      })),
    ];
    const client = makeMockClient(rows);

    const state = await getQuotaState(client as never, 'user-1');

    expect(state.count).toBe(10);
    expect(state.isExhausted).toBe(true);
    expect(state.nextSlotAt?.toISOString()).toBe(
      new Date(oldest.getTime() + QUOTA_WINDOW_MS).toISOString(),
    );
  });

  it('reports 0 when no invites in window', async () => {
    const client = makeMockClient([]);
    const state = await getQuotaState(client as never, 'user-1');
    expect(state.count).toBe(0);
    expect(state.isExhausted).toBe(false);
    expect(state.nextSlotAt).toBeNull();
  });

  it('throws if supabase returns an error', async () => {
    const errorBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'rls denied' },
      }),
    };
    const client = {
      from: vi.fn().mockReturnValue(errorBuilder),
    } as unknown as FakeSupabase;

    await expect(getQuotaState(client as never, 'user-1')).rejects.toThrow();
  });
});
```

**Step 2: Run test, confirm it fails**

```bash
npx vitest run lib/invitations/quota.test.ts
```

Expected: FAIL with "Cannot find export 'getQuotaState'" or similar.

**Step 3: Implement**

Append to `lib/invitations/quota.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export const DAILY_INVITE_LIMIT = 10;
export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

export type QuotaState = {
  count: number;
  limit: number;
  isExhausted: boolean;
  nextSlotAt: Date | null;
};

export async function getQuotaState(
  supabase: SupabaseClient,
  userId: string,
): Promise<QuotaState> {
  const windowStart = new Date(Date.now() - QUOTA_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from('invitations')
    .select('created_at')
    .eq('invited_by', userId)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to load invite quota: ${error.message}`);

  const count = data?.length ?? 0;
  const isExhausted = count >= DAILY_INVITE_LIMIT;
  const nextSlotAt =
    isExhausted && data && data.length > 0
      ? new Date(new Date(data[0].created_at).getTime() + QUOTA_WINDOW_MS)
      : null;

  return { count, limit: DAILY_INVITE_LIMIT, isExhausted, nextSlotAt };
}
```

**Step 4: Run test, confirm pass**

```bash
npx vitest run lib/invitations/quota.test.ts
```

Expected: PASS, all 8 tests green.

**Step 5: Commit**

```bash
git add lib/invitations/quota.ts lib/invitations/quota.test.ts
git commit -m "feat: getQuotaState helper for friend-invite rolling 24h window

Reads the inviter's own friend-invites from the last 24h, returns
count + whether exhausted + when next slot opens (oldest invite +
24h)."
```

---

## Task 4: `sendFriendInvite` server action

**Files:**
- Create: `app/invite/actions.ts`

No automated tests for this task — Server Actions exercise auth, DB writes, and side-effecting calls (`signInWithOtp` sends a mail). We rely on the pure helpers above being tested, plus manual end-to-end verification at the end of the plan. Reference: existing `app/admin/invitations/actions.ts` is the pattern to follow.

**Step 1: Write the action**

`app/invite/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { getQuotaState } from '@/lib/invitations/quota';

// Lightweight format check. We rely on browser `type="email"` + the
// fact that Supabase will reject malformed addresses too. Just guard
// against trivially-empty / no-@ submissions here.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function sendFriendInvite(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email) {
    redirect('/invite?error=email_required');
  }
  if (!looksLikeEmail(email)) {
    redirect('/invite?error=invalid_email');
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Look up inviter profile. If the inviter hasn't completed their own
  // profile, send them there first — same defensive pattern as /profile.
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single();

  if (profileError && profileError.code === 'PGRST116') {
    redirect('/complete-profile');
  }
  if (profileError || !profile) {
    redirect('/invite?error=unknown');
  }

  // Defensive quota re-check — the /invite page already gates on this,
  // but server-side enforcement is what actually protects the rule.
  const quota = await getQuotaState(supabase, user.id);
  if (quota.isExhausted) {
    redirect('/invite?error=quota');
  }

  // Block invites to addresses that already have a Tørny account.
  // Prevents user_metadata.inviter_name pollution and confusing
  // "X has invited you" mails to existing users.
  const { data: existing, error: existingError } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingError) {
    redirect('/invite?error=unknown');
  }
  if (existing) {
    redirect('/invite?error=already_user');
  }

  // Compute callback URL from request headers — same approach as
  // /login and /admin/invitations so we don't hardcode the host.
  const headerList = await headers();
  const host =
    headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '';
  const protocol = headerList.get('x-forwarded-proto') ?? 'https';
  const callback = new URL('/auth/callback', `${protocol}://${host}`);

  const inviterName = profile.name?.trim() || 'En venn';

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: callback.toString(),
      data: { inviter_name: inviterName },
    },
  });

  if (otpError) {
    const msg = otpError.message?.toLowerCase() ?? '';
    const code = msg.includes('rate') || msg.includes('too many')
      ? 'rate_limited'
      : 'unknown';
    redirect(`/invite?error=${code}`);
  }

  // Audit log. Token is required NOT NULL UNIQUE but Supabase's own
  // magic-link token is the real mechanism; this UUID exists only to
  // satisfy the column.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from('invitations').insert({
    email,
    token: randomUUID(),
    invited_by: user.id,
    game_id: null,
    expires_at: expiresAt,
  });

  if (insertError) {
    // Mail already went out via signInWithOtp; logging failure isn't
    // fatal but we surface it so the user knows something odd happened.
    redirect('/invite?error=unknown');
  }

  const qs = new URLSearchParams({ status: 'sent', email });
  redirect(`/invite?${qs.toString()}`);
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add app/invite/actions.ts
git commit -m "feat: sendFriendInvite server action

Lets an authenticated player invite a friend via magic-link. Guards
against missing/invalid email, exhausted daily quota, already-registered
addresses, and missing inviter profile. Passes inviter_name via
options.data so the Magic Link template can render a personalised
greeting."
```

---

## Task 5: `/invite` page

**Files:**
- Create: `app/invite/page.tsx`

**Step 1: Write the page**

`app/invite/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { getQuotaState, formatTimeUntil } from '@/lib/invitations/quota';
import { sendFriendInvite } from './actions';

type SearchParams = Promise<{
  error?: string | string[];
  status?: string | string[];
  email?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function InvitePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const quota = await getQuotaState(supabase, user.id);

  const params = await searchParams;
  const errorCode = first(params.error);
  const status = first(params.status);
  const sentEmail = first(params.email);
  const showSuccess = status === 'sent';

  const errorMessages: Record<string, string> = {
    email_required: 'Du må skrive inn en e-postadresse.',
    invalid_email: 'Ugyldig e-postadresse.',
    already_user:
      'Denne personen er allerede på Tørny. Be admin om å legge dem til et spill.',
    quota: quota.nextSlotAt
      ? `Du har brukt opp dagens kvote. Ny invitasjon om ~${formatTimeUntil(quota.nextSlotAt)}.`
      : 'Du har brukt opp dagens kvote.',
    rate_limited: 'Vent litt før du prøver igjen.',
    unknown: 'Noe gikk galt. Prøv igjen.',
  };
  const errorMessage = errorCode ? errorMessages[errorCode] : undefined;

  return (
    <AppShell>
      <PageHeader
        title="Invitér en venn"
        subtitle="Send en lenke så vennen kan lage konto"
      />

      {showSuccess && sentEmail && (
        <div role="status" className="mb-4">
          <Banner tone="success">✓ Invitasjon sendt til {sentEmail}.</Banner>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <Card>
        {quota.isExhausted ? (
          <div aria-disabled="true" className="opacity-60">
            <p className="text-sm text-text">
              Du har brukt opp dagens kvote. Ny invitasjon om ~
              {quota.nextSlotAt ? formatTimeUntil(quota.nextSlotAt) : 'snart'}.
            </p>
          </div>
        ) : (
          <form action={sendFriendInvite} className="space-y-4">
            <Input
              id="email"
              name="email"
              type="email"
              label="E-post"
              autoComplete="email"
              required
            />

            <Button type="submit" className="w-full mt-2">
              Send invitasjon
            </Button>

            <p className="text-xs text-muted mt-2 text-center">
              Vi sender vennen en mail med en lenke. De kan lage konto med ett klikk.
            </p>
          </form>
        )}
      </Card>

      <div className="mt-4 text-center">
        <Link
          href="/profile"
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Avbryt
        </Link>
      </div>
    </AppShell>
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Visual smoke-check (local dev)**

```bash
npm run dev
```

Open `http://localhost:3000/invite` after logging in. Confirm:
- Page renders with PageHeader, Card, form
- Submitting an empty email shows the "Du må skrive inn..." banner after redirect
- The "Avbryt" link routes to `/profile`

Stop the dev server (Ctrl+C) before committing.

**Step 4: Commit**

```bash
git add app/invite/page.tsx
git commit -m "feat: /invite page with friend-invite form and quota state

Renders an email-input form when the user is under quota, and a
disabled state with a relative countdown when exhausted. Reads
quota state server-side via getQuotaState and surfaces error/success
banners from URL params."
```

---

## Task 6: `/profile` Card linking to `/invite`

**Files:**
- Modify: `app/profile/page.tsx`

**Step 1: Add the imports and quota lookup**

In `app/profile/page.tsx`, add to the imports section:

```tsx
import Link from 'next/link';  // (already imported — confirm)
import { getQuotaState, formatTimeUntil } from '@/lib/invitations/quota';
```

After the existing `profile` fetch and before the `return`, add:

```tsx
const quota = await getQuotaState(supabase, user.id);
```

**Step 2: Add the invite-Card after the existing profile form Card**

Inside the `<AppShell>...`, after the closing `</Card>` of the profile form, add:

```tsx
<div className="mt-6">
  {quota.isExhausted ? (
    <Card>
      <div aria-disabled="true" className="opacity-60">
        <h2 className="font-serif text-lg font-medium text-text mb-1">
          Invitér en venn
        </h2>
        <p className="text-sm text-muted">
          Ny invitasjon om ~
          {quota.nextSlotAt ? formatTimeUntil(quota.nextSlotAt) : 'snart'}
        </p>
      </div>
    </Card>
  ) : (
    <Link href="/invite" className="block">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-medium text-text mb-1">
              Invitér en venn
            </h2>
            <p className="text-sm text-muted">
              Dra med kompiser inn på Tørny
            </p>
          </div>
          <span aria-hidden="true" className="text-muted text-xl">
            →
          </span>
        </div>
      </Card>
    </Link>
  )}
</div>
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 4: Visual smoke-check**

```bash
npm run dev
```

Open `http://localhost:3000/profile`:
- Existing form still renders correctly
- Below the form-Card, the "Invitér en venn"-Card is visible
- Clicking the Card routes to `/invite`

Stop dev server.

**Step 5: Commit**

```bash
git add app/profile/page.tsx
git commit -m "feat: invite-a-friend Card on /profile

Adds a clickable Card linking to /invite below the existing profile
form. Greys out with a relative countdown when the user has exhausted
their daily quota. Uses existing Card primitive and forest-and-
champagne tokens for visual consistency."
```

---

## Task 7: Conditional Magic Link mail template in `docs/email-templates.md`

**Files:**
- Modify: `docs/email-templates.md`

**Step 1: Replace the Magic Link section's Subject and Body**

In `docs/email-templates.md`, locate the section starting with `## 1. Magic Link — primær login` (around line 27). Replace the Subject and Body blocks with the conditional version below.

**New Subject:**

````markdown
**Subject:** `{{ if .Data.inviter_name }}{{ .Data.inviter_name }} har invitert deg til Tørny{{ else }}Logg inn på Tørny{{ end }}`
````

**New Body** — three small Go-template `{{ if }}...{{ else }}...{{ end }}` blocks injected into the existing HTML. Replace the three locations indicated below; leave everything else (logo lockup, footer, fallback link, table-shell) unchanged.

In the `<h1>` (existing text: `Klikk for å logge inn`):

```html
<h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 500; color: #1A2E1F; margin: 0 0 12px 0; line-height: 1.3;">
  {{ if .Data.inviter_name }}{{ .Data.inviter_name }} vil ha deg med på Tørny{{ else }}Klikk for å logge inn{{ end }}
</h1>
```

In the intro paragraph (existing text: `Hei! Klikk knappen under for å åpne Tørny. Lenken er gyldig i 1 time.`):

```html
<p style="font-size: 15px; color: #1A2E1F; margin: 0 0 24px 0; line-height: 1.5;">
  {{ if .Data.inviter_name }}{{ .Data.inviter_name }} har invitert deg til Tørny — fyr opp golfturneringen på minutter. Klikk knappen under for å lage din konto. Lenken er gyldig i 1 time.{{ else }}Hei! Klikk knappen under for å åpne Tørny. Lenken er gyldig i 1 time.{{ end }}
</p>
```

In the CTA button (existing text: `Logg inn på Tørny`):

```html
<a href="{{ .ConfirmationURL }}" style="display: inline-block; background-color: #1B4332; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 16px; font-weight: 500; letter-spacing: -0.01em;">
  {{ if .Data.inviter_name }}Lag konto{{ else }}Logg inn på Tørny{{ end }}
</a>
```

Then add a paragraph just below the existing intro about Tørny, explaining the dual purpose of the template (login + invite). Suggested text after the existing "Brukes ved alle logins og admin-invitasjoner" line, expand to:

```markdown
> Brukes ved alle logins, admin-invitasjoner, og venneinvitasjoner via `/invite`. Vennene får personalisert tekst når server-action passerer `options.data.inviter_name` til `signInWithOtp`; ellers faller templaten på vanlig login-tekst.
```

**Step 2: Commit**

```bash
git add docs/email-templates.md
git commit -m "docs: conditional Magic Link template for friend invites

Extends the Tørny-branded Magic Link template with Go-template
{{ if .Data.inviter_name }} blocks on subject, H1, intro paragraph,
and CTA button. One template now serves login, admin invite, and
friend invite. Falls back gracefully to login-tone when no data is
passed."
```

---

## Task 8: Final test sweep

**Step 1: Run all tests**

```bash
npm test
```

Expected: all tests pass — the 40 existing scoring tests plus the 8 new quota tests = 48 total.

**Step 2: Build to catch type errors**

```bash
npm run build
```

Expected: clean build, no TypeScript errors, no warnings escalating to errors.

**Step 3: If anything fails**

STOP. Do not commit. Surface the failure clearly and let the user decide whether to roll back or fix forward.

---

## Manual deployment steps (Claude prepares messages, user executes)

After the implementation commits are merged to `main` (Vercel auto-deploys), the user must do **two manual steps** in third-party UIs (the SQL step runs **two migrations**, see below). Claude prepares a copy-paste-ready message for each.

### Step A: Apply both SQL migrations in Supabase

The feature requires **two migrations** to be applied in order. Run them as two separate queries in the SQL Editor — do not merge them into one paste.

**Where:** Supabase Dashboard → SQL Editor → New query

**A1 — RLS policies:** paste the full contents of `supabase/migrations/0008_player_friend_invites_rls.sql` → **Run**

**A2 — Existence-check RPC:** paste the full contents of `supabase/migrations/0009_email_is_registered_rpc.sql` → **Run**

**What to look for:** both queries return "Success. No rows returned" (or similar — no error banner)

**If it doesn't look right:** screenshot the error, paste it in chat. Most likely failure mode is the policy/function names already existing — in which case nothing to do. Migration 0009 is **required** before `/invite` will work — without the RPC, every friend-invite attempt redirects to `/invite?error=unknown`.

### Step B: Update the Magic Link template in Supabase Auth

**Where:** Supabase Dashboard → Authentication → Email Templates → Magic Link

**What to paste:**
- Subject: the new conditional subject from `docs/email-templates.md`
- Body (HTML): the new full body (Claude provides the full HTML with all three conditional blocks baked in, ready to paste — not just the diff)

**Click:** Save

**What to look for:** banner "Template updated" (or similar success cue)

**Test:**
1. Log in normally (existing user) — verify the mail still says "Logg inn på Tørny" in subject and "Klikk for å logge inn" in body
2. Send a friend-invite from `/invite` to a fresh address (not registered) — verify the mail subject says "<your name> har invitert deg til Tørny" and body has the personalised greeting + "Lag konto" CTA

**Cache caveat:** Supabase Auth caches templates for ~15 min. If the first test mail still shows old wording, wait and retry.

---

## End-to-end verification (manual, after deployment)

Same as the design doc's verification section — copied here for executor convenience:

1. **Lykke-sti:** Log in as non-admin → /profile → click "Invitér en venn"-Card → /invite. Enter test mail you own (unregistered). Click "Send invitasjon".
   - Confirm: success-banner "✓ Invitasjon sendt til X"
   - Confirm: mail in inbox has personalised subject + "Lag konto" CTA
   - Click link → lands on /complete-profile → can finish onboarding

2. **Quota limit:** Send 10 invitations rapidly.
   - Confirm: after the 10th, /profile Card greys out with "Ny invitasjon om ~24 t"
   - Confirm: direct navigation to /invite shows the same disabled state
   - Confirm in Supabase Table Editor: 10 rows in `invitations` with `invited_by = your-uid` and `game_id IS NULL`

3. **Existing user:** Invite a mail that already has Tørny.
   - Confirm: `error=already_user` banner. No mail sent. No row inserted. No quota slot consumed.

---

## Notes for the executor

- All TypeScript code in this plan should compile cleanly under the existing `tsconfig.json`. No new deps.
- The existing `app/admin/invitations/actions.ts` is the closest analogue for the server action — when in doubt about Supabase patterns, mirror that file.
- `getServerClient()` already swallows cookie-write errors in read-only contexts (Server Components); Route Handlers and Server Actions write cookies fine.
- The `invitations` table's `token` column is NOT NULL UNIQUE, hence the `randomUUID()` per row even though the real auth token is owned by Supabase Auth. Same pattern as admin invite.
- If you encounter a bug during execution, do NOT quick-fix — invoke `superpowers:systematic-debugging` first per project convention.

---

## Post-implementation notes

Two deviations from the original task code shipped as separate atomic fix commits caught by code review during execution. Future replays of this plan should incorporate them inline:

### Deviation 1: `getQuotaState` filters by `game_id IS NULL`

**Why:** Task 3 originally counted ALL invitations attributed to the inviter. For admin users (whose existing admin SELECT policy returns every row regardless of `game_id`), this would inflate the friend-invite quota with admin's game-scoped invites. RLS hides game-scoped rows from non-admin selectors so non-admin players were unaffected, but explicit filtering is correct and self-documenting.

**Fix (commit `4da1b0e`):** Added `.is('game_id', null)` between `.eq('invited_by', userId)` and `.gte('created_at', windowStart)` in the PostgREST chain. Tests extended: boundary cases at `count = limit - 1` (allowed) and `count > limit` (still exhausted), plus a spy assertion confirming the filter is actually applied.

### Deviation 2: `already_user` check uses a SECURITY DEFINER RPC

**Why:** Task 4 originally did `select id from users where email = $email`. The `users` RLS policy only returns rows visible to the caller (self, admin, or shared-game peers). A non-admin player inviting a friend who already has Tørny but with whom they share no games would see zero rows and the guard would fail open — mail goes out, invitations row inserted, quota slot burned. Exactly the friend-invite case.

**Fix (commit `4294c71`):** New migration `0009_email_is_registered_rpc.sql` defines `public.email_is_registered(p_email text) returns boolean` as `security definer stable` with hardened `search_path` and `revoke all from public + grant execute to authenticated`. Server action calls `supabase.rpc('email_is_registered', { p_email: email })` instead of the SELECT. Returns only a boolean — no PII leak.

### Deviation 3: Keyboard-focus ring on /profile invite Card

**Why:** Task 6 wrapped the Card in `<Link>` but didn't add `focus-visible:ring`, breaking keyboard discoverability.

**Fix (commit `2cefb10`):** Added `block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2` to the Link className. Matches the pattern in `components/ui/Button.tsx`.

### Manual deployment now requires TWO migrations

Update Step A of the deployment guidance:
- `supabase/migrations/0008_player_friend_invites_rls.sql` — RLS policies (run first)
- `supabase/migrations/0009_email_is_registered_rpc.sql` — SECURITY DEFINER RPC (run second)

Both must be applied before `/invite` will work in production.
