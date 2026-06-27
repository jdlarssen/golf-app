# Push-varsler via Web Push API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Tørny's existing in-app notifications to the user's device as Web Push when the app is closed (mobile, tablet, PC), behind a one-tap opt-in.

**Architecture:** Push is a new delivery channel hooked into the single existing `notify()` fan-out. When a user is off-app, `notify()` additionally sends a best-effort Web Push to that user's subscribed devices — *in addition to* today's email (email behaviour is unchanged, so nobody goes dark if push is blocked/fails). A new `push_subscriptions` table holds per-device subscriptions; the service worker shows the notification and handles clicks; a profile toggle and a mobile-only post-install nudge drive opt-in.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), `web-push` (npm), hand-rolled service worker (`public/sw.js`), next-intl, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-27-push-notifications-design.md](../specs/2026-06-27-push-notifications-design.md)

---

## File Structure

**Create:**
- `supabase/migrations/0116_push_subscriptions.sql` — table + RLS
- `lib/notifications/cardContent.ts` — shared server-safe `buildNotificationText(kind, payload, t)` (extracted from NotificationCard)
- `lib/notifications/cardContent.test.ts` — Type A test
- `lib/notifications/inboxTranslator.ts` — server-side per-recipient `inbox`-namespace translator (reuses `lib/mail/i18n.ts`)
- `lib/notifications/push/vapid.ts` — VAPID init wrapper
- `lib/notifications/push/sendPush.ts` — `sendPushToUser(...)` fan-out + prune
- `lib/notifications/push/sendPush.test.ts` — Type A test
- `lib/pwa/push.ts` — client subscribe/unsubscribe + state detection
- `app/[locale]/profile/pushActions.ts` — `savePushSubscription` / `removePushSubscription`
- `components/pwa/PushToggle.tsx` — profile row (4 states)
- `components/pwa/PushNudge.tsx` — mobile-only post-install nudge

**Modify:**
- `components/notifications/NotificationCard.tsx` — use shared `buildNotificationText`
- `lib/notifications/notify.ts` — additive push fan-out + select `locale`
- `lib/notifications/notify.test.ts` — mock `sendPushToUser`, add off-app push test
- `public/sw.js` — `push` + `notificationclick` handlers + bump `CACHE_VERSION`
- `app/[locale]/profile/page.tsx` — mount `PushToggle`
- `app/[locale]/layout.tsx` — mount `PushNudge`
- `messages/no.json`, `messages/en.json` — UI strings (`pushSettings.*`)
- `lib/database.types.ts` — regenerate after migration
- `package.json`, `package-lock.json`, `CHANGELOG.md` — dep + version bump + changelog

**Owner step (manual, documented in Task 12):** set VAPID env vars in Vercel (staging + prod).

---

## Task 1: Add `web-push` dependency + VAPID config module

**Files:**
- Modify: `package.json` (dependencies)
- Create: `lib/notifications/push/vapid.ts`

- [ ] **Step 1: Install the library**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22
npm install web-push
npm install --save-dev @types/web-push
```
Expected: `web-push` added to `dependencies`, `@types/web-push` to `devDependencies`.

- [ ] **Step 2: Generate a VAPID keypair (for local/staging testing now)**

Run:
```bash
npx web-push generate-vapid-keys
```
Expected: prints a `Public Key:` and `Private Key:`. **Record both** — they go to the owner for Vercel env (Task 12) and into `.env.staging.local` for local/staging testing.

- [ ] **Step 3: Create the VAPID init wrapper**

Create `lib/notifications/push/vapid.ts`:
```ts
import 'server-only';
import webpush from 'web-push';

// VAPID = the app-server identity that signs Web Push requests. Keys are env-
// provided (own keypair per environment). Missing env → push degrades to a no-op
// and email still covers the user (additive design). See spec §7/§11.
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:post@tornygolf.no';

let configured = false;

/** True when VAPID env is present. When false, callers must skip push silently. */
export function isPushConfigured(): boolean {
  return PUBLIC_KEY.length > 0 && PRIVATE_KEY.length > 0;
}

/** Idempotently apply VAPID details to the web-push singleton. */
export function ensureVapid(): typeof webpush | null {
  if (!isPushConfigured()) return null;
  if (!configured) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  }
  return webpush;
}
```

- [ ] **Step 4: Add the keys to `.env.staging.local` for local testing**

Append to `.env.staging.local` (gitignored):
```
VAPID_PUBLIC_KEY=<public key from step 2>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same public key>
VAPID_PRIVATE_KEY=<private key from step 2>
VAPID_SUBJECT=mailto:post@tornygolf.no
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no errors from the new module).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/notifications/push/vapid.ts
git commit -m "build(push): add web-push dep + VAPID config wrapper

Refs #24"
```

---

## Task 2: Migration `0116_push_subscriptions` + RLS

**Files:**
- Create: `supabase/migrations/0116_push_subscriptions.sql`
- Modify: `lib/database.types.ts` (regenerated)

- [ ] **Step 1: Verify the next migration number**

Run: `ls supabase/migrations/ | tail -3`
Expected: highest is `0115_...`. If a parallel branch already added `0116`, renumber this file to the next free number and update references.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0116_push_subscriptions.sql`:
```sql
-- 0116_push_subscriptions.sql
-- #24: Web Push subscriptions, one row per device. A user may have several.
-- `notify()` reads these (admin client) to send a push when the user is off-app;
-- push is ADDITIVE on top of today's email, so this table is purely opt-in and
-- safe to apply before the code deploy (no writer exists until the client ships).

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Web Push subscription per device (#24). One user → many rows. notify() fans '
  'out a push to these when the user is off-app, in addition to email.';

alter table public.push_subscriptions enable row level security;

-- RLS: a user manages only their own device rows. user_id is set server-side
-- from the session, never from client payload.
create policy "push_subscriptions own select"
  on public.push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

create policy "push_subscriptions own insert"
  on public.push_subscriptions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "push_subscriptions own update"
  on public.push_subscriptions for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "push_subscriptions own delete"
  on public.push_subscriptions for delete to authenticated
  using (auth.uid() = user_id);
```

- [ ] **Step 3: Apply to staging via Supabase MCP**

Apply the migration to the **staging** project (ref `snwmueecmfqqdurxedxv`) using the Supabase MCP `apply_migration` tool. Do NOT touch prod yet.
Expected: success, table visible in `list_tables`.

- [ ] **Step 4: Regenerate types**

Run: `npm run gen:types`
Expected: `lib/database.types.ts` now contains a `push_subscriptions` entry under `public.Tables`.

- [ ] **Step 5: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0116_push_subscriptions.sql lib/database.types.ts
git commit -m "feat(push): push_subscriptions table + RLS (0116)

Refs #24"
```
> Note: this commit is `feat` but ships no user-visible behaviour on its own. The version bump for the whole feature happens in Task 12; if the commit-msg hook blocks this `feat` for a missing bump, change the prefix to `chore(push):` for this schema-only commit and keep the single bump in Task 12.

---

## Task 3: Extract shared notification text builder + refactor NotificationCard

**Files:**
- Create: `lib/notifications/cardContent.ts`
- Create: `lib/notifications/cardContent.test.ts`
- Modify: `components/notifications/NotificationCard.tsx`

- [ ] **Step 1: Write the failing test**

Create `lib/notifications/cardContent.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildNotificationText } from './cardContent';
import type { NotificationKind, NotificationPayload } from './types';

// A fake translator: returns "key" or "key|json(values)" so assertions can check
// which catalog key + interpolation values each kind resolves to, without loading
// the real next-intl catalog. Mirrors the (key, values) call shape both
// useTranslations('inbox') and createTranslator(...namespace:'inbox') expose.
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}|${JSON.stringify(values)}` : key;

const cases: Array<{ kind: NotificationKind; payload: NotificationPayload; title: string }> = [
  {
    kind: 'invite',
    payload: { game_id: 'g', game_name: 'Vinter-cup', invited_by_name: 'Jørgen' } as NotificationPayload,
    title: 'kinds.invite.title|{"invitedByName":"Jørgen"}',
  },
  {
    kind: 'game_finished',
    payload: { game_id: 'g', game_name: 'Sommercup' } as NotificationPayload,
    title: 'kinds.gameFinished.title',
  },
];

describe('buildNotificationText', () => {
  it.each(cases)('$kind → resolves the inbox title key', ({ kind, payload, title }) => {
    expect(buildNotificationText(kind, payload, t).title).toBe(title);
  });

  it('product_update renders DB content verbatim (no catalog key)', () => {
    const out = buildNotificationText(
      'product_update',
      { source_id: 's', title: 'Nyhet', body: 'Tekst' } as NotificationPayload,
      t,
    );
    expect(out).toEqual({ title: 'Nyhet', detail: 'Tekst' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/notifications/cardContent.test.ts`
Expected: FAIL — `buildNotificationText` not found.

- [ ] **Step 3: Create the shared builder**

Create `lib/notifications/cardContent.ts` by moving the body of `buildCardContent` out of `NotificationCard.tsx` verbatim, exporting it under the new name and a translator type that both call sites satisfy:
```ts
import type { NotificationKind, NotificationPayload } from './types';

/**
 * Minimal translator shape shared by client `useTranslations('inbox')` and the
 * server-side `createTranslator(...namespace:'inbox')`. Typed loosely on the key
 * so dynamic keys (e.g. reason codes) and both translator implementations fit.
 */
export type NotificationTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * Builds the title + one-line detail for a notification, per kind, from the
 * `inbox` catalog. Single source of truth used by both the inbox card (client)
 * and Web Push (server). Moved out of NotificationCard so push reuses it (#24).
 */
export function buildNotificationText(
  kind: NotificationKind,
  payload: NotificationPayload,
  t: NotificationTranslator,
): { title: string; detail: string } {
  switch (kind) {
    // ⬇️ PASTE the full switch body from the old buildCardContent here, unchanged,
    //    including every case from 'invite' through 'auto_start_blocked'.
    //    (See components/notifications/NotificationCard.tsx lines ~274–460.)
    default:
      return { title: '', detail: '' };
  }
}
```
> The executor MUST paste the complete existing switch (all 21 kinds) from `NotificationCard.tsx`'s `buildCardContent`, not a stub. The only changes are the function name and the `t` parameter type.

- [ ] **Step 4: Refactor NotificationCard to use it**

In `components/notifications/NotificationCard.tsx`:
1. Delete the local `buildCardContent` function and the local `Translator` type.
2. Add import: `import { buildNotificationText } from '@/lib/notifications/cardContent';`
3. Replace the call site `const { title, detail } = buildCardContent(kind, payload, t);` with:
```ts
const { title, detail } = buildNotificationText(
  kind,
  payload,
  t as unknown as import('@/lib/notifications/cardContent').NotificationTranslator,
);
```

- [ ] **Step 5: Run tests + typecheck**

Run:
```bash
npx vitest run lib/notifications/cardContent.test.ts components/notifications/NotificationCard.test.tsx
npx tsc --noEmit
```
Expected: PASS. The existing `NotificationCard.test.tsx` still passes (behaviour unchanged).

- [ ] **Step 6: Commit**

```bash
git add lib/notifications/cardContent.ts lib/notifications/cardContent.test.ts components/notifications/NotificationCard.tsx
git commit -m "refactor(notifications): extract shared buildNotificationText

Single source of truth for notification title/detail, reused by Web Push.

Refs #24"
```

---

## Task 4: Server-side `inbox` translator helper

**Files:**
- Create: `lib/notifications/inboxTranslator.ts`

- [ ] **Step 1: Create the helper (reuses mail i18n)**

Create `lib/notifications/inboxTranslator.ts`:
```ts
import 'server-only';
import { createTranslator } from 'next-intl';
import { getMailMessages, resolveMailLocale } from '@/lib/mail/i18n';
import type { NotificationTranslator } from './cardContent';

/**
 * A translator scoped to the `inbox` namespace for a RECIPIENT's locale — the
 * server-side twin of the client `useTranslations('inbox')`. Reuses the mail
 * i18n catalog loader (per-recipient locale, ICU, Oslo timezone) so push text
 * matches the inbox card text exactly. See spec §8.3.
 */
export async function getInboxTranslator(
  locale: string | null | undefined,
): Promise<NotificationTranslator> {
  const loc = resolveMailLocale(locale);
  const t = createTranslator({
    locale: loc,
    messages: await getMailMessages(loc),
    namespace: 'inbox',
    timeZone: 'Europe/Oslo',
  });
  return t as unknown as NotificationTranslator;
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/inboxTranslator.ts
git commit -m "feat(push): server-side inbox-namespace translator for push text

Refs #24"
```
> If the commit-msg hook blocks `feat` for a missing bump, use `chore(push):` (single bump lives in Task 12).

---

## Task 5: `sendPushToUser` fan-out + prune

**Files:**
- Create: `lib/notifications/push/sendPush.ts`
- Create: `lib/notifications/push/sendPush.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/notifications/push/sendPush.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendNotificationMock = vi.fn();
vi.mock('../push/vapid', () => ({
  ensureVapid: () => ({ sendNotification: sendNotificationMock }),
  isPushConfigured: () => true,
}));

// Admin client mock: select subs by user_id, delete by endpoint, update last_used_at.
const subsRows: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> = [];
const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
const updateEqMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'push_subscriptions') throw new Error(`unexpected ${table}`);
      return {
        select: () => ({ eq: () => Promise.resolve({ data: subsRows, error: null }) }),
        delete: () => ({ eq: deleteEqMock }),
        update: () => ({ eq: updateEqMock }),
      };
    },
  }),
}));

vi.mock('@/lib/notifications/inboxTranslator', () => ({
  getInboxTranslator: async () => (key: string) => key,
}));
vi.mock('@/lib/notifications/cardContent', () => ({
  buildNotificationText: () => ({ title: 'T', detail: 'D' }),
}));
vi.mock('@/lib/notifications/deeplink', () => ({
  notificationDestination: () => '/games/abc',
}));

import { sendPushToUser } from './sendPush';

beforeEach(() => {
  sendNotificationMock.mockReset();
  deleteEqMock.mockClear();
  updateEqMock.mockClear();
  subsRows.length = 0;
});

describe('sendPushToUser', () => {
  it('no subscriptions → does not call web-push', async () => {
    await sendPushToUser({ userId: 'u', kind: 'game_finished', payload: {} as never, locale: 'no' });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('a 410 Gone response → prunes that subscription', async () => {
    subsRows.push({ id: '1', endpoint: 'https://push/x', p256dh: 'k', auth: 'a' });
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    await sendPushToUser({ userId: 'u', kind: 'game_finished', payload: {} as never, locale: 'no' });
    expect(deleteEqMock).toHaveBeenCalledWith('endpoint', 'https://push/x');
  });

  it('success → marks last_used_at, no prune', async () => {
    subsRows.push({ id: '1', endpoint: 'https://push/x', p256dh: 'k', auth: 'a' });
    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });
    await sendPushToUser({ userId: 'u', kind: 'game_finished', payload: {} as never, locale: 'no' });
    expect(updateEqMock).toHaveBeenCalledWith('endpoint', 'https://push/x');
    expect(deleteEqMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/notifications/push/sendPush.test.ts`
Expected: FAIL — `sendPushToUser` not found.

- [ ] **Step 3: Implement `sendPushToUser`**

Create `lib/notifications/push/sendPush.ts`:
```ts
import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureVapid, isPushConfigured } from './vapid';
import { buildNotificationText } from '@/lib/notifications/cardContent';
import { notificationDestination } from '@/lib/notifications/deeplink';
import { getInboxTranslator } from '@/lib/notifications/inboxTranslator';
import type { NotificationKind, NotificationPayload } from '@/lib/notifications/types';

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Best-effort Web Push fan-out to all of a user's devices. ADDITIVE on top of
 * email — never throws, never blocks the caller. No-ops when push is unconfigured
 * or the user has no subscriptions. Prunes dead subscriptions (404/410). #24.
 */
export async function sendPushToUser<K extends NotificationKind>(opts: {
  userId: string;
  kind: K;
  payload: NotificationPayload<K>;
  locale: string | null;
}): Promise<void> {
  try {
    const webpush = ensureVapid();
    if (!webpush || !isPushConfigured()) return;

    const admin = getAdminClient();
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', opts.userId);
    const rows = (subs ?? []) as SubRow[];
    if (rows.length === 0) return;

    const t = await getInboxTranslator(opts.locale);
    const { title, detail } = buildNotificationText(opts.kind, opts.payload, t);
    const url = notificationDestination({ kind: opts.kind, payload: opts.payload }) ?? '/';
    const body = JSON.stringify({ title, body: detail, url, kind: opts.kind });

    await Promise.allSettled(
      rows.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
          await admin
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('endpoint', sub.endpoint);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          } else {
            console.error('[push] send failed', sub.endpoint, err);
          }
        }
      }),
    );
  } catch (err) {
    // Never let push break the parent flow.
    console.error('[push] sendPushToUser failed', err);
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run:
```bash
npx vitest run lib/notifications/push/sendPush.test.ts
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/push/sendPush.ts lib/notifications/push/sendPush.test.ts
git commit -m "feat(push): sendPushToUser fan-out with dead-subscription prune

Refs #24"
```
> `chore(push):` if the hook blocks `feat` (bump in Task 12).

---

## Task 6: Wire push into `notify()` (additive, off-app)

**Files:**
- Modify: `lib/notifications/notify.ts`
- Modify: `lib/notifications/notify.test.ts`

- [ ] **Step 1: Update the test mocks + add the off-app push assertion**

In `lib/notifications/notify.test.ts`:

1. Add a mock for the push module near the top (after the `next/cache` mock):
```ts
const sendPushMock = vi.fn().mockResolvedValue(undefined);
vi.mock('./push/sendPush', () => ({
  sendPushToUser: (...args: unknown[]) => sendPushMock(...args),
}));
```
2. Change the `userSelectMock` type + default to also carry `locale`:
```ts
const userSelectMock = vi.fn<
  (...args: unknown[]) => Promise<{ data: { last_seen_at: string | null; locale: string | null } | null }>
>();
```
```ts
userSelectMock.mockResolvedValue({
  data: { last_seen_at: new Date().toISOString(), locale: 'no' },
});
```
3. In `beforeEach`, add `sendPushMock.mockClear();`
4. Add a new test inside `describe('notify (validation-rekkefølge)', ...)`:
```ts
it('off-app user → sends push AND shouldAlsoSendMail true', async () => {
  userSelectMock.mockResolvedValueOnce({
    data: { last_seen_at: null, locale: 'no' }, // null = off-app
  });
  const { notify } = await import('./notify');

  const result = await notify({
    userId: '00000000-0000-0000-0000-000000000001',
    kind: 'game_finished',
    payload: { game_id: '00000000-0000-0000-0000-000000000002', game_name: 'Cup' },
  });

  expect(sendPushMock).toHaveBeenCalledTimes(1);
  expect(result.shouldAlsoSendMail).toBe(true);
});

it('on-app user → no push', async () => {
  // default mock = fresh last_seen_at (active)
  const { notify } = await import('./notify');
  await notify({
    userId: '00000000-0000-0000-0000-000000000001',
    kind: 'game_finished',
    payload: { game_id: '00000000-0000-0000-0000-000000000002', game_name: 'Cup' },
  });
  expect(sendPushMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to verify the new tests fail**

Run: `npx vitest run lib/notifications/notify.test.ts`
Expected: FAIL — push not yet called; `locale` not selected.

- [ ] **Step 3: Update `notify()`**

In `lib/notifications/notify.ts`:

1. Add import: `import { sendPushToUser } from './push/sendPush';`
2. Change the user select to also fetch `locale`:
```ts
admin
  .from('users')
  .select('last_seen_at, locale')
  .eq('id', userId)
  .single<{ last_seen_at: string | null; locale: string | null }>(),
```
3. After the successful insert + `revalidateTag(...)`, before the `return`, compute off-app once and fan out push when off-app:
```ts
const offApp = shouldSendMailFallback(userRes.data?.last_seen_at ?? null);

// Additive Web Push: when the user is off-app, also push to their devices.
// Best-effort — sendPushToUser never throws. Email is unchanged (offApp), so a
// blocked/failed push never leaves the user dark. (#24, spec §4)
if (offApp) {
  await sendPushToUser({
    userId,
    kind,
    payload,
    locale: userRes.data?.locale ?? null,
  });
}

return { shouldAlsoSendMail: offApp };
```
> Replace the existing `return { shouldAlsoSendMail: shouldSendMailFallback(...) }` with the block above so `offApp` is computed once.

- [ ] **Step 4: Run tests + typecheck**

Run:
```bash
npx vitest run lib/notifications/notify.test.ts
npx tsc --noEmit
```
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/notify.ts lib/notifications/notify.test.ts
git commit -m "feat(push): fan out Web Push from notify() for off-app users

Additive on top of email; best-effort; on-app users unaffected.

Refs #24"
```
> `chore(push):` if the hook blocks `feat` (bump in Task 12).

---

## Task 7: Service worker `push` + `notificationclick` handlers

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: Bump the cache version**

In `public/sw.js`, change:
```js
const CACHE_VERSION = 'v2';
```
to:
```js
const CACHE_VERSION = 'v3';
```

- [ ] **Step 2: Append the push handlers at the end of the file**

Add to the end of `public/sw.js`:
```js
// ── Web Push (#24) ───────────────────────────────────────────────────────────
// The app server (lib/notifications/push/sendPush.ts) posts an encrypted JSON
// payload {title, body, url, kind}. We show it as a native notification and, on
// click, focus an open tab (navigating it) or open a new window at the deeplink.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Tørny', {
      body: data.body || '',
      icon: '/icon',
      badge: '/icon',
      tag: data.kind,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(url); } catch { /* cross-origin guard */ }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
```

- [ ] **Step 3: Verify the file is valid JS**

Run: `node --check public/sw.js`
Expected: no output (valid syntax).

- [ ] **Step 4: Commit**

```bash
git add public/sw.js
git commit -m "feat(push): service worker push + notificationclick handlers

Bumps CACHE_VERSION to v3 so clients pick up the new SW.

Refs #24"
```
> `chore(push):` if the hook blocks `feat` (bump in Task 12).

---

## Task 8: Client push subscribe/unsubscribe library

**Files:**
- Create: `lib/pwa/push.ts`

- [ ] **Step 1: Create the client push helper**

Create `lib/pwa/push.ts`:
```ts
'use client';

import { isStandalone, isIosSafari } from './detect';

export type PushState =
  | 'loading'      // before useEffect resolves
  | 'unsupported'  // browser lacks the APIs
  | 'ios-install'  // iOS Safari tab — must install to home screen first
  | 'blocked'      // Notification.permission === 'denied'
  | 'off'          // supported, not subscribed
  | 'on';          // subscribed on this device

/** Web Push needs SW + PushManager + Notification. iOS additionally needs install. */
export function pushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** VAPID public key (base64url) → Uint8Array for pushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Resolve the current push state for this device. */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) {
    return isIosSafari() && !isStandalone() ? 'ios-install' : 'unsupported';
  }
  if (isIosSafari() && !isStandalone()) return 'ios-install';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/**
 * Ask for permission, subscribe, and persist on the server. Returns the new
 * state. Triggered by a user gesture (button) — requestPermission() shows the
 * OS dialog; if already 'denied' it resolves 'denied' with no prompt (#24 spec §3.4).
 */
export async function enablePush(
  save: (sub: PushSubscriptionJSON, userAgent: string) => Promise<void>,
): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';

  const reg = await navigator.serviceWorker.ready;
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  await save(sub.toJSON(), navigator.userAgent);
  return 'on';
}

/** Unsubscribe on this device and remove the server row. */
export async function disablePush(
  remove: (endpoint: string) => Promise<void>,
): Promise<PushState> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await remove(endpoint);
  }
  return 'off';
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/pwa/push.ts
git commit -m "feat(push): client subscribe/unsubscribe + per-device state

Refs #24"
```
> `chore(push):` if the hook blocks `feat` (bump in Task 12).

---

## Task 9: Server actions — save/remove subscription

**Files:**
- Create: `app/[locale]/profile/pushActions.ts`

- [ ] **Step 1: Create the server actions**

Create `app/[locale]/profile/pushActions.ts`:
```ts
'use server';

import { getServerClient } from '@/lib/supabase/server';
import { expectOne } from '@/lib/supabase/affectedRows';

type SubJSON = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

/**
 * Upsert the caller's push subscription for the current device (#24). RLS limits
 * rows to the caller; user_id is taken from the session, never the client.
 */
export async function savePushSubscription(sub: SubJSON, userAgent: string): Promise<void> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error('invalid_subscription');

  expectOne(
    await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: userAgent.slice(0, 400),
        },
        { onConflict: 'endpoint' },
      )
      .select(),
    'savePushSubscription',
  );
}

/** Remove the caller's subscription for a given endpoint (turn off this device). */
export async function removePushSubscription(endpoint: string): Promise<void> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  // Best-effort: deleting an already-gone row is fine (no expectAffected here —
  // the client may have unsubscribed a sub the server already pruned on 410).
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id);
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/[locale]/profile/pushActions.ts
git commit -m "feat(push): server actions to save/remove a device subscription

Refs #24"
```
> `chore(push):` if the hook blocks `feat` (bump in Task 12).

---

## Task 10: `PushToggle` profile row + i18n + wire into profile

**Files:**
- Create: `components/pwa/PushToggle.tsx`
- Modify: `messages/no.json`, `messages/en.json`
- Modify: `app/[locale]/profile/page.tsx`

- [ ] **Step 1: Add i18n strings**

In `messages/no.json`, add a top-level `pushSettings` object (place near other settings namespaces):
```json
"pushSettings": {
  "title": "Varsler på denne enheten",
  "off": "Av",
  "on": "På · denne enheten",
  "enable": "Slå på varsler",
  "permissionNote": "Telefonen spør deg om lov én gang.",
  "blockedTitle": "Varsler er blokkert i telefonen",
  "blockedIntro": "Du har slått av varsler for Tørny tidligere. Slik slår du dem på igjen:",
  "blockedStep1": "Åpne Innstillinger på telefonen",
  "blockedStep2": "Gå til Varsler → Tørny",
  "blockedStep3": "Slå på Tillat varsler",
  "blockedFootnote": "Appen får ikke lov å åpne Innstillinger for deg.",
  "emailBackstop": "Du får fortsatt beskjed på e-post i mellomtiden.",
  "iosInstallTitle": "Legg Tørny til på hjemskjermen først",
  "iosInstallBody": "Trykk Del → «Legg til på Hjem-skjerm», så kan du slå på varsler."
}
```
In `messages/en.json`, add the same keys with English copy (e.g. `"title": "Notifications on this device"`, etc.).

- [ ] **Step 2: Create the component**

Create `components/pwa/PushToggle.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  getPushState,
  enablePush,
  disablePush,
  type PushState,
} from '@/lib/pwa/push';
import { savePushSubscription, removePushSubscription } from '@/app/[locale]/profile/pushActions';

export function PushToggle() {
  const t = useTranslations('pushSettings');
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  // On desktop + Android + installed iOS this renders the toggle; on iOS Safari
  // tab it renders the install hint; when unsupported it renders nothing.
  if (state === 'loading' || state === 'unsupported') return null;

  async function turnOn() {
    setBusy(true);
    try {
      setState(await enablePush(savePushSubscription));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      setState(await disablePush(removePushSubscription));
    } finally {
      setBusy(false);
    }
  }

  if (state === 'ios-install') {
    return (
      <div className="rounded-xl border border-border bg-bg-tint p-4">
        <p className="font-medium text-sm text-text">{t('iosInstallTitle')}</p>
        <p className="mt-1 text-xs text-text-muted leading-relaxed">{t('iosInstallBody')}</p>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div className="rounded-xl border border-border bg-bg-tint p-4">
        <p className="font-medium text-sm text-text">{t('blockedTitle')}</p>
        <p className="mt-1 text-xs text-text-muted leading-relaxed">{t('blockedIntro')}</p>
        <ol className="mt-2 space-y-1 text-xs text-text list-decimal list-inside">
          <li>{t('blockedStep1')}</li>
          <li>{t('blockedStep2')}</li>
          <li>{t('blockedStep3')}</li>
        </ol>
        <p className="mt-2 text-xs text-text-muted">{t('blockedFootnote')}</p>
        <p className="mt-2 text-xs text-text-muted">{t('emailBackstop')}</p>
      </div>
    );
  }

  // 'off' or 'on'
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-text">{t('title')}</p>
        <p className="text-xs text-text-muted">{state === 'on' ? t('on') : t('off')}</p>
      </div>
      {state === 'on' ? (
        <button
          type="button"
          onClick={turnOff}
          disabled={busy}
          role="switch"
          aria-checked="true"
          aria-label={t('title')}
          className="relative h-7 w-12 rounded-full bg-primary transition-colors disabled:opacity-50"
        >
          <span className="absolute top-[3px] left-[23px] h-[22px] w-[22px] rounded-full bg-white" />
        </button>
      ) : (
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          className="rounded-full bg-primary text-bg-tint px-4 py-2 text-sm font-medium min-h-11 disabled:opacity-50"
        >
          {t('enable')}
        </button>
      )}
    </div>
  );
}
```
> Match `bg-surface` / `bg-bg-tint` / `text-text` to whatever utility names exist in `app/globals.css`; if they differ, use the project's equivalents (the existing `InstallBanner.tsx` is the reference for class names).

- [ ] **Step 3: Mount it in the profile settings**

In `app/[locale]/profile/page.tsx`, inside the labelled settings sections (see the comment around line 219, "Settings split into labelled sections"), add a section that renders `<PushToggle />`:
```tsx
import { PushToggle } from '@/components/pwa/PushToggle';
// ...
<section>
  <PushToggle />
</section>
```

- [ ] **Step 4: Run i18n parity + typecheck**

Run:
```bash
npx vitest run messages/catalogParity.test.ts
npx tsc --noEmit
```
Expected: PASS (no/en key parity holds; component compiles).

- [ ] **Step 5: Run the humanizer on new Norwegian copy**

Invoke the `humanizer:humanizer` skill on the new `pushSettings.*` Norwegian strings; apply any fixes.

- [ ] **Step 6: Commit**

```bash
git add components/pwa/PushToggle.tsx app/[locale]/profile/page.tsx messages/no.json messages/en.json
git commit -m "feat(push): profile toggle with on/off/blocked/ios-install states

Refs #24"
```
> `chore(push):` if the hook blocks `feat` (bump in Task 12).

---

## Task 11: `PushNudge` (mobile-only) + wire into layout

**Files:**
- Create: `components/pwa/PushNudge.tsx`
- Modify: `messages/no.json`, `messages/en.json`
- Modify: `app/[locale]/layout.tsx`

- [ ] **Step 1: Add i18n strings**

Add to `pushSettings` in `messages/no.json`:
```json
"nudgeTitle": "Få beskjed med en gang",
"nudgeBody": "Slå på varsler, så sier vi ifra når du blir invitert, et kort skal godkjennes, eller resultatet er klart.",
"nudgeLater": "Ikke nå",
"nudgeDoneTitle": "Varsler er på",
"nudgeDoneBody": "Vi sier ifra med en gang noe skjer."
```
Add the English equivalents to `messages/en.json`.

- [ ] **Step 2: Create the nudge component**

Create `components/pwa/PushNudge.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isStandalone, isIos } from '@/lib/pwa/detect';
import { getPushState, enablePush, type PushState } from '@/lib/pwa/push';
import { savePushSubscription } from '@/app/[locale]/profile/pushActions';

const DISMISS_KEY = 'torny-push-nudge-dismissed';

/**
 * One-time post-install prompt to turn on push. MOBILE/TABLET ONLY: shown only
 * when running as an installed PWA (isStandalone) on a touch device, push is
 * supported but off, and the nudge hasn't been dismissed. Never on desktop. (#24)
 */
export function PushNudge() {
  const t = useTranslations('pushSettings');
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isStandalone()) return;            // installed PWA only
    if (!isIos() && !('ontouchstart' in window)) return; // touch (mobile/tablet) only
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch { /* private mode */ }
    if (dismissed) return;
    getPushState().then((s: PushState) => {
      if (s === 'off') setShow(true);
    });
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  }

  async function turnOn() {
    setBusy(true);
    try {
      const next = await enablePush(savePushSubscription);
      if (next === 'on') { setDone(true); dismiss(); }
      else setShow(false); // blocked/denied — the profile row explains it
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
        <p className="font-medium text-sm text-text">{t('nudgeDoneTitle')}</p>
        <p className="text-xs text-text-muted mt-0.5">{t('nudgeDoneBody')}</p>
      </div>
    );
  }
  if (!show) return null;

  return (
    <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 p-4">
      <p className="font-medium text-sm text-text">{t('nudgeTitle')}</p>
      <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{t('nudgeBody')}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          className="rounded-full bg-primary text-bg-tint px-4 py-2 text-sm font-medium min-h-11 disabled:opacity-50"
        >
          {t('enable')}
        </button>
        <button type="button" onClick={dismiss} className="text-text-muted text-sm px-3 min-h-11">
          {t('nudgeLater')}
        </button>
      </div>
    </div>
  );
}
```
> Reuse the same Tailwind utility names as `InstallBanner.tsx`. The nudge's placement should match where `InstallBanner` renders (home/app shell), not globally.

- [ ] **Step 3: Mount it where InstallBanner lives**

Render `<PushNudge />` in the same place the home/app-shell renders `InstallBanner` (check where `InstallBanner` is mounted; if it is on the home page, mount `PushNudge` adjacent to it). If `InstallPromptCapture`/`PwaBoot` are mounted in `app/[locale]/layout.tsx`, `PushNudge` may also be mounted there — but ensure it only renders on the authenticated home shell, not on `/login` etc. (the `isStandalone` + `off` gating already prevents most spurious displays).

- [ ] **Step 4: i18n parity + typecheck**

Run:
```bash
npx vitest run messages/catalogParity.test.ts
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 5: Humanizer on new copy**

Invoke `humanizer:humanizer` on the new nudge strings; apply fixes.

- [ ] **Step 6: Commit**

```bash
git add components/pwa/PushNudge.tsx app/[locale]/layout.tsx messages/no.json messages/en.json
git commit -m "feat(push): mobile-only post-install nudge to enable notifications

Refs #24"
```
> `chore(push):` if the hook blocks `feat` (bump in Task 12).

---

## Task 12: Version bump, CHANGELOG, owner env step, full verification

**Files:**
- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md`

- [ ] **Step 1: Bump the version (minor — user-visible feature)**

Run:
```bash
npm version minor --no-git-tag-version
```
Expected: `package.json` version bumped (minor).

- [ ] **Step 2: Add the CHANGELOG line**

In `CHANGELOG.md`, under the Funksjoner (Features) section, add (read `docs/changelog-conventions.md` first):
```
- Du kan nå slå på varsler og få beskjed rett på telefonen — invitasjoner, godkjenninger og resultater dukker opp selv når appen er lukket.
```

- [ ] **Step 3: Run the full local gate**

Run:
```bash
npx tsc --noEmit
npm run lint
npx vitest run lib/notifications components/pwa components/notifications app/[locale]/profile
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "feat(push): ship Web Push notifications (#24)

Refs #24"
```

- [ ] **Step 5: Owner env step (message the owner)**

Tell the owner to add these to **Vercel → Project → Settings → Environment Variables** for **both Production and Preview/staging** (use the keypair generated in Task 1; ideally a SEPARATE keypair for prod vs staging):
- `VAPID_PUBLIC_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (same value as public key)
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` = `mailto:post@tornygolf.no`

Expected confirmation: owner reports the vars saved. Without them, push degrades to no-op (email still covers users).

- [ ] **Step 6: Apply migration to prod**

After staging verification passes, apply `0116_push_subscriptions.sql` to the **prod** Supabase project via MCP (0107 staging→prod pattern).

- [ ] **Step 7: Staging end-to-end verification**

On staging (`preview_start("torny-staging")`, Node 22), verify the affected flow on: an **installed iPhone PWA**, **Android Chrome**, and **one desktop browser**:
1. Open profile → see the `PushToggle` row → "Slå på varsler" → grant → row shows "På".
2. Trigger a notification (e.g. invite the test player, or finish a game) for an **off-app** recipient → confirm a push arrives with correct localized title/text → tapping it opens the correct deeplink.
3. Verify the **blocked** state copy appears if permission is denied.
4. Verify the recipient still receives the email (additive backstop).
5. Confirm **0 writes to prod** (staging-only session).

- [ ] **Step 8: Push branch + open PR**

```bash
git push origin <branch>
gh pr create --base main --title "Push-varsler via Web Push API (#24)" --body-file <(printf 'Closes #24\n\nSlå på varsler og få beskjed rett på telefonen når appen er lukket.')
```

- [ ] **Step 9: Closing comment (after merge)**

Post the mandatory `gh issue comment 24` with **## Teknisk** (files/approach, additive-on-email decision, decoupling from #951, channel-chooser rejected) and **## Funksjonell** (plain-Norwegian: "Du kan nå slå på varsler …").

---

## Self-Review Notes

- **Spec coverage:** §4 notify wiring → Task 6; §5 table → Task 2; §6 RLS → Task 2; §7 VAPID → Task 1 + Task 12 step 5; §8.1 sendPush → Task 5; §8.2 vapid → Task 1; §8.3 text builder → Task 3 + Task 4; §9 SW → Task 7; §10.1–10.2 client → Task 8; §10.3 toggle → Task 10; §10.4 nudge → Task 11; §11 edge-cases covered by sendPush/notify best-effort + blocked state; §12 testing → Tasks 3/5/6; §13 delivery → Task 12; §14 issue/flow → Task 12 step 9.
- **Type consistency:** `buildNotificationText` / `NotificationTranslator` used identically in Tasks 3, 4, 5. `sendPushToUser` signature `{ userId, kind, payload, locale }` identical in Tasks 5 and 6. `PushState` union shared across Tasks 8, 10, 11. `savePushSubscription`/`removePushSubscription` signatures match between Task 9 (def) and Tasks 8/10/11 (use).
- **Decision recorded:** additive email (not "push instead of email") — single bump in Task 12; per-commit `feat`→`chore` fallback noted because the feature lands over many commits but bumps once.
