# Spec: Native Supabase-passkeys (Face ID / Touch ID) som opt-in innlogging

**Issue:** [#63](https://github.com/jdlarssen/golf-app/issues/63)
**Erstatter:** den utdaterte kontrakten `63-session-90-days.md` (90-dagers-session-plasteret) — se issue-analysen 2026-06-22 som snur premisset.
**Bump:** MINOR (`feat`) — ny bruker-synlig innloggings- og profil-funksjon.

## Problem

OTP-kode-flyten har lav, men ikke null friksjon: ved retur mellom turneringer må brukeren bytte til mail-appen, kopiere en 8-sifret kode og tilbake. Issue #63 ba om biometrisk innlogging som null-friksjons-alternativ. Premisset i det opprinnelige issuet (og i den forrige kontrakten) er nå utdatert: **Supabase fikk innebygd passkey/WebAuthn-støtte (Beta) 28. mai 2026** — ingen egen `credentials`-tabell, ingen Edge Function, ingen egen JWT-signering. Vi kan legge passkeys på som en opt-in «Slå på Face ID», med OTP beholdt som permanent reserve og recovery.

## Research Findings

Bekreftet mot levende Supabase-docs (`search_docs`, 2026-07-01) + repo-inspeksjon:

- **API (høynivå):** `supabase.auth.registerPasskey()` (krever aktiv sesjon; returnerer `{ id, friendly_name?, created_at }`), `supabase.auth.signInWithPasskey()` (discoverable — ingen e-post nødvendig; setter `data.session`/`data.user` og dispatcher `SIGNED_IN` på browser-klienten). Håndtering: `supabase.auth.passkey.list()` → `[{ id, friendly_name, created_at, last_used_at? }]`, `.update({ passkeyId, friendlyName })` (maks 120 tegn), `.delete({ passkeyId })`. Kilde: https://supabase.com/docs/guides/auth/passkeys
- **Klient-opt-in (påkrevd):** `createClient(url, key, { auth: { experimental: { passkey: true } } })`. Krever `@supabase/supabase-js` ≥ 2.105.0 — repoet har `^2.105.4` ✓.
- **`@supabase/ssr` v0.10.3 videresender flagget:** `createBrowserClient.js:33` spreder `...options?.auth` inn i `createClient` uten whitelist, så `experimental.passkey` når fram. Verifisert i source. (Beholdes som staging-smoke-gate siden API-et er Beta.)
- **Kun browser-klienten trenger flagget** — passkey-seremonien (`navigator.credentials`) kjører i nettleseren. Server/middleware-klientene kaller aldri passkey-metoder → røres ikke.
- **RP-config:** Dashboard → Authentication → Passkeys (RP ID = bar domene uten scheme/port/path; RP Origins ≤ 5, hver origin må matche eller være subdomene av RP ID; HTTPS kreves unntatt loopback). Alternativt Management API PATCH `/v1/projects/$REF/config/auth`. **RP ID er kryptografisk permanent** — endring ugyldiggjør alle passkeys.
- **Feilkoder:** `passkey_disabled`, `too_many_passkeys`, `webauthn_credential_exists`, `webauthn_credential_not_found`, `webauthn_challenge_not_found/expired`, `webauthn_verification_failed`; sign-in kan i tillegg gi `email_not_confirmed` / `user_banned`.
- **Begrensninger:** SSO- og anonyme brukere kan ikke registrere passkeys (irrelevant — Tørny har verken). Ingen innebygd recovery → OTP må forbli permanent recovery-kanal.
- **iOS-risiko (web-research kan ikke avgjøre):** dokumenterte, uløste WebKit-feil der passkey-seremonien kludrer *spesielt* når appen åpnes fra Hjem-skjerm-ikon (Tørnys hovedplattform). Derfor: eksplisitt knapp (aldri conditional-UI autofyll), synlig fallback, og en ekte add-to-home-screen-enhetstest før flagget flippes for reelle brukere.

## Prior Decisions

- **Fra stale-kontrakten `63-session-90-days.md`:** «Full WebAuthn = 1–2 uker» er utdatert (native passkeys). 90-dagers-session-planen er delvis feil (timebox-feltet er Pro-only; Free-tier-sesjoner er allerede langlivde). Vi bygger passkeys direkte i stedet.
- **Fra #166 (self-registration):** feature-flagg-mønsteret i appen er env-var lest som `process.env.NEXT_PUBLIC_ALLOW_SELF_REGISTRATION === 'true'` ([login/page.tsx:68], [login/actions.ts:61]). Vi følger samme env-var-mønster.
- **OTP-only recovery + magic-link pensjonert (2026-05-13):** uendret. Passkey er additiv, aldri eneste vei.

## Design

### Rollout-flagg (3-trinns, env-var)

Ny env-var `NEXT_PUBLIC_PASSKEYS` med verdier `'off' | 'admin' | 'on'` (uspesifisert = `off`). Parses i en liten ren helper `lib/auth/passkeyFlag.ts`:

```ts
// resolvePasskeyAccess(flag, isAdmin) -> { canEnroll, showLoginButton }
// 'off'   -> { canEnroll:false, showLoginButton:false }
// 'admin' -> { canEnroll:isAdmin, showLoginButton:true }   // login-knapp vises til alle,
//                                                          // men virker bare for de som har enrollet (= admin)
// 'on'    -> { canEnroll:true,  showLoginButton:true }
```

**Hvorfor login-knappen vises til alle i `admin`-fasen:** login-siden er pre-auth (vi vet ikke hvem som er admin før innlogging). Discoverable sign-in feiler grasiøst for ikke-enrollede (OS-en sier «ingen passkey» → fall tilbake til kode). I `admin`-fasen har bare admin enrollet, så bare admin kjører faktisk seremonien i prod — som er hele risiko-poenget. `canEnroll` (post-auth, `is_admin` kjent) er den ekte porten.

Owner-flyt: sett `NEXT_PUBLIC_PASSKEYS=admin` i Vercel → verifiser på ekte enhet → `NEXT_PUBLIC_PASSKEYS=on`.

### 1. Klient-opt-in
[lib/supabase/client.ts:5] `getBrowserClient()` — legg til `{ auth: { experimental: { passkey: true } } }` som tredje arg. Server/middleware røres ikke.

### 2. Innlogging med Face ID (pre-auth)
Ny klient-komponent `PasskeyLoginButton` rendret på `?step=email` i [login/page.tsx] over e-post-skjemaet med en «eller»-divider. Vises kun når `showLoginButton` **og** `browserSupportsWebAuthn()`. På tap → `signInWithPasskey()`:
- Suksess → **hard navigasjon** `window.location.assign(next ?? '/')` (IKKE server `redirect()`) slik at cookien satt av browser-klienten plukkes opp av `proxy.ts`. Dette er den ene integrasjons-vrien.
- `webauthn_credential_not_found` / bruker avbryter → grasiøs melding «Fant ingen passkey på denne enheten — bruk kode i stedet» og behold e-post-skjemaet synlig.

Discoverable sign-in hopper over e-post-steget → invitasjons-bivirkningene i `verifyCode` (invite-accept, `befriend_inviter`, klubb-invitasjoner) kjører ikke. Greit: passkey er kun for **retur**-innlogging av allerede-onboardede brukere (de enrollet etter en første OTP-runde som allerede kjørte de bivirkningene).

### 3. Post-login enroll-nudge
Ny klient-komponent `PasskeyEnrollmentNudge` mountet etter `<PushNudge />` i [app/[locale]/page.tsx:88], Suspense-wrappet, samme dismiss-mønster som PushNudge (localStorage). Vises kun når: `canEnroll` **og** `browserSupportsWebAuthn()` **og** brukeren har ingen passkey (`auth.passkey.list()` tom) **og** ikke tidligere avvist. På tap (user-gesture, aldri auto) → `registerPasskey()` → suksess-toast; feil → grasiøs, blokkerer ingenting.

### 4. Passkeys-seksjon i Profil
Ny klient-komponent `PasskeySettings` i [app/[locale]/profile/page.tsx] etter notifikasjons-seksjonen (~linje 260), bygget med `SettingList`/`SettingRow` og PushToggle-presedensen (intern overskrift, betinget render). Lister enrollede passkeys (`friendly_name` + «lagt til»/«sist brukt»), med gi-nytt-navn og slett per rad, og en «Slå på Face ID»-knapp når `canEnroll` og ingen/flere kan legges til.

### 5. Copy (i18n)
Ny `"passkey"`-seksjon i `messages/no.json` + `messages/en.json`. Server-komponenter: `getTranslations('passkey')`; klient: `useTranslations('passkey')`. Norsk copy kjøres gjennom humanizer før commit.

### 6. RP-config (owner, manuelt — ikke kode)
Dashboard → Authentication → Passkeys på **prod** (`glofubopddkjhymcbaph`): Enable; RP Display Name «Tørny»; **RP ID = `tornygolf.no`** (dekker `www.tornygolf.no` som subdomene); RP Origins = `https://www.tornygolf.no,https://tornygolf.no`. Og redirect `tørny.no → tornygolf.no` (owner-beslutning). Staging-prosjektet får egen RP-config mot staging-hosten for enhetstesten. Hovedchatten leverer eksakt Dashboard-sti + Management-API-curl som alternativ.

## Edge Cases & Guardrails

- **User-gesture-krav:** enroll-nudge og login-knapp fyrer kun på tap, aldri auto.
- **Beta-robusthet:** alle passkey-kall try/catch-wrappet; feil blokkerer aldri OTP-flyten.
- **iOS Hjem-skjerm-flakiness:** eksplisitt knapp (ikke conditional-UI), synlig «prøv igjen», OTP alltid tilgjengelig.
- **Ingen recovery i Beta:** OTP forblir permanent recovery; enroll er alltid opt-in, aldri tvunget; fjern aldri OTP-veien.
- **`too_many_passkeys` / `webauthn_credential_exists`:** vennlig norsk melding, ikke rå feilkode.
- **Sletter siste passkey:** brukeren faller tilbake til OTP (greit).
- **Flagg default `off`:** null endring i prod til owner opts inn; eksisterende login-e2e-smoke upåvirket (ingen passkey-UI rendres uten env-var).
- **`verifyCode`-bivirkninger røres ikke** — passkey-login er en separat vei, ikke en endring av OTP-verifisering.
- **RP ID permanent:** `tornygolf.no`, settes én gang av owner; kan aldri endres uten å ugyldiggjøre alle passkeys.

## Key Decisions

- **Build now, flagget, admin-først:** native passkeys bak `NEXT_PUBLIC_PASSKEYS`, OTP som permanent fallback; admin enroller først, åpnes for alle etter ekte enhetstest på staging. — owner-valg (Beta på live prod).
- **Post-login nudge + Profil-liste:** enroll-prompt rett etter første OTP-login *og* en Passkeys-seksjon i Profil. — owner-valg (best adopsjon).
- **RP ID = `tornygolf.no`, redirect `tørny.no → tornygolf.no`:** én credential-lager, virker uansett domene. — owner-valg.
- **Kun høynivå-API** (`registerPasskey`/`signInWithPasskey`), ikke to-stegs lavnivå.
- **Kun browser-klient får flagget** — server/middleware kaller aldri passkey.

**Claude's Discretion:**
- Eksakt norsk/engelsk copy-formulering (humanizer-pass; kanon-tone «Slå på Face ID»).
- Fil-/komponent-plassering (`components/passkey/` for nye komponenter) og om `lib/auth/passkeyFlag.ts` eksponerer én eller to helpere.
- Om `PasskeyLoginButton` bruker `browserSupportsWebAuthn()` fra en egen liten util eller inline `window.PublicKeyCredential`-sjekk.
- Om `supabase/config.toml` får en `[auth.passkey]`/`[auth.webauthn]`-blokk for lokal-stack-paritet (kun hvis det ikke bryter `supabase`-CLI-validering; den operative configen er Dashboard).
- Om login-flyt-diagrammet i `docs/flows/` trenger oppdatering (sjekk; oppdater i samme PR hvis passkey-inngangen endrer en dokumentert flyt).

## Success Criteria

- [x] `lib/supabase/client.ts` opts inn i passkeys (`auth.experimental.passkey`); server/middleware uendret. → [lib/supabase/client.ts:8-14]; ingen endring i server.ts/middleware.ts.
- [x] `lib/auth/passkeyFlag.ts` finnes med enhetstestet `resolvePasskeyAccess` som gir riktig `{canEnroll, showLoginButton}` for `off`/`admin`(admin+ikke-admin)/`on`. → 19 tester grønne i `passkeyFlag.test.ts`.
- [x] Login-siden viser «Logg inn med Face ID» når flagg ≠ off + WebAuthn støttet; kaller `signInWithPasskey`; suksess → `window.location.assign(next)`; manglende credential/avbrudd → grasiøs fallback til kode. → `PasskeyLoginButton.tsx` + 3 tester (hard-nav, no-credential-fallback, unsupported→null); wiring i login/page.tsx.
- [x] Hjem-siden viser en dismissbar «Slå på Face ID»-nudge (user-gesture, kun når `canEnroll` + WebAuthn + ingen passkey) som kaller `registerPasskey`. → `PasskeyEnrollmentPrompt.tsx` (+ server-gate `PasskeyEnrollmentNudge.tsx`) + 3 tester; Suspense-mount i page.tsx:88.
- [x] Profil har Passkeys-seksjon: liste (navn + datoer), gi-nytt-navn, slett, og enroll-knapp når tillatt. → `PasskeySettings.tsx` + 2 tester (list-render, delete-after-confirm); gated mount i profile/page.tsx.
- [x] OTP-innlogging virker uendret som fallback/recovery; ingen endring i `verifyCode`-bivirkninger. → actions.ts urørt; `login/`-tester (31) grønne; full suite 4393 grønne.
- [x] Ny `passkey`-copy i `no.json` + `en.json`, humanizer-ren; eksisterende login-e2e-smoke fortsatt grønn (flagg off → ingen passkey-UI). → begge locales, humanizer-pass gjort; i18n-parity-test grønn.
- [x] MINOR-bump i `package.json` (1.161→1.162.0). CHANGELOG-announcement **utsatt til flagget flippes** (dark launch). Feat-commit bærer `[no-changelog]`. → commit 8b71a99e passerte commit-msg-hook.

## Gates

- [x] `npm install` i worktree — exit 0.
- [x] `npx tsc --noEmit` (exit 0) + `npm run build` (grønn, full rute-tre).
- [x] `npm run lint` — 0 errors (50 pre-eksisterende complexity-warnings i urelaterte filer).
- [x] `npm test` — 345 filer / 4393 tester grønne.
- [x] Pre-commit-hook: kun 2 i18n-vakt-advarsler på JSDoc-**kommentarer** (ikke ekte hardkodet copy — all UI-tekst går via `useTranslations`). Ingen ekte funn.
- [ ] **Manuelt (owner-gate før flagg flippes):** Dashboard passkey-config på prod (RP ID `tornygolf.no`) + ekte add-to-home-screen-enhetstest på staging. Kode merges med flagg `off`; flippes til `admin` først etter enhetstest. — owner-handling, ikke byggbar.

## Files Likely Touched

- `lib/supabase/client.ts` — passkey-opt-in på browser-klient.
- `lib/auth/passkeyFlag.ts` (ny) + `.test.ts` — flagg-parsing/gating.
- `app/[locale]/(auth)/login/page.tsx` — render passkey-login-knapp på email-steg, send flagg-prop.
- `app/[locale]/(auth)/login/_components/PasskeyLoginButton.tsx` (ny, klient) + test.
- `app/[locale]/page.tsx` — mount enroll-nudge etter PushNudge.
- `components/passkey/PasskeyEnrollmentNudge.tsx` (ny, klient) + test.
- `app/[locale]/profile/page.tsx` — Passkeys-seksjon.
- `components/passkey/PasskeySettings.tsx` (ny, klient) + test.
- `messages/no.json` + `messages/en.json` — `passkey`-seksjon.
- `CHANGELOG.md` + `package.json` — MINOR-bump.
- (Valgfritt) `supabase/config.toml` — `[auth.passkey]`/`[auth.webauthn]` for lokal paritet.
- (Hvis nødvendig) `docs/flows/*` — login-flyt-diagram.

## Out of Scope

- **Admin-revoke-UI** (`auth.admin.passkey`) — owner revokerer via Dashboard ved behov.
- **To-stegs lavnivå passkey-API** — bruker høynivå `registerPasskey`/`signInWithPasskey`.
- **Conditional-UI autofyll-login** — eksplisitt forkastet (iOS upålitelig).
- **«Logg ut alle steder» / sesjons-enhetsliste.**
- **Related Origin Requests** — owner valgte redirect i stedet.
- **OAuth (Apple/Google Sign-In), SMS-OTP, magic-link** — separate/forkastede vurderinger.
- **Automatisert e2e av selve seremonien** — ekte enhetstest på staging (owner-gate), ikke Playwright.
- **Deployet staging / Vercel Preview-oppsett** — owner sin ventende infra (Fase 2); kreves for iOS-enhetstesten men ikke for kode-bygget.
- **90-dagers JWT-expiry-plaster** — forkastet (Free-tier-sesjoner allerede langlivde; timebox er Pro-only).
