# Spec: invite_only-blindvei → «Be om å bli med»

Issue: #368 (`enhancement`, `area:auth`). Flyt: «Bli med i et spill» (`docs/flows/02-bli-med-i-spill-fremtid.svg`).

## Problem
Lander en innlogget bruker på `/signup/[shortId]` for et `invite_only`-spill uten ventende invitasjon, ser de en blindvei: «Dette spillet krever invitasjon. Be arrangøren om å sende deg en.» ([`page.tsx:200-204`](app/signup/[shortId]/page.tsx)) — ingen handling, ingen vei videre. Brukeren har lenken (noen delte den), men kan ikke gjøre noe fra skjermen.

## Prior Decisions
- **#357/#367 «påmeldingsmåten ER synligheten»:** `invite_only` er PRIVAT — vises ikke i «Finn turneringer». Denne endringen rører IKKE oppdagbarhet: invite_only forblir uoppdagbart. Eneste nye er at noen som *har lenken* kan banke på.
- **#199 selv-påmelding:** `game_registration_requests` + `requestApproval`-action + admin signups-side er den etablerte forespørsel-infraen. Gjenbrukes, ikke dupliseres.
- **Eier-valg (2026-06-02):** Option A — «Be om å bli med»-knapp for invite_only (samme flyt som manual_approval). Forkastet: kun-instruks (Option B kolliderte med no-leak-kriteriet siden arrangør-navn = ny privat info).

## Design
End-to-end Option A. Fire koordinerte deler (alle nødvendige — uten admin-delene flytter vi bare blindveien til admin-siden):

1. **Signup-siden ([`page.tsx`](app/signup/[shortId]/page.tsx), `renderBody` invite_only-gren):** når ingen ventende invitasjon, ingen åpen forespørsel (fanges allerede av `hasOpenPendingRequest` over), ikke låst (fanges av `gameLocked` over):
   - **solo/both:** render intro «Du er ikke invitert ennå, men du kan be arrangøren om plass.» + `<RegistrationForm mode="manual_approval" shortId={...} />` (gjenbruk — viser valgfri hilsen + «Send forespørsel» + kvittering).
   - **team-only:** behold en informativ melding (lag-forespørsel støttes ikke ennå — be arrangøren invitere laget). Ikke render en form som alltid feiler.
   - Behold `hasPendingInvitation`-undergrenen (→ innboks) uendret.

2. **`requestApproval`-action ([`actions.ts:253`](app/signup/[shortId]/actions.ts)):** utvid mode-gaten fra `!== 'manual_approval'` til å godta `manual_approval` OG `invite_only`. `open` → fortsatt `wrong_mode`. Alt annet (rate-limit, pending-insert, notify arrangør) er uendret og gjenbrukes.

3. **Admin detalj-side ([`RegistrationOverviewSection.tsx`](app/admin/games/[id]/RegistrationOverviewSection.tsx)):** fjern `if (registrationMode === 'invite_only') return null`. For invite_only: vis pending-count (samme count-query som manual_approval) + «Vis alle påmeldinger →»-lenke, `modeLabel` = «Bare inviterte». **IKKE** del-lenke-knappen (CopyShareLinkButton) for invite_only — invite_only er privat, og en del-lenke-knapp ville nudget arrangøren til å kringkaste lenken. Arrangørens primære invite-vei er fortsatt Spillere-fanen; forespørsel-veien er en fallback for folk som alt har lenken. Gir arrangøren en STÅENDE vei til forespørslene (ikke bare det flyktige varselet).

4. **Admin signups-side ([`signups/page.tsx:188-196`](app/admin/games/[id]/signups/page.tsx)):** dagens `isInviteOnly`-banner sier «Spillere kan ikke melde seg på selv» — det blir feil nå. Erstatt med korrekt info: invite_only tar imot «be om å bli med»-forespørsler fra folk som har lenken, og de dukker opp her.

## Edge Cases & Guardrails
- **No-leak (akseptkriterium):** signup-siden viser ingen ny privat info (ikke arrangør-navn) — kun navn + tee-off + modus-label, som før. Forespørsel-formen legger ingenting til.
- **Allerede forespurt:** `hasOpenPendingRequest` fanges FØR invite_only-grenen → «Forespørsel sendt»-melding. Ikke regresjon.
- **Låst spill (active/finished):** `gameLocked` fanges FØR invite_only-grenen → «påmelding stengt». Form vises aldri for låst spill. `requestApproval` har dessuten egen `game_locked`-guard.
- **team-only invite_only:** render IKKE forespørsel-formen (den feiler alltid med `team_not_supported_yet`) — vis informativ melding i stedet.
- **Approve-flyten:** `approveRequest` er ikke mode-gated (keyed på request_id) — invite_only-forespørsler godkjennes/avvises som vanlig. Verifisert under bygg.
- **#367-copy urørt:** «Privat»-merket + hint i wizard-en er fortsatt korrekt (invite_only er fortsatt uoppdagbart). Ikke rør.

## Key Decisions
- **Option A**, gjenbruk `requestApproval` + `RegistrationForm mode="manual_approval"` framfor ny action/form.
- **Admin-overskue un-gates for invite_only** — ellers lander forespørselen et sted arrangøren ikke har stående vei til (ville vært ny blindvei).
- **Ingen del-lenke-knapp for invite_only** — bevarer privat-karakteren; arrangøren nudges ikke til å kringkaste lenken. Forespørsel-veien tjener folk som alt har lenken.
- **MINOR-bump:** ny bruker-synlig handling (knapp + ny request-vei for invite_only).

**Claude's Discretion:**
- Endelig norsk copy (signup-intro, team-only-melding, signups-banner, modeLabel) — kjøres gjennom `humanizer`.
- Om team-only-grenen gjenbruker en eksisterende banner-tone.

## Success Criteria
- [ ] invite_only-signup (solo/both, ingen ventende invitasjon, ikke forespurt, ikke låst) viser en «Be om å bli med»-forespørsel-form, ikke en handlingsløs beskjed — lesing av `page.tsx`.
- [ ] `requestApproval` godtar `invite_only` (pending-insert + notify arrangør); `open` → fortsatt `wrong_mode` — `npx vitest run app/signup/[shortId]/actions.test.ts`.
- [ ] Arrangøren har en stående vei til forespørselen: `RegistrationOverviewSection` rendrer for invite_only (pending-count + «Vis alle påmeldinger»), og signups-siden lister den (ikke mode-gated) — lesing.
- [ ] Signups-sidens invite_only-banner hevder ikke lenger at selv-påmelding er umulig — lesing av `signups/page.tsx`.
- [ ] Ingen ny privat info lekkes på signup-siden ut over navn/tee-off — lesing.
- [ ] Eksisterende undergrener intakt: ventende invitasjon → innboks; allerede forespurt → «venter»; låst → «stengt»; team-only → informativ melding (ikke knekt form) — lesing.

## Gates
- [ ] `npx tsc --noEmit` passerer
- [ ] `npx vitest run app/signup/[shortId]/actions.test.ts` passerer (utvidet)
- [ ] `npx eslint` på endrede filer passerer
- [ ] `npm run build` passerer
- [ ] `feat`-commit: MINOR-bump `package.json` + `CHANGELOG.md` (ny serie, wrap 1.67.y)
- [ ] Playwright/preview **waived**: signup-flyten krever autentisert bruker + seedet invite_only-spill; lokal preview når ikke den tilstanden. Verifiseres via kode + unit-test, samme begrunnelse som #357/#367. Eier spot-sjekker i prod.

## Files Likely Touched
- `app/signup/[shortId]/page.tsx` — invite_only-gren rendrer forespørsel-form (solo/both), team-only beholder melding.
- `app/signup/[shortId]/actions.ts` — `requestApproval` godtar invite_only.
- `app/signup/[shortId]/actions.test.ts` — invite_only godtatt; open fortsatt wrong_mode.
- `app/admin/games/[id]/RegistrationOverviewSection.tsx` — un-gate for invite_only.
- `app/admin/games/[id]/signups/page.tsx` — korriger invite_only-banner.
- `package.json` + `CHANGELOG.md` — MINOR-bump + ny serie.

## Out of Scope
- Endre oppdagbarhet for invite_only (forblir ute av «Finn turneringer»).
- Lag-forespørsel for invite_only (team self-request er ikke støttet for noen modus ennå).
- Default-policy for registration_mode (flyt-4).
- Endringer i #357/#367 sin discovery/wizard-copy.
- Ny notifikasjons-type (gjenbruker `registration_request`).
