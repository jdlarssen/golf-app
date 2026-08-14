# Kontrakt: Låst back 9-copy skal fortelle riktig trigger (#1375)

Kilde: kontrakt-kommentar på issue #1375 (kontrakt-smeden). Re-verifisert mot
main ved byggestart 2026-08-14: begge nøkler hadde gammel copy (no/en:2532/2682),
og koden åpner på `game.status === 'finished'` (`leaderboardContent.tsx:509–510`,
`holes/page.tsx:71`) — aldri på godkjenning.

## Design (bygget)

Ren copy-endring, fire strenger + to docs-sitater:
- no `lockedSub` → «Resten av tabellen vises når arrangøren avslutter spillet.»
- no `hiddenBackNineSub` → «Hull 10–18 vises når arrangøren avslutter spillet.»
- en `lockedSub` → "The rest of the board is shown when the organizer ends the game."
- en `hiddenBackNineSub` → "Holes 10–18 are revealed when the organizer ends the game."
- `docs/uat-empty-states-and-scheduled-status.md:129,138` siterer nye strenger.

## Success Criteria

- [x] Begge nøkler i begge locales sier «arrangøren avslutter spillet»-sannheten.
  **Evidens:** diff messages/ = nøyaktig 4 endrede verdilinjer; ordvalg matcher
  søster-copyene («avslutter spillet», «arrangøren»). Humanizer: ingen tells.
- [x] Ingen andre strenger eller logikk endret; ingen snapshot-diffs.
  **Evidens:** ingen tester/snapshots refererer nøklene (grep verifisert;
  gameFinishedNotification-treffet er en annen, fortsatt korrekt mail-streng);
  `catalogParity.test.ts` + `npm run typecheck` grønne. Logikk-gatene urørt.

## Gates

tsc + catalogParity grønne lokalt; full vitest kjøres av pre-push/CI.
Staging-klikk: GJENNOMFØRT 2026-08-14 — E2E best_ball-spill med ferdig front 9:
både lockedSub (leaderboard state3.5) og hiddenBackNineSub (drilldown) viste ny
tekst; bevis + staging-verified-label på PR #1603; testdata slettet.

## Commits

- fix(leaderboard): locked back-9 copy states the real unlock trigger
