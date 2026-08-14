# Evaluering: #1375 — låst back 9-copy sier riktig trigger

**ACCEPT**

Evaluator: fersk kontekst, branch `fix/1375-locked-back9-copy` @ 3d8bf038, mot
`origin/main`. All evidens under er reprodusert i denne økten. Staging-kriteriet
er ikke vurdert her (vurderes separat).

## Kriterier

### (a) Nøyaktig 4 verdilinjer endret i messages/, ingenting annet — PASS

`git diff origin/main...HEAD --stat` gir 4 filer: `.changes/1375-back9-copy-trigger.md`
(ny), `docs/uat-empty-states-and-scheduled-status.md` (2 linjer), `messages/en.json`
(2 linjer), `messages/no.json` (2 linjer). Full diff viser at katalog-endringene er
utelukkende verdi-siden av:

- `no.json:2532 lockedSub`, `no.json:2682 hiddenBackNineSub`
- `en.json:2532 lockedSub`, `en.json:2682 hiddenBackNineSub`

Ingen nøkler lagt til/fjernet, ingen struktur-endring, ingen andre kataloglinjer.

### (b) Ny copy matcher kodens faktiske åpne-trigger — PASS

Verifisert direkte i koden, ikke via kontraktens påstand:

- `app/[locale]/games/[id]/leaderboard/leaderboardContent.tsx:509–513`: i
  `live-always`-grenen er `view = game.status === 'finished' ? 'full' : (…state3 |
  state3.5)`. Låst-kortet (`renderState35` → `formats/state3.tsx:361 ts35('lockedSub')`)
  vises altså til og med `status === 'finished'` — aldri på godkjenning.
- `app/[locale]/games/[id]/leaderboard/holes/page.tsx:67–73`: `draft`/`scheduled`
  redirecter bort, deretter `const isActive = game.status === 'active'`, sendt til
  `DrilldownBody` (`:206`). `holes/formats/drilldown.tsx:310–317` rendrer
  `hiddenBackNineSub` i `isActive`-grenen. Siden bare `active`/`finished` når hit,
  er «ikke aktiv» ⇔ `finished`.
- `lib/games/status.ts`: unionen er `draft | scheduled | active | finished`, og
  `finished` er dokumentert som «Admin har avsluttet spillet». Det finnes ingen
  mellom-status knyttet til godkjenning, så «når arrangøren avslutter spillet» er
  presist for begge flatene.

Kontrakten siterte `leaderboardContent.tsx:509–510` og `holes/page.tsx:71`; faktiske
linjer er 509–513 og 73. Ubetydelig linjedrift, ikke et avvik i innhold.

### (c) docs/uat-empty-states-and-scheduled-status.md-sitatene oppdatert — PASS

Linje 129 og 138 siterer nå de nye strengene ordrett («Resten av tabellen vises når
arrangøren avslutter spillet.» / «Hull 10–18 vises når arrangøren avslutter
spillet.»). `grep -n "godkjen" docs/uat-empty-states-and-scheduled-status.md` gir
null treff — ingen gjenværende gammelt sitat i UAT-dokumentet.

### (d) Ingen tester/snapshots refererer nøklene — PASS

`grep -rn "lockedSub|hiddenBackNineSub"` over `*.ts/*.tsx/*.json/*.md/*.snap` (uten
node_modules) treffer kun katalogene, `state3.tsx:361`, `drilldown.tsx:316` og
kontraktfila. `grep -rln "levert og godkjent"` i tester/snapshots treffer kun
`lib/mail/gameFinishedNotification.test.ts`, som låser mail-strengen
`no.json:5311 bodyBestBall` — en annen nøkkel, urørt av diffen og fortsatt korrekt
(mailen sendes etter at spillet er avsluttet, da alle kort faktisk er godkjent).

### (e) Ingen logikk-endringer — PASS

Diffen inneholder null `.ts`/`.tsx`-endringer. Eneste ikke-copy-fil er
notatfila `.changes/1375-back9-copy-trigger.md` (`type: fix`, `issue: 1375`,
én brødtekstlinje) — i samsvar med malen i `.changes/README.md`.

## Porter (kjørt i denne økten, Node v22.23.0)

- `npx vitest run messages/catalogParity.test.ts` → 1 fil, 2 tester, alle grønne.
- `npm run typecheck` (`tsc --noEmit`) → exit 0, ingen output.

## Hull-jakt (steg 4)

Søkte etter andre steder som fortsatt lover «levert og godkjent»-åpning for
leaderboardet/back 9-låsen:

- `messages/*.json`: alle søster-låser sier allerede riktig trigger
  («holdes hemmelig til admin avslutter spillet», `hullForHullRevealSub`,
  `revealHiddenSub` ×10, `state4.description:2670`). Ingen gjenværende
  approval-formulering på en låst tavle.
- `no/en.json:1885 ctaSubmittedApproved` («Scorekort levert og godkjent. Venter på
  at admin avslutter spillet.») er korrekt som den står — den beskriver spillerens
  egen status og peker allerede på avslutningen.
- `no/en.json:5311 bodyBestBall` (mail) — bevisst utenfor scope per kontrakt, og
  faktisk korrekt.
- `docs/`: eneste gjenværende treff er `docs/audits/2026-07-27-safety-by-design-hcd-audit.md`
  (F34-funnet som ga opphav til #1375). Det er en datert revisjonslogg og skal ikke
  redigeres i etterkant.

Konklusjon: ingen hull kontrakten burde tatt.

## Observasjon (ikke et funn mot denne kontrakten)

`hiddenBackNineSub` hardkoder «Hull 10–18» selv om drilldownen klipper til
*segmentets* første halvdel (`lib/games/holeScope.ts:67 firstHalfHoleNumbersForSegment`).
I et `front9`-spill er de skjulte hullene 6–9, ikke 10–18, så teksten er feil der.
Dette er pre-eksisterende på `main`, handler om hull-området og ikke om triggeren
#1375 gjelder, og er dermed korrekt utelatt fra denne kontrakten. Verdt et eget
issue ved neste berøring av segment-spill.

## Finding-signaturer

Ingen.
