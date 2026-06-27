# Push-varsler via Web Push API — Design (#24, v1)

**Issue:** [#24](https://github.com/jdlarssen/golf-app/issues/24)
**Status:** Godkjent design — klar for implementeringsplan
**Dato:** 2026-06-27

## 1. Mål

Lever Tørnys eksisterende varsler til enheten som push når appen er lukket — på
mobil, tablet og PC. Push er en ny **leveringskanal** hektet på den eksisterende
`notify()`-fan-out, ikke et parallelt system og ingen nye varseltyper. Målet er
**enklest mulig happy flow**: få brukeren til å slå på varsler med ett trykk.

### Designprinsipper (fra brainstorming)

- **Ett trykk.** Ingen kanalvelger, ingen enhetsliste, ingen innstillings-konsoll.
  «Slå på varsler» → telefonen spør om lov → ferdig.
- **Additivt og trygt.** Push legges *oppå* dagens e-post — e-postoppførselen
  endres ikke. Blokkeres eller svikter push stille, fanger e-posten det opp, så
  ingen går mørke. Robusthet > eleganse for v1.
- **Virker der det virker.** Tilby toggelen overalt nettleseren støtter push
  (mobil, tablet, PC). Det proaktive dyttet vises kun på mobil/tablet.

## 2. Scope

### I scope (v1)

- `push_subscriptions`-tabell (per enhet) + RLS.
- `web-push`-utsending hektet inn i `notify()` (best-effort, **i tillegg** til
  dagens e-post).
- Service worker `push`- + `notificationclick`-handlers.
- Opt-in: én profil-rad (av/på per enhet) + ett post-install-dytt (mobil).
- «Blokkert»-tilstand: oppdag `Notification.permission === 'denied'` → vis
  Innstillinger-oppskrift.
- iOS-gating: push tilbys kun i installert PWA (Safari-fane → «installer først»).
- Gjenbruk av eksisterende deeplink- og tekst-katalog (lokalisert per mottaker).

### Ikke i scope (v1)

- **Kanalvelger / `notification_channel`.** Forkastet bevisst — for «massivt».
  Push er en enkel av/på, e-post forblir dagens baseline.
- **«Ingen varsler»-valg / e-post-opt-out.** Status quo beholdes (e-post når
  off-app). Full demping er en framtidig sak.
- **Per-enhet enhetsliste / fjernstyring av andre enheter.** Hver enhet styrer
  bare seg selv.
- Nye «live-øyeblikk»-varsler (birdie / ledelsesendring) — hører til #938/#951 og
  arver push gratis når de bygges (de kaller bare `notify()`).
- Edge Function / kø-basert utsending (escape-hatch, §11). Ikke bygget nå.

## 3. Brukeropplevelse

### 3.1 Dyttet (mobil/tablet, kun proaktive flate)

Lite, lukkbart kort på hjem-skjermen, vist **én gang** etter at appen er
installert (samme dismiss-mønster som `InstallBanner`, eget localStorage-flagg).
«Slå på varsler» → §3.4. «Ikke nå» → legges bort for godt. Vises **ikke** på PC.

### 3.2 Profil-raden (overalt push støttes, inkl. PC)

Én rad i profil-innstillingene, «Varsler på denne enheten», med fire tilstander:

| Tilstand | Vises som | Handling |
|----------|-----------|----------|
| `default` (aldri spurt) | «Slå på» | trykk → §3.4 |
| `granted` + abonnert | «På · denne enheten» + av/på-bryter | bryter av → unsubscribe + slett rad |
| `denied` (blokkert) | gul «Varsler er blokkert i telefonen» + 3-stegs Innstillinger-oppskrift | manuell (vi kan ikke åpne Innstillinger) |
| iOS Safari-fane (ikke installert) | «Legg til på hjemskjermen først» + del-snarvei | bruker installerer, så §3.4 |

På **PC** finnes raden i profil, men ikke dyttet. Ingen iOS-install-gating på PC.

### 3.3 Selve varselet

App-ikon + «TØRNY» + tittel/tekst fra den eksisterende varselkatalogen (samme
tekst som innboks-kortet, på mottakerens språk). Trykk åpner riktig sted via
`notificationDestination`. Ser tilsvarende ut på iOS, Android og desktop-OS.

### 3.4 På-skru-flyten

1. Bruker trykker «Slå på varsler» (dytt eller profil-rad) — en brukergest.
2. `Notification.requestPermission()` → **dette er selve telefon-/OS-dialogen.**
   Det finnes intet eget «slå på i Innstillinger»-steg for førstegangsbrukere:
   app-trykket *er* det som åpner OS-popupen. «Tillat» → på på begge nivåer.
3. `pushManager.subscribe(...)` → POST til server-action → lagre abonnement.
4. Bekreftelse: «Varsler er på».

> **Blokkert fra før:** er permission allerede `denied`, vil nettleseren **ikke**
> vise popupen på nytt, og en nettside/PWA får **ikke** lov å åpne OS-innstillingene.
> Eneste vei er manuell — derfor oppskriften i §3.2. E-post dekker dem i mellomtiden.

### 3.5 PC-spesifikt

Web Push virker på Chrome/Edge/Firefox (Win/Mac/Linux) og Safari 16+ (Mac), uten
install-krav. Nyanse å kommunisere ikke i UI, men å vite: desktop-push leveres kun
mens nettleseren kjører (bakgrunn er ok; helt avsluttet → ingen levering). Derfor
er e-post-backstoppen ekstra relevant på PC.

## 4. Arkitektur — push additivt i `notify()`

`lib/notifications/notify.ts` er den ene fan-out-funksjonen alle 21 varseltyper
går gjennom. Den (a) inserter in-app-raden og (b) returnerer `shouldAlsoSendMail`
ut fra om brukeren er off-app (`shouldSendMailFallback(last_seen_at)`, terskel
`OFF_APP_THRESHOLD_MS` = 5 min).

Vi legger til **ett** steg — best-effort push når brukeren er off-app:

```ts
const offApp = shouldSendMailFallback(lastSeenAt);
if (offApp) {
  // Best-effort, kaster aldri; no-op hvis 0 abonnement eller VAPID umangler.
  await sendPushToUser({ userId, kind, payload, locale });
}
return { shouldAlsoSendMail: offApp };   // E-postoppførsel UENDRET fra i dag
```

- **E-post er uendret.** `shouldAlsoSendMail` returnerer akkurat som før. Push er
  rent additivt → ingen kan gå mørke, ingen suppress-logikk, ingen ny kolonne.
- **On-app:** verken push eller mail — kun realtime-prikken. Uendret.
- **Caller-kontrakt uendret:** ingen av de ~20 call-sites endres.
- `notify()`s parallelle `users`-spørring utvides til også å hente `locale`
  (henter allerede `last_seen_at`).

## 5. Datamodell — migrasjon `0116`

> Verifiser siste migrasjonsnummer mot `origin/main` før commit (parallell-PR-felle).

`push_subscriptions` (ny tabell — RLS PÅ):

| Kolonne        | Type            | Notat                                            |
|----------------|-----------------|--------------------------------------------------|
| `id`           | `uuid` PK       | `default gen_random_uuid()`                      |
| `user_id`      | `uuid` NOT NULL | FK → `users(id)` `ON DELETE CASCADE`             |
| `endpoint`     | `text` NOT NULL | **UNIQUE** (push-tjenestens URL = enhets-ID)     |
| `p256dh`       | `text` NOT NULL | `subscription.keys.p256dh`                       |
| `auth`         | `text` NOT NULL | `subscription.keys.auth`                         |
| `user_agent`   | `text`          | for gjenkjenning av enhet                        |
| `created_at`   | `timestamptz`   | `default now()`                                  |
| `last_used_at` | `timestamptz`   | settes ved vellykket utsending (opprydding)      |

Indeks på `(user_id)`. `endpoint` UNIQUE → upsert-on-conflict. **Ingen** kolonne
på `users` (av/på = «finnes det et abonnement for denne enheten»).

## 6. RLS

`push_subscriptions`:

- **SELECT/INSERT/UPDATE/DELETE for egen rad:** `user_id = auth.uid()`.
- **Send-veien** (`sendPushToUser`) leser via **admin-klient** (service role) —
  symmetrisk med hvordan `notify()` allerede inserter.
- `user_id` settes server-side fra sesjon, aldri fra klient-payload.

## 7. VAPID & konfig

- Bibliotek: **`web-push`** (npm) — Node-runtime, VAPID-signering + kryptering.
- Jeg genererer ett VAPID-nøkkelpar (`npx web-push generate-vapid-keys`).
- **Eierens manuelle steg (Vercel → Settings → Environment Variables):**
  - `VAPID_PUBLIC_KEY` (server)
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (samme public key, til klient)
  - `VAPID_PRIVATE_KEY` (hemmelig)
  - `VAPID_SUBJECT` (`mailto:post@tornygolf.no`)
  - Egne nøkkelpar for **staging** og **prod**.
- Mangler env → `sendPushToUser` no-op'er med én `console.error` (e-post dekker).

## 8. Server — moduler

### 8.1 `lib/notifications/push/sendPush.ts` (ny)

`sendPushToUser({ userId, kind, payload, locale }): Promise<void>`

- Henter brukerens abonnement (admin-klient). 0 → returnér uten IO.
- Bygger innhold: tekst via delt bygger (§8.3), lenke via `notificationDestination`.
- Sender til hvert abonnement parallelt (`Promise.allSettled`).
- **Prune:** svar `404`/`410` → slett det abonnementet. Andre feil → logg, behold.
- `last_used_at = now()` på vellykkede.
- Kaster aldri oppover (best-effort).

Payload (kryptert, holdes < ~4 KB):
`{ "title": "...", "body": "...", "url": "/games/abc", "kind": "game_finished" }`

### 8.2 `lib/notifications/push/vapid.ts` (ny)

Tynn init: leser env, `webpush.setVapidDetails(...)` én gang, `isPushConfigured()`.

### 8.3 Delt tekst-bygger — refaktor

Tittel/tekst-mappingen bor i dag i `buildCardContent` **inne i**
`components/notifications/NotificationCard.tsx` (klient, `inbox`-namespace).
Trekk ut til ren, server-trygg funksjon:

```ts
// lib/notifications/cardContent.ts (ny)
buildNotificationText(kind, payload, t): { title: string; detail: string }
```

- `NotificationCard` importerer den (fjerner sin lokale kopi) → én kilde.
- Push bygger **server-side** translator per mottaker-locale ved å gjenbruke
  mønsteret i `lib/mail/i18n.ts` (`createTranslator({ locale, messages,
  namespace: 'inbox', timeZone: 'Europe/Oslo' })`).
- Lenke: `notificationDestination({ kind, payload })`; `null` → push uten URL
  (åpner appen på `/`).

## 9. Service worker — `public/sw.js`

Legg til (og **bump `CACHE_VERSION`** så klienter henter ny SW):

```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(data.title ?? 'Tørny', {
    body: data.body ?? '',
    icon: '/icon', badge: '/icon',
    data: { url: data.url ?? '/' },
    tag: data.kind,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find((c) => 'focus' in c);
    if (existing) { await existing.focus(); existing.navigate?.(url); return; }
    await self.clients.openWindow(url);
  })());
});
```

Caching-strategien (allowlist av offentlige ruter) røres ikke.

## 10. Klient — opt-in

Gjenbruk `lib/pwa/detect.ts` (`isStandalone`, `isIosSafari`, `isIosNonSafari`).

### 10.1 Støtte-deteksjon

Tilby toggelen når `'serviceWorker' in navigator && 'PushManager' in window &&
'Notification' in window`. Dette er sant på PC (Chrome/Edge/Firefox/Safari-Mac)
og Android, og på iOS **kun installert** (Safari-fane → vis install-først).

### 10.2 På-skru / av (`lib/pwa/push-subscribe.ts` + hook)

1. `Notification.requestPermission()` (bruker-gest).
2. `reg = await navigator.serviceWorker.ready`
3. `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
4. POST `subscription.toJSON()` → server-action `savePushSubscription` (upsert på
   `endpoint`, `user_id` fra sesjon).
5. Av: `subscription.unsubscribe()` + `removePushSubscription(endpoint)`.

Tilstand til profil-raden (§3.2) avledes av `Notification.permission` +
`reg.pushManager.getSubscription()`.

### 10.3 Profil-raden

Ny enkel rad i `app/[locale]/profile/` (settings er allerede delt i merkede
seksjoner). Fire tilstander per §3.2. Server-actions:
`savePushSubscription` / `removePushSubscription` (upsert/slett, assert affected
via `expectAffected`, jf. AGENTS.md «0-row write = failure»).

### 10.4 Post-install-dytt

Lite kort, dismiss-mønster som `InstallBanner`
(`localStorage['torny-push-nudge-dismissed']`). Vis når: `isStandalone()` **og**
mobil/tablet **og** push ikke alt er på **og** ikke avvist. **Aldri på PC.**

## 11. Feilhåndtering & edge-cases

- **Push aldri blokkerende:** all push-IO best-effort; feil → `console.error`.
  E-post går uansett (additivt) → ingen går mørke.
- **Blokkert (`denied`):** kan ikke re-prompte eller åpne Innstillinger fra web —
  vis oppskrift (§3.2). `pushManager.subscribe()` feiler → ingen rad → e-post dekker.
- **Tillatelse trukket på OS-nivå etter abonnement:** abonnementet kan finnes, men
  push vises ikke (web-push svarer likevel «mottatt»). Akseptert — e-post-backstoppen
  (additiv) sikrer at brukeren ikke går glipp av noe. Dette er hovedgrunnen til at
  v1 er additivt, ikke «push i stedet for e-post».
- **Desktop, nettleser avsluttet:** ingen levering før den kjører igjen. E-post dekker.
- **Døde abonnement:** `410`/`404` → slett raden.
- **Manglende VAPID-env:** `sendPushToUser` no-op'er → e-post dekker.
- **Lastbekymring (klubb-skala):** push er symmetrisk med dagens mail-fan-out
  (N brukere, parallellisert, best-effort). Escape-hatch hvis problem: Postgres-
  trigger → Supabase Edge Function. Ikke bygget nå.

## 12. Testing (per `docs/test-discipline.md`)

- **Type A (ren logikk, TDD):**
  - `buildNotificationText` — `it.each` over alle kinds: tittel/tekst mot katalog.
  - `sendPushToUser` prune-logikk: `410` → sletter; suksess → `last_used_at` +
    behold; 0 abonnement → ingen IO. Mock kun ved system-grensa (`web-push` +
    admin-klient).
  - `notify()` off-app-gren: off-app → kaller push + `shouldAlsoSendMail=true`;
    on-app → ingen push, `false`. Oppdater eksisterende `notify.test.ts`.
- **Server-action:** én test for `savePushSubscription`/`removePushSubscription`
  (upsert + slett, affected-row-assert).
- **SW-handlers:** verifiseres **manuelt på staging** (installert iPhone-PWA +
  Android + én desktop-nettleser) — ikke enhetstestet (DOM/SW-grense).
- **Forbudt:** «mens jeg var her»-tester, duplisert mock-oppsett.

## 13. Leveranse-rekkefølge

1. PR med kode + migrasjon `0116`. `feat` → bump minor + CHANGELOG-linje
   (Funksjoner). Ny norsk copy → kjør `humanizer`-skillet før commit.
2. Migrasjon på **staging** først (Supabase MCP), verifiser, så **prod**.
3. Eier setter VAPID-env i Vercel (staging + prod).
4. Verifiser på staging: installert iPhone-PWA + Android + desktop-nettleser →
   slå på i profil/dytt → utløs et varsel (inviter testbruker) → bekreft push med
   riktig tekst + at klikk åpner riktig sted. Verifiser også blokkert-oppskriften
   og at e-post fortsatt går.
5. Merge via PR (`gh pr merge --rebase --delete-branch`).

## 14. Issue & flyt

- Lukker [#24](https://github.com/jdlarssen/golf-app/issues/24) (v1-scope = dagens
  varsler). Closing-kommentar (Teknisk + Funksjonell) obligatorisk.
- Noter i closing-kommentaren at vi bevisst bygget **rør-jobben nå**, frikoblet fra
  live-epicen #951 — #938 sine framtidige live-øyeblikk arver push gratis. Bevisst
  avvik fra #24s «start med live-øyeblikk»-anbefaling; begrunnelse: røret er
  identisk, og dagens varsler gir verdi nå uten å vente på #938. Noter også at
  kanalvelger-idéen (push/e-post/ingen) ble forkastet til fordel for additiv
  ett-trykks-happy-flow.
- PWA-install-flyten i `docs/flows/` berøres ikke strukturelt (push er en
  leveringskanal). Ingen diagram-regenerering nødvendig.

## 15. Åpne antakelser

- **`inbox`-namespacet dekker push-tekst tilstrekkelig.** Blir noen for lange som
  push, legges egne `push.*`-nøkler til ved behov (ikke antatt nå).
- **Egne VAPID-nøkkelpar per miljø.** Bekreft ved env-oppsett.
- **Additivt e-post beholdes i v1.** Bevisst valg for robusthet (eier prioriterte
  «får faktisk beskjed» > «litt dobbelt»). Kan strammes til senere.
