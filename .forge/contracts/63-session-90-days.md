# Spec: 90-dagers session-lifetime (quick-win før WebAuthn)

**Issue:** [#63](https://github.com/jdlarssen/golf-app/issues/63)
**Berører:** Supabase Dashboard (JWT expiry-konfig) + optional micro-copy på `/login`
**Bump:** PATCH (oppførselsendring uten ny UI/feature) — alternativt MINOR hvis copy-endring teller som ny synlig adferd

## Problem

OTP-kode-flyten har lav, men ikke null friksjon: bytte til mail-app → kopier kode → tilbake. Issue #63 ble åpnet for å vurdere biometrisk innlogging (Face ID / Touch ID / passkeys) som null-friksjons-alternativ. Full WebAuthn-build er en 1-2 ukers oppgave (SimpleWebAuthn + ny `credentials`-tabell + Supabase custom-JWT-integrasjon) og krever en større brainstorming rundt session-modellen.

**Innsikt fra scout:**
- iOS auto-fyll av OTP-kode er allerede aktivt ([app/(auth)/login/_components/VerifyCodeForm.tsx:106](app/(auth)/login/_components/VerifyCodeForm.tsx:106) har `autoComplete="one-time-code"`). Når koden kommer på mail, viser iOS den som forslag over tastaturet — ett tap, så er den fylt inn.
- Supabase default JWT-expiry er 1 time access-token + 7 dagers refresh-token. `proxy.ts` refresher automatisk så lenge refresh-tokenen er gyldig. Med ~20 aktive brukere som besøker Tørny minst én gang i uka, betyr det at de fleste sjelden ser OTP-flyten.
- For brukere som er borte i mer enn 7 dager (mellom turneringer), tvinger de inn på re-login. Det er der friksjonen ligger.

Med så få brukere er WebAuthn-investeringen i overkant før brukerbasen vokser (typisk etter self-registration #166 ramper opp). I mellomtiden er den enkleste massive frikst-reduksjonen å forlenge session-lifetime til 90 dager.

## Research Findings

Verifisert mot Supabase-dokumentasjon + dagens kode:

- **Supabase JWT-expiry** settes per-prosjekt i Dashboard: **Authentication → Sessions → JWT expiry limit**. Akseptert område: 5 minutter til 1 år. Per default: 1 time access-token, 7 dagers refresh-token. Refresh-token-lifetime overstyrer access-token-expiry — det er refresh-tokenen som bestemmer hvor lenge en bruker kan «forbli innlogget» uten å re-autentisere. Kilde: [Supabase Auth Docs — Sessions](https://supabase.com/docs/guides/auth/sessions).
- **Refresh-token-rotation** (Dashboard: Authentication → Sessions → Enable refresh token rotation): default ON. Hver gang refresh-tokenen brukes, byttes den til en ny. Forhindrer at en lekt refresh-token kan brukes uendelig — den blir invalidert ved første rotasjon. Beholdes ON ved 90-dagers expiry; sikkerheten øker med rotasjon, ikke senkes.
- **Cookie max-age** (`@supabase/ssr`): settes automatisk basert på `session.expires_at`. Ingen kode-endring nødvendig.
- **`proxy.ts`** refresher session ved hver request hvis token er nær expiry. Virker uendret med lengre lifetime.

## Prior Decisions

- **Fra [#168](https://github.com/jdlarssen/golf-app/issues/168) (handicap-prompt, samme worktree-cohort):** Brukere får inline-prompts på `/profile` ved viktige stale-tilstander. Ingen direkte avhengighet, men sammenlignbar bruker-vennlig pattern.
- **Fra [#166](https://github.com/jdlarssen/golf-app/issues/166) (self-registration, samme worktree-cohort):** Self-reg-flagg-en åpner OTP-flyten for nye brukere. Med 90-dagers session lever den engasjementen mye lengre — én OTP-runde dekker hele turneringssesongen for casual-brukere. Forsterker hverandre.

## Design

### 1. Supabase Dashboard-konfig (brukerens jobb)

Sti i Supabase Dashboard: **Project Settings → Authentication → Sessions → JWT expiry limit**.

Endre fra default (`3600` sekunder = 1 time) til:

```
7776000  (90 dager i sekunder)
```

**Også sjekk** (skal allerede være på, men verifiser):
- **Refresh token rotation:** Enabled ✓
- **Reuse interval:** 10 sekunder (default) ✓

**Hva brukeren skal se etter:**
- Verdiet er lagret, page reloader uten feilmelding
- Endringen tar effekt for NYE sessions (eksisterende brukere fortsetter med 7-dagers session inntil de re-logger inn)

**Rollback hvis noe galt:** sett tilbake til `604800` (7 dager) eller `3600` (1 time). Eksisterende lange sessions fortsetter helt til de utløper, men nye blir kortere.

### 2. Optional micro-copy på `/login`

På `verifyCode`-stage, under input-feltet for OTP-koden, vurdér å legge til en kort melding:

```
Du forblir innlogget i 90 dager fra denne enheten.
```

Plassering: under input-feltet, før «Bekreft»-knappen. Bruker eksisterende `text-sm text-muted`-stil for å matche andre sub-tekster i flyten.

**Hvorfor optional:** copy-en gjør 90-dagers-løftet synlig for nye brukere, men eksisterende brukere oppdager det uansett ved at de slipper å logge inn så ofte. Hvis vi velger å droppe copy-en, sparer vi humanizer-pass-runden. Klar-til-implementasjon-anbefaling: ta med copy-en — det er én linje, eksplisitt forventnings-setter, ingen sikkerhets-trade-off.

### 3. CHANGELOG-oppføring

Stakeholder-tagline (vanlig norsk, blockquote):

```
> Du forblir innlogget i Tørny i 90 dager — én OTP-kode dekker hele sesongen
> for de fleste, så slipper du å skifte til mail-appen før neste vinter.
```

Teknisk-seksjon under `<details>`:
- Supabase JWT-expiry endret fra 7 dager til 90 dager
- Refresh-token-rotation forblir aktiv (sikkerhets-trade-off er nøytralt med rotasjon på)
- Eksisterende sessions fortsetter med 7-dagers expiry; nye får 90 dager
- (Hvis copy lagt til:) /login viser ny micro-copy

### 4. Sluttsteg — close #63 med deferral-notat

#63 lukkes med kommentar som forklarer at:
- Quick-win er shipped (90-dagers session)
- Full WebAuthn/passkeys deferred til separat issue (opprettes som del av lukkings-kommentaren)
- Ny issue spore-er full WebAuthn-bygging når brukerbasen krever det — typisk etter #166 har rampet opp

## Edge Cases & Guardrails

- **Tapt enhet med innlogget session:** lengre vindu (~90 dager) for misbruk. Mitigation: Supabase-admin (`auth.users` Dashboard) kan force-invalidate en spesifikk bruker eller alle sessions. Tørny har ingen sensitiv data — golf-resultater og kontaktinfo. Akseptabel trade-off for en consumer-app.
- **Spillere som deler enhet:** 90-dagers session betyr at en spillebro mister sin innlogging hvis de logger ut, men den andre spilleren blir værende. Eksisterende «Logg ut»-knapp ([app/page.tsx:233-241](app/page.tsx:233)) virker uendret.
- **Eksisterende sessions:** alle nåværende brukere fortsetter med 7-dagers expiry til neste re-login. Ingen forced re-auth, ingen abrupt logout. Gradvis migrering.
- **Supabase refresh-token-rotasjon:** med 90-dagers lifetime og rotasjon ON, blir hver refresh en mulighet for å invalidate gammel token hvis brukeren ikke har brukt sessionen på lenge. Standard sikkerhets-pattern, ingen ny risiko.
- **WebAuthn-build i fremtiden:** den nye issue-en for full WebAuthn må vurdere session-modellen separat. 90-dagers session kan beholdes som «backup-login»-mekanisme også etter WebAuthn er på plass.
- **GDPR / personvern-side:** ingen endring nødvendig. Cookie-disclosure dekker allerede vedvarende auth-cookie.

## Key Decisions

- **90 dager:** lang nok til å dekke en typisk golf-sesong + vinterpause + neste vår. Kort nok til at en glemt enhet ikke gir evig tilgang.
- **Refresh-token-rotation på:** sikkerhets-net mot lekte tokens. Standard og anbefalt av Supabase.
- **Ingen «Husk meg»-toggle på /login:** Supabase støtter ikke per-login JWT-expiry. Globalt 90-dagers er enklere og dekker 100% av brukerne.
- **Ingen «Logg ut alle steder»-knapp:** Supabase støtter `signOut({scope: 'global'})` som invaliderer alle sessions, men det er en separat feature. Defer til egen issue hvis behov.
- **Ingen session-info på `/profile`** («Logget inn siden X»): nice-to-have, men ikke nødvendig for å levere kjernen.
- **Defer full WebAuthn til ny issue:** signaliseres tydelig i lukkings-kommentaren på #63 + opprettelse av oppfølger-issue med koblinger til denne kontrakten.

**Claude's Discretion:**
- Eksakt copy-formulering på /login. Humanizer-pass før commit. Anti-mønstre: «You will remain logged in»-anglisme, em-dash-kjeder, US-decimal-formatering. Kanon: «Du forblir innlogget i 90 dager fra denne enheten.»
- Bestem om copy-endringen lander i samme commit som CHANGELOG-bump-en, eller separat.
- Tittel på den nye oppfølger-issuen for full WebAuthn. Forslag: «WebAuthn / passkeys for biometrisk innlogging (deferred fra #63)».

## Success Criteria

- [ ] Supabase JWT-expiry satt til 90 dager (7776000s) i Dashboard. Verifikasjon: skjermbilde fra brukeren av Authentication → Sessions-siden, eller bekreftelse i tekst.
- [ ] Refresh-token-rotation er aktiv (default, men verifiser). Verifikasjon: samme skjermbilde.
- [ ] (Hvis copy lagt til:) `/login` viser «Du forblir innlogget i 90 dager»-melding på verifyCode-stage. Verifikasjon: spot-sjekk på preview/prod i Safari.
- [ ] CHANGELOG har ny oppføring med stakeholder-tagline + teknisk-seksjon. Versjons-bump i `package.json` matcher.
- [ ] #63 lukket med kommentar som forklarer scope-deler (Teknisk + Funksjonell) + lenker til ny WebAuthn-oppfølger-issue.
- [ ] Ny GitHub Issue opprettet for full WebAuthn-build med kobling til denne kontrakten.
- [ ] Manuelt test på preview: logg inn, sjekk at session-cookie har `Max-Age ≈ 7776000` i DevTools. Verifikasjon: skjermbilde av Application → Cookies i Safari/Chrome.

## Gates

- [ ] (Hvis copy lagt til:) `npx tsc --noEmit` passerer
- [ ] (Hvis copy lagt til:) `npm run lint` passerer
- [ ] (Hvis copy lagt til:) Pre-commit-hook `.githooks/pre-commit` ingen humanizer-advarsler
- [ ] (Hvis copy lagt til:) `npm test` passerer (hvis snapshot på VerifyCodeForm finnes)
- [ ] Manuelt røyk-test:
  - [ ] Logg ut, logg inn på nytt
  - [ ] Sjekk session-cookie expiry i DevTools (skal være ~90 dager fram)
  - [ ] Verifisér at `proxy.ts` ikke kicker brukeren ut tidligere enn forventet
- [ ] Vercel-preview deployer grønt (hvis copy-endring)

## Files Likely Touched

- **Supabase Dashboard** — JWT expiry-konfig (brukerens manuelle steg, ikke kode)
- `app/(auth)/login/_components/VerifyCodeForm.tsx` — optional micro-copy (én ny `<p>` rundt linje 110)
- `CHANGELOG.md` — ny oppføring under nyeste minor-serie
- `package.json` — PATCH/MINOR-bump

**Ingen DB-migrasjon, ingen ny tabell, ingen ny RPC, ingen `lib/`-fil-endring.**

Hvis vi dropper copy-endringen blir kontrakten en ren docs/CHANGELOG-commit + Dashboard-klikk.

## Out of Scope

- **Full WebAuthn / passkeys** — egen oppfølger-issue (opprettes ved lukking av #63). Krever SimpleWebAuthn-bibliotek + `credentials`-tabell + Supabase custom-JWT eller `signInWithIdToken`-integrasjon. 1-2 ukers solid arbeid.
- **«Husk meg»-toggle per-login** — Supabase støtter ikke per-login JWT-expiry. Hvis ønsket, krever det å bytte til en custom-JWT-flyt parallelt med Supabase Auth.
- **«Logg ut alle steder»-knapp** — Supabase har `signOut({scope: 'global'})` som invaliderer alle sessions, men UI-en og bekreftelses-flyten er sin egen feature. Defer.
- **Session-info på `/profile`** («Logget inn siden …», device-liste) — nice-to-have for sikkerhets-bevisste brukere, ikke nødvendig nå.
- **OAuth-providers (Apple Sign-In, Google Sign-In)** — alternativ til OTP/passkey. Egen vurdering, krever klient-konfig + Supabase Auth-provider-oppsett.
- **SMS OTP** — kostbart i Norge, ikke verdt det.
- **Magic-link-retur** — eksplisitt forkastet 2026-05-13 pga. iOS PWA-cookie-jar-issue.
- **Bot-deteksjon / device-fingerprinting** — overkill for current scope.
