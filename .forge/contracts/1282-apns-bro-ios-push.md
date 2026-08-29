# Kontrakt: APNs-bro — native push i iOS-skallet (#1282)

## Problem

Web-pushen fra #24 (VAPID) når aldri et WKWebView-skall — iOS-appen (#1283) ville vært
uten varsler, som både dreper produktverdien og det viktigste argumentet mot Apples
4.2-avslag. Pipelinen er kanal-agnostisk frem til `sendPushToUser`; utvidelsen er en
APNs-kanal ved siden av web-push, ikke et nybygg. Apple-medlemskapet er aktivt (bekreftet
i økten, utløper aug. 2027); eieren oppretter APNs-nøkkelen (.p8) i økten.

## Research-funn (verifisert 2026-08-29)

- `@capacitor/push-notifications` (v8, matcher Capacitor 8): iOS returnerer **rå
  APNs-token** i `registration`-listeneren. Krever Push-capability i Xcode-prosjektet +
  to AppDelegate-hooks (`didRegisterForRemoteNotifications…` → NotificationCenter-post).
  `presentationOptions` i capacitor-config styrer foreground-visning.
- Capacitor-bridgen injiseres også i remote-`server.url`-sider (spike #1281-arkitekturen)
  → registrerings- og deeplink-koden kan bo i WEB-appen (deployes via Vercel, ingen
  butikk-release for å iterere) bak `window.Capacitor?.isNativePlatform?.()`-deteksjon.
- Node-APNs-klienter på npm er stagnerte (apns2 v12: ett år gammel; alternativene 8 år).
  APNs HTTP/2-API-et er stabilt og lite: JWT (ES256, .p8) + `POST /3/device/<token>` med
  `apns-topic` = bundle-id. Node har alt som trengs innebygd: `node:http2` +
  `node:crypto` (`sign('sha256', …, { dsaEncoding: 'ieee-p1363' })` gir JWT-korrekt
  R||S-signatur). **Beslutning: håndrullet tynn provider, null nye deps** (repoet har 14).
- **Sandbox vs. produksjon:** dev-bygg (Xcode → fysisk enhet) får SANDBOX-tokens
  (`api.sandbox.push.apple.com`); TestFlight/App Store får produksjons-tokens. Klienten
  kan ikke lese entitlement-miljøet sitt → self-healing på server (se Design 3).

## Tidligere beslutninger (arves)

- Spike #1281 (funn-notat på #1276): ren remote-URL-skall, ingen SW i skallet, host
  apex `tornygolf.no`, bundle-id `no.tornygolf.app`, team `8C8WCW67J9`. CapacitorCookies
  aktiveres ALDRI.
- `notify()`-kontrakten (#24): push er additiv, best-effort, aldri blokkerende;
  `Promise.allSettled` + pruning av døde tokens. Kanalvalg skjer i push-laget —
  `notify()`-callere røres ikke (akseptkriterium 4 by construction).
- Repoet er PUBLIC: .p8-nøkkelen kun som env (`~/.torny-native/` lokalt + Vercel-env
  hos eieren), aldri i repo.

## Design

**1. DB — søstertabell `apns_tokens`** (IKKE utvidelse av `push_subscriptions` —
web-push-tabellen forblir urørt, som er den sterkeste garantien for akseptkriterium 3):
`id uuid pk, user_id uuid not null → users on delete cascade, token text not null
unique, environment text ('sandbox'|'production', nullable — settes av self-healing),
user_agent text, created_at, last_used_at`. Index på user_id. RLS own-rows (kopi av
0116-policyene). Additiv og writer-løs før koden deployes → trygg å påføre staging nå;
**prod-migrasjon er eier-gated (prod-brannmuren #1074) og skjer i test-økten**.

**2. Server-provider `lib/notifications/push/apns.ts`:** env `APNS_KEY_ID`,
`APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY` (p8-innhold, base64). Manglende
env → `isApnsConfigured()` false → no-op (vapid.ts-mønsteret). JWT caches ~45 min
(Apple-krav: 20–60 min). Payload: `{ aps: { alert: { title, body }, sound: 'default',
badge? }, url, kind }` — samme clamp-grenser som web-push (120/240). Rene funksjoner
(JWT-bygging, payload, prune-beslutning) skilles fra http2-IO for Type A-testbarhet.

**3. Fan-out i `sendPush.ts`:** les `apns_tokens` parallelt med `push_subscriptions`,
samme allSettled. Sending per token: kjent `environment` → det endepunktet; ukjent →
produksjon først, ved `BadDeviceToken` prøv sandbox, persist miljøet som svarte 200.
Pruning: `410 Unregistered` (og `BadDeviceToken` i BEGGE miljøer) → slett raden
(web-push-404/410-symmetrien). Andre feil → `console.error('[push]…')`, behold raden.

**4. Klient-søm (web-appen, aktiv kun i skallet):** `lib/pwa/push.ts` får en
Capacitor-gren: `isNativePush()` når `window.Capacitor?.isNativePlatform?.()`.
`PushToggle`/`PushNudge` gjenbruker samme `PushState`-vokabular — i skallet betyr
'on' = permission granted + token registrert via ny server action
`registerApnsToken`/`removeApnsToken` (`app/[locale]/profile/apnsActions.ts`,
pushActions-mønsteret: user_id fra sesjon, RLS own-rows, `expectOne`). Ved app-start
med permission allerede granted: re-register (tokens roterer). Deeplink:
`pushNotificationActionPerformed`-listener → `router.push(data.url)` — samme
`notificationDestination`-URL som web-push. Nettleser-/PWA-oppførsel: bit-identisk
(grenen er død kode uten Capacitor-objektet).

**5. Skall-skjelett `native/ios/`** (committes som `native/android/`): Capacitor
8-prosjekt fra spike-oppskriften (remote-URL apex, ingen CapacitorCookies) +
`@capacitor/push-notifications` + Push-entitlement + AppDelegate-hooks +
`presentationOptions: ['badge','sound','alert']`. Produksjonspolish (offline-skjerm,
ikoner, TestFlight) er #1283 — dette skjelettet er testriggen for fysisk push-test.

## Kanttilfeller & vakter

- .p8/nøkler ALDRI i repo (public); `native/ios/.gitignore` speiler Android-vaktene.
- Gjester/anonymiserte: allerede gatet i `notify()` (is_guest/deleted_at) — APNs-grenen
  arver gaten siden den bor i samme `sendPushToUser`.
- Token-unikhet på tvers av brukere (byttet konto på samme enhet): `token` er globalt
  unik — `registerApnsToken` upserter på token og overtar raden til ny user_id
  (onConflict token, samme som endpoint-upserten i web-push).
- APNs-payload-taket er 4 KB — clamp-grensene holder oss langt under.
- http2-sesjoner: én per send-batch, lukkes etterpå (serverless-vennlig; ingen
  connection-pooling å lekke).
- Commit-typer: `feat(native)`/`feat(push)` med `[no-changelog]` (ikke bruker-synlig før
  #1283 shipper skallet). `Refs #1282` overalt.

## Suksesskriterier

- [ ] Migrasjon påført STAGING (MCP `list_tables`-bevis); prod eksplisitt IKKE rørt
- [ ] `lib/notifications/push/apns.ts`: Type A-tester grønne for JWT (verifiserbar med
      `crypto.verify`), payload-form, prune-/miljø-beslutning; ingen nye npm-deps
- [ ] `sendPush.ts`-fan-out dekker begge kanaler; EKSISTERENDE `sendPush.test.ts`
      passerer UENDRET (akseptkriterium 3-regresjon)
- [ ] `apnsActions.ts` + klient-søm bak Capacitor-deteksjon; `npm run build` grønn;
      nettleser-stien i `lib/pwa/push.ts` uendret i diff utenfor den nye grenen
- [ ] `native/ios/`-skjelett committet med push-entitlement + AppDelegate-hooks;
      `xcodebuild build` mot fysisk enhet exit 0
- [ ] VERIFICATION GAP dokumentert i PR: fysisk push-mottak (3 NotificationKind-er +
      deeplink), prod-migrasjon og Vercel-env er neste-økt-steg med eieren — issuet
      lukkes først når akseptkriteriene i #1282 er innfridd fysisk

## Gates (per chunk)

- [ ] `npx tsc --noEmit` / `npm run build` når app-kode røres
- [ ] `npx vitest run lib/notifications` (+ co-located for endrede filer)
- [ ] `npm run lint`

## Filer som trolig røres

- `supabase/migrations/<neste>_apns_tokens.sql` — ny tabell + RLS
- `lib/notifications/push/apns.ts` (+ test) — ny provider
- `lib/notifications/push/sendPush.ts` (+ test-utvidelse) — to-kanals fan-out
- `app/[locale]/profile/apnsActions.ts` — register/remove server actions
- `lib/pwa/push.ts`, `components/pwa/PushToggle.tsx` — Capacitor-gren
- `native/ios/**` — skall-skjelett med push
- `docs/native/` — kort iOS-avsnitt (bygg/miljø) når skjelettet lander

## Out of scope

- TestFlight/produksjonspolish av skallet (#1283), App Store-innsending (#1284)
- Android-push (TWA-en bruker web-push med notification delegation — urørt)
- Prod-migrasjon og Vercel-env-innlegging (eier-steg, neste økt)
- Badge-tall-synk, notification actions, rich media — ikke i issuet
