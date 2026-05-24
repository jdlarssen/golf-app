# In-app innboks / varslings-senter — design

**Issue:** [#25](https://github.com/jdlarssen/golf-app/issues/25)
**Status:** Designet 2026-05-24, klar for implementeringsplan.
**Bumper milepæl:** klubb-skala-fundament (avlaster mail-spam, åpner for push-varsler i framtiden).

---

## Mål

Gi innloggede brukere en sentralisert flate for å se alle relevante varsler (invitasjoner, godkjennings-forespørsler, scorekort-events, spill-avsluttet) uten å måtte sjekke mail eller åpne hvert enkelt spill. Reduserer mail-spam for aktive brukere og fjerner UX-hull der enkelte events (peer-approval, scorekort-godkjent) i dag er helt usynlige før brukeren tilfeldigvis åpner riktig side.

---

## Brukerens opplevelse

### Bjelle-ikon i TopBar

- Liten bjelle-ikon på høyre side av sticky `TopBar`, på alle innloggede sider, ved siden av eksisterende `action`-slot (eller alene hvis det ikke finnes annen action).
- Når brukeren har minst ett ulest varsel: en champagne-farget prikk (8px) øverst-til-høyre på bjella. **Ingen tellertall** — kun en signal-dott. Mindre visuell støy enn tall.
- Tap navigerer til `/innboks`.

### `/innboks`-flaten

- Sticky `TopBar` med chevron tilbake (`back="/"`) + kicker `INNBOKS`.
- Varsel-kort i en liste, nyeste øverst, gruppert per dag (`I dag`, `I går`, datostamp).
- Per kort:
  - Emoji-ikon (`📨 invitasjon`, `🏆 spill avsluttet`, `✋ peer-approval`, `📋 scorekort levert`, `✅ scorekort godkjent`)
  - Tittel + 1-linjes detalj (eks: «Per inviterte deg til Hauger Open», «Resultatet for Hauger Open er klart»)
  - Relative tid-stamp («for 2 timer siden»)
  - Uleste: champagne-farget vertikal stripe på venstre + `font-medium` tekst
  - Leste: grå dott + normal vekt + dempet farge
- Tap på et kort: marker som lest + naviger til relevant rute.
- Knapp øverst-til-høyre: «Marker alle som lest» — kun synlig hvis det er noen uleste.
- Tom-tilstand: stille illustrasjon + «Ingen nye varsler» (samme `PullQuote`-stil som andre tomme tilstander).

### v1 events

| Event | Trigger | Mail i dag? | Navigerer til |
|---|---|---|---|
| `invite` | Admin inviterer spilleren til et spill | Ja (inviteNotification) | `/games/[id]` |
| `peer_approval_request` | Flight-medlem leverer scorekort som krever din godkjenning | Nei (helt ny) | `/games/[id]/approve` |
| `scorecard_submitted` | Spiller leverer scorekortet sitt (admin-varsel) | Ja (scorecardSubmittedNotification) | `/admin/games/[id]` |
| `scorecard_approved` | Flight-medlem godkjenner ditt leverte scorekort | Nei (helt ny) | `/games/[id]` |
| `game_finished` | Admin avslutter spillet | Ja (gameFinishedNotification) | `/games/[id]/leaderboard` |

`round_starting_soon` (tidsbasert reminder) settes til **v2** — krever cron-infrastruktur som ikke finnes ennå.

### Mail-fallback

- For de 3 mail-baserte eventene (invite, scorecard_submitted, game_finished): mailen sendes KUN hvis mottakeren har vært off-app i ≥5 minutter (basert på `users.last_seen_at`). Aktive brukere ser kun in-app varsel og slipper mail.
- For de 2 nye eventene (peer_approval_request, scorecard_approved): kun in-app, ingen mail.
- Edge-case: PWA i bakgrunnen oppdaterer ikke `last_seen_at`. Brukere som har appen åpen men ikke aktiv i ≥5 min får mail som backup — akseptert som korrekt (de er ikke faktisk aktive). Push-varsler ([#24](https://github.com/jdlarssen/golf-app/issues/24)) løser dette bedre senere.

### Read-state-mekanikk

- Tap på varsel-kort → marker `read_at = now()` + naviger til rute.
- Server-side mark-as-read-helper på hver målside automatisk markerer matching uleste varsler som lest når sida lastes. Fanger BÅDE mail-deeplink-klikk og direkte navigering (typisk: spiller åpner spill-listen, tapper på spill X, lander på `/games/X` — alle uleste `invite`-varsler for X markeres som lest).
- «Marker alle som lest» bulk-button: setter `read_at = now()` på alle brukerens uleste varsler.

---

## Teknisk arkitektur

### Datamodell

**Ny tabell `public.notifications`** (migrasjon `0032_notifications.sql`):

```sql
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

create index notifications_user_unread_created
  on public.notifications(user_id, created_at desc)
  where read_at is null;

create index notifications_user_created
  on public.notifications(user_id, created_at desc);

alter publication supabase_realtime add table public.notifications;
```

`payload`-shape per `kind` (TypeScript-validert via Zod ved insert):

- `invite` → `{ game_id, game_name, invited_by_name }`
- `peer_approval_request` → `{ game_id, game_name, submitter_name }`
- `scorecard_submitted` → `{ game_id, game_name, player_name }`
- `scorecard_approved` → `{ game_id, game_name, approver_name }`
- `game_finished` → `{ game_id, game_name }`

Disse er minste mengde data som trengs for å rendre kort + bygge deeplink. Spillnavn snapshotes ved insert slik at varselet leser riktig selv om admin senere endrer navnet.

### RLS

```sql
alter table public.notifications enable row level security;

create policy notifications_select_own
  on public.notifications for select
  using (user_id = auth.uid());

create policy notifications_update_own
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Ingen insert/delete-policy for klienten — inserts skjer via server-actions
-- (med service_role-bypass eller admin-client), deletes håndteres via cascade
-- når en user slettes.
```

### Server-action-pattern

Helper `lib/notifications/notify.ts`:

```ts
async function notify(opts: {
  userId: string;
  kind: NotificationKind;
  payload: NotificationPayload;
}): Promise<{ shouldAlsoSendMail: boolean }> {
  // 1. Insert in notifications-tabellen
  await adminClient.from('notifications').insert({...});

  // 2. Sjekk last_seen_at for off-app-gating
  const { data: user } = await adminClient
    .from('users')
    .select('last_seen_at')
    .eq('id', userId)
    .single();
  const offApp = !user?.last_seen_at ||
    Date.now() - new Date(user.last_seen_at).getTime() > 5 * 60 * 1000;

  // 3. Best-effort revalidateTag for innboks-cache
  revalidateTag(`notifications-${userId}`);

  return { shouldAlsoSendMail: offApp };
}
```

Eksisterende server-actions som sender mail (f.eks. `app/invite/actions.ts:103`, `app/games/[id]/submit/actions.ts:77`, `app/admin/games/[id]/avslutt/actions.ts`) endres til:

```ts
const { shouldAlsoSendMail } = await notify({ userId, kind: 'invite', payload: {...} });
if (shouldAlsoSendMail) {
  await sendInviteNotification({...});  // Eksisterende Resend-helper, uendret
}
```

For de 2 nye eventene (peer_approval_request, scorecard_approved) legges `notify()`-kallet inn på relevant action — ingen mail-grein.

### Realtime + badge

Ny client-hook `useUnreadNotificationsCount(userId)`:

- Initial fetch via server-action eller direkte Supabase-query: `count notifications where user_id = $userId and read_at is null`.
- Sub til realtime channel `notifications:${userId}` på INSERTs + UPDATEs.
- Holder lokal teller, returnerer `unreadCount`.

`<NotificationBell />`-komponent i `TopBar`:

- Bruker hook, viser bjelle + champagne-prikk hvis `unreadCount > 0`.
- Tap navigerer til `/innboks`.

### Mark-as-read-helpers

`lib/notifications/markRead.ts`:

```ts
async function markNotificationsRead(opts: {
  userId: string;
  kind?: NotificationKind;
  entityId?: string;  // payload.game_id
}): Promise<void> {
  let q = serverClient
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.entityId) q = q.eq('payload->>game_id', opts.entityId);
  await q;
  revalidateTag(`notifications-${opts.userId}`);
}
```

Kalles fra:

- `app/games/[id]/leaderboard/page.tsx` → `markNotificationsRead({ userId, kind: 'game_finished', entityId: gameId })`
- `app/games/[id]/approve/page.tsx` → `markNotificationsRead({ userId, kind: 'peer_approval_request', entityId: gameId })`
- `app/admin/games/[id]/page.tsx` → `markNotificationsRead({ userId, kind: 'scorecard_submitted', entityId: gameId })`
- `app/games/[id]/page.tsx` (spill-hjem) → `markNotificationsRead({ userId, kind: 'invite', entityId: gameId })` OG `markNotificationsRead({ userId, kind: 'scorecard_approved', entityId: gameId })`

Best-effort: feiler stille (loggføres console.error). Bør ikke blokkere page-render.

---

## Migrasjons-plan: 4 faser

Hver fase er sjipbar separat (egen PR, prod-deploy).

### Fase 1 — Datamodell + infra (foundation)

- Migrasjon `0032_notifications.sql` (tabell + RLS + indekser + publikasjon)
- `lib/notifications/types.ts` — TypeScript-typer + Zod-skjemaer per `kind`
- `lib/notifications/notify.ts` — helper for insert + off-app-gating
- `lib/notifications/markRead.ts` — helper for read-state-mutasjon
- Unit-tester for payload-validering + off-app-logikk

**Ingen UI-endringer.** Bare grunnmuren.

### Fase 2 — Bjelle + /innboks UI

- `components/notifications/NotificationBell.tsx` (client component)
- `hooks/useUnreadNotificationsCount.ts` (realtime sub)
- Modifisere `components/ui/TopBar.tsx` til å rendre bjelle hvis bruker er logget inn
- `app/innboks/page.tsx` — listevisning
- `components/notifications/NotificationCard.tsx` — per-kort UI
- Mark-as-read-action ved tap
- «Marker alle som lest»-knapp
- Tom-tilstand
- Tester (unit + component)

**Innboksen er tom.** Ingen events trigger varsler ennå.

### Fase 3 — Tilkobling per event-type

Itererer per event (én commit per event for atomic disiplin):

- `invite` — modifiser `app/invite/actions.ts` til å kalle `notify()` før mail
- `peer_approval_request` — kall `notify()` i `app/games/[id]/submit/actions.ts` for hver peer
- `scorecard_submitted` — kall `notify()` i samme submit-action for admin
- `scorecard_approved` — kall `notify()` i `app/games/[id]/approve/actions.ts`
- `game_finished` — kall `notify()` i `app/admin/games/[id]/avslutt/actions.ts` for hver deltaker
- Mark-as-read-helpers wires inn på de 4 målsidene

**Mailen sendes fortsatt alltid.** Off-app-gating er ikke aktiv ennå (sikkerhetsnett under utrulling).

### Fase 4 — Off-app mail-gating

- Aktiver `shouldAlsoSendMail`-grenen i alle 3 mail-baserte server-actions
- Verifiser at `last_seen_at` faktisk oppdateres ved hver innlogget request (eksisterer fra `0019_users_last_seen_at`-migrasjonen — sjekk at det er wired i `proxy.ts` eller layout)
- Hvis ikke wired: legg til oppdatering i `app/proxy.ts` på authenticated requests
- E2E-test: simuler aktiv bruker (last_seen_at = nylig) → kun in-app; simuler inaktiv → mail OG in-app

**Mail-spam reduseres for aktive brukere.** Epic complete.

---

## Avgrensninger (eksplisitt out-of-scope for v1)

- **Push-varsler** (issue [#24](https://github.com/jdlarssen/golf-app/issues/24)) — separat epic, krever Web Push API + service worker arbeid
- **`round_starting_soon`** — krever cron/scheduled-task, ikke i v1
- **Notification settings / opt-out** — brukeren kan ikke skru av enkelte event-typer. Hvis behov oppstår, legges til som v2
- **Aggregering** («Per og 2 andre inviterte deg til X») — i v1 er hver invitasjon en egen rad. Aggregering kommer hvis volum krever det
- **Auto-arkivering / sletting** — i v1 er det ingen automatisk opprydding. DB-volumet er trivielt; legges til hvis det blir et problem
- **Sound / haptisk feedback** — ingen lyd eller vibrasjon ved nytt varsel i v1
