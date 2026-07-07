# Spec: Cup-oppsett — slank til det som faktisk brukes (allowance + point-mål + wizard-steg)

**Issue:** #1142 · **Branch:** claude/1142-cup-oppsett-slank-til-faktisk-bruk

## Problem

Cup-opprettelsesflaten bærer tre rester fra tidligere cup-arbeid som ingen bruker (prod: 0 cuper noensinne):

1. **Fem `AllowanceField`-fieldsett** i `app/[locale]/admin/games/new/CupSetup.tsx:145-188` (fourball 85 / foursomes 50 / greensome 100 / chapman 100 / gruesome 50). Hver er legend + beskrivelse + netto/brutto-radio + tallfelt + hjelpetekst. Verifisert server-side: `createTournamentDraft` leser dem via `parseAllowancePct(raw, ALLOWANCE_DEFAULTS.x)` (`lib/cup/actions.ts:135-144`), og `parseAllowancePct('', default)` returnerer default-en (`lib/cup/allowance.ts:43`). Utelates feltene fra formen, får serveren nøyaktig WHS-defaultene — ingen server-hull. `createCupMatchesFromPlan` leser videre de lagrede kolonnene med `?? ALLOWANCE_DEFAULTS`-fallback (`generer/actions.ts:166-175`).

2. **«Poengmål»-feltet** (`CupSetup.tsx:133-143`). Default-en (`CupSetup.tsx:48-56`) hardkoder «anta 8 matcher» (`4,5 = 8/2 + 0,5`), men antall matcher velges først i `/generer`-wizarden (`generer/actions.ts` — kun mens `status='draft'`), strengt før `startTournament` (`lib/cup/actions.ts:264`). Admin tvinges til å gjette et tall før det ekte antallet finnes. `points_to_win` er i dag `NOT NULL` (`lib/database.types.ts:1657` — Insert krever den) og settes ved opprettelse.

3. **Match-wizardens steg 5 (Bekreft)** i `GenerateMatchesWizard.tsx` (`Step5Confirm`, :608-708) viser kun bane·tee-recap + total + confirm-knapp — ingen nytt input. Steg 4 (`Step4Preview`, :467-604) er den siste flaten med reelt valg (redigerbar match-oppstilling). All validering ligger server-side i `createCupMatchesFromPlan`.

`updateTournament` (`lib/cup/actions.ts:187`) er verifisert foreldreløs (null callers repo-vidt) — cup-redigeringsflate finnes ikke, så endringene under trenger bare røre opprett-, generer- og visnings-flatene.

## Design

### Del 1 — Fjern de fem allowance-feltene (ren UI-subtraksjon)

I `app/[locale]/admin/games/new/CupSetup.tsx`:
- Slett de fem `<AllowanceField .../>`-blokkene, linje 145-188.
- Slett importen `import { AllowanceField } from '@/components/admin/AllowanceField';` (linje 7).
- **Server urørt:** IKKE endre `createTournamentDraft`s allowance-lesing/-insert (`lib/cup/actions.ts:120-144, 163-166`). Når formen ikke sender feltene, gir `parseAllowancePct('')` WHS-defaulten, som lagres i kolonnene. Dette er den tryggeste stien (DB-default på kolonnene kan avvike fra WHS; ved å beholde insert-en garanterer vi WHS-verdi).
- **i18n-opprydding (T2):** de 20 nå-foreldreløse nøklene under `wizard.cupSetup` (`{fourball,foursomes,greensome,chapman,gruesome}AllowanceLegend/Description/NettoHelper/BruttoHelper`, f.eks. `messages/no.json:551`) fjernes fra **BEGGE** kataloger (`messages/no.json` + `messages/en.json`) for å holde `messages/catalogParity.test.ts` grønn. Grep-bekreft at ingen andre call-sites står igjen før sletting (eneste bruk er de slettede `t(...)`-kallene). `allowedFormatsLegend`/`allowedFormatsHint` og multi-select-blokka (`CupSetup.tsx:190-244`) beholdes urørt.

### Del 2 — Fjern poengmål-feltet, utled ved cup-start (T2 + T3)

**Beslutning:** gjør `tournaments.points_to_win` nullable og utled den ved `startTournament` fra det reelle match-antallet. Se Key Decisions for hvorfor start (ikke opprettelse/generering) er riktig punkt.

1. **Migrasjon `supabase/migrations/0138_cup_points_to_win_nullable.sql`:**
   ```sql
   ALTER TABLE public.tournaments ALTER COLUMN points_to_win DROP NOT NULL;
   ```
   Påfør staging via Supabase MCP → verifiser → prod. Prod har 0 cuper, så ingen backfill; DROP NOT NULL er trygt uansett rad-antall.
   - **Verifiserings-SELECT (staging + prod):**
     ```sql
     SELECT is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='tournaments' AND column_name='points_to_win';
     ```
     Forvent `YES`.
   - **Prod-brannmur:** DDL mot prod krever engangs-luken `touch .claude/approve-prod` i økten (eier-godkjenning), jf. #1074.
   - Etter migrasjon: `npm run gen:types` (leser prod read-only) så `points_to_win` blir `number | null` i `lib/database.types.ts` (Row + Insert).

2. **`CupSetup.tsx`:** slett `<Input ... name="points_to_win" .../>` (linje 133-143) og den nå-ubrukte `pointsDefault`/`pointsHint`-utledningen (linje 48-56). `matchCap`-propen brukes fortsatt i generer-wizarden, men her i `CupSetup` blir den ubrukt etter dette — behold prop-signaturen (kalleren sender den), men fjern den døde bruken. Verifiser med `npm run build` at ingen ubrukt-variabel-lint slår til; fjern importen/variabelen helt hvis den blir foreldreløs.

3. **`lib/cup/actions.ts` — `createTournamentDraft`:** fjern `pointsRaw`-lesingen (linje 119), `parsePointsToWin`-valideringen + `cup_points`-redirecten (linje 133-134), og `points_to_win: points as number` fra insert-objektet (linje 161). Draft-rader får da `points_to_win = NULL`. `parsePointsToWin`-hjelperen (linje 28-35) blir foreldreløs når `updateTournament` også ryddes (se punkt under) — behold den hvis `updateTournament` beholdes urørt (den er dead code, men kompilerer fortsatt).

4. **`lib/cup/actions.ts` — `startTournament` (linje 264-353):** `count`-spørringen (linje 273-279) garanterer allerede `≥ 2` matcher før start. Utled målet der:
   ```ts
   const pointsToWin = (count ?? 0) / 2 + 0.5; // samme formel som den gamle default-en, på ekte antall
   ```
   - Legg `points_to_win: pointsToWin` inn i status-flip-update-en (linje 293-300, ved siden av `status: 'active'`). `.select('id')` + `expectAffected` er allerede på plass (0-rad-fella dekket).
   - Bruk `pointsToWin` (ikke `current.points_to_win`, som nå er `null` fram til denne update-en) i mail-payloaden `sendCupStartedNotification({ ..., pointsToWin })` (linje 335). `sendCupStartedNotification` krever `pointsToWin: number` (`lib/mail/cupStartedNotification.ts:36`) — den beregnede verdien er alltid et tall, aldri null. `current`-selecten (linje 283) kan beholde `points_to_win` i listen (uskadelig) eller droppe den.

5. **`lib/cup/computeCupLeaderboard.ts` (T2 — vinner-logikk):**
   - `TournamentInput.points_to_win: number` → `number | null` (linje 45).
   - `CupLeaderboardResult.pointsToWin: number` → `number | null` (linje 60); `pointsToWin: tournament.points_to_win` (linje 112) trenger ingen endring.
   - Vinner-sjekken (linje 98-105): gate på ikke-null så et draft-mål (null) aldri feil-erklærer en vinner:
     ```ts
     } else if (tournament.points_to_win != null && team1Points >= tournament.points_to_win) {
       winner = 1;
     } else if (tournament.points_to_win != null && team2Points >= tournament.points_to_win) {
       winner = 2;
     }
     ```
     (Uten guarden ville `>= null` alltid vært falsk i JS, men eksplisitt null-sjekk gjør intensjonen tydelig og robust mot type-endring.)

6. **`lib/cup/getCupSnapshot.ts`:** `points_to_win: number` → `number | null` (linje 46; selecten linje 115 er uendret; mapping linje 308 `points_to_win: t.points_to_win` uendret).

7. **Visnings-flater (null-vindu = draft→generert→før-start):** `formatPoints(n: number)` er en lokal helper i to filer og tar `number`. Gate hvert kall så null ikke sendes inn:
   - `app/[locale]/cup/[id]/page.tsx:86-90` — «Først til {formatPoints(points_to_win)} point vinner» vises når `status !== 'finished'`. Ved `points_to_win == null` (draft/aktivert-før-start): vis en nøytral erstatning (f.eks. «Poengmål settes når cupen starter») eller utelat linjen. Byggerens skjønn på copy (norsk, kort).
   - `app/[locale]/admin/cup/[id]/CupManagement.tsx:137` (`headerSubtitle`) og `:175` (`matchesSummary`) — begge sender `formatPoints(tournament.points_to_win)`. Null-håndter (placeholder-tekst eller «—»).
   - `app/[locale]/admin/cup/page.tsx:64` (lokal type `points_to_win: number`) → `number | null`; `:118` (`String(cup.points_to_win).replace(...)`) — null-håndter i rad-subtittelen.

8. **i18n:** fjern `pointsToWinLabel`, `pointsHintDefault`, `pointsHintCapped` under `wizard.cupSetup` fra **begge** kataloger (`messages/no.json:545-547` + `messages/en.json:545-547`). Legg til evt. ny placeholder-nøkkel for null-vinduet i begge kataloger (parity).

9. **Tester (Type A):** `lib/cup/computeCupLeaderboard.test.ts` — legg til én case med `points_to_win: null` som bekrefter `winner === null` selv når et lag har poeng. `lib/cup/getCupSnapshot.test.ts:36` bruker `points_to_win: 1` — fortsatt gyldig (number er tillatt), ingen endring nødvendig.

### Del 3 — Slå wizard-steg 5 inn i steg 4 (UI-restrukturering)

I `app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.tsx`:
- `TOTAL_STEPS` 5 → 4 (linje 721); `type Step = 1 | 2 | 3 | 4` (linje 47); `StepIndicator total` følger `TOTAL_STEPS`.
- Fold `Step5Confirm`-innholdet (bane·tee-recap + format-oppsummering + `cup-wizard-generate`-confirm-knappen, `:667-707`) inn i steg 4-renderingen: når `step === 4`, vis `<Step4Preview .../>` (redigerbar oppstilling) etterfulgt av recap + confirm-knappen. `handleConfirm`/`createCupMatchesFromPlan`-kallet + `errorMap` (`:638-659`) + `isPending` flyttes med. Bevar `data-testid="cup-wizard-step5"`? Nei — se e2e-punktet: bruk `cup-wizard-step4` som container-testid og behold `cup-wizard-generate` på confirm-knappen.
- Fjern `Step5Confirm`-komponenten og `step === 5`-grenen (`:929-939`).
- Navigasjon (`:942-972`): endre `{step < 5 && ...}` → `{step < 4 && ...}` slik at Neste/Tilbake-raden skjules på steg 4. Confirm-knappen (fra gammelt steg 5) er da eneste primær-handling på steg 4, ved siden av en «Tilbake»-mulighet — behold en Tilbake-knapp på steg 4 (byggerens skjønn på layout: enten behold nav-raden med Neste skjult på steg 4, eller render Tilbake sammen med confirm).
- `handleNext` (`:812-819`): når `step === 3` genereres matchene og går til steg 4 (uendret logikk, bare at 4 nå er terminal). `canAdvance()` steg 4-grenen (`:808`) er ikke lenger en «Neste»-gate men kan beholdes.

**e2e (@gate, cup-smoke):** `e2e/cup/cup-lifecycle.spec.ts:268-288` walker i dag fire `cup-wizard-next`-klikk (1→2→3→4→5), asserter `cup-wizard-step5` synlig (`:287`), og klikker `cup-wizard-generate` (`:288`). Etter merge: **tre** `cup-wizard-next`-klikk (1→2→3→4), assert `cup-wizard-step4` synlig, klikk `cup-wizard-generate`. Oppdater specen (fjern ett next-klikk linje 284, bytt step5→step4-assert linje 287). Kjør mot staging (`npm run e2e:gate`-forutsetninger i CLAUDE.md).

## Edge Cases & Guardrails

- **Null-vindu for `points_to_win`:** mellom cup-opprettelse og start er verdien null. `computeCupLeaderboard` må aldri erklære vinner på null-mål (Del 2 punkt 5). Alle tre visnings-flatene må null-håndtere `formatPoints` (Del 2 punkt 7).
- **0-rad-skriv (bug-prevention #2):** `startTournament`s status-flip bruker allerede `.select('id')` + `expectAffected` — behold den; den nye `points_to_win`-koloonnen legges inn i samme update, ingen ny skrive-sti.
- **Migrasjon staging→prod:** verifiser `is_nullable = YES` på staging FØR prod; prod bak `touch .claude/approve-prod`-luken.
- **catalogParity:** enhver i18n-nøkkel-fjerning må skje i no.json + en.json samtidig, ellers rødt.
- **`updateTournament` (dead code):** forblir kompilerbar etter nullable-migrasjonen (`points_to_win: points as number` er assignable til `number | null`). Rør den ikke i dette issuet — se Out of Scope.

## Key Decisions

- **Utled `points_to_win` ved `startTournament`, ikke ved generering.** `createCupMatchesFromPlan` teller ikke totalen atomisk (den appender matcher og teller eksisterende + nye for cap-en), så et mål utledet fra `matches.length` der ville vært feil ved re-generering. `startTournament`s `count`-spørring gir totalen for hele turneringen uansett antall generer-runder, og er den siste gaten før cupen blir aktiv. Formelen `count/2 + 0.5` er nøyaktig den gamle default-en (`matchCap/2 + 0.5`) anvendt på det ekte antallet.
- **Nullable framfor sentinel.** Ingen NOT-NULL-tallverdi representerer «ikke bestemt ennå» rent: `0` ville få `computeCupLeaderboard` til å erklære vinner umiddelbart (`0 >= 0`) og vise «Først til 0 point». Nullable er den ærlige modelleringen og lar visningen si «settes ved start».
- **Behold server-side allowance-lesing i `createTournamentDraft`.** Minimal, trygg: formen slutter å sende feltene, `parseAllowancePct('')` gir WHS-default, kolonnene får garantert WHS-verdi uavhengig av DB-default.

**Claude's Discretion:** eksakt norsk copy for null-vindu-placeholderen; layout for confirm-knapp + Tilbake på det sammenslåtte steg 4; hvorvidt `parsePointsToWin`/`matchCap`-restene i `CupSetup`/`actions.ts` fjernes helt eller bare gjøres ubrukt (så lenge `npm run build`/`lint` er grønt); nøyaktig testid-navngiving på steg 4-containeren (men `cup-wizard-generate` MÅ bevares).

## Success Criteria

- [ ] `CupSetup.tsx` viser hverken de fem allowance-feltene eller poengmål-feltet; cup-opprettelse fungerer og lagrer en draft med WHS-allowance i kolonnene.
- [ ] `tournaments.points_to_win` er nullable på staging (og prod etter godkjenning); `lib/database.types.ts` regenerert til `number | null`.
- [ ] En draft-cup har `points_to_win = NULL`; etter `startTournament` er den satt til `matchCount/2 + 0.5`.
- [ ] `computeCupLeaderboard` returnerer `winner === null` når `points_to_win` er null, uansett poengstilling.
- [ ] Ingen visnings-flate (`cup/[id]`, `CupManagement`, `admin/cup`-lista) krasjer eller viser «0»/«null» som poengmål i draft-tilstand.
- [ ] Generer-wizarden har fire steg; steg 4 viser redigerbar oppstilling + bane·tee-recap + generer-knapp; steg 5 finnes ikke.
- [ ] `e2e/cup/cup-lifecycle.spec.ts` oppdatert til fire steg og grønn mot staging.
- [ ] `messages/no.json` + `messages/en.json` har identiske leaf-nøkler (parity-test grønn) etter nøkkel-fjerning.

## Gates

- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npx vitest run lib/cup/computeCupLeaderboard.test.ts lib/cup/getCupSnapshot.test.ts messages/catalogParity.test.ts`
- [ ] Migrasjon påført staging + verifiserings-SELECT (`is_nullable = YES`); prod bak `touch .claude/approve-prod`.
- [ ] `npm run e2e:gate` (cup-smoke) grønn mot staging.
- [ ] staging-verify: opprett cup → generer matcher (fire steg) → start → bekreft «Først til X point» viser riktig utledet mål; post bevis på PR-en.

## Files Likely Touched

- `app/[locale]/admin/games/new/CupSetup.tsx` — fjern 5 allowance-felt + poengmål-felt + død default-logikk.
- `supabase/migrations/0138_cup_points_to_win_nullable.sql` — ny migrasjon (DROP NOT NULL).
- `lib/database.types.ts` — regenerert (`points_to_win: number | null`).
- `lib/cup/actions.ts` — `createTournamentDraft` (drop points-insert), `startTournament` (utled + sett + mail-verdi).
- `lib/cup/computeCupLeaderboard.ts` — null-tolerant vinner-logikk + typer.
- `lib/cup/getCupSnapshot.ts` — type `points_to_win: number | null`.
- `app/[locale]/cup/[id]/page.tsx` · `app/[locale]/admin/cup/[id]/CupManagement.tsx` · `app/[locale]/admin/cup/page.tsx` — null-håndter poengmål-visning.
- `app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.tsx` — slå steg 5 inn i steg 4, `TOTAL_STEPS=4`.
- `e2e/cup/cup-lifecycle.spec.ts` — fire-stegs walk.
- `messages/no.json` + `messages/en.json` — fjern foreldreløse nøkler (allowance + poengmål), evt. ny placeholder-nøkkel.
- `lib/cup/computeCupLeaderboard.test.ts` — null-mål-case.

## Out of Scope

- **`updateTournament`** (`lib/cup/actions.ts:187`) og dens `points_to_win`/allowance-lesing — foreldreløs dead code (null callers). Ikke rør; separat opprydding.
- **DB-default-verdiene** på `*_allowance_pct`-kolonnene — beholdes; serveren fortsetter å skrive WHS-defaults via `parseAllowancePct`.
- **`AllowanceField`-komponenten** (`components/admin/AllowanceField.tsx`) — brukes fortsatt av andre wizards; ikke fjern.
- **Multi-select av tillatte match-formater** i `CupSetup` (`:190-244`) — urørt.
- **Bruker-synlig versjons-bump + CHANGELOG:** dette er ren opprydding/refactor uten ny bruker-verdi; commits merkes `refactor`/`fix` med `[no-changelog]` etter behov (feat-bump ikke påkrevd). PR-en bruker `Closes #1142` + `Refs #1142` i commits.
