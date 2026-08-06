# Spec: Sidepoeng-oppsettet låses når cupen er startet (#1455)

## Problem

Eier-funn fra generalprøven av splittet cup-dag (#1441), 2026-08-06: det er mulig å legge til og redigere sidepoeng (closest-to-pin / longest drive) mens cup-runden er i gang. `saveSideAwardConfig` tillater i dag re-konfigurering mens cupen er `active`, helt til første vinner er registrert, og SideAwardsPanel viser redigeringspanelet (+ Legg til / Lagre) under aktiv runde. Eieren har overstyrt D9-timingregelen: sidepoeng-oppsett hører hjemme i cup-oppsettet — konfigurasjon KUN mens cupen er `draft`. Etter start: kun vinner-registrering.

## Research Findings

Ingen ekstern biblioteksflate berøres — endringen bruker utelukkende mønstre som allerede finnes i repoet og som er lest i denne økten:

- Server-gate-mønsteret finnes allerede i `saveSideAwardConfig` (`cup_finished`-sjekken, lib/cup/sideAwardActions.ts:103) — den nye gaten er en søskensjekk rett under.
- UI-et har allerede en ferdigbygget read-only-modus: `SideAwardsPanel` rendrer recap-liste når `configEditable={false}` (SideAwardsPanel.tsx:180–195). Ingen ny UI trengs — kun endret prop-utledning på kall-siden.
- ⚠️ Navnekollisjon (ufarlig, men ikke bli forvirret): strengen `cup_started` finnes allerede som **notification kind** i `lib/notifications/types.ts:24`. Det er et annet type-namespace (NotificationKind vs SaveSideAwardConfigError) — ingen konflikt, ingen av dem skal renames.

## Prior Decisions

- **#1441 / D9:** sidepoeng-flyten (egen tabell `tournament_side_awards` uten write-RLS, all skriving via `getAdminClient()` med authz KUN i server-action-gaten) står. Denne fiksen endrer bare timing-regelen i den gaten.
- **Eier-overstyring (dette issuet):** D9s «active men vinner-løs»-vindu fjernes. Draft-only er besluttet av eieren med skjermbilde — ikke re-diskuter.
- **Atomic-or-compensated-mønsteret** (delete-så-insert med kompensert rollback) i `saveSideAwardConfig` røres ikke.

## Design

**Server** (`lib/cup/sideAwardActions.ts`):

1. Nytt medlem i unionen: `SaveSideAwardConfigError` får `'cup_started'`.
2. Ny gate i `saveSideAwardConfig`, rett etter `cup_finished`-sjekken (rekkefølgen gir mest spesifikk feilmelding — finished-cuper skal fortsatt få `cup_finished`, ikke `cup_started`):
   ```ts
   if (cup.status === 'finished') return { ok: false, error: 'cup_finished' };
   if (cup.status !== 'draft') return { ok: false, error: 'cup_started' };
   ```
3. `winners_already_registered`-sjekken BEHOLDES som forsvar i dybden (etter den nye gaten kan den i praksis bare treffe en teoretisk draft-cup med registrerte vinnere — det er poenget med dybdeforsvar).
4. Doc-kommentaren over `saveSideAwardConfig` (linje 54–73) oppdateres: timing-regelen er nå draft-only (eier-overstyring av D9, Refs #1455). Rollback-rasjonalet («ingen av radene hadde vinner») holder fortsatt — draft-gaten + winners-gaten garanterer det samme.

**UI** (`app/[locale]/admin/cup/[id]/`):

5. `CupManagement.tsx:289–293`: `configEditable`-uttrykket forenkles til `tournament.status === 'draft'`. Read-only-grenen i panelet (lesbar liste over konfigurerte sidepoeng) og vinner-registreringen («Etter runden», synlig i active/finished) finnes allerede og trenger ingen endring.
6. `SideAwardsPanel.tsx`: `errorMap` får `cup_started: t('errors.cupStarted')` (server-svaret skal ha norsk kopi selv om UI-et ikke lenger tilbyr redigering — en åpen fane fra før start kan fortsatt sende). JSDoc-en øverst (linje 19–22, beskriver gamle regelen) oppdateres.

**i18n** (`messages/no.json` + `messages/en.json`): ny nøkkel `cup.sideAwards.errors.cupStarted`. Forslag (builder kjører humanizer-sjekk): no: «Cupen er i gang — sidepoeng kan bare settes opp før start.» / en: "The cup is under way — side awards can only be set up before the start."

## Edge Cases & Guardrails

- `draft` → uendret: fullt redigerbart oppsett.
- `active`, ingen vinnere → FØR: redigerbart (bugen). NÅ: server avviser med `cup_started`, UI viser lesbar liste.
- `active`, vinner registrert → NÅ: `cup_started` fra server (før: `winners_already_registered`); UI uendret lesbar.
- `finished` → fortsatt `cup_finished` (gate-rekkefølgen sikrer det).
- `draft` med vinner-rader (skal ikke kunne oppstå) → `winners_already_registered` (dybdeforsvaret).
- `registerSideAwardWinner` røres IKKE — vinner-registrering etter start er hele poenget med flyten.
- Ingen DB-/RLS-endring: tabellen har bevisst ingen write-policies (migrasjon 0154); authz håndheves i denne server-action-gaten, som er nettopp der vi strammer.
- Tom lesbar liste i active (`empty`-nøkkelen «Ingen sidepoeng lagt til ennå.» antyder at man kan legge til): se Claude's Discretion.

## Key Decisions

- **Draft-only-gate på server + UI**: eier-besluttet i issuet — ikke et produktvalg i denne PR-en.
- **Gate-rekkefølge finished → started**: `cup_finished` sjekkes først så finished-cuper får riktig melding — teknisk valg, avgjort her.
- **`winners_already_registered` beholdes**: forsvar i dybden per issuets fiks-retning.

**Claude's Discretion:**

- Empty-state-kopien i lesbar modus når cupen er i gang («Ingen sidepoeng lagt til ennå.» leser rart når man ikke lenger KAN legge til). Builder kan enten la stå eller legge til en låst-variant (f.eks. «Ingen sidepoeng ble satt opp for denne cupen.») — hvis variant: egen nøkkel, begge locales, humanizer-sjekk. ASSUMPTION: dette er kopi-polish innenfor issuets scope, ikke scope-utvidelse.
- Eksakt ordlyd på ny feilkopi (forslaget over er utgangspunkt).

## Success Criteria

- [ ] `saveSideAwardConfig` med cup-status `active` returnerer `{ ok: false, error: 'cup_started' }` uten at delete/insert kalles — ny Type A-test i `lib/cup/sideAwardActions.test.ts` (samme mock-stil som naboene).
- [ ] Eksisterende `cup_finished`-test er fortsatt grønn (rekkefølge-beviset).
- [ ] `winners_already_registered`-testen (i dag status `active`, linje ~163) er oppdatert til status `draft` + eksisterende vinner-rad, så dybdeforsvars-grenen fortsatt er utøvd.
- [ ] `CupManagement.tsx` sender `configEditable={tournament.status === 'draft'}` — verifiseres ved kodelesing (de to eksisterende render-testene i `SideAwardsPanel.test.tsx` dekker allerede begge moduser; INGEN nye Type C-tester).
- [ ] `cup.sideAwards.errors.cupStarted` finnes i både `messages/no.json` og `messages/en.json`.
- [ ] `package.json` patch-bumpet + én Feilrettinger-linje i `CHANGELOG.md` (fix, bruker-synlig).
- [ ] Staging-verifisering før merge: aktiv cup viser lesbar sidepoeng-liste uten Legg til/Lagre; vinner-registrering virker fortsatt (staging-verify-skillet, bevis-kommentar + label på PR-en).

## Gates

- [ ] `npx vitest run lib/cup/sideAwardActions.test.ts "app/[locale]/admin/cup/[id]/SideAwardsPanel.test.tsx"` grønn
- [ ] `npm run build` grønn (tsc-gate — ikke filtrer «pre-existing»)
- [ ] `npm run lint` grønn

## Files Likely Touched

- `lib/cup/sideAwardActions.ts` — ny gate + `'cup_started'` i unionen + doc-kommentar
- `lib/cup/sideAwardActions.test.ts` — ny test + oppdatert winners-test
- `app/[locale]/admin/cup/[id]/CupManagement.tsx` — `configEditable`-uttrykket
- `app/[locale]/admin/cup/[id]/SideAwardsPanel.tsx` — errorMap-nøkkel + JSDoc
- `messages/no.json`, `messages/en.json` — `errors.cupStarted` (+ evt. låst empty-state)
- `package.json`, `package-lock.json`, `CHANGELOG.md` — versjon + changelog

## Out of Scope

- Status-gate i `registerSideAwardWinner` (blokkere vinner-registrering i draft): UI-et viser aldri seksjonen i draft; en server-gate der er en egen herdings-vurdering — nevn i closing-kommentaren hvis builder mener det trengs, ikke bygg det her.
- Endringer i `getCupSnapshot`, RLS, migrasjoner eller `tournament_side_awards`-skjemaet.
- Re-diskusjon av D9-timingregelen — eieren har besluttet.
