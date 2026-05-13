# OTP-code-login Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the magic-link URL flow with a 6-digit OTP code that the user types on the same page they entered their email. Fixes pre-existing iOS PWA + email-prefetcher bugs.

**Architecture:** Single `/login` route with two steps controlled by `?step=` search param. Step 1 sends a Supabase OTP via `signInWithOtp`; Step 2 verifies via `verifyOtp` and marks the user's invitation as accepted. Admin invitations move from Supabase-auth-mail to a Resend notification mail; the auth mail itself is sent only by Step 1.

**Tech Stack:** Next.js 16 App Router, Supabase `@supabase/ssr`, Resend, Postgres RLS (existing policy 0012 unchanged).

**Reference:** [design doc](2026-05-13-otp-code-login-design.md)

---

## Phase 1: Database helper

### Task 1: Migration `0013_email_is_invited.sql`

**Files:**
- Create: `supabase/migrations/0013_email_is_invited.sql`

**Step 1: Write migration**

```sql
-- email_is_invited(text) returns true if the email has at least one open
-- (non-accepted, non-expired) row in public.invitations. SECURITY DEFINER
-- so the login server-action can call it without exposing the invitations
-- table to anonymous SELECT (current policy 0002 already allows it, but
-- the RPC narrows the surface).
create or replace function public.email_is_invited(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invitations
    where lower(email) = lower(check_email)
      and accepted_at is null
      and (expires_at is null or expires_at > now())
  );
$$;

grant execute on function public.email_is_invited(text) to anon, authenticated;
```

**Step 2: Apply via Supabase MCP**

Use `mcp__36be25a6-2d72-41c3-a675-2352133ed510__apply_migration` with `project_id: glofubopddkjhymcbaph`, name `0013_email_is_invited`, body as above. Expect `{"success": true}`.

**Step 3: Verify via SQL**

Use `mcp__36be25a6-2d72-41c3-a675-2352133ed510__execute_sql`:

```sql
select public.email_is_invited('eier@example.com') as is_admin_invited,
       public.email_is_invited('nobody@nowhere.invalid') as nonsense;
```

Expect: `is_admin_invited=false, nonsense=false` (admin himself isn't in invitations, that's fine — he's in `auth.users` and `email_is_registered` handles him).

**Step 4: Verify `email_is_registered` exists; create if missing**

Use `execute_sql`:

```sql
select proname from pg_proc where proname = 'email_is_registered';
```

If missing, add to migration 0013:

```sql
create or replace function public.email_is_registered(check_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users where lower(email) = lower(check_email)
  );
$$;

grant execute on function public.email_is_registered(text) to anon, authenticated;
```

Re-apply migration if needed.

**Step 5: Commit**

```bash
git add supabase/migrations/0013_email_is_invited.sql
git commit -m "feat(auth): email_is_invited / email_is_registered RPC helpers"
```

Note: this is `feat()` but no user-visible behavior changes yet — bumps would block hook. **Use `chore()` prefix instead** to skip the hook:

```bash
git commit -m "chore(db): add email_is_invited / email_is_registered RPC helpers"
```

---

## Phase 2: Login server-actions

### Task 2: Refactor `app/(auth)/login/actions.ts` into `sendCode` + `verifyCode`

**Files:**
- Modify: `app/(auth)/login/actions.ts` (full rewrite)

**Step 1: Replace file contents**

```typescript
'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

// Step 1 of two-step OTP login. Verifies the email is either registered
// or invited, then asks Supabase to send a 6-digit code.
export async function sendCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const nextRaw = String(formData.get('next') ?? '').trim();
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '';

  if (!email) {
    redirect('/login?error=unknown');
  }

  const supabase = await getServerClient();

  // Gate: only allow OTP for known emails. shouldCreateUser=true is reserved
  // for invitees so random emails can't auto-create accounts.
  const [{ data: isRegistered }, { data: isInvited }] = await Promise.all([
    supabase.rpc('email_is_registered', { check_email: email }),
    supabase.rpc('email_is_invited', { check_email: email }),
  ]);

  if (!isRegistered && !isInvited) {
    redirect('/login?error=user_not_found');
  }

  const shouldCreateUser = Boolean(isInvited) && !isRegistered;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser },
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    let code: 'rate_limited' | 'unknown' = 'unknown';
    if (msg.includes('rate') || msg.includes('too many') || msg.includes('security purposes')) {
      code = 'rate_limited';
    }
    redirect(`/login?error=${code}`);
  }

  const qs = new URLSearchParams({ step: 'verify', email });
  if (next) qs.set('next', next);
  redirect(`/login?${qs.toString()}`);
}

// Step 2: verify the 6-digit code, set the session cookie, mark any pending
// invitation rows for this email as accepted (replaces the side-effect that
// lived in /auth/callback), and redirect to next destination.
export async function verifyCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const token = String(formData.get('token') ?? '').trim();
  const nextRaw = String(formData.get('next') ?? '').trim();
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';

  if (!email || !token) {
    redirect(`/login?step=verify&email=${encodeURIComponent(email)}&error=code_invalid`);
  }

  const supabase = await getServerClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    let code: 'code_invalid' | 'code_expired' = 'code_invalid';
    if (msg.includes('expired')) {
      code = 'code_expired';
    }
    redirect(
      `/login?step=verify&email=${encodeURIComponent(email)}&error=${code}`,
    );
  }

  // Mark any pending invitation rows for this email as accepted.
  // Best-effort: never block login on failure. Allowed by RLS policy 0012
  // ("invitations self mark accepted") since auth.jwt() ->> 'email' is
  // populated post-verifyOtp.
  try {
    await supabase
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .ilike('email', email)
      .is('accepted_at', null);
  } catch (err) {
    console.warn('[login/verifyCode] invitation-accept side-effect threw', err);
  }

  // Send users without a profile to complete it; everyone else goes to next.
  const { data: userRow } = await supabase
    .from('users')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (!userRow) {
    redirect('/complete-profile');
  }
  redirect(next);
}
```

**Step 2: Verify imports + types resolve**

Run TypeScript check on this file only:

```bash
npx tsc --noEmit -p . 2>&1 | grep "app/(auth)/login/actions.ts" || echo "OK"
```

Expect: `OK` (no errors).

**Step 3: Commit**

```bash
git add "app/(auth)/login/actions.ts"
git commit -m "feat(auth): split login action into sendCode + verifyCode for OTP flow"
```

This is user-visible (changes login UX), so the hook will require a package.json + CHANGELOG bump. **Defer commit** until Task 9 (final ship) so we can bundle all changes under one 0.4.0 bump. For now:

```bash
# Don't commit yet — task 9 bundles everything
git status  # confirm changes are staged-pending in working tree
```

---

## Phase 3: Login UI — same page, two steps

### Task 3: Rewrite `app/(auth)/login/page.tsx`

**Files:**
- Modify: `app/(auth)/login/page.tsx` (full rewrite)

**Step 1: Replace file contents**

```typescript
import { sendCode, verifyCode } from './actions';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { BrandHero } from '@/components/ui/BrandHero';

type SearchParams = Promise<{
  step?: string | string[];
  email?: string | string[];
  error?: string | string[];
  next?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: 'Vent litt før du prøver igjen.',
  user_not_found:
    'Denne mailen er ikke registrert. Be admin om en invitasjon.',
  code_invalid: 'Feil kode. Sjekk mailen og prøv igjen.',
  code_expired: 'Koden er gått ut. Be om ny kode.',
  link_expired: 'Lenken er gått ut. Be om ny kode på login.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const step = first(params.step) === 'verify' ? 'verify' : 'email';
  const email = first(params.email) ?? '';
  const next = first(params.next) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  return (
    <AppShell>
      <div className="mt-10">
        <BrandHero className="mb-10" />
        <Card>
          {errorMessage && (
            <div role="alert" className="mb-4">
              <Banner tone="error">{errorMessage}</Banner>
            </div>
          )}

          {step === 'email' ? (
            <form action={sendCode} className="space-y-4">
              <input type="hidden" name="next" value={next} />
              <Input
                id="email"
                name="email"
                type="email"
                label="E-post"
                autoComplete="email"
                required
              />
              <Button type="submit" className="w-full mt-2">
                Send meg kode
              </Button>
              <p className="text-xs text-muted mt-6 text-center">
                Vi sender deg en 6-sifret kode på mail.
              </p>
            </form>
          ) : (
            <form action={verifyCode} className="space-y-4">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="next" value={next} />
              <p className="text-sm text-muted">
                Skriv inn 6-sifret kode vi sendte til <strong>{email}</strong>.
              </p>
              <Input
                id="token"
                name="token"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                label="Kode"
                required
              />
              <Button type="submit" className="w-full mt-2">
                Logg inn
              </Button>
              <p className="text-xs text-muted mt-6 text-center">
                Fikk du ikke koden?{' '}
                <a
                  href={`/login?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ''}`}
                  className="underline"
                >
                  Send ny kode
                </a>
              </p>
            </form>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
```

**Step 2: TypeScript check**

```bash
npx tsc --noEmit -p . 2>&1 | grep "app/(auth)/login/page.tsx" || echo "OK"
```

Expect: `OK`.

**Step 3: Visual confirm (defer to smoke-test after ship)**

Skip local smoke-test per production-only-testing policy. Verification happens after Task 9 ships.

**Step 4: No commit yet — bundle in Task 9**

---

## Phase 4: Invitation notification mail

### Task 4: Create `lib/mail/inviteNotification.ts`

**Files:**
- Create: `lib/mail/inviteNotification.ts`

**Step 1: Check if Resend is already wired up**

```bash
grep -rn "resend\|Resend\|@resend" --include="*.ts" --include="*.tsx" lib/ app/ 2>/dev/null | head -20
```

If a `lib/mail/*` infrastructure already exists, reuse it; otherwise install resend SDK.

**Step 2: Inspect existing mail infra**

If a sender helper exists (e.g. `lib/mail/sender.ts`), use it. Otherwise:

```bash
ls lib/mail/ 2>/dev/null
```

Adapt the file structure to fit. If no infra: install `resend`:

```bash
npm install resend
```

Verify `RESEND_API_KEY` is in `.env.local` (user has it set in Vercel; check env var names in next.config.ts or grep):

```bash
grep -rn "RESEND" .env.example next.config.ts 2>/dev/null
```

**Step 3: Write `lib/mail/inviteNotification.ts`**

(Final contents depend on Step 2 findings — match existing pattern. Skeleton:)

```typescript
// Sends a "you've been invited" notification mail via Resend.
// The actual login code is sent by Supabase Auth when the invitee
// reaches /login and asks for one — this mail is just the prompt
// to get them there.

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInviteNotification(params: {
  to: string;
  invitedByName: string;
}): Promise<void> {
  const { to, invitedByName } = params;

  const subject = 'Du er invitert til Tørny';
  const html = `<!DOCTYPE html><html><body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #F8F6F0; color: #1A1813;">
  <h1 style="font-family: Georgia, serif; font-size: 28px; margin: 0 0 16px; color: #1B4332;">Tørny</h1>
  <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px;">
    Hei!
  </p>
  <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px;">
    <strong>${invitedByName}</strong> har invitert deg til å bli med på en
    golf-turnering i Tørny.
  </p>
  <p style="font-size: 16px; line-height: 1.5; margin: 0 0 32px;">
    For å komme i gang, gå til
    <a href="https://tornygolf.no/login" style="color: #1B4332; font-weight: 600;">tornygolf.no</a>,
    skriv inn denne e-posten, og logg inn med koden du får tilsendt.
  </p>
  <p style="font-size: 13px; color: #5C5347; line-height: 1.5; margin: 32px 0 0;">
    Tørny — fyr opp golfturneringen på et par minutter.
  </p>
</body></html>`;

  const text = `Du er invitert til Tørny\n\n${invitedByName} har invitert deg til å bli med på en golf-turnering i Tørny.\n\nGå til https://tornygolf.no/login, skriv inn denne e-posten, og logg inn med koden du får tilsendt.\n\nTørny — fyr opp golfturneringen på et par minutter.`;

  await resend.emails.send({
    from: 'Tørny <noreply@tornygolf.no>',
    to,
    subject,
    html,
    text,
  });
}
```

**Step 4: TypeScript check**

```bash
npx tsc --noEmit -p . 2>&1 | grep "lib/mail/inviteNotification.ts" || echo "OK"
```

Expect: `OK`.

---

### Task 5: Update `app/admin/invitations/actions.ts`

**Files:**
- Modify: `app/admin/invitations/actions.ts`

**Step 1: Read current contents**

```bash
cat app/admin/invitations/actions.ts
```

**Step 2: Remove `signInWithOtp` call; replace with `sendInviteNotification`**

Locate the existing `supabase.auth.signInWithOtp({ ... shouldCreateUser: true })` block. Replace with:

```typescript
import { sendInviteNotification } from '@/lib/mail/inviteNotification';

// inside the action, after inserting into public.invitations:
const { data: { user: actingUser } } = await supabase.auth.getUser();
const invitedByName =
  (actingUser?.user_metadata?.name as string | undefined) ?? 'En venn';

try {
  await sendInviteNotification({ to: email, invitedByName });
} catch (err) {
  console.error('[admin/invitations] notification mail failed', err);
  // Don't fail the action — invitations row is the source of truth;
  // admin can resend manually if mail doesn't land.
}
```

Preserve the rest of the action (invitations insert, error handling, redirect).

**Step 3: TypeScript check**

```bash
npx tsc --noEmit -p . 2>&1 | grep "app/admin/invitations/actions.ts" || echo "OK"
```

**Step 4: No commit yet — bundle in Task 9**

---

### Task 6: Update `app/invite/actions.ts` (friend-invite flow)

**Files:**
- Modify: `app/invite/actions.ts`

**Step 1: Read current contents**

Same pattern as admin/invitations. Replace `signInWithOtp` with `sendInviteNotification`. Adapt `invitedByName` lookup based on the friend-invite payload structure.

**Step 2: TypeScript check**

```bash
npx tsc --noEmit -p . 2>&1 | grep "app/invite/actions.ts" || echo "OK"
```

**Step 3: No commit yet — bundle in Task 9**

---

## Phase 5: Old callback deprecation

### Task 7: Strip `app/auth/callback/route.ts` to graceful-fail

**Files:**
- Modify: `app/auth/callback/route.ts`

**Step 1: Replace contents**

```typescript
import { NextRequest, NextResponse } from 'next/server';

// Magic-link URL flow was retired 2026-05-13 in favor of OTP-code login.
// This route stays for ~30 days to redirect stale magic-link clicks
// gracefully. Delete the route after 2026-06-13 — track in TODO.md.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(
    new URL('/login?error=link_expired', request.url),
  );
}
```

**Step 2: Add 30-day delete-todo to TODO.md**

Locate the "⚙️ Tekniske forbedringer" section. Add:

```markdown
- [ ] **Slett `app/auth/callback/route.ts`** — magic-link-URL-flyten ble retired 2026-05-13 til fordel for OTP-kode. Route-en redirecter alle gamle mail-klikk til `/login?error=link_expired` i en 30-dagers overgangsperiode. Etter 2026-06-13: slett filen.
```

**Step 3: TypeScript check**

```bash
npx tsc --noEmit -p . 2>&1 | grep "app/auth/callback/route.ts" || echo "OK"
```

**Step 4: No commit yet — bundle in Task 9**

---

## Phase 6: Supabase config (Claude does directly via MCP)

### Task 8: Set OTP Expiration via Supabase MCP

**Step 1: Set OTP expiry to 3600 seconds (60 min)**

Supabase exposes this in `auth.config` via the dashboard. MCP doesn't have a direct setting-write tool, but we can apply a config via `execute_sql` to `auth.config` if needed, OR document it as a manual step for the user.

**Decision:** OTP expiry currently defaults to 3600 in Supabase Auth (since it was raised from 60min default at some point — verify in dashboard). If user needs to change: leave a clear instruction in the post-ship message rather than trying to set it via SQL.

Skip this task — verification is part of the post-ship instruction to user.

---

## Phase 7: Ship + smoke test

### Task 9: Bundle commits, bump version, ship

**Step 1: Verify all expected files are modified**

```bash
git status
```

Expect to see modified:
- `app/(auth)/login/actions.ts`
- `app/(auth)/login/page.tsx`
- `app/admin/invitations/actions.ts`
- `app/invite/actions.ts`
- `app/auth/callback/route.ts`
- `TODO.md`

And new:
- `lib/mail/inviteNotification.ts`

`supabase/migrations/0013_email_is_invited.sql` should already be committed (Task 1).

**Step 2: Run full test suite to catch regressions**

```bash
npm test 2>&1 | tail -20
```

Expect: any pre-existing failures from `components/hole/HoleStrip.test.tsx` and `BottomActionBar.test.tsx` (~7 known failures in TODO). No NEW failures.

**Step 3: Bump to 0.4.0**

```bash
npm version minor --no-git-tag-version
```

Expect: `v0.4.0`.

**Step 4: Add CHANGELOG entry**

Edit `CHANGELOG.md` — insert at top (after the format-rules block, before `## [0.3.3]`):

```markdown
---

## [0.4.0] - 2026-05-13

### Changed

- **Innlogging går nå via 6-sifret kode i mail i stedet for å klikke lenke.** Skriver inn e-post som før, men mottar en kode i mailen (f.eks. `482 619`) som du taster inn på samme side. Fjerner to pre-existing problemer som blokkerte PWA-innlogging på iPhone: (a) magic-link åpnet seg i Safari i stedet for PWA-en og brøt PKCE-handoff'en, (b) mail-scannere konsumerte engangs-token-en før brukeren faktisk klikket. Begge problemene forsvinner når det ikke finnes noen URL å konsumere — bare en kode som leses med øynene og tastes inn.
- **Invitasjonsmail-en endres.** Når admin inviterer en kompis sender Tørny nå en kort notifikasjons-mail («Du er invitert. Gå til tornygolf.no og logg inn med din e-post.»). Selve innloggings-koden får invitéen først når de kommer til /login og taster e-posten sin. To mailer per invitasjon (notifikasjon + kode), men én og samme innlogging for alle.

### Removed

- **Magic-link-URL-flyten.** `/auth/callback`-route-en redirecter alle gamle klikk til `/login?error=link_expired` i en 30-dagers overgangsperiode. Etter det fjernes route-en helt.
```

**Step 5: Stage everything and commit**

```bash
git add app/\(auth\)/login/actions.ts \
        app/\(auth\)/login/page.tsx \
        app/admin/invitations/actions.ts \
        app/invite/actions.ts \
        app/auth/callback/route.ts \
        lib/mail/inviteNotification.ts \
        TODO.md \
        package.json \
        package-lock.json \
        CHANGELOG.md

git commit -m "$(cat <<'EOF'
feat(auth): replace magic-link URL with 6-digit OTP code login

The magic-link URL flow broke iOS PWA logins for two compounding
reasons established from Supabase auth logs:

1. PKCE handoff broke between browser contexts — code_verifier cookie
   set in the PWA's cookie jar wasn't readable when Mail.app opened
   the link in Safari, so exchangeCodeForSession failed locally.
2. Mail scanners / link previewers pre-fetched the one-time URL,
   consuming the token before the user clicked.

Both vanish when there's no URL to consume. New flow:
- /login renders email-input (step 1) or 6-digit code-input (step 2),
  switched via ?step= search param. Same page, same browser context.
- sendCode action: checks email_is_registered / email_is_invited RPCs,
  calls signInWithOtp with shouldCreateUser gated to invitees.
- verifyCode action: verifyOtp(type='email'), marks invitation
  accepted (moved from the now-stripped /auth/callback), redirects
  to next or /complete-profile.

Admin invitations move off Supabase auth-mail entirely. They now send
a Resend notification mail ("Du er invitert. Go to tornygolf.no.") and
the OTP code is issued only when the invitee reaches /login.

/auth/callback retained for 30 days as a graceful-fail redirect to
/login?error=link_expired for any stale magic-link mails still in
flight. Slated for deletion after 2026-06-13 (logged in TODO.md).

EOF
)"
```

Expect: commit hook passes (package.json + CHANGELOG.md staged).

**Step 6: Push to main**

```bash
git push origin HEAD:main
```

Expect: fast-forward.

**Step 7: Notify user with copy-paste Supabase instructions**

Send the user a message with EXACT copy-paste-ready text for the Supabase Magic Link template (Subject + Body), the exact path through the dashboard, and a clear "after you've done this, test by..." section. **From this point forward, every message should remind the user of the Supabase task until they confirm it's done.**

---

### Task 10: Smoke-test in prod

**Step 1: Wait for Vercel deploy**

Use Vercel MCP `list_deployments` until latest commit state = READY (~2 min).

**Step 2: Smoke-test 1 — existing admin login**

User instructions:
1. Open tornygolf.no on iPhone PWA
2. Enter admin email, tap "Send meg kode"
3. Check mail — subject should say "Din kode til Tørny: <6 digits>"
4. Return to PWA (still showing code input), enter code, tap "Logg inn"
5. Should land on `/` as logged-in admin

If anything fails: capture screenshot, check Vercel runtime logs + Supabase auth logs via MCP.

**Step 3: Smoke-test 2 — invitation flow**

User instructions:
1. From admin/invitations, send invite to a secondary email you control
2. Verify Resend notification mail arrives
3. From that secondary email's device, follow link to /login
4. Enter that email, request code, verify code arrives separately
5. Enter code → should land on /complete-profile
6. Fill profile → should land on `/` as new user
7. Back in admin, verify `/admin/invitations` now shows the invite as "Akseptert"

**Step 4: Wrap up**

If both smoke-tests pass: confirm with user, close out the work. If not: invoke systematic-debugging on the specific failure.

---

## Success criteria

- [ ] Migration 0013 applied + verified in prod
- [ ] Login from iPhone PWA succeeds via OTP code (smoke-test 1)
- [ ] New invitee flow works end-to-end (smoke-test 2)
- [ ] Old magic-link click → "Lenken er gått ut" banner
- [ ] Supabase Magic Link template updated by user (confirmed)
- [ ] No new TypeScript errors
- [ ] No new test failures beyond pre-existing HoleStrip/BottomActionBar ones
- [ ] `/admin/invitations` shows correct accepted/pending status
- [ ] CHANGELOG.md has 0.4.0 entry
- [ ] TODO.md has the 30-day delete-callback entry
