# Kontrakt: Profilporten beholder /team-konteksten + invitasjons-peker på base-signup (#1344)

**Issue:** #1344 (HCD-audit F2, P2) · **Klasse:** bruker-synlig · **Produktvalg:** nei

## Problem

En helt ny bruker invitert til et lag rutes etter OTP-innlogging til `/signup/[shortId]/team` og ser attach-flyten uten profil. Men når de trykker «Bli med på lag», redirecter `requireAuthedUser` dem til `/complete-profile?next=/signup/[shortId]` — `/team`-suffikset er droppet. Etter fullført profil lander de på base-signup-siden, som for lag-spill viser `TeamRegistrationForm`: «Registrer laget» med lagnavn + e-postfelter. Den inviterte brukeren står i et skjema for å opprette et NYTT lag; verste utfall er et duplikat-lag. Invitasjonen ligger fortsatt ventende på /team-siden, men ingenting peker dit.

## Research-funn (verifisert i økten mot main @ 2204043, kryss-verifisert av fersk-kontekst-agent)

- `requireAuthedUser` i `app/[locale]/signup/[shortId]/teamActions.ts:127` (fila er `'use server'`, linje 1): login-redirect `:136`, complete-profile-redirect `:144` — begge mister /team-suffikset.
- **Call site → eneste kaller → riktig next (kartlagt uttømmende via grep):**
  - `submitTeamRegistration` (:193, call site :218) ← `TeamRegistrationForm.tsx` på base-siden → **uendret** `/signup/<shortId>`
  - `acceptTeamInvite` (:579/:586), `declineTeamInvite` (:703/:710), `removeTeamMember` (:805/:812), `attachToCaptainTeam` (:901/:908, bug-stien), `resendTeamInvite` (:1079/:1086) ← alle kalles KUN fra `team/TeamDashboardClient.tsx` → `/signup/<shortId>/team`
  - Altså: 5 av 6 endres, 1 består. `removeTeamMember`/`resendTeamInvite` er kaptein-only (kapteinen passerte profilporten i `submitTeamRegistration`) — endres for konsistens, men test-budsjettet legges på attach/accept/decline.
- **Søsken-duplikat SJEKKET og skal IKKE endres:** `actions.ts:105-123` har en egen, identisk `requireAuthedUser` — men dens kallere (`registerForOpenGame` :148, `requestApproval` :380) kalles kun fra `RegistrationForm.tsx` på base-siden, der `/signup/<shortId>` er KORREKT. Byggeren skal la den stå (T2-sjekken er gjort; en «hjelpsom» endring der ville vært feil).
- `complete-profile/actions.ts:92`: `redirect(next)` med prefiks-sanitering (:20-22) — bruker next som gitt; fiks på call-site er tilstrekkelig.
- **next overlever login:** `verifyCode` (`login/actions.ts:178`) validerer next prefiks-only (:181-184 — `startsWith('/') && !startsWith('//')`), ingen suffiks-stripping; eksplisitt next vinner over invitee-ruting (:415). :422 ruter alt i dag en team-scopet invitee til `/team` uoppfordret.
- **Løftebærende mekanisme for pekeren:** `login/actions.ts:314-331` konsumerer BEVISST IKKE team-scopede invitasjoner (`registration_type` `'team'`/`'both'`, :303-305) — `accepted_at` forblir NULL slik at attach-flyten finner dem. Derfor matcher base-sidens `.is('accepted_at', null)`-filter etter innlogging. (Siteres her så en fremtidig opprydding av :314-331 ikke dreper pekeren stille.)
- Base-signup `page.tsx:219-229`: `hasPendingInvitation` beregnes kun i `invite_only`-gaten, men prop-en er ALLEREDE i scope i `renderBody` (:370/:392/:407) og ved `team_form`-grenen (:557) — ingen ny plumbing, bare en `if`.
- `page.tsx:557-579`: `team_form`-grenen rendrer `TeamRegistrationForm` (:571-576) uten invitasjonssjekk. Grenene `invite_only` (:496-536) og `team_form` er gjensidig utelukkende early-returns — dobbel-visning er umulig.
- `users.email` er `NOT NULL` (`lib/database.types.ts:1752`) og `page.tsx:374` derefererer `profile!.email` ubetinget — å kjøre invitasjons-oppslaget for alle modes gir ingen ny null-flate og ingen sideeffekter (ren SELECT via admin-client).
- Test-presedens: `teamActions.test.ts:21-24` mocker `@/i18n/navigation` med `makeLocaleRedirectMock()` (`tests/serverActionMocks.ts:38-43`, kaster `RedirectError(href)`); :538-559 asserter allerede `href: '/login?next=/signup/${SHORT_ID}'`-formen. Fixturen `authedAsCaptain(false)` (:93-105) finnes og er UBRUKT — complete-profile-redirecten er utestet i dag. `requireAuthedUser` kalles FØR game-oppslaget i `attachToCaptainTeam` (:908 før :911-921), så redirect-testene trenger ikke game-mock.
- Ingen side-test finnes for `page.tsx`, og `renderBody` er ueksportert — presedensen for testbarhet er `registrationTypeView.ts` (ekstrahert fra `renderBody` av akkurat denne grunnen, se header-kommentar :7-8).

## Design

1. **`requireAuthedUser` (teamActions-varianten) får eksplisitt retursti:** signaturen utvides med `next`-opsjon, default dagens `/signup/${shortId}`. De 5 team-side-aksjonene over sender `/signup/${shortId}/team`; `submitTeamRegistration` uendret. Verdien er hardkodet konstant per call-site (aldri bruker-input) — ingen open-redirect-flate. `actions.ts`-varianten røres ikke (se research-funn).
2. **Base-signup viser vei til laget:** invitasjons-oppslaget (:219-229) løftes ut av invite_only-gaten (kjøres for alle modes — samme spørring, ett `maybeSingle`). Beslutningen «vis peker?» ekstraheres som ren funksjon etter `registrationTypeView.ts`-mønsteret (f.eks. `shouldShowTeamInvitePointer({ typeViewKind, hasPendingInvitation })`) med Type A-test. I `team_form`-grenen: pending invitasjon → `Banner` (tone info) «Du er invitert til et lag i dette spillet — gå til laget ditt» + lenke til `/signup/[shortId]/team`, OVER `TeamRegistrationForm`. Skjemaet blokkeres ikke (invitasjonen kan være stale; brukeren kan legitimt ville registrere eget lag).
3. Nye i18n-nøkler i `signup`-namespacet, begge locales; humanizer-runde på norsk copy.

## Edge Cases & Guardrails

- invite_only-grenen og team_form-grenen er gjensidig utelukkende early-returns — ingen dobbel melding (verifisert; ingen ekstra assert nødvendig).
- Invitasjon med `accepted_at` satt → ingen peker (eksisterende filter består).
- **Kjent, akseptert hull:** `registration_type='both'` på en modus UTEN lag-konsept gir `solo_form` (`registrationTypeView.ts:29-44`) — en team-scopet invitee der får ingen peker (lag-teksten ville vært feil for et spill uten lag). Semi-korrupt konfig; dokumenteres, fikses ikke her.
- **Nabo-blindvei utenfor scope:** `page.tsx:426-431` (`hasOpenPendingRequest`-early-return uten /team-lenke) rammer kjent-bruker-invite-stien — samme UX-klasse, annen trigger. Byggeøkten fileser dette som eget issue (reviewer-funn-regelen), endrer det ikke her.
- Ingen DB-/skjemaendring, ingen RLS-endring (ren SELECT via admin-client som i dag).
- Eksisterende wart (røres ikke): complete-profile redirecter via `next/navigation` (uprefikset) mens requireAuthedUser bruker `@/i18n/navigation` — gjelder allerede i dag og forverres ikke.

## Key Decisions

- **Fiks på call-site, ikke i complete-profile:** `redirect(next)` er korrekt oppførsel; det er avsenderen som mister kontekst.
- **Peker i stedet for auto-redirect til /team:** base-siden kan nås med gyldig intensjon (registrere nytt lag); en peker respekterer begge intensjoner. (Issue-forslagets design; redirect ville vært funksjonelt feil for kapteiner.)
- **Peker-beslutningen ekstraheres som ren funksjon** — eneste vei til unit-test siden `renderBody` er ueksportert; samme mønster som `registrationTypeView.ts`.
- **Alle 5 team-aksjoner endres, ikke bare de nåbare** — én regel, ett hjem; men testene dekker de realistisk nåbare (attach/accept/decline).

## Success Criteria

1. [ ] Unit-tester (obligatorisk — mønsteret finnes): `attachToCaptainTeam` uinnlogget → `RedirectError` med `href: '/login?next=/signup/<shortId>/team'`; `authedAsCaptain(false)` → `href: '/complete-profile?next=/signup/<shortId>/team'`. **Bevis:** vitest-output.
2. [ ] Type A-test på `shouldShowTeamInvitePointer`-helperen (pending+team_form → true; accepted/solo_form → false). **Bevis:** vitest-output.
3. [ ] Staging ende-til-ende: invitert ny bruker → «Bli med på lag» → complete-profile → lander PÅ /team-siden med attach-knappen (ikke TeamRegistrationForm); base-signup for team-spill med pending invitasjon viser pekeren. Bruker-synlig endring → dette er merge-porten (`needs-manual-qa` hvis flyten ikke lar seg rigge autonomt).
4. [ ] `npm run typecheck && npm run lint` grønt + `npm test` (evt. filtrert `npm test -- 'app/[locale]/signup'` lokalt) grønt. **Bevis:** kommando-output.

## Gates

- `npm run typecheck`
- `npm run lint`
- `npm test` (kanonisk; path-filtrert vitest-kjøring er OK underveis)
- `npm run build`

## Files Likely Touched

- `app/[locale]/signup/[shortId]/teamActions.ts` (+ `teamActions.test.ts`)
- `app/[locale]/signup/[shortId]/page.tsx`
- ny liten helper-fil etter `registrationTypeView.ts`-mønsteret (+ test)
- `messages/no.json`, `messages/en.json`
- `CHANGELOG.md`, `package.json` (patch-bump — fix)

## Out of Scope

- #1343 (feil lag ved attach) og #1345 (login-feilstier mister next/email/invite) — egne kontrakter.
- `actions.ts` sin `requireAuthedUser` (verifisert korrekt for sine kallere — skal stå).
- `hasOpenPendingRequest`-blindveien (`page.tsx:426-431`) — eget issue fra byggeøkten.
- Profilport-arkitekturen (#1176) — kun retursti-parameteren endres.
- Endringer i `/complete-profile` (den gjør allerede rett) og i login-rutingen (:314-331 skal IKKE «ryddes» — den bærer pekeren).
- Duplikat-lag-opprydding for brukere som alt har truffet bugen.
