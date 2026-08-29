# Kontrakt: App Review-konto — deterministisk innlogging (#1284, del 1)

## Problem

Apple App Review kan ikke motta OTP-mailene våre → revieweren får ikke logget inn →
nær-sikkert 2.1-avslag («unable to review»). Vi trenger en dedikert review-konto med
deterministisk innlogging (brukernavn + passord, som App Store Connect-skjemaet
forventer) og ferdig utfylte demo-data (et aktivt spill) så revieweren ser kjernen
uten oppsett. Issuets kandidat 1 er valgt av eieren: egen Supabase-bruker med
passord-innlogging, via en skjult/direkte rute. Metadata/skjermbilder/innsending er
utenfor scope denne økta (skjermbilder tas sammen med eieren etter TestFlight-godkjenning).

## Research-funn (verifisert 2026-08-30)

- `supabase.auth.signInWithPassword({ email, password })` — supabase-js v2, stabil.
  Feilmeldingen skiller IKKE «konto finnes ikke» fra «feil passord» → ingen
  konto-orakel by design. (docs/reference/javascript/auth-signinwithpassword)
- Passord-auth er del av email-provideren og «enabled by default» — prosjektet bruker
  allerede email-OTP, så ingen dashboard-endring trengs. Brukere uten passord (alle
  eksisterende) kan ikke logges inn via passord-grant. (docs/guides/auth/passwords)
- `admin.auth.admin.createUser({ email, password, email_confirm: true })` — samme
  mønster som `createGuestUser` (lib/games/createGuestPlayer.ts:164), som også beviser
  at `on_auth_user_created`-triggeren lager `public.users`-raden.
- Insert-shapes for games/game_players/scores er bevist i `e2e/_helpers/games.ts`
  (`seedActiveStablefordGame`, `seedFinishedModeGame`): games trenger name/course_id/
  tee_box_id/game_mode/mode_config/registration_mode/registration_type/status/created_by;
  scores trenger game_id/user_id/hole_number/strokes/entered_by/client_updated_at.

## Tidligere beslutninger (arves)

- #1283: repo er PUBLIC — aldri e-poster/nøkler/passord i repo. Commits `[no-changelog]`
  (reviewer-flate, ikke spiller-synlig) + `Refs #1284`.
- #1009: gjestebrukere (`is_guest`, plassholder-domene uten MX) er den etablerte
  mekanismen for medspillere uten innlogging — gjenbrukes som demo-medspillere.
- Auth-endringer auto-merges ALDRI (CLAUDE.md) — PR-en venter på eksplisitt eier-godkjenning.
- Prod-skriv (provisjonering) skjer KUN etter eksplisitt eier-godkjenning i økten;
  staging først (0107-mønsteret).

## Design

1. **Skjult rute `/review-login`** (`app/[locale]/(auth)/review-login/`, samme
   (auth)-gruppe som login). Ingen lenker til den noe sted; `robots: noindex` som /login.
   - Env-gate: `REVIEW_ACCOUNT_EMAIL` (server-only env). Usatt → `notFound()` — ruta
     er inert til eieren setter env-var i Vercel. Allerede innlogget besøkende → redirect `/`.
   - Skjema: e-post + passord (matcher ASC-skjemaets username/password), i18n-nøkler
     under `auth.reviewLogin` i BÅDE no.json og en.json (catalogParity håndhever).
2. **Server action** (`actions.ts`):
   - Rate-limit først: gjenbruk `consumeLoginRateLimit` (samme buckets/terskler som login).
   - E-post må matche `REVIEW_ACCOUNT_EMAIL` (case-insensitivt) — ellers SAMME generiske
     feilkode som feil passord (ingen oracle). Kun én konto er angripbar via ruta.
   - `signInWithPassword` via `getServerClient()` (cookie-sesjon som verifyCode) →
     redirect `/`. Feil → redirect tilbake med én generisk feilkode.
   - Ingen invitasjons-/klubb-side-effekter (review-kontoen har ingen) — bevisst enkel.
3. **`proxy.ts`**: `review-login` inn i PUBLIC_PATH_PATTERN-alternasjonen
   (`^\/(login|register|review-login)$`) — nåbar utlogget, header-stripping følger med.
4. **Provisjoneringsskript `scripts/provision-review-account.mjs`** (mønster:
   clone-cup-to-staging.mjs — env-fil-lasting, service-role-klient):
   - `--env staging|prod` (default staging; prod krever eksplisitt flagg). Leser
     `REVIEW_ACCOUNT_EMAIL` + `REVIEW_ACCOUNT_PASSWORD` fra prosess-env (aldri fil/repo).
   - Idempotent: (a) auth-bruker opprettes med passord + `email_confirm`, eller passord
     oppdateres via `updateUserById` hvis den finnes; (b) `public.users` settes komplett
     (name, hcp_index, handicap_updated_at, profile_completed_at, locale 'en' — engelsk
     UI for revieweren); (c) demo-spill: aktivt solo-stableford-spill med review-kontoen
     som creator + 3 gjeste-medspillere (createGuestUser-mønsteret), bane/tee velges som
     i `seedActiveStablefordGame` (tee med herre-rating); (d) motstander-scores hull 1–6,
     review-kontoens scores hull 1–3 — revieweren fortsetter på hull 4; (e) re-kjøring
     resetter scores + status til kjent tilstand (spent demo → frisk demo før hver innsending).
   - Spillnavn på engelsk (f.eks. «Demo Round — Tørny»); kun synlig for kontoens spillere (RLS).
5. **Runbook** `docs/native/app-store-review-konto.md`: ASC-notes-mal (engelsk, med
   review-flyt: URL `/en/review-login`, credentials-plassering), prod-provisjonering
   (eier-gatet), reset-før-innsending, og hva som IKKE ligger i repo (e-post/passord).

## Kanttilfeller & vakter

- Feil e-post, feil passord, ukjent konto → én og samme generiske feilkode.
- Brute force: `consumeLoginRateLimit` (email+IP) + Supabase egne /token-limits +
  kun én konto angripbar + generert sterkt passord (24+ tegn, dokumentert i runbook).
- Passord aldri i logg, repo, env-filer i repo, eller klient-kode.
- Revieweren kan selv avslutte demo-spillet (de er creator — viser kjerneløkka, det er
  et poeng) → skriptet er re-kjørbart; runbook sier «kjør reset før hver innsending».
- Mail-støy: gjester er mail-ekskludert (`is_guest`); scorecard-/finish-mail går kun
  til review-adressen selv (best-effort, umonitorert — harmløst).
- `.changes/`: ingen notatfil — `[no-changelog]` i commit-body (ikke spiller-synlig).

**Claude's Discretion:** eksakt kopi på skjema/feil (norsk+engelsk), honeypot eller ei,
demo-scorenes verdier, spillnavn, HCP-verdier, om `next`-param støttes (trolig nei — KISS).

## Suksesskriterier

- [ ] `/review-login` finnes, er env-gatet (usatt env → 404-adferd), noindex, og nåbar
      utlogget (PUBLIC_PATH_PATTERN) — verifiseres med unit-test + staging-klikk
- [ ] Server action: kun `REVIEW_ACCOUNT_EMAIL` kan logges inn; feil e-post og feil
      passord gir identisk feilkode; rate-limit konsumeres før auth-kallet — bevises
      med unit-tester (mock ved systemgrensen, som login/actions.test.ts)
- [ ] Provisjoneringsskriptet er idempotent: to kjøringer på rad gir samme slutt-tilstand
      (én review-bruker, ett aktivt demo-spill, kjente scores) — bevises mot staging
- [ ] Staging ende-til-ende: provisjonert konto logger inn via `/review-login` med
      passord og ser det aktive demo-spillet — bevis (skjermbilde/DOM) på PR +
      `staging-verified`-label
- [ ] Runbook-dokumentet finnes med ASC-notes-mal og eier-steg for prod (env-var i
      Vercel, skript-kjøring m/ godkjenning, credentials inn i ASC)
- [ ] Gates grønne: `npm run build`, `npm run lint`, co-lokaliserte vitest-filer

## Gates

- `npm run build` (fanger cacheComponents-/typefeil tsc alene ikke ser)
- `npm run lint`
- `npx vitest run <berørte testfiler>` (nye + login-suiten + messages catalogParity)
- Staging-verifisering av flyten FØR merge (feat-PR) + label

## Filer som trolig røres

- `app/[locale]/(auth)/review-login/{page.tsx,actions.ts,actions.test.ts}` (nye)
- `proxy.ts` (PUBLIC_PATH_PATTERN)
- `messages/no.json` + `messages/en.json` (auth.reviewLogin)
- `scripts/provision-review-account.mjs` (ny)
- `docs/native/app-store-review-konto.md` (ny)

## Utenfor scope

- Prod-provisjonering (eier-gatet — kjøres i egen økt/med eksplisitt godkjenning)
- Metadata, skjermbilder, App Privacy-etikett, selve innsendingen (resten av #1284)
- Passkey-/demo-modus-alternativene (demo-modusen nevnes gjerne i review-notes som
  bonus, men review-kontoen er ASC-skjemaets krav)
- Endringer i den ordinære login-flyten (røres ikke)
