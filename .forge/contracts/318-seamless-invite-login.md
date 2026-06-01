# Spec: Sømløs innlogging fra invitasjon (kode + skanner-trygg tapp-knapp i én mail)

GitHub: [#318](https://github.com/jdlarssen/golf-app/issues/318) · Tier 1 flagship · branch: `claude/relaxed-bose-2512eb` (or fresh from `main`)

## Problem

En invitert spiller må i dag gjennom to mailer: invitasjons-notifikasjonen («gå til /login og be om en kode»), så Supabase-OTP-mailen. To mailer, to ventetrinn, og det er førsteinntrykket. Vi vil at **én** invitasjonsmail skal inneholde alt: en «Logg inn»-knapp som virker med ett tapp, og en innloggingskode printet rett under som alltid funker (også i PWA-en og hvis en mail-skanner har vært innom). Vanlige innloggere (ikke-inviterte) skal være helt urørt.

Magic-link ble forkastet 2026-05-13 fordi mail-skannere (SafeLinks, Mimecast, Gmail-prefetch) henter URL-en og brenner engangs-token-en før mennesket trykker. Knepet som gjør en lenke trygg: **token konsumeres kun på eksplisitt POST** (bruker trykker knapp på en landingsside), aldri på GET (skanner åpner siden, men sender ikke skjema). Koden i mail-body-en er ikke en klikkbar URL, så den kan ikke brennes ved skanning.

## Research Findings

Verifisert mot Supabase-docs 2026-06-01:
- `supabase.auth.admin.generateLink({ type, email })` returnerer `data.properties` med `email_otp`, `hashed_token`, `action_link`, `verification_type` — og **sender ingen mail selv**. Det er nettopp primitivet for «generer OTP, send via egen kanal». ([docs](https://supabase.com/docs/reference/javascript/auth-admin-generatelink))
- `email_otp`-en løses inn med `verifyOtp({ email, token: email_otp, type: 'email' })`, som setter session-cookie-en **på den kallende klienten**. Må kjøres på SSR-cookie-klienten (`getServerClient()`), IKKE admin-klienten — ellers lander ikke cookien (kjent felle, [discussion #22073](https://github.com/orgs/supabase/discussions/22073)). Dagens `verifyCode` gjør allerede nøyaktig dette.
- **Type-branching (bekreftet gotcha):** `magiclink` feiler for en ikke-eksisterende bruker; `invite`/`signup` oppretter bruker. Vi må sjekke `auth.users`-eksistens (admin) først og velge `'magiclink'` (finnes) vs `'invite'` (ny).
- `generateLink` kan returnere samme OTP innen dens gyldighetsvindu ([auth#1357]) — irrelevant her, vi genererer + konsumerer i samme request, så OTP-ens levetid er millisekunder.

## Prior Decisions

- **#182 (game-scoped invite-notifications):** `verifyCode` stempler `accepted_at`, oppretter `game_players` for game-scopede invitasjoner, og fyrer `notifyInvitedToGame`. Disse side-effektene skal nå kjøre fra ALLE innløsnings-stiene → trekkes ut til delt helper.
- **#356 (onboarding-landing, nettopp shipped):** `verifyCode` regner ut landingsmål (`/games/[id]` via `/complete-profile?next=…` for spill-scopet solo-invitee). Denne logikken flyttes inn i den delte side-effekt-helperen så knapp- og kode-stiene arver samme landing.
- **#309 (modus-hint i invite-mail):** `inviteNotification.ts` har allerede et modus-hint (game_mode → callout). #318 legger til knapp + kode i SAMME mal — komponer, ikke erstatt. Approval-test-regexen på intro-linja må fortsatt holde.
- **#361 (vennlige feil, nettopp shipped):** redeem-stiene skal gi vennlige norske feil ved utløpt/brukt/feil kode, i samme ånd som `invite_expired`.
- **#166 (self-registration):** `consumeLoginRateLimit({ email, ip })` (per-email + per-IP bucket) gjenbrukes for kode-innløsning.
- **`lib/productUpdates/unsubscribeToken.ts`:** etablert mønster for HMAC-SHA256 + `timingSafeEqual` + env-secret. Gjenbrukes for hashing av redeem-hemmeligheter.

## Design

### Hemmeligheter (genereres ved invitasjon, lagres hashet)

To hemmeligheter per invitasjon, generert i én delt helper `lib/auth/inviteRedeem.ts`:
- **URL-token** for knappen: ≥128-bit (`randomBytes(32).toString('base64url')`). Høy entropi.
- **Innloggingskode** for typing: **8-sifret numerisk** (matcher dagens Supabase-OTP-UX — `VerifyCodeForm` er allerede bygd for 8 siffer, formatert «1234 5678»). Lav entropi (~26 bit) → forsvares av email-binding + rate-limit + lockout.

Begge lagres **hashet** via HMAC-SHA256 med server-pepper (`INVITE_REDEEM_SECRET` env-var, samme mønster som `unsubscribeToken`). Pepper-en gjør at en DB-lekkasje ikke lar en angriper brute-force den lav-entropi 8-sifret-koden offline. Klartekst finnes kun i mailen.

### Levetid (Key Decision)

- **Game-scopet invitasjon:** `redeem_expires_at` = spillets `scheduled_tee_off_at` + 2 dager (buffer for etter-runde-innlogging). Mangler tee-off (draft/uplanlagt) → fall tilbake til 30 dager.
- **Åpen / venne-invitasjon (game_id null):** 30 dager.
- Sett **både** `expires_at` (eksisterende kolonne, gater `email_is_invited` + #361-meldingen) **og** `redeem_expires_at` til samme verdi, så alle gates er konsistente. (I dag er `expires_at` hardkodet 7 dager — den utvides til den nye levetiden.)

### 1. Ved invitasjon (admin/game/venn inviterer)

Alle tre invite-send-stiene (`app/admin/spillere/actions.ts:sendInvitation` + `resendInvitation`, `app/admin/games/[id]/inviteToGameActions.ts`, `app/invite/actions.ts`) kaller den delte `inviteRedeem`-helperen for å:
1. Generere token + kode (klartekst) + deres hasher + `redeem_expires_at`.
2. Skrive hasher + `redeem_expires_at` til `invitations`-raden (insert eller, ved resend, update + nullstill `redeem_attempts`).
3. Sende ÉN Resend-mail med klartekst-token (i knapp-URL) + klartekst-kode. Ingen `signInWithOtp`/`generateLink` her.

`resendInvitation` regenererer ferske hemmeligheter (gamle blir ugyldige) og nullstiller `redeem_attempts`.

### 2. Knapp-sti — `/login/invite/[token]`

- **GET** = landingsside som IKKE verifiserer. Slår opp invitasjon på token-hash (kun for å vise «Logg inn som {email}»), viser knapp + koden (som fallback). Skanner åpner denne uten å konsumere noe. Honeypot-felt som ellers.
- **Tapp → POST** server-action (`app/(auth)/login/invite/[token]/actions.ts`):
  1. Hash token, slå opp invitasjon på `redeem_token_hash`. Sjekk ikke utløpt (`redeem_expires_at > now`), ikke akseptert (`accepted_at is null`).
  2. Kall delt `establishSessionForEmail(email)`.
  3. Kall delt `runInviteRedemption(email)` (side-effekter + landingsmål), single-use: sett `accepted_at` + nullstill begge hash-er. Redirect til spillet/`next` (arver #356-landing).

### 3. Kode-sti — eksisterende `/login`, redeem-modus på verify-steget

Invite-mailens lenke til `/login` bærer `?email=` (ferdig utfylt) — gjenbruk dagens prefill. Brukeren taster koden fra mailen i det eksisterende `VerifyCodeForm`.

Verify-steget dispatcher på om e-posten har en **innløsbar invitasjon** (redeem_code_hash satt, ikke utløpt, ikke låst):
- **Redeem-modus:** match kode mot `redeem_code_hash` (email-bundet). Treff → `establishSessionForEmail` + `runInviteRedemption` + single-use-nullstilling + redirect. Bom → `redeem_attempts++`, vennlig «feil kode»-feil; ved ≥ lockout-grense (5) → lås (`code_locked`-feil, be om ny via admin). **Faller IKKE tilbake til Supabase-verify i redeem-modus** — det holder lockouten meningsfull.
- **Standard-modus** (ingen innløsbar invitasjon for e-posten): dagens `verifyCode` (ekte Supabase-OTP) uendret. Dekker ikke-inviterte og inviterte som har bedt om en frisk Supabase-kode.

### 4. Delt session-minting — `lib/auth/establishSessionForEmail.ts`

```
establishSessionForEmail(email): Promise<{ ok: true } | { ok: false; error: string }>
  1. exists = admin: finnes auth.users-rad for email?
  2. { data, error } = admin.generateLink({ type: exists ? 'magiclink' : 'invite', email })
  3. getServerClient().auth.verifyOtp({ email, token: data.properties.email_otp, type: 'email' })
  4. returner ok/feil
```
`getAdminClient()` + `getServerClient()` finnes allerede.

### 5. Delt post-auth — `lib/auth/inviteRedemption.ts`

Trekk ut fra dagens `verifyCode` (linjene som stempler `accepted_at`, oppretter `game_players` for game-scopede invitasjoner, fyrer `notifyInvitedToGame`) **+ #356-landingslogikken** (regn ut `gameDest`/`profileIncomplete`). Returner landingsmålet til kalleren. `verifyCode`, knapp-stien og kode-stien kaller alle denne. Behold best-effort-semantikken (try/catch rundt side-effektene, redirect skjer i kalleren utenfor catch — NEXT_REDIRECT-swallow-fellen).

### 6. Vanlig innlogging (ikke-inviterte) — urørt

`sendCode` + `verifyCode`s standard-modus står som i dag. Alt over er additivt.

### Mail (komponer med #309)

`inviteNotification.ts` får to nye params: `loginCode` (8-sifret, formatert «1234 5678») + `loginUrl` (`https://tornygolf.no/login/invite/{token}`). Layout: modus-hint (#309, hvis game-scopet) → «Logg inn»-knapp (primær, forest-grønn, peker på knapp-stien) → koden i en lesbar boks rett under («eller skriv inn denne koden på tornygolf.no: 1234 5678»). Behold brand-stil. Oppdater både `html` og `text`. Når `loginCode`/`loginUrl` mangler (skal ikke skje i prod, men defensivt) → dagens copy.

## Edge Cases & Guardrails

- **Skanner GET-er knapp-stien:** ingenting konsumeres, ingen DB-write, ingen session. Kun en landingsside rendres. (Dette er hele poenget — må verifiseres i test/review.)
- **Token/kode utløpt eller allerede brukt (`accepted_at` satt / hash nullstilt):** vennlig norsk feil med vei videre («Invitasjonen er utløpt eller allerede brukt — be arrangøren sende en ny»), aldri en rå feil eller 404.
- **Feil kode, gjentatte forsøk:** `redeem_attempts++`; ved ≥5 → lås kode-innløsning for invitasjonen (`code_locked`). Knapp-stien (høy-entropi token) rammes ikke av kode-lockouten.
- **Rate-limit:** `consumeLoginRateLimit({ email, ip })` på kode-innløsning (per-email + per-IP), før hash-oppslag.
- **`generateLink` type-branch:** feil eksistens-sjekk → `invite` på eksisterende bruker (eller `magiclink` på ny) feiler. Sjekk `auth.users` via admin før kall; ved generateLink-feil → vennlig «noe gikk galt, prøv koden eller be om ny».
- **Cookie-kontekst:** `verifyOtp` MÅ på `getServerClient()` (cookie-klient), ikke admin — ellers ingen session. Lås dette i `establishSessionForEmail` + en kommentar.
- **Team-only game-scopet invitasjon:** samme #182-håndtering (ingen solo `game_players`-insert; lander på lag-stien). Arves fra delt helper.
- **Idempotens / single-use:** vellykket innløsning setter `accepted_at` + nullstiller begge hash-er i samme update. En andre POST finner ingen match → vennlig «allerede brukt».
- **#348 invite-dedup:** uendret — `email_is_invited` gater fortsatt dobbel-invite på tvers av dører.
- **Klartekst-hemmeligheter:** kun i Resend-mailen. Aldri i DB, aldri i logger, aldri til klienten.

## Key Decisions

- **Levetid:** game-scopet = tee-off + 2 dager (fallback 30d uten tee-off); åpen/venn = 30 dager. `expires_at` + `redeem_expires_at` settes likt. — *Eier valgte spilldato-binding for game-scopede, 30d ellers.*
- **Kode-format:** 8-sifret numerisk. — *Matcher dagens Supabase-OTP (8 siffer, «1234 5678»); gjenbruker `VerifyCodeForm`. Lav entropi forsvares av email-binding + HMAC-pepper + rate-limit + lockout.*
- **Hashing:** HMAC-SHA256 med `INVITE_REDEEM_SECRET`-pepper (mønster fra `unsubscribeToken`). — *Pepper hindrer offline brute-force av 8-sifret-koden ved DB-lekkasje.*
- **Verify-dispatch:** redeem-modus når e-posten har innløsbar invitasjon, ellers standard Supabase-OTP. — *Lar både mailet kode OG frisk Supabase-kode virke, uten å svekke lockout.*

**Claude's Discretion:**
- Lockout-grense (foreslått 5 forsøk) og buffer-dager (foreslått +2) — juster om noe føles bedre under bygg.
- Eksakt mail-layout/copy innen brand (kjør `humanizer` på all ny norsk copy).
- Om kode-stien blir en ny `redeemInviteCode`-action eller en gren i `verifyCode` — velg det reneste gitt den delte helperen.
- Migrasjonsnummer (neste ledige i `supabase/migrations/`). Bruk Supabase MCP til å applye POST-merge.

## Success Criteria

- [ ] Én invitasjonsmail inneholder både «Logg inn»-knapp og en 8-sifret kode — ingen andre-mail-request. (Les `inviteNotification.ts` + snapshot.)
- [ ] Knapp-stien verifiserer kun på eksplisitt POST, aldri på GET. (Test: GET på `/login/invite/[token]` gjør ingen DB-write / ingen session; verifiser i review + e2e.)
- [ ] Koden virker uavhengig i `/login` (e-post ferdig utfylt) uker etter utsendelse, opp til `redeem_expires_at`. (Type A: utløp-logikk.)
- [ ] Session lander i samme kontekst (Safari ELLER PWA), ingen cross-context handoff. (`verifyOtp` på cookie-klient — review + e2e.)
- [ ] Game-scopet invitasjon: `game_players` + `notifyInvitedToGame` + #356-landing kjører via delt helper fra alle tre stiene. (Type A på delt helper + e2e golden path lander på spillet.)
- [ ] Ikke-inviterte: `sendCode`/`verifyCode` standard-modus uendret. (Eksisterende `login/actions.test.ts` grønn.)
- [ ] Token + kode lagret hashet (HMAC), ingen klartekst i DB, single-use + utløp håndhevet. (Type A + les migrasjon/koden.)
- [ ] Rate-limit + lockout (≥5 → låst) på kode-innløsning. (Type A: attempt-teller + lockout.)

## Gates

- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npx vitest run` co-located for endrede filer + `lib/auth/*` + `app/(auth)/login/*` grønne
- [ ] `npx eslint <endrede filer>` → ingen nye warnings
- [ ] `npm run build` → exit 0 (ny rute `/login/invite/[token]`)
- [ ] Playwright golden-path (Type D): inviter → åpne knapp-sti → POST → logget inn → lander på spillet; + én edge (utløpt/brukt token → vennlig feil)
- [ ] `inviteNotification`-snapshot oppdatert (Type B), chrome-lås intakt
- [ ] commit-msg-hook: `feat(...)` → version-bump (MINOR — ny innloggings-flate) + CHANGELOG i samme commit

## Files Likely Touched

- `supabase/migrations/00XX_invitation_redeem_secrets.sql` — NY: `redeem_token_hash`, `redeem_code_hash`, `redeem_expires_at`, `redeem_attempts int not null default 0` + index på `redeem_token_hash`. RLS: service-role skriver, kun server-side lesing.
- `lib/auth/inviteRedeem.ts` — NY: generer token+kode, HMAC-hashing, validering (utløp/single-use/email-binding/attempt-lockout). Type A.
- `lib/auth/establishSessionForEmail.ts` — NY: delt session-minting (generateLink → verifyOtp på cookie-klient).
- `lib/auth/inviteRedemption.ts` — NY: delt post-auth (accept-stamp + game_players + notify + #356-landing), uttrukket fra `verifyCode`.
- `app/(auth)/login/actions.ts` — `verifyCode` bruker delt helper; redeem-modus-dispatch (eller ny `redeemInviteCode`).
- `app/(auth)/login/invite/[token]/page.tsx` — NY: GET-landing (ingen verify) + POST-form, honeypot.
- `app/(auth)/login/invite/[token]/actions.ts` — NY: POST redeem-action (token-sti).
- `lib/mail/inviteNotification.ts` — knapp + kode, komponert med #309 modus-hint.
- `app/admin/spillere/actions.ts` (`sendInvitation` + `resendInvitation`), `app/admin/games/[id]/inviteToGameActions.ts`, `app/invite/actions.ts` — generer hemmeligheter via delt helper, lagre hash, send klartekst i mail.
- `lib/database.types.ts` — regenerer for nye kolonner (Supabase MCP `generate_typescript_types`).
- Tester: `lib/auth/inviteRedeem.test.ts` (A), `inviteNotification`-snapshot (B), e2e (D).

## Out of Scope

- **Passkeys / Face ID** (#63) — den ekte «logget inn uten å taste noe». Egen sak.
- **Endring av `sendCode`/`verifyCode` standard-modus** utover å kalle delt helper.
- **Captcha** på redeem (utsatt til misbruk faktisk ses, jf. #365).
- **Endring av Supabase Auth OTP-mal** (kode-mailen for ikke-inviterte) — urørt.
- **DMARC/Outlook-leverbarhet** (#319) — separat; koordiner kun content-hygiene på mailen.

## Deferred Ideas

- Bundet redeem-utløp per-spiller for cup/fler-runde (utover enkelt tee-off) — vurder hvis cup-invitasjoner blir vanlige.
