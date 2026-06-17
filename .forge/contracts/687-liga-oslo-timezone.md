# Kontrakt #687 — Liga tidssone-opprydding (UTC → Oslo)

## Problem
Auto-genererte liga-rundevinduer (`generateRounds`) bygges på rå UTC-midnatt-grenser,
og noen visnings-etiketter leser UTC-gettere i stedet for Oslo wall-clock. Gir 1–2t
skjevhet i kantene og kan vise feil måned/dato nær månedsskifte (Vercel kjører UTC).
Samme tidssone-familie som #648/#647, som allerede fikset admin-rediger-stiene via
`parseOsloDateTimeLocal`. Generering og visning skal forankres til Europe/Oslo.

## Suksesskriterier
- [x] `generateRounds` forankrer vinduer til Oslo wall-clock: månedlig juni åpner
      `2026-05-31T22:00:00.000Z` (= Oslo midnatt 1. juni) og lukker
      `2026-06-30T21:59:00.000Z` (= Oslo 23:59). Vinter (CET) håndteres: jan åpner
      `2025-12-31T23:00:00.000Z`, lukker `2026-01-31T22:59:00.000Z`.
- [x] weekly/biweekly re-forankrer hvert vindu til Oslo midnatt (DST-stabilt).
- [x] Begge `fmtWindow`-kopier (liga-side + runde/spill-side) viser timestamptz-
      vinduer i Oslo wall-clock; YYYY-MM-DD season-datoer uendret.
- [x] CreateLigaForm måned-preview bruker Oslo-måned, ikke `getUTCMonth()`.
- [x] Gating-semantikk (`windowStatus`, `startLeagueRoundFlight`) uendret —
      kun tz-korreksjon, speiler #648.
- [x] Failing unit-test skrevet først, så implementert grønn.

## Gate
`npx vitest run lib/league/` → 7 filer / 69 tester grønne (inkl. nye Oslo-asserts).
`npx vitest run lib/i18n/` → 165 grønne (ny `formatShortOsloDateWithYearLocale`).
tsc scoped på berørte filer: 0 feil.

## Tilnærming
Gjenbruk #648-mønsteret: `parseOsloDateTimeLocal` (lib/games/gamePayload.ts:36)
for generering, `osloParts` (lib/format/teeOff.ts:34) for måned-label.
- `lib/league/generateRounds.ts`: kalender-aritmetikk i heltall (år/måned/dag),
  hver grense → UTC-instant via `osloInstant()` som ruter gjennom
  `parseOsloDateTimeLocal`. weekly/biweekly stepper kalenderdato + re-forankrer.
- Ny `formatShortOsloDateWithYearLocale` i lib/i18n/format.ts (Oslo-pinned søsken
  av `formatShortDateWithYearLocale`, mønster fra `formatShortOsloDayMonthLocale`).
- Begge `fmtWindow` bruker den for timestamptz-grenen.
- CreateLigaForm:670 `getUTCMonth()` → `osloParts(...).month` (begge 0-baserte).

## Bevis
- Test feilet mot UTC-impl (6 failed / 3 passed), grønn etter fix (9 passed).
- Gate: `npx vitest run lib/league/` 69 passed; `lib/i18n/` 165 passed.
- Ingen nye user-facing strenger (gjenbruker eksisterende dato-formatering).
