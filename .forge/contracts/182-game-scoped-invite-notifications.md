# Spec: Game-scoped invite-notifikasjoner

**Issue:** [#182](https://github.com/jdlarssen/golf-app/issues/182)
**Avhenger av:** Phase 3 av [#25](https://github.com/jdlarssen/golf-app/issues/25) (shipped 2026-05-24, commit `d9a6595`)
**Berører:** notifications-systemet (`lib/notifications/`), admin-flaten (`/admin/games/[id]`, `/admin/games/new`, edit-flyten), invite-skjemaet (`app/login/actions.ts`)
**Bump:** neste MINOR (`1.17.0` → `1.18.0` hvis #182 lander før #203-wizardene; ellers `1.18.x` → `1.19.0`)

## Problem

Notifikasjons-systemet ble wired i Phase 3 av [#25](https://github.com/jdlarssen/golf-app/issues/25) (2026-05-24), men `invite`-eventet ble bevisst utelatt fordi `invitations.game_id` alltid var `null` i koden. Dagens to invitasjons-flyter (`app/invite/actions.ts` friend-invite, `app/admin/spillere/actions.ts` admin-invite) sender åpne app-invitasjoner uten spill-kontekst — bare en Resend-mail, ingen in-app-notifikasjon.

Når admin curates en spillerliste på `/admin/games/new` eller `/admin/games/[id]/edit`, får spilleren heller ingen varsling om at de er meldt på. De oppdager det først ved å åpne appen, se i «Mine spill»-lista, eller få mail om at spillet starter (`game_finished`-eventet er det første som faktisk varsler dem). For pilot-admins som inviterer kompiser sporadisk gjennom uka er det åpenbart at folk burde få bell-ikon-varsel når de blir lagt til.

Mål: wire `invite`-eventet for **alle** spillere som havner i `game_players` — både via ny dedikert «Inviter spillere»-flate på `/admin/games/[id]` og via eksisterende add-player-flyt på `/admin/games/new` og edit-siden. Game-scoped invitasjoner via e-post (ukjente brukere) lander i `invitations.game_id` og fyrer notify deferred etter OTP-verify.

## Prior decisions

Disse stammer fra Phase 3 av #25 og notifikasjons-infrastrukturen:

- **`inviteSchema` krever ikke-null `game_id`** (`lib/notifications/types.ts:23-27`): `game_id` (uuid), `game_name`, `invited_by_name`. Schema er strikt — alle invite-notifikasjoner MÅ ha game-kontekst. Vi beholder dette (mulighet 1 fra issue, ikke mulighet 2).
- **`notify()` er admin-client-basert** (`lib/notifications/notify.ts:26-71`): server-only, validerer payload, inserter, invaliderer Next.js-cache-tag, returnerer `{shouldAlsoSendMail}` (gated på `OFF_APP_THRESHOLD_MS`). Wraps i `Promise.allSettled` på call-site for best-effort-semantikk.
- **`NotificationCard`-copy er ferdig** (`components/notifications/NotificationCard.tsx:114-120`): `📨 ${p.invited_by_name} inviterte deg` + detail = `${p.game_name}`. Ingen card-endringer trengs.
- **`InboxClient.tsx:131-144` deeplinker `invite`-events til `/games/${gameId}`** — fungerer ut av boksen for game-scoped invites.
- **Mark-as-read-hook på `/games/[id]/page.tsx:203`** ble forberedt for `kind: 'invite'` i Phase 3, men ikke aktivert siden eventet aldri fyrte. Aktiveres som del av denne spec-en.
- **Admin er curator, ikke RSVP-modell** (avklart 2026-05-25): spillere som legges til av admin (picker eller via /new/edit) auto-joines `game_players` uten accept-steg. Notifikasjons-copy («X inviterte deg til Y») er passende selv om det ikke kreves eksplisitt godkjenning.
- **`invitations.game_id` er allerede en nullable FK til `games(id) ON DELETE CASCADE`** (`supabase/migrations/0001_initial_schema.sql:85`). Ingen migrasjon trengs — kolonnen brukes for første gang.
- **RLS-policy «invitations admin write» linje 8** sjekker `game_id is null` for admin-update — gjelder kun friend-invite-rader, ikke game-scoped (som ikke matcher policien siden game_id er satt). For game-scoped invites trengs ingen update fra admin (de aksepteres av invitee selv via 0012-policien).

## Design

### 1. Ny notify-helper: `lib/notifications/notifyInvitedToGame.ts`

Sentralisert wrapper som alle tre call-sites (ny inviter-flate, /new, edit) bruker. Tar over ansvaret for å oversette (game_id, recipient_user_id, inviter_user_id) til en validert `invite`-payload + kjøre `notify()` best-effort.

```ts
export async function notifyInvitedToGame(opts: {
  recipientUserId: string;
  gameId: string;
  inviterUserId: string;
}): Promise<void> {
  // 1. Fetch game (id, name) — bruker admin-client siden server-actions
  //    er post-auth-allerede-verifisert. Skipper hvis spillet er finished
  //    (varsel er meningsløst da).
  // 2. Fetch inviter user (id, name eller email-fallback).
  // 3. Bygg payload: { game_id, game_name, invited_by_name }
  // 4. Kall notify({ userId: recipientUserId, kind: 'invite', payload })
  //    — wrappet i try/catch + console.error, aldri kastes oppover.
  //    Notifikasjon er best-effort; samme pattern som
  //    `lib/mail/inviteNotification.ts` og `gameFinishedNotification.ts`.
}
```

Helper-en garanterer at alle invite-notifikasjoner har samme copy-pattern og at silenced-errors logges konsistent (med `[notifyInvitedToGame]`-prefix for Vercel-debugging per #198-kontrakt-mønster).

### 2. Ny «Inviter spillere»-card på `/admin/games/[id]`

**Plassering:** mellom «Spillere»-table (linje 645-711) og status-CTA-card-ene (linje 783-888). Synlig kun for `draft` + `scheduled` spill — `active` og `finished` skjuler hele card-en (admin kan ikke utvide roster etter spill-start).

**UI-struktur** (`<Card>`-wrapper, tab-orden topp-til-bunn):

```
┌─ Inviter spillere ───────────────────────────────────┐
│                                                       │
│ Velg fra registrerte                                 │
│ [Søk i registrerte brukere…]                          │
│ ┌─ Per Hansen — HCP 12.4 ───── [+ Legg til] ─┐       │
│ ┌─ Kari Olsen — HCP 18.2 ───── [+ Legg til] ─┐       │
│ ┌─ Ola Nordmann — HCP 6.5 ──── [+ Legg til] ─┐       │
│                                                       │
│ ── eller ──                                           │
│                                                       │
│ Inviter ny spiller på e-post                          │
│ [eksempel@gmail.no]            [Send invitasjon]      │
│                                                       │
└──────────────────────────────────────────────────────┘
```

- **Picker-del** (øvre): viser alle registrerte brukere (`users` med `profile_completed_at != null`) som IKKE allerede er i `game_players` for dette spillet. Substring-søk på navn/nickname/email (samme mønster som `/admin/games/new`-spiller-listen). Hver rad har «+ Legg til»-knapp som kaller server-action `addExistingPlayerToGame({game_id, recipient_user_id})`.
- **E-post-del** (nedre): standard `<Input type="email">` + submit-knapp som kaller server-action `inviteEmailToGame({game_id, email})`. Validerer e-post-format klient-side; server-action gjør auth + duplikatsjekk.
- Mode-aware kapasitets-banner: hvis modus er best-ball-netto og spillet allerede har 8 spillere, vises et `<Banner tone="info">` øverst i card-en: «Spillet er fullt (8 av 8). Fjern noen for å invitere flere.» Picker + e-post-felt deaktiveres. Andre modi har ingen øvre grense.
- Optimistic update etter `addExistingPlayerToGame`: spilleren forsvinner umiddelbart fra picker (via revalidate-tag på `game-${id}`). Etter `inviteEmailToGame`: «Invitasjon sendt til X»-banner i 5 sek, e-post-felt nullstilles.
- Tap-target ≥44px på alle knapper (mobil-først).

### 3. Server-actions: `app/admin/games/[id]/inviteToGameActions.ts`

```ts
'use server';

export async function addExistingPlayerToGame(
  gameId: string,
  formData: FormData,
): Promise<void> {
  // 1. requireAdmin() (eller requireAdminOrTrustedCreator() hvis spillet
  //    er opprettet av en trusted creator — sjekkes via games.created_by).
  //    Bruker eksisterende helper fra `lib/admin/auth.ts`.
  // 2. Validate game-status er draft eller scheduled. Hvis active/finished:
  //    redirect tilbake med error=game_locked.
  // 3. Validate kapasitet for best-ball (max 8). Hvis full: error=game_full.
  // 4. Insert i game_players med team_number/flight_number = null
  //    (admin kan deretter fordele i edit-flyten). Hvis spilleren allerede
  //    er i spillet (UNIQUE-violation): swallow + return — idempotent.
  // 5. notifyInvitedToGame({ recipientUserId, gameId, inviterUserId })
  //    — best-effort, etter at game_players-insertet er commitet.
  // 6. revalidateTag(`game-${gameId}`, 'max')
  // 7. redirect tilbake til /admin/games/[id]?invited=success
}

export async function inviteEmailToGame(
  gameId: string,
  formData: FormData,
): Promise<void> {
  // 1. requireAdmin/TrustedCreator + status-check (samme som over).
  // 2. Normaliser email (lowercase + trim).
  // 3. Sjekk om email allerede er i users-tabellen:
  //    - JA → behandle som addExistingPlayerToGame (slå opp user_id, gå
  //      gjennom samme flyt). Sender ikke mail siden de er i appen.
  //    - NEI → insert i invitations med game_id satt, token randomUUID,
  //      expires_at = +14 dager, invited_by = current admin.
  //      Send sendInviteNotification-mail (oppdatert til å ta valgfri
  //      gameName for mer kontekstuell subject/body — se §5).
  //      notify() fyrer IKKE her — invitee har ingen user_id ennå.
  //      Den fyres deferred i §4 etter OTP-verify.
  // 4. Hvis email finnes som pending invitation for SAMME spill: swallow
  //    (idempotent). For ANNET spill: lag ny rad (én invitasjon per spill
  //    per email).
  // 5. revalidateTag + redirect.
}
```

Actions returnerer void og bruker URL-search-params for success/error-feedback (samme mønster som `/admin/games/new/actions.ts`).

### 4. Backfill: eksisterende /new + edit fyrer notify

Per gray-area-avklaring 2026-05-25 (option «Begge — også backfill add-player»):

**`app/admin/games/new/actions.ts`** — i `createGameDraft` og `createAndPublishGame`, etter at `game_players` er insertet (rundt linje 100-130 — exakt sted bestemmes ved scout under build):

```ts
// Best-effort notify hver tilkommet spiller. Skip hvis spilleren er
// admin-en selv (de vet allerede). Bruk Promise.allSettled så én feilet
// notify ikke ruller back hele spillet.
const newPlayerIds = insertedRows.map(r => r.user_id).filter(id => id !== inviterUserId);
await Promise.allSettled(
  newPlayerIds.map(recipientUserId =>
    notifyInvitedToGame({ recipientUserId, gameId, inviterUserId })
  )
);
```

**Edit-flyten** (`app/admin/games/[id]/edit/actions.ts` eller hvor enn update-actionen lever): samme mønster, men kun for spillere som ER NYE i diff-en (gamle som beholdes skal IKKE få ny notifikasjon — sammenligne mot `game_players`-snapshot før update).

### 5. Mail-helper-utvidelse: `lib/mail/inviteNotification.ts`

Eksisterende `sendInviteNotification({to, invitedByName})` brukes for både friend-invite og admin-invite i dag. Game-scoped invites trenger spill-navn i subject/body.

**Endring:** tilføy valgfri `gameName?: string`-param. Når satt:
- Subject: `«Du er invitert til Stiklestad 25. mai på Tørny»` (i dag: `«Du er invitert til Tørny»`).
- Body: tilføy en kort linje under hilsen — «Jørgen har invitert deg til spillet *Stiklestad 25. mai*.»
- Når `gameName` IKKE er satt: nåværende generisk copy (uendret friend-invite + admin-invite uendret).

Begge mail-versjoner kjøres gjennom `humanizer:humanizer`-passet før commit per CLAUDE.md-policy. Eksisterende snapshot-tester for mail-copy oppdateres for game-scoped-grenen.

### 6. Deferred notify etter OTP-verify

**`app/login/actions.ts` → `verifyCode`-action:** allerede markerer `invitations.accepted_at` (via 0012-RLS-policy). Etter aksept, hvis invitation-rad har `game_id != null`:

1. Slå opp game_id, inviter_user_id (fra invitations.invited_by) og recipient_user_id (= nyopprettet/eksisterende user).
2. Insert i `game_players` (samme som addExistingPlayerToGame).
3. Kall `notifyInvitedToGame()`.
4. Best-effort: ingen kastes oppover, OTP-verify-redirect skjer som normalt.
5. Endrer ikke success-redirect-stien — invitee lander på `/` som før, men ser bell-prikken med invite-eventet.

Edge case: invitation er expired eller game er finished — sett `accepted_at` likevel (closes the invitation), men hopp over game_players-insert og notify. Vises som en harmløs no-op.

### 7. Mark-as-read aktivering

**`app/games/[id]/page.tsx:203`-blokk** (eksisterende):

```ts
after(() =>
  markNotificationsRead({
    userId,
    kind: 'scorecard_submitted', // eksisterende
    entityId: id,
  }),
);
```

Utvides til å også markere `invite`-kind for samme `entityId`:

```ts
after(() => {
  void markNotificationsRead({ userId, kind: 'scorecard_submitted', entityId: id });
  void markNotificationsRead({ userId, kind: 'invite', entityId: id });
});
```

Kjøres parallelt med `Promise.allSettled` (eller bare `void`-fired siden mark-read er idempotent). Dekker både picker-add og deferred-OTP-flow — så snart invitee åpner spillet, fjernes bell-prikken.

### 8. Hva som IKKE endres

- **Friend-invite (`app/invite/actions.ts`)**: forblir game-løs (sender bare Resend-mail, ingen notify). Hvis vi senere vil støtte game-løse notifikasjoner (mulighet 2 fra issue), gjør vi det da. Ingen scope-utvidelse her.
- **Admin-invite (`app/admin/spillere/actions.ts`)**: samme — beholdes som åpen app-invitasjon. Admin som vil invitere noen til et konkret spill bruker den nye /admin/games/[id]-flaten.
- **`invitations.game_id`-column**: ingen migrasjon. Kolonnen finnes allerede som nullable FK med ON DELETE CASCADE — bruk uten endring.
- **RLS-policies**: ingen endringer. Eksisterende «invitations self mark accepted» (0012) håndterer game-scoped invitations korrekt (sjekker email match, ikke game_id).
- **NotificationCard.tsx-copy**: uendret. «X inviterte deg» + game_name i detail-linje fungerer for både picker-add og deferred-OTP-flow.
- **InboxClient.tsx-deeplink**: uendret. Game-scoped invites linker til `/games/${gameId}` — som forventet.
- **inviteSchema (lib/notifications/types.ts)**: forblir strikt `game_id` ikke-null.

## Edge cases & guardrails

- **Spill er fullt (best-ball: 8/8)**: picker + e-post-felt deaktiveres i UI; server-action returnerer `error=game_full` ved race-condition. Mode-aware kapasitets-check: kun best_ball_netto har øvre grense; andre moduser (stableford, matchplay 1v1, Texas, solo) har sine egne validatorer som server-action respekterer.
- **Spill er active/finished**: invite-card skjules i UI; server-action returnerer `error=game_locked`. Forhindrer at admin inviterer noen mens spillet pågår.
- **Duplicate invitation til samme email + samme spill**: `inviteEmailToGame` finner pending rad → swallow, ingen ny mail, ingen ny notify. Idempotent.
- **Email tilhører eksisterende bruker**: `inviteEmailToGame` oppdager dette via `users.email`-lookup → går gjennom `addExistingPlayerToGame`-stien istedenfor invitations-stien. Ingen mail (de er i appen). Notify fyrer.
- **Picker-add av spiller som allerede er i spillet** (race): UNIQUE-violation på `game_players.(game_id, user_id)` swallow-es; returner success uten ny notify.
- **Recipient = inviter**: admin som inviterer seg selv via picker — skip notify (de vet allerede), men game_players-insert skjer. Trolig sjelden, men billig å håndtere.
- **Notification spam ved bulk-edit**: hvis admin går inn i `/admin/games/[id]/edit` og legger til 5 spillere på én gang, fyres 5 notifyInvitedToGame-kall parallelt via Promise.allSettled. Hver mottaker får én notifikasjon. Ingen rate-limit nødvendig for typical-scale (Jørgen + 7 kompiser).
- **Best-effort-feil i notify**: notifyInvitedToGame swallow-er og logger via console.error med `[notifyInvitedToGame]`-prefix. Hovedflyten (game_players-insert) commits uansett — spilleren er meldt på selv om bell-prikken ikke kom.
- **Realtime-propagering**: `notify()` (`lib/notifications/notify.ts:42-46`) inserter i `notifications` med RLS-respekterende admin-client. Realtime-channel propagerer automatisk per `0032_notifications.sql:52` — recipient ser oppdatert unread-count uten refresh.
- **Tidssone for mail-subject**: «Stiklestad 25. mai» genereres via samme `lib/games/autoGameName.ts`-helper som #203 introduserer (hvis #203 landet først); ellers re-introduserer vi en lokal date-formatter her. Sjekk eksistens i build-fasen.
- **Trusted creators**: spill opprettet av trusted creator (per #198) kan ha `inviter_user_id` som er ikke-admin. notifyInvitedToGame slår opp via `users`-tabellen og bruker navnet — fungerer både for admin og trusted creator som inviter. requireAdminOrTrustedCreator-helper sjekker authz på actions.
- **PWA-install-state**: irrelevant — notifikasjoner går via DB + realtime, ikke web-push (web-push er separat issue #24).

## Key decisions

- **Mulighet 1 (game-scoped flyt)** — ny `inviteToGame`-action med game-kontekst i payload. inviteSchema forblir strikt; ingen card/deeplink-bifurkering.
- **Picker + e-post-felt på samme flate** — én UI-card dekker både «inviter Per som er registrert» (umiddelbar add + notify) og «inviter ukjent e-post» (invitation row + mail + deferred notify).
- **Inline-seksjon på `/admin/games/[id]`** — ny `<Card>` mellom Spillere-table og status-CTA-er. Ingen ny rute, ingen modal (matcher kompis-mental-modell + bevarer single-page-detalj-flow).
- **Picker auto-joins game_players** — direkte-add, ingen RSVP/accept-steg. Notifikasjons-copy «X inviterte deg» er passende selv uten accept (T-as-curator-modellen er etablert).
- **Backfill /new + edit** — eksisterende add-player-flyter fyrer også notify for hver nye spiller. Skip inviter-selv. Skip i edit hvis spilleren allerede var med fra før (kun diff-add fyrer).
- **Mail med game-kontekst** — `sendInviteNotification` får valgfri `gameName`-param. Game-scoped mail har «Stiklestad 25. mai»-subject; eksisterende friend/admin-invite uendret.
- **inviter_user_id fra `games.created_by`** — bruk admin/trusted som opprettet spillet hvis ulik fra actor (sjelden — typisk samme person). For backfill i /new bruker actor (current user); for picker-add bruker actor. Bevarer «hvem inviterte meg»-trace.

**Claude's discretion:**
- Eksakt visuell stil på `<Card>`-headeren («Inviter spillere» eller «Legg til flere spillere» — sjekk brand-stemme-disiplin og kjør humanizer).
- Hvorvidt picker viser hcp_index/nickname i hver rad (matcher /admin/games/new-mønstret) eller bare navn for kompakthet.
- Eksakt subject-tekst på game-scoped mail (innenfor humanizer-rammene). Forslag: «Du er invitert til *{gameName}* — Tørny».
- Hvorvidt success-banneret etter add/invite blinker eller bare fader inn (respekt for prefers-reduced-motion).
- Hvorvidt edit-flytens diff-detection er per-row (smart) eller hele rosteren replace-then-diff (enklere). Anbefalt: snapshot pre-update, diff post-update.

## Success criteria

- [ ] **K1:** `lib/notifications/notifyInvitedToGame.ts` finnes, kapsler fetch-game + fetch-inviter + payload-bygging + best-effort notify-kall. Unit-tester dekker: happy path, finished-game skip, manglende inviter/user, error-swallow med console.error.
- [ ] **K2:** `app/admin/games/[id]/InviteToGameSection.tsx` rendres mellom Spillere-table og status-CTA-er for draft/scheduled-spill. Skjules for active/finished. Mode-aware kapasitetsbanner for best-ball.
- [ ] **K3:** `app/admin/games/[id]/inviteToGameActions.ts` eksporterer `addExistingPlayerToGame` (picker) og `inviteEmailToGame` (e-post). Authz via `requireAdminOrTrustedCreator`. Status-/kapasitets-/duplikat-checks pr. §3. notifyInvitedToGame fyres etter game_players-insert.
- [ ] **K4:** Backfill: `createGameDraft` + `createAndPublishGame` (`app/admin/games/new/actions.ts`) fyrer `notifyInvitedToGame` for hver ny spiller (skip inviter-selv). Tester asserterer at notify kalles én gang per nye spiller, null ganger for inviter, og at game-creation lykkes selv om notify feiler.
- [ ] **K5:** Edit-flytens update-action fyrer notify kun for spillere som ER NYE i diff-en (sammenlignet mot pre-update `game_players`-snapshot). Eksisterende spillere får IKKE ny notifikasjon ved roster-edit.
- [ ] **K6:** `app/login/actions.ts` `verifyCode`: når akseptert invitasjon har `game_id != null`, insertes spilleren i `game_players` + `notifyInvitedToGame` fyres. Expired-invitation/finished-game-skip håndtert per §6.
- [ ] **K7:** `app/games/[id]/page.tsx` mark-as-read-hook utvidet til å også markere `kind: 'invite'` for `entityId: id`. Bell-prikken forsvinner når invitee åpner spillet.
- [ ] **K8:** `lib/mail/inviteNotification.ts` tar valgfri `gameName?: string`-param. Game-scoped subject: «Du er invitert til {gameName} — Tørny». Eksisterende friend/admin-invite-bruk uendret (gameName ikke satt). Snapshot-test for game-scoped mail-grenen.
- [ ] **K9:** Eksisterende test-suite grønn (`npm test`). Nye tester for inviteToGameActions, notifyInvitedToGame, backfill i createGameDraft, verifyCode-deferred-notify, mark-as-read for invite. Bekreftet med `npm test -- lib/notifications/notifyInvitedToGame app/admin/games`.
- [ ] **K10:** `npm run lint` + `npm run build` grønn.
- [ ] **K11:** Manuelt verifisert i prod (per `verify`-skill): admin oppretter spill → kompis får bell-prikk + notifikasjon «Jørgen inviterte deg til X»; admin bruker inviter-card på eksisterende spill → samme; ukjent e-post får mail med spill-kontekst og deretter bell-prikk etter OTP-verify.
- [ ] **K12:** Version bumpet til neste MINOR (sannsynligvis `1.18.0` eller `1.19.0`). CHANGELOG-oppføring med stakeholder-tagline (eks: «Spillere som blir invitert til et spill får nå et varsel i appen, ikke bare når spillet starter.»). Forrige minor-serie wrappet i `<details>`.

## Gates

```bash
npm run lint
npm test
npm run build
```

Scoped under utvikling: `npm test -- lib/notifications app/admin/games app/login lib/mail/inviteNotification`. Full suite før evaluator. Manuell verifisering (K11) via prod-test etter deploy:
1. Logge inn som admin, opprette nytt spill med 1 testbruker → testbruker logger inn på annen enhet, sjekker bell-prikk.
2. På eksisterende spill: bruke inviter-card til å (a) plukke en eksisterende bruker, (b) sende invitasjon til ny e-post.
3. Sjekke at Resend-mail har riktig subject med spill-navn.
4. Etter OTP-verify på ukjent invitee: sjekke bell-prikk + at de står i `game_players`.

## Files likely touched

| Fil | Status | Hva |
|---|---|---|
| `lib/notifications/notifyInvitedToGame.ts` | NY | Helper for fetch-game + fetch-inviter + payload + best-effort notify |
| `lib/notifications/notifyInvitedToGame.test.ts` | NY | Unit-tester for helper |
| `app/admin/games/[id]/InviteToGameSection.tsx` | NY | UI-card: picker + e-post-felt, mode-aware kapasitets-banner |
| `app/admin/games/[id]/inviteToGameActions.ts` | NY | `addExistingPlayerToGame` + `inviteEmailToGame` server-actions |
| `app/admin/games/[id]/inviteToGameActions.test.ts` | NY | Action-tester: authz, status, kapasitet, idempotens, duplikat |
| `app/admin/games/[id]/page.tsx` | ENDRET | Mounter `<InviteToGameSection>` for draft/scheduled; ingen visuell endring for active/finished |
| `app/admin/games/new/actions.ts` | ENDRET | `createGameDraft` + `createAndPublishGame` fyrer notifyInvitedToGame for nye spillere (skip inviter) |
| `app/admin/games/new/actions.test.ts` | ENDRET | Nye tester: notify kalles per ny spiller, ikke for inviter, game-creation lykkes selv ved notify-feil |
| `app/admin/games/[id]/edit/actions.ts` | ENDRET (lokasjon bekreftes ved scout) | Diff-add fyrer notify; eksisterende spillere skip |
| `app/admin/games/[id]/edit/actions.test.ts` | ENDRET | Diff-detection-test |
| `app/login/actions.ts` | ENDRET | `verifyCode`: post-aksept, insert i game_players + notify hvis game_id satt |
| `app/login/actions.test.ts` | ENDRET | Deferred-notify-test for game-scoped invitation; expired-skip-test |
| `app/games/[id]/page.tsx` | ENDRET (én linje) | Mark-as-read-hook utvidet til også kind: 'invite' |
| `lib/mail/inviteNotification.ts` | ENDRET | Valgfri gameName-param + game-scoped subject/body-gren |
| `lib/mail/inviteNotification.test.ts` | ENDRET | Snapshot-test for game-scoped mail-grenen |
| `package.json` | ENDRET | Bump til neste MINOR |
| `CHANGELOG.md` | ENDRET | Ny oppføring + ev. wrap forrige serie i `<details>` |

## Out of scope

- **Mulighet 2** (optional `game_id` i inviteSchema): friend-invite og admin-invite forblir game-løse og fyrer ingen in-app-notifikasjon. Hvis vi senere bestemmer at åpne app-invitasjoner også fortjener notifikasjon, lager vi egen issue.
- **RSVP/accept-flyt**: spillere kan ikke avslå en invitasjon i UI. Admin-curator-modellen er beholdt. Hvis vi vil støtte «meld avbud»-knapp, egen issue.
- **Selv-påmelding** ([#199](https://github.com/jdlarssen/golf-app/issues/199)): independent epic. Når selv-påmelding lander, kan denne flyten bli «hybrid» (åpen + curated), men endringer i schema/RLS skjer i #199-scope.
- **Bulk-invite** (lim inn liste av e-poster, batch-add 10 spillere): én-om-gangen-flyt er tilstrekkelig for kompis-skala. Egen issue hvis pilot-admin ber om det.
- **Web-push-notifikasjoner** ([#24](https://github.com/jdlarssen/golf-app/issues/24)): notifikasjoner går via DB + realtime + bell-ikon. Web-push på lock-screen er separat issue.
- **Notifikasjon når spillere fjernes fra spill**: kun add-events fyrer notify. Remove-handler er stille. Trenger eget event-kind hvis ønsket.
- **Notifikasjons-preferanser** (slå av per-kind): brukeren får alle notifikasjoner, ingen settings-side. Egen issue hvis flere ber om opt-out.
- **Mail-fallback når in-app-notify feiler**: best-effort er best-effort. Hvis notify-tabellen er nede, går ikke mail ut som backup. Aksepteres for MVP.

## Deferred ideas (oppdaget under spec-discussion)

- Notifikasjons-historie per spill («7 spillere ble varslet 25. mai kl. 14.32») — admin-debug-view, lavt løft.
- Inviter-card kan ha rikere picker (HCP-filter, klubb-tilhørighet når #50 lander) — utsatt til skalering.
- Mail-mal kan vise spill-kort med bane, tee-off, format — krever mer HTML-design, ikke nødvendig for MVP.
