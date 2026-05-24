# In-app innboks / varslings-senter — implementeringsplan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Levere in-app innboks for Tørny med 5 v1 events, bjelle-badge i TopBar, dedikert /innboks-rute, og mail-fallback for off-app brukere.

**Architecture:** Polymorf `notifications`-tabell med JSONB payload, RLS-scoped til `auth.uid()`. Server-actions kaller `notify()`-helper som inserter rad + returnerer off-app-flagg. Mail sendes kun hvis off-app. Bjelle bruker Supabase realtime for live badge-oppdatering. Mark-as-read fanger både tap-i-innboks OG mail-deeplink-klikk via server-side helpers på målsider.

**Tech Stack:** Next.js 16 App Router (server actions + RSC), Supabase Postgres + RLS + realtime, Tailwind v4, Vitest + Testing Library. Norsk UI-tekst, engelsk kode.

**Design-doc:** [`docs/plans/2026-05-24-inbox-notifications-design.md`](./2026-05-24-inbox-notifications-design.md)

**Branch:** `issue-25-inbox-notifications`

**Issue:** [#25](https://github.com/jdlarssen/golf-app/issues/25)

---

## Phase 1 — Datamodell + helpers (foundation)

Leverer datalaget + helpers UTEN UI-endringer. End state: kan inserte/lese notifications fra server-actions, alle tester grønne, ingen synlig UI-endring i appen.

**Slutt-PR:** «feat(notifications): tabell + RLS + notify/markRead-helpers (#25 Phase 1)» — patch-bump 1.14.3.

### Task 1.1: Migrasjon for notifications-tabellen

**Files:**
- Create: `supabase/migrations/0032_notifications.sql`

**Step 1: Skriv migrasjonen**

```sql
-- 0032_notifications.sql
-- In-app innboks for varsler (issue #25).
--
-- Polymorf tabell med kind-discriminator og JSONB-payload. Payload-shape
-- per kind valideres i TypeScript-laget via Zod før insert (ingen DB-CHECK
-- på struktur — gjør utvidelse til nye kind-verdier billig).
--
-- RLS: hver bruker ser/oppdaterer kun sine egne rader. Inserts skjer via
-- server-actions med admin-client (ingen klient-insert-policy).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'game_finished'
  )),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Partial index for ulest-teller + listevisning (vanligste query).
create index notifications_user_unread_created
  on public.notifications(user_id, created_at desc)
  where read_at is null;

-- Full historikk-index for /innboks-listen (uleste + leste sortert).
create index notifications_user_created
  on public.notifications(user_id, created_at desc);

-- Aktiver RLS.
alter table public.notifications enable row level security;

-- Spillere ser kun egne varsler.
create policy notifications_select_own
  on public.notifications for select
  using (user_id = auth.uid());

-- Spillere oppdaterer kun egne (for read_at-mutasjon via «marker som lest»).
-- WITH CHECK forhindrer at user_id endres via update.
create policy notifications_update_own
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Realtime: legg til i supabase_realtime-publikasjonen så NotificationBell
-- kan subbe til INSERT/UPDATE-events for live badge-oppdatering.
alter publication supabase_realtime add table public.notifications;
```

**Step 2: Apply migrasjonen via Supabase MCP**

Bruk `mcp__36be25a6...__apply_migration` med name `0032_notifications` og query fra fil.

**Step 3: Verifiser at tabellen + RLS er på plass**

Run via MCP `execute_sql`:
```sql
select tablename, rowsecurity from pg_tables where tablename = 'notifications';
select policyname from pg_policies where tablename = 'notifications';
```
Expected: rowsecurity=true, 2 policies (select_own + update_own).

**Step 4: Commit**

```bash
git add supabase/migrations/0032_notifications.sql
git commit -m "feat(db): notifications-tabell + RLS for in-app innboks

Refs #25
"
```

---

### Task 1.2: TypeScript-typer + Zod-skjemaer for payloads

**Files:**
- Create: `lib/notifications/types.ts`
- Create: `lib/notifications/types.test.ts`

**Step 1: Skriv tester først (TDD)**

```ts
// lib/notifications/types.test.ts
import { describe, it, expect } from 'vitest';
import { parseNotificationPayload, NotificationKind } from './types';

describe('parseNotificationPayload', () => {
  it('aksepterer gyldig invite-payload', () => {
    const result = parseNotificationPayload('invite', {
      game_id: '11111111-1111-1111-1111-111111111111',
      game_name: 'Hauger Open',
      invited_by_name: 'Per',
    });
    expect(result.kind).toBe('invite');
    expect(result.payload.game_name).toBe('Hauger Open');
  });

  it('aviser invite-payload uten game_id', () => {
    expect(() =>
      parseNotificationPayload('invite', { game_name: 'X', invited_by_name: 'Y' }),
    ).toThrow();
  });

  it('aksepterer alle 5 kind-verdier', () => {
    const kinds: NotificationKind[] = [
      'invite',
      'peer_approval_request',
      'scorecard_submitted',
      'scorecard_approved',
      'game_finished',
    ];
    for (const kind of kinds) {
      expect(() =>
        parseNotificationPayload(kind, {
          game_id: '11111111-1111-1111-1111-111111111111',
          game_name: 'X',
          ...(kind === 'invite' && { invited_by_name: 'Per' }),
          ...(kind === 'peer_approval_request' && { submitter_name: 'Per' }),
          ...(kind === 'scorecard_submitted' && { player_name: 'Per' }),
          ...(kind === 'scorecard_approved' && { approver_name: 'Per' }),
        }),
      ).not.toThrow();
    }
  });
});
```

**Step 2: Run tester for å verifisere de feiler**

Run: `npx vitest run lib/notifications/types.test.ts`
Expected: FAIL med «cannot find module './types'».

**Step 3: Implementer types.ts**

```ts
// lib/notifications/types.ts
import { z } from 'zod';

export type NotificationKind =
  | 'invite'
  | 'peer_approval_request'
  | 'scorecard_submitted'
  | 'scorecard_approved'
  | 'game_finished';

const uuid = z.string().uuid();

const inviteSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  invited_by_name: z.string().min(1),
});

const peerApprovalRequestSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  submitter_name: z.string().min(1),
});

const scorecardSubmittedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  player_name: z.string().min(1),
});

const scorecardApprovedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  approver_name: z.string().min(1),
});

const gameFinishedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
});

const schemas = {
  invite: inviteSchema,
  peer_approval_request: peerApprovalRequestSchema,
  scorecard_submitted: scorecardSubmittedSchema,
  scorecard_approved: scorecardApprovedSchema,
  game_finished: gameFinishedSchema,
} as const;

export type NotificationPayload<K extends NotificationKind = NotificationKind> =
  z.infer<(typeof schemas)[K]>;

export type ParsedNotification<K extends NotificationKind = NotificationKind> = {
  kind: K;
  payload: NotificationPayload<K>;
};

export function parseNotificationPayload<K extends NotificationKind>(
  kind: K,
  raw: unknown,
): ParsedNotification<K> {
  const schema = schemas[kind];
  const payload = schema.parse(raw) as NotificationPayload<K>;
  return { kind, payload };
}
```

**Step 4: Run tester for å verifisere de passerer**

Run: `npx vitest run lib/notifications/types.test.ts`
Expected: 3/3 PASS.

**Step 5: Commit**

```bash
git add lib/notifications/types.ts lib/notifications/types.test.ts
git commit -m "feat(notifications): zod-typer for de 5 notification-kindene

Refs #25
"
```

---

### Task 1.3: `notify()`-helper med off-app-gating

**Files:**
- Create: `lib/notifications/notify.ts`
- Create: `lib/notifications/notify.test.ts`

**Step 1: Sjekk eksisterende admin-client + last_seen_at-kolonne**

Run: `grep -rn "service_role\|adminClient\|SUPABASE_SERVICE" lib/supabase/ 2>&1 | head -10`

Forventet output: en admin-client-helper finnes (sjekk hva den heter — typisk `lib/supabase/admin.ts` eller lignende). Hvis IKKE finnes, lag den i denne tasken som ekstra step.

Run: `grep -n "last_seen_at" supabase/migrations/0019_users_last_seen_at.sql` for å bekrefte kolonne-navn.

**Step 2: Skriv tester først**

```ts
// lib/notifications/notify.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldSendMailFallback, OFF_APP_THRESHOLD_MS } from './notify';

describe('shouldSendMailFallback', () => {
  it('returnerer true når last_seen_at er null (aldri vært i appen)', () => {
    expect(shouldSendMailFallback(null)).toBe(true);
  });

  it('returnerer true når last_seen_at er eldre enn terskel', () => {
    const oldDate = new Date(Date.now() - OFF_APP_THRESHOLD_MS - 1000);
    expect(shouldSendMailFallback(oldDate.toISOString())).toBe(true);
  });

  it('returnerer false når last_seen_at er nyere enn terskel', () => {
    const recent = new Date(Date.now() - 60 * 1000); // 1 min siden
    expect(shouldSendMailFallback(recent.toISOString())).toBe(false);
  });

  it('returnerer true når last_seen_at er ugyldig ISO', () => {
    expect(shouldSendMailFallback('not-a-date')).toBe(true);
  });
});
```

**Step 3: Run tester for å verifisere de feiler**

Run: `npx vitest run lib/notifications/notify.test.ts`
Expected: FAIL med «cannot find module './notify'».

**Step 4: Implementer notify.ts**

```ts
// lib/notifications/notify.ts
import { revalidateTag } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin'; // verifiser faktisk path i Step 1
import {
  parseNotificationPayload,
  type NotificationKind,
  type NotificationPayload,
} from './types';

/**
 * Terskel for når brukeren regnes som «off-app» og dermed skal få mail
 * som backup på in-app varselet. 5 min er konservativt — dekker normal
 * idle/swap-mellom-apper-bruk uten å gi unødvendig mail-spam.
 */
export const OFF_APP_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Insert varsel + returner om mail bør sendes som backup. Caller er
 * ansvarlig for å trigge mail-sendingen — vi gjør ingen mail-IO her.
 *
 * Best-effort: feiler stille på DB-error (loggføres console.error).
 * Skal aldri blokkere parent-action som er en faktisk bruker-flyt.
 */
export async function notify<K extends NotificationKind>(opts: {
  userId: string;
  kind: K;
  payload: NotificationPayload<K>;
}): Promise<{ shouldAlsoSendMail: boolean }> {
  const { userId, kind, payload } = opts;

  // Validér payload mot zod-skjema før insert — bedre å feile tidlig
  // her enn å ha en korrupt JSONB-rad som /innboks ikke kan rendre.
  parseNotificationPayload(kind, payload);

  const admin = getAdminClient();

  // Insert + lookup last_seen_at i parallell. Insert er den autoritative
  // operasjonen; mail-gaten er informativ.
  const [insertRes, userRes] = await Promise.all([
    admin.from('notifications').insert({
      user_id: userId,
      kind,
      payload,
    }),
    admin
      .from('users')
      .select('last_seen_at')
      .eq('id', userId)
      .single<{ last_seen_at: string | null }>(),
  ]);

  if (insertRes.error) {
    console.error('[notifications] insert failed', insertRes.error);
    // Returner false så caller IKKE sender mail heller — vi vil ikke ha
    // en situasjon der mail går ut men in-app er tom (verre UX enn ingen).
    return { shouldAlsoSendMail: false };
  }

  // Invalider innboks-cache for brukeren slik at SSR-rendering ikke
  // serverer stale data. Bell-badgen oppdateres via realtime, men
  // direkte /innboks-navigering går gjennom cache.
  revalidateTag(`notifications-${userId}`);

  return {
    shouldAlsoSendMail: shouldSendMailFallback(userRes.data?.last_seen_at ?? null),
  };
}

/**
 * Pure helper for off-app-beregning. Eksportert for testing.
 */
export function shouldSendMailFallback(lastSeenAt: string | null): boolean {
  if (lastSeenAt == null) return true;
  const ts = Date.parse(lastSeenAt);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > OFF_APP_THRESHOLD_MS;
}
```

**Step 5: Run tester**

Run: `npx vitest run lib/notifications/notify.test.ts`
Expected: 4/4 PASS.

**Step 6: Commit**

```bash
git add lib/notifications/notify.ts lib/notifications/notify.test.ts
git commit -m "feat(notifications): notify-helper med off-app-mail-gating

Refs #25
"
```

---

### Task 1.4: `markNotificationsRead()`-helper

**Files:**
- Create: `lib/notifications/markRead.ts`
- Create: `lib/notifications/markRead.test.ts`

**Step 1: Skriv tester først**

```ts
// lib/notifications/markRead.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMarkReadQuery } from './markRead';

describe('buildMarkReadQuery', () => {
  it('filtrerer kun på userId når kind+entityId ikke gitt', () => {
    const filters = buildMarkReadQuery({ userId: 'u1' });
    expect(filters).toEqual({ userId: 'u1', kind: null, entityId: null });
  });

  it('filtrerer på userId + kind', () => {
    const filters = buildMarkReadQuery({ userId: 'u1', kind: 'invite' });
    expect(filters).toEqual({ userId: 'u1', kind: 'invite', entityId: null });
  });

  it('filtrerer på userId + kind + entityId (game-scoped)', () => {
    const filters = buildMarkReadQuery({
      userId: 'u1',
      kind: 'game_finished',
      entityId: 'game-uuid',
    });
    expect(filters).toEqual({
      userId: 'u1',
      kind: 'game_finished',
      entityId: 'game-uuid',
    });
  });
});
```

**Step 2: Run tester for å verifisere de feiler**

Run: `npx vitest run lib/notifications/markRead.test.ts`
Expected: FAIL med «cannot find module './markRead'».

**Step 3: Implementer markRead.ts**

```ts
// lib/notifications/markRead.ts
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import type { NotificationKind } from './types';

export type MarkReadOpts = {
  userId: string;
  /** Hvis satt, kun varsler med denne kind markeres. */
  kind?: NotificationKind;
  /** Hvis satt, kun varsler hvor payload.game_id matcher (eller annen entity-key). */
  entityId?: string;
};

/**
 * Pure helper for filter-konstruksjon. Eksportert for testing — den faktiske
 * Supabase-query-en bygges i markNotificationsRead som ikke unit-testes
 * (krever live DB / mocking-tunge integrasjons-tester).
 */
export function buildMarkReadQuery(opts: MarkReadOpts) {
  return {
    userId: opts.userId,
    kind: opts.kind ?? null,
    entityId: opts.entityId ?? null,
  };
}

/**
 * Markerer matching uleste varsler som lest for `userId`. Best-effort:
 * feiler stille på error, blokkerer aldri parent-page-render.
 *
 * Brukes både ved tap-i-innboks og fra server-side helper på målsider
 * (f.eks. /games/[id]/leaderboard markerer game_finished-varsler for det
 * spillet). Mail-deeplink-klikk havner også her, siden mailen lenker til
 * samme target-rute.
 */
export async function markNotificationsRead(opts: MarkReadOpts): Promise<void> {
  const supabase = await getServerClient();

  let q = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', opts.userId)
    .is('read_at', null);

  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.entityId) q = q.eq('payload->>game_id', opts.entityId);

  const { error } = await q;
  if (error) {
    console.error('[notifications] markRead failed', error);
    return;
  }

  revalidateTag(`notifications-${opts.userId}`);
}
```

**Step 4: Run tester**

Run: `npx vitest run lib/notifications/markRead.test.ts`
Expected: 3/3 PASS.

**Step 5: Run full test-suite for å sikre ingen regresjon**

Run: `npm test -- --run`
Expected: alle tester grønne.

**Step 6: Commit**

```bash
git add lib/notifications/markRead.ts lib/notifications/markRead.test.ts
git commit -m "feat(notifications): markRead-helper for read-state-mutasjon

Refs #25
"
```

---

### Task 1.5: Typecheck + sluttverifisering + PR

**Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen output (ren).

**Step 2: Full test-suite**

Run: `npm test -- --run`
Expected: alle tester grønne (forventet 776 + 7 nye = 783).

**Step 3: Bump til 1.14.3 + CHANGELOG**

- Rediger `package.json` → version `1.14.3`
- Legg til CHANGELOG-entry under 1.14.y:

```markdown
### [1.14.3] - YYYY-MM-DD

> Datalaget for in-app innboks er på plass. Ingen synlige endringer i appen ennå — fase 1 av 4 mot in-app varslings-senter (#25).

<details>
<summary>Teknisk</summary>

#### Added
- `supabase/migrations/0032_notifications.sql` — `public.notifications`-tabell (polymorf med kind-discriminator + JSONB payload), RLS-policies (select/update kun egne), 2 indekser (uleste-partial + full-historikk), realtime-publikasjon.
- `lib/notifications/types.ts` — `NotificationKind`-union + Zod-skjemaer per kind. `parseNotificationPayload()` validerer payload mot kind før insert.
- `lib/notifications/notify.ts` — `notify()`-helper inserter rad og returnerer `shouldAlsoSendMail`-flagg basert på `users.last_seen_at` (5-min terskel). `shouldSendMailFallback()` er pure-helper for off-app-beregning.
- `lib/notifications/markRead.ts` — `markNotificationsRead()`-helper for read-state-mutasjon (filtrerbar på userId + kind + entityId).
- 10 nye unit-tester (types/notify/markRead).

#### Notes
- Phase 1 av 4 i issue #25-epic. Phase 2 leverer bjelle + /innboks UI; Phase 3 wires inn de 5 events; Phase 4 aktiverer off-app mail-gating.

</details>
```

**Step 4: Commit bump + changelog**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 1.14.3 — notifications foundation (#25 Phase 1)"
```

Wait — denne commiten endrer ikke bruker-synlig oppførsel direkte (kun infrastruktur). Hooken vil sannsynligvis ikke blokkere `chore` selv uten bump. Sjekk at hooken passerer.

Hvis hooken blokkerer feature-commits uten bump, må vi enten:
- Bump på en av feat-commitene i denne fasen (legg bumpen i task 1.1 i stedet)
- Eller bytte prefix på en av commitene til chore/refactor

ANBEFALING: bump skjer i en final dedikert «chore(release): 1.14.3» commit etter alle feat-commits. Hvis hooken kreves den i feat-commiten, flytt bumpen til Task 1.4 (markRead) i stedet og inkluder CHANGELOG der.

**Step 5: Push branch og åpne PR**

```bash
git push -u origin issue-25-inbox-notifications
gh pr create --base main --title "feat(notifications): tabell + RLS + helpers (#25 Phase 1)" --body "$(cat <<'EOF'
Refs #25 (Phase 1 av 4)

## Summary

Datalag-foundation for in-app innboks. Ingen synlige UI-endringer.

- Ny tabell \`public.notifications\` med RLS (select/update kun egne)
- Realtime-publikasjon klar for bjelle-badge i Phase 2
- TypeScript-typer + Zod-skjemaer for de 5 v1 event-kindene
- \`notify()\`-helper med off-app-mail-gating
- \`markNotificationsRead()\`-helper for read-state-mutasjon

## Test plan

- [x] \`npx tsc --noEmit\` — ren
- [x] \`npm test -- --run\` — alle grønne
- [ ] Verifiser i Supabase: tabell + RLS + indekser + realtime-publikasjon

Følgefaser:
- Phase 2: bjelle i TopBar + /innboks-rute
- Phase 3: wire \`notify()\` inn i de 5 server-actions
- Phase 4: aktiver off-app mail-gating
EOF
)"
```

---

## Phase 2 — Bjelle + /innboks UI

Leverer bjelle-ikon i TopBar med realtime-badge og dedikert `/innboks`-flate. End state: appen viser bjelle + tom innboks (siden ingen events trigger varsler ennå).

**Slutt-PR:** «feat(notifications): bjelle i TopBar + /innboks-rute (#25 Phase 2)» — minor-bump 1.15.0 (åpner ny minor-serie «In-app innboks»).

### Task 2.1: `useUnreadNotificationsCount`-hook med realtime

**Files:**
- Create: `hooks/useUnreadNotificationsCount.ts`
- Create: `hooks/useUnreadNotificationsCount.test.ts`

Hook returnerer `{ count: number, loading: boolean }` for current user. Initial fetch + realtime sub via eksisterende `subscribeRealtimeChannel`-pattern fra `lib/sync/realtimeChannel.ts`.

**Steps:** (TDD: skriv test først for count-håndtering på INSERT/UPDATE-events, deretter implementasjon).

Test-skjelett:
```ts
import { renderHook, act } from '@testing-library/react';
import { useUnreadNotificationsCount } from './useUnreadNotificationsCount';
// Mock supabase-klient + realtime-channel
// Test: initial count fra DB, increment på INSERT med read_at=null,
//       decrement på UPDATE som setter read_at, cleanup på unmount
```

Implementasjon-skjelett:
```ts
'use client';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';

export function useUnreadNotificationsCount(userId: string | null) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const supabase = getBrowserClient();
    let mounted = true;

    // Initial fetch
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
      .then(({ count: initial }) => {
        if (mounted) {
          setCount(initial ?? 0);
          setLoading(false);
        }
      });

    // Realtime sub for INSERT/UPDATE
    const cleanup = subscribeRealtimeChannel(`notifications:${userId}`, (channel) => {
      channel
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          if (payload.new.read_at == null) setCount((c) => c + 1);
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          const wasUnread = payload.old.read_at == null;
          const isUnread = payload.new.read_at == null;
          if (wasUnread && !isUnread) setCount((c) => Math.max(0, c - 1));
          if (!wasUnread && isUnread) setCount((c) => c + 1);
        });
    });

    return () => {
      mounted = false;
      cleanup();
    };
  }, [userId]);

  return { count, loading };
}
```

**Commit:** `feat(notifications): useUnreadNotificationsCount-hook med realtime`

---

### Task 2.2: `<NotificationBell />`-komponent

**Files:**
- Create: `components/notifications/NotificationBell.tsx`
- Create: `components/notifications/NotificationBell.test.tsx`
- Create: `components/icons/Bell.tsx` (hvis ikke finnes — sjekk `components/icons/` først)

Bell-icon (Lucide eller egen-tegnet — match eksisterende ikon-stil i `components/icons/`). Champagne-prikk (8px, `bg-accent`, `border-2 border-bg`) absolutt-posisjonert øverst-til-høyre når `count > 0`. Tap navigerer til `/innboks` via `<SmartLink>`.

Test-skjelett (jsdom-rendring):
- Når count = 0: ingen prikk
- Når count > 0: prikk synlig
- Link href = `/innboks`
- aria-label inneholder antall uleste

**Commit:** `feat(notifications): NotificationBell-komponent med badge`

---

### Task 2.3: Mount bjelle i TopBar

**Files:**
- Modify: `components/ui/TopBar.tsx`

TopBar tar i dag en `action`-prop. Vi legger bjella inn UAVHENGIG av denne — alltid synlig for innloggede brukere. Trenger en måte å vite om brukeren er logget inn på client side.

Approach: legg en `<NotificationBellSection userId={userId} />`-wrapper inn i TopBar som er en client component som leser userId fra context eller props.

Vurder å lage en `<TopBarBell />`-wrapper i `components/ui/` som tar `userId` (kan være null for ikke-innlogget — i så fall rendrer den ingenting).

Modifiser TopBar til å akseptere et `bellSlot`-prop, og rendere det mellom action og back-link.

Wires inn fra parent-layout (`app/(authed)/layout.tsx` eller hvor TopBar instansieres) der userId allerede er kjent server-side.

**Sjekk først:** hvor instansieres TopBar i dag? Bruker den layout-wiring eller per-side?

Run: `grep -rn "TopBar" app/ components/ | head -20` — kartlegg insertion points.

Hvis TopBar brukes per-side: må wire bell på alle ~19 sider. Vurder å pakke i `<TopBarWithBell>` som er én linje.

**Commit:** `feat(ui): mount NotificationBell i TopBar`

---

### Task 2.4: `/innboks`-route + listevisning

**Files:**
- Create: `app/innboks/page.tsx` (server component)
- Create: `app/innboks/InboxClient.tsx` (client for mark-as-read + bulk-actions)
- Create: `app/innboks/InboxClient.test.tsx`

Server-component fetcher notifications for current user, grupperer per dag (i dag/i går/dato), sender til client.

Client-komponent rendrer liste + håndterer:
- Tap på kort: kall server-action `markOneRead(id) + navigate(href)`
- «Marker alle som lest»-knapp øverst: kall server-action `markAllRead()`
- Empty-state hvis ingen notifications

Implementer date-grouping-helper i `lib/notifications/groupByDay.ts` med unit-tester (i dag/i går/eldre, locale='nb-NO').

Server-actions i `app/innboks/actions.ts`:
- `markOneRead(notificationId)` — kall `markNotificationsRead({ userId, /* match by id */ })`. **Note:** dagens markRead-helper støtter ikke filter på id direkte; utvid med valgfri `notificationId`-parameter i helperen, eller bygg query inline her.
- `markAllRead()` — kall `markNotificationsRead({ userId })` (alle uleste).

**Commit:** `feat(innboks): list-route + mark-as-read-handling`

---

### Task 2.5: `<NotificationCard />`-komponent

**Files:**
- Create: `components/notifications/NotificationCard.tsx`
- Create: `components/notifications/NotificationCard.test.tsx`

Per-kort UI:
- Emoji per kind (lookup-objekt: invite → 📨, peer_approval_request → ✋, etc.)
- Tittel + 1-linjes detalj (lookup per kind, fyll inn fra payload)
- Relativ tid-stamp via `Intl.RelativeTimeFormat('nb-NO')` eller en eksisterende helper (sjekk om `lib/format/` har noe)
- Uleste: champagne-stripe på venstre + font-medium
- Leste: grå dott + dempet farge
- Tap-handler-prop (caller setter dette)
- Tap-target ≥44px (per CLAUDE.md)

Title/detail-builder per kind:
```ts
function buildCardContent(kind, payload) {
  switch (kind) {
    case 'invite':
      return {
        title: `${payload.invited_by_name} inviterte deg`,
        detail: payload.game_name,
      };
    case 'peer_approval_request':
      return {
        title: 'Godkjenning trengs',
        detail: `${payload.submitter_name} leverte scorekortet i ${payload.game_name}`,
      };
    // ... etc
  }
}
```

Test: rendring per kind, klasser for ulest vs lest, formatert tid.

**Commit:** `feat(notifications): NotificationCard-komponent`

---

### Task 2.6: Sluttverifisering + PR

- Typecheck + alle tester grønne
- Bump til 1.15.0 (åpner ny minor-serie «In-app innboks»)
- CHANGELOG-entry + collapse 1.14.y
- Manuell visuell test i Safari preview-deploy: bjelle synlig, /innboks tom-tilstand, marker-alle-som-lest fungerer (selv om listen er tom)

PR-tittel: `feat(notifications): bjelle i TopBar + /innboks-rute (#25 Phase 2)`

---

## Phase 3 — Event-wiring (5 events)

Wires `notify()` inn i de 5 relevante server-actions, og mark-as-read-helpers på de 4 målsidene. Hver event gjøres som egen commit for atomic disiplin.

**Slutt-PR:** «feat(notifications): wire 5 events + mark-as-read på målsider (#25 Phase 3)» — patch-bump 1.15.1.

### Task 3.1: `invite`-event

**Files:**
- Modify: `app/invite/actions.ts` (sannsynligvis ~linje 103 per Explore-rapporten)

I action der invitasjon opprettes + mail sendes, før mail-call:

```ts
import { notify } from '@/lib/notifications/notify';

// ... eksisterende kode ...

// Skapt invitation-raden, nå varsle invitee in-app (hvis users-raden finnes)
// + send mail som backup. Hvis invitee ikke har users-rad ennå (fresh email),
// hopper vi over in-app (kommer ved første innlogging).
const { data: existingUser } = await supabase
  .from('users')
  .select('id, name')
  .eq('email', inviteeEmail)
  .maybeSingle();

let sendMail = true;
if (existingUser) {
  const { shouldAlsoSendMail } = await notify({
    userId: existingUser.id,
    kind: 'invite',
    payload: {
      game_id: gameId,
      game_name: gameName,
      invited_by_name: inviterName,
    },
  });
  sendMail = shouldAlsoSendMail;
}

// Phase 3: mail sendes fortsatt alltid (sikkerhetsnett). Phase 4 vil sette
// `if (sendMail)` her.
await sendInviteNotification({...});
```

Mark-as-read-helper for `invite`:
- Modify: `app/games/[id]/page.tsx`

```tsx
import { markNotificationsRead } from '@/lib/notifications/markRead';

// I server-component, etter auth-check:
await markNotificationsRead({
  userId,
  kind: 'invite',
  entityId: id, // game_id
});
```

**Commit:** `feat(notifications): wire invite-event + mark-read på spill-hjem`

---

### Task 3.2: `peer_approval_request`-event

**Files:**
- Modify: `app/games/[id]/submit/actions.ts` (~linje 77)

Etter at scorekortet er lagret (submitted), loope over peer-medlemmer som må godkjenne:

```ts
import { notify } from '@/lib/notifications/notify';

// Hent peer-medlemmer (flight-medlemmer som ikke er submitter selv)
const peers = /* eksisterende logikk eller ny query */;

for (const peer of peers) {
  await notify({
    userId: peer.id,
    kind: 'peer_approval_request',
    payload: {
      game_id: gameId,
      game_name: gameName,
      submitter_name: submitterName,
    },
  });
}
```

Mark-as-read for `peer_approval_request`:
- Modify: `app/games/[id]/approve/page.tsx`

```tsx
await markNotificationsRead({
  userId,
  kind: 'peer_approval_request',
  entityId: id,
});
```

**Commit:** `feat(notifications): wire peer_approval_request + mark-read på /approve`

---

### Task 3.3: `scorecard_submitted`-event (admin-varsel)

**Files:**
- Modify: `app/games/[id]/submit/actions.ts` (samme action som Task 3.2, men varsler admin-er i tillegg)

```ts
// Etter peer-notifying, varsle admin-er
const admins = /* eksisterende query for admin-er på spillet */;

for (const admin of admins) {
  const { shouldAlsoSendMail } = await notify({
    userId: admin.id,
    kind: 'scorecard_submitted',
    payload: {
      game_id: gameId,
      game_name: gameName,
      player_name: submitterName,
    },
  });
  // Phase 3: mail sendes uansett (sikkerhetsnett)
  void shouldAlsoSendMail;
}

await sendScorecardSubmittedNotification({...}); // uendret
```

Mark-as-read:
- Modify: `app/admin/games/[id]/page.tsx`

```tsx
await markNotificationsRead({
  userId,
  kind: 'scorecard_submitted',
  entityId: id,
});
```

**Commit:** `feat(notifications): wire scorecard_submitted + mark-read på admin/games/[id]`

---

### Task 3.4: `scorecard_approved`-event

**Files:**
- Modify: `app/games/[id]/approve/actions.ts` (eller hvor approve-action lever — Explore hvis usikker)

Når en peer godkjenner et scorekort, varsle submitter:

```ts
await notify({
  userId: submitterId,
  kind: 'scorecard_approved',
  payload: {
    game_id: gameId,
    game_name: gameName,
    approver_name: approverName,
  },
});
```

Mark-as-read for `scorecard_approved`:
- Modify: `app/games/[id]/page.tsx` (spill-hjem — samme som invite, men annen kind)

```tsx
await markNotificationsRead({
  userId,
  kind: 'scorecard_approved',
  entityId: id,
});
```

**Commit:** `feat(notifications): wire scorecard_approved + mark-read på spill-hjem`

---

### Task 3.5: `game_finished`-event

**Files:**
- Modify: `app/admin/games/[id]/avslutt/actions.ts` (per Explore-rapporten)

Etter at admin-en avslutter spillet, loope over alle deltakere og varsle:

```ts
for (const player of players) {
  const { shouldAlsoSendMail } = await notify({
    userId: player.id,
    kind: 'game_finished',
    payload: {
      game_id: gameId,
      game_name: gameName,
    },
  });
  void shouldAlsoSendMail;
}

// Phase 3: mail sendes alltid (sikkerhetsnett)
await sendGameFinishedNotification({...}); // uendret
```

Mark-as-read for `game_finished`:
- Modify: `app/games/[id]/leaderboard/page.tsx`

```tsx
await markNotificationsRead({
  userId,
  kind: 'game_finished',
  entityId: id,
});
```

**Commit:** `feat(notifications): wire game_finished + mark-read på leaderboard`

---

### Task 3.6: Sluttverifisering + PR

- Typecheck + alle tester grønne
- Bump til 1.15.1 + CHANGELOG
- Manuell e2e i Safari preview: opprett invitasjon → invitee ser bjelle-prikk + varsel i innboks → tap navigerer til spill-hjem → prikk borte
- PR-tittel: `feat(notifications): wire 5 events + mark-as-read (#25 Phase 3)`

---

## Phase 4 — Off-app mail-gating + last_seen_at-verifisering

Aktiverer mail-gating-grenen i de 3 mail-baserte actions slik at aktive brukere slipper mail. End state: aktive brukere ser kun in-app; off-app brukere får mail OG in-app som backup.

**Slutt-PR:** «feat(notifications): off-app mail-fallback aktivert (#25 Phase 4)» — patch-bump 1.15.2 (eller minor 1.16.0 hvis vi vil markere mail-reduction som synlig change).

### Task 4.1: Verifiser at `last_seen_at` oppdateres ved request

**Files:**
- Inspect: `proxy.ts` eller hovedlayout
- Modify: `proxy.ts` (sannsynligvis) hvis ikke wired

Run: `grep -rn "last_seen_at" app/ lib/ proxy.ts 2>&1`

Forventet: én eller flere skrive-call. Hvis ingen: må implementeres.

Hvis ikke wired: legg til en update-call i proxy.ts på authenticated requests:

```ts
// I proxy.ts, etter at session er bekreftet:
if (session?.user) {
  // Best-effort fire-and-forget — blokker ikke request-renderen.
  // Bare oppdater hvis vi ikke har oppdatert siste minutt (anti-thrash).
  void updateLastSeenAt(session.user.id);
}
```

Med rate-limit-pattern i en helper `lib/auth/lastSeen.ts`:
```ts
const recentUpdates = new Map<string, number>(); // userId -> timestamp
const RATE_LIMIT_MS = 60 * 1000; // 1 min mellom oppdateringer

export async function updateLastSeenAt(userId: string): Promise<void> {
  const now = Date.now();
  const last = recentUpdates.get(userId) ?? 0;
  if (now - last < RATE_LIMIT_MS) return;
  recentUpdates.set(userId, now);

  const admin = getAdminClient();
  await admin
    .from('users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId);
}
```

**Commit:** `feat(auth): oppdater users.last_seen_at på proxy-requests` (hvis ny)
**Eller:** `chore: verified last_seen_at-oppdatering wired` (hvis allerede der)

---

### Task 4.2: Aktiver mail-gating i invite-action

**Files:**
- Modify: `app/invite/actions.ts`

Endre Phase 3-koden fra:
```ts
let sendMail = true;
if (existingUser) {
  const { shouldAlsoSendMail } = await notify({...});
  sendMail = shouldAlsoSendMail;
}
await sendInviteNotification({...});
```

Til:
```ts
let sendMail = true;
if (existingUser) {
  const { shouldAlsoSendMail } = await notify({...});
  sendMail = shouldAlsoSendMail;
}
if (sendMail) {
  await sendInviteNotification({...});
}
```

**Commit:** `feat(notifications): off-app gating aktivert for invite-mail`

---

### Task 4.3: Aktiver mail-gating i scorecard_submitted-action

**Files:**
- Modify: `app/games/[id]/submit/actions.ts`

Samme pattern. Tracking per admin-mottaker:

```ts
const shouldMailAdmins: { userId: string; sendMail: boolean }[] = [];
for (const admin of admins) {
  const { shouldAlsoSendMail } = await notify({...});
  shouldMailAdmins.push({ userId: admin.id, sendMail: shouldAlsoSendMail });
}

// Filter admin-mottakerlisten før mail-call
const mailRecipients = admins.filter((a) =>
  shouldMailAdmins.find((s) => s.userId === a.id)?.sendMail,
);

if (mailRecipients.length > 0) {
  await sendScorecardSubmittedNotification({ admins: mailRecipients, ... });
}
```

**Commit:** `feat(notifications): off-app gating aktivert for scorecard_submitted-mail`

---

### Task 4.4: Aktiver mail-gating i game_finished-action

**Files:**
- Modify: `app/admin/games/[id]/avslutt/actions.ts`

Samme pattern som Task 4.3 (per-player mail-filtering).

**Commit:** `feat(notifications): off-app gating aktivert for game_finished-mail`

---

### Task 4.5: Sluttverifisering + PR

- Typecheck + alle tester grønne
- Bump til 1.15.2 + CHANGELOG-entry som beskriver mail-reduksjon synlig for bruker
- Manuell e2e:
  - **Aktiv-bruker-flow:** logget inn med browser åpen → admin oppretter invitasjon → in-app varsel kommer umiddelbart, **ingen mail**
  - **Off-app-flow:** logget inn for 10 min siden, browser lukket → admin oppretter invitasjon → in-app varsel kommer (vises ved neste login) OG mail i innboks
- PR-tittel: `feat(notifications): off-app mail-fallback aktivert (#25 Phase 4 — epic complete)`
- Closing-kommentar på #25 ved merge

---

## Closing-kommentar-mal for issue #25 (post-merge Phase 4)

```markdown
## Teknisk

Implementert i 4 faser over 4 PR-er. Datalag (notifications-tabell med RLS + JSONB-payload), bjelle/UI (NotificationBell-komponent + /innboks-rute + realtime-badge), event-wiring (5 events kalt fra eksisterende server-actions), og off-app mail-fallback (mail sendes kun til brukere med last_seen_at > 5 min siden).

PR-er: #X (Phase 1), #Y (Phase 2), #Z (Phase 3), #W (Phase 4).

Sentrale arkitekturvalg: polymorf tabell med Zod-validert payload (vs separate tabeller per event-type — for utvidbarhet), tap-→-marker-lest-+-naviger-mønster (vs eksplisitt arkiv-handling — for friksjon), 5-min off-app-terskel (konservativt for å unngå mail-spam uten å miste viktige varsler for inaktive brukere).

Avgrensninger holdt eksplisitt out-of-scope: push-varsler (#24), tidsbaserte reminders, settings/opt-out, aggregering, auto-arkivering, lyd/haptisk feedback.

## Funksjonell

Du har nå en bjelle øverst-til-høyre på alle sider når du er innlogget. Når noen inviterer deg, leverer scorekortet sitt, godkjenner ditt scorekort, eller avslutter et spill du var med i, dukker det opp en champagne-prikk på bjella. Tap deg inn på innboksen for å se hva som har skjedd — sortert per dag, nyeste øverst.

Aktive brukere får færre mail nå. Hvis du er innlogget når noe skjer, ser du varselet kun i appen. Hvis du har vært borte fra appen i mer enn 5 minutter får du fortsatt mailen som backup, slik at du ikke går glipp av noe.
```

---

## Plan-statistikk

- **4 faser**, hver en separat PR
- **17 atomiske commits** totalt fordelt på fasene (5+6+5+5 ≈ varierer per task-granularitet)
- **15+ nye unit-tester** (notify, markRead, types, useUnreadNotificationsCount, NotificationBell, NotificationCard, InboxClient, groupByDay)
- **~10 modifiserte filer** (TopBar + 5 server-actions + 4 målsider for mark-as-read)
- **~12 nye filer** (1 migrasjon + 4 lib/notifications/ + 2 components/notifications/ + 1 components/icons/Bell + 1 hooks/ + 2 app/innboks/ + 1 lib/auth/lastSeen)
