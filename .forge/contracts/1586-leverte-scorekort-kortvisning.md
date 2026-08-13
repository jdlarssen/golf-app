# Kontrakt: 18-hulls-kort i Sekretariatets og oppretter-sidens godkjenningslister (#1586)

## Problem

#1365 åpnet 18-hulls-kortet på `/games/[id]/approve`, men de to andre flatene som
godkjenner scorekort viser fortsatt ikke ett eneste hull:

- **Sekretariatet** (`app/[locale]/admin/games/[id]/page.tsx`, «Leverte scorekort»-
  seksjonen, aktiv-spill-gren): navn + flight/lag + status + `ApprovePlayerButton`/
  `ReopenScorecardButton`. Scores hentes i dag KUN som fremdrift uten slag
  (bevisst spoiler-vern i progress-visningen).
- **Oppretter-flaten** (`app/[locale]/games/[id]/spillere/page.tsx`,
  `awaitingApproval`-seksjonen, override-bruk på tvers av flighter): kun navn +
  godkjenn-knapp.

Attestering/gjenåpning uten å se kortet er samme designfeil som #1365 rettet.

## Eier-avklaringer (grå-sone-diskusjon 2026-08-13, i økta)

1. **Sammenslått, ett trykk** på begge flatene — IKKE åpent som på /approve.
   Listene kan være lange; «18-hulls-kort»-linja åpner tabellen per spiller.
2. **Spoiler-vernet vike for leverte kort:** admin kan åpne et levert kort og se
   slagene også mens spillet pågår — å åpne er et aktivt valg. Fremdrifts-
   visningen (uten slag) er UENDRET.

Begge produktvalg er dermed avgjort av eier — PR-en har ingen åpne produktvalg.

## Design

1. **Ekstraher delt tabell-komponent** `app/[locale]/games/[id]/_components/ScorecardTable.tsx`
   (server-komponent) fra tabellen i `approve/page.tsx`: props
   `{ holes, scores, teeGender, holeSegment }`; filtrerer selv med
   `isHoleInSegment` (#1441-mønsteret); rendrer identisk markup (kolonnene
   `game.approve.colHole/colPar/colSi/colStrokes`, `ParAsideInline`,
   `ScoreShape`/`scoreShape`/`scoreTone`, `tabular-nums`). `/approve` bruker
   komponenten — ren refaktor der, null visuell endring.
2. **Sekretariatet:** i «Leverte scorekort»-lista får HVER rad (både til-
   godkjenning og allerede godkjent — gjenåpning er også en vurdering) en
   sammenslått `<details>` med `<summary>` = `game.approve.showCard`
   («18-hulls-kort») + `ScorecardTable`. Datahenting topp-nivå ved
   `status === 'active'` og minst én levert: `course_holes` + scores (med slag)
   for leverte spillere via sidens vanlige klient (`is_admin()`-grenen i
   scores-RLS dekker lesingen). `tee_gender` legges til i game_players-selecten.
   Fremdrifts-queryen (uten slag) røres ikke.
3. **Oppretter-flaten:** samme `<details>`-mønster per rad i
   `awaitingApproval`-seksjonen. Scores hentes via `getAdminClient()`
   (service-role) — siden er gated bak `requireAdminOrCreator`, samme
   dokumenterte mønster som #1009-gjeste-e-postene på samme side; RLS-klienten
   ville feilet stille for skjult visning / andre flighter (#1542-prinsippet:
   gaten på call-site ER håndhevelsen). `course_holes` via vanlig klient.
4. **Testid:** `data-testid="submitted-scorecard-details"` på begge nye
   details-elementer (skiller dem fra approve-sidens
   `approve-scorecard-details`).
5. **Copy:** kun gjenbruk av eksisterende `game.approve.*`-nøkler — ingen nye
   strenger, ingen humanizer-runde nødvendig.

## Edge cases & guardrails

- Levert kort med hull uten slag → «—» via `ScoreShape(null)` — samme som /approve.
- front9/back9-spill → segment-filter i komponenten (#1441).
- Trukkede spillere er allerede filtrert ut av begge lister.
- Gjestespillere rendres som andre (navnevisning uendret).
- 0 leverte → ingen ekstra queries, seksjonene uendret.
- IKKE rør approve-/reject-/reopen-actions, `pendingApprovalsFor`, eller
  fremdrifts-queryen (spoiler-vernet der består).
- `/approve`-refaktoren skal være atferds-identisk (åpent kort består, #1365).

## Suksesskriterier

1. Sekretariatet, aktivt spill med leverte kort: hver rad har sammenslått
   «18-hulls-kort»-linje; ett trykk viser hele tabellen med par/SI/slag
   (staging-klikkrunde).
2. Oppretter-siden, spill med ventende godkjenning: samme — også for spillere
   utenfor oppretterens flight (staging-klikkrunde; testdata med 2 flighter
   eller skjult visning dekker service-role-stien).
3. `/approve` ser og oppfører seg som før (åpent kort, toggle) — e2e `@gate`
   grønn + visuell sjekk i klikkrunden.
4. Godkjenn-knappene fungerer uendret på begge flater (klikkrunde + SQL-orakel).

## Gates

- `npm run build` + `lint` + `vitest` (pre-push + CI) grønne.
- Én Type C-render-test for `ScorecardTable` (18 rader + testid — maks én, jf.
  test-disiplinen).
- e2e `@gate` mot staging grønn.
- Staging-klikkrunde av begge flater + bevis-kommentar + `staging-verified`-label
  før merge.
- Commit(er): `fix`-prefix + `.changes/1586-*.md`-notat + `Refs #1586`.

## Files likely touched

- `app/[locale]/games/[id]/_components/ScorecardTable.tsx` (ny) + én test-fil
- `app/[locale]/games/[id]/approve/page.tsx` (bruk komponenten)
- `app/[locale]/games/[id]/spillere/page.tsx` (details + datahenting)
- `app/[locale]/admin/games/[id]/page.tsx` (details + datahenting + tee_gender)
- `.changes/1586-leverte-scorekort-kortvisning.md`

## Out of scope

- Åpent-som-standard på disse flatene (eier valgte sammenslått).
- Endringer i fremdrifts-/spoiler-visningen ellers i Sekretariatet.
- Kortvisning på avsluttede spill (resultatflatene finnes).
- Reopen-/approve-actions og varsler (#1362/#1363 er egne løp).
