# Spec: Wizard — påmeldingsvalg viser synlighet i «Finn turneringer»

Issue: #367 (`enhancement`, `area:admin`). Flyt: «Bli med i et spill» (parnet med #357, nettopp shippet).

## Problem
Påmeldings-steget i opprett-spill ([`RegistrationSection.tsx`](app/admin/games/new/sections/RegistrationSection.tsx)) lar arrangøren velge `invite_only` / `manual_approval` / `open`, men forklarer kun *hvem* som kan melde seg på — aldri at valget styrer **synlighet i «Finn turneringer»**. Etter #357 er konsekvensen reell: `open` + `manual_approval` dukker opp i discovery, `invite_only` er privat. Default er `invite_only` ([`useGameFormState.ts:448`](app/admin/games/new/useGameFormState.ts)), så spill blir usynlige med mindre arrangøren bevisst bytter — og i dag forstår de ikke at det er det valget gjør. Beslutning fra flyt 2: **påmeldingsmåten ER synligheten**, ingen egen synlighets-bryter.

## Research Findings
Ingen ekstern research nødvendig — ren in-repo copy/UX-endring i en eksisterende `'use client'`-komponent. `RegistrationSection` rendres allerede både i wizard-steget ([`GameWizard.tsx:694`](app/admin/games/new/GameWizard.tsx)) og i full-skjemaet ([`GameForm.tsx:760`](app/admin/games/new/GameForm.tsx)), så én endring dekker begge. `lib/games/registration.ts` eier `RegistrationMode`-typen og importeres allerede av komponenten (klient-trygt).

## Prior Decisions
- **#357 (nettopp shippet):** `getDiscoverableGames` inkluderer `open` + `manual_approval`, ekskluderer `invite_only`. Synlighets-merket MÅ matche dette nøyaktig — ellers lyver wizard-en om hva som skjer.
- **#199:** `RegistrationSection` har to akser (modus + type). Vi rører kun modus-aksen («Hvem kan melde seg på?»).
- **Flyt 2 «påmeldingsmåten ER synligheten»:** gjenbruk `registration_mode`, ingen ny kolonne/bryter.
- **#346 «én vei til rom»:** ett valg styrer alt — ikke legg til en parallell synlighets-kontroll.

## Design
Berik modus-valget i `RegistrationSection` så synligheten er tydelig **i det arrangøren velger**:

1. **Synlighets-merke per modus** (valgt design): hvert av de tre alternativene får et lite merke ved siden av tittelen:
   - `invite_only` → «Privat» (muted tone)
   - `manual_approval` → «Oppdagbar» (accent/positiv tone)
   - `open` → «Oppdagbar»
   Hand-rolles som en liten inline-pill (samme visuelle språk som `StatusChip`: `rounded-full`, ~9.5px uppercase, tett tracking) — `StatusChip`-tonene passer ikke semantisk, så egen lett markup med palette-variabler (muted vs. accent/primary-soft).

2. **Omskrevne hint-tekster** — hver hint sier nå konsekvensen i klartekst, f.eks.:
   - `invite_only`: «Privat. Vises ikke i Finn turneringer — du sender invitasjoner selv fra Spillere.»
   - `manual_approval`: «Dukker opp i Finn turneringer. Folk ber om plass, du godkjenner hver enkelt.»
   - `open`: «Dukker opp i Finn turneringer så hvem som helst med lenken kan melde seg på.»
   (Endelig copy kjøres gjennom `humanizer` før commit — unngå em-dash-kjeder.)

3. **Ren synlighets-helper** — `lib/games/registration.ts` får `isDiscoverableRegistrationMode(mode): boolean` (true for `open` + `manual_approval`). Komponenten utleder merke-label + tone fra den. Holder mode→synlighet på ÉN plass, enhetstestbar, og umulig å la drifte fra `getDiscoverableGames`.

## Edge Cases & Guardrails
- **Merket må matche #357 eksakt:** `open`/`manual_approval` = oppdagbar, `invite_only` = privat. Helper + test låser dette.
- **`lockGameMode` (edit på publisert spill):** radioene disables, men merke + hint skal fortsatt rendre (informativt). Ikke skjul synligheten fordi feltet er låst.
- **Ikke rør default:** `invite_only` forblir default (`useGameFormState.ts:448`). Default-policy (intent-styrt) er en flyt-4-beslutning, eksplisitt utenfor scope.
- **Ingen ny DB-kolonne / payload-endring** — `gamePayload.ts` uendret.
- **Ikke rør type-aksen** («Hva melder man på?» — solo/team/both) eller team-disable-logikken.

## Key Decisions
- **Merke + forklaring** (bruker-valg 2026-06-02) — skannbart «i det de velger» + detaljert hvorfor. Forkastet: kun-tekst (mindre skannbart), dynamisk callout (mindre direkte per-valg).
- **Synlighet utledes av én helper** speilet mot `getDiscoverableGames`, ikke duplisert i komponenten.
- **PATCH-bump:** clarity/polish på eksisterende felt — arrangøren gjør det samme som før, bare med forståelse. Ingen ny feature.

**Claude's Discretion:**
- Eksakt merke-markup/palette (muted for Privat, accent/primary-soft for Oppdagbar) og plassering (ved tittel-linja).
- Endelig ordlyd på hints + om legend «Hvem kan melde seg på?» får en liten under-tekst.
- Helper-navn og om den eksponerer label/tone eller bare boolean.

## Success Criteria
- [ ] Hver modus viser et synlighets-merke: `invite_only` → «Privat», `manual_approval` + `open` → «Oppdagbar» — verifisert ved lesing av `RegistrationSection.tsx` + helper-test.
- [ ] Hver modus' hint forklarer i klartekst om spillet blir oppdagbart i «Finn turneringer» eller privat — lesing av komponent.
- [ ] `isDiscoverableRegistrationMode` er ren og enhetstestet, og samsvarer med `getDiscoverableGames` (`open`+`manual_approval` true, `invite_only` false) — `npx vitest run`.
- [ ] Endringen gjelder både wizard-steget og full GameForm (delt komponent, ingen duplisering) — lesing.
- [ ] Ingen ny DB-kolonne; default forblir `invite_only` — `useGameFormState.ts:448` + `gamePayload.ts` uendret.

## Gates
- [ ] `npx tsc --noEmit` passerer
- [ ] `npx vitest run lib/games/registration.test.ts` (ny/utvidet helper-test) passerer
- [ ] `npx eslint` på endrede filer passerer
- [ ] `npm run build` passerer
- [ ] `feat`/`fix`-commit: PATCH-bump `package.json` + `CHANGELOG.md`-oppføring (commit-msg-hook håndhever)
- [ ] Playwright/preview **waived**: wizard er admin-gated (`/admin/games/new`); lokal preview når ikke autentisert admin-state. Verifiseres via kode + helper-test, samme begrunnelse som #357. Eier spot-sjekker i prod.

## Files Likely Touched
- `app/admin/games/new/sections/RegistrationSection.tsx` — synlighets-merke per modus + omskrevne hints.
- `lib/games/registration.ts` — `isDiscoverableRegistrationMode`-helper.
- `lib/games/registration.test.ts` — enhetstest for helperen (ny eller utvidet).
- `package.json` + `CHANGELOG.md` — PATCH-bump + oppføring under 1.67.y-serien.

## Out of Scope
- Default-policy for `registration_mode` (intent-styrt default — flyt-4-beslutning).
- Type-aksen (solo/team/both) og team-disable-logikk.
- Endringer i `getDiscoverableGames` eller «Finn turneringer»-siden (#357, allerede shippet).
- Ny DB-kolonne eller egen synlighets-bryter.
- Edit-flytens lock-semantikk.
