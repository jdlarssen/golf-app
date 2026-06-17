# Kontrakt #703 — best_n bruker svakere aldri-spilt-guard

## Problem

`computeLeagueStandings` (`lib/league/computeLeagueStandings.ts`) markerer en
spiller som `ranked = false` når `roundsPlayed === 0` i grenene `total`,
`average` og `points`. `best_n`-grenen brukte i stedet en svakere **global**
sjekk (`if (candidates.length === 0)`), som bare slo ut når HELE feltet manglet
runder. I en `best_n`-liga med blandet deltakelse fikk en spiller som aldri
stilte til start derfor en straffe-fylt verdi og ble rangert som «aktiv» — samme
feilklasse som #664 rettet for `total`. (#664-commit-meldingen 348f0f06 hevdet
feilaktig at `best_n` allerede hadde guarden.)

## Suksesskriterier

- [x] En aldri-spilt spiller (`roundsPlayed === 0`) i en `best_n`-liga får
  `ranked === false` og `rank === null`, og sorteres sist (unranked).
  Bevis: ny test `#703: a never-played player is unranked even when other rounds have results` (computeLeagueStandings.test.ts:227) — PASS.
- [x] `best_n`-guarden bruker den SAMME per-spiller-sjekken
  (`roundsPlayed === 0 ⇒ ranked = false`) som `total`/`average`/`points`.
  Bevis: fiks på `computeLeagueStandings.ts:134-140` (erstattet `candidates.length === 0` med `roundsPlayed === 0`).
- [x] Gjelder begge retninger: slagspill (lavest best) og stableford
  (poeng-basert). Bevis: oppdaterte tester for begge — slagspill `#703: a never-played player is unranked under best_n` (test.ts:189) + stableford `best_n: a never-played no-show is unranked and sorts last (#703)` (test.ts:369) — begge PASS.
- [x] En spiller som PLAYED ≥1 men <N runder beholdes fortsatt med penalty-fill
  (ingen regresjon på den lovlige fyll-stien). Bevis: `penalty-fills up to N for a player who PLAYED at least one but fewer than N rounds` (test.ts:179) — PASS.

## Gates

- [x] `npx vitest run lib/league/computeLeagueStandings.test.ts` → 34 passed.
- [x] `npx vitest run lib/league/` → alle grønne (se #677-kontrakt for samlet kjøring).

## Approach

Ettlinjes-bytte i `best_n`-grenen: erstatt `if (candidates.length === 0)` med
`if (roundsPlayed === 0)`. `candidates`-arrayet beholdes (det bygges fortsatt for
`else`-grenen). Verdien for en aldri-spilt spiller faller da til initialverdien
`0` (samme som `average`/`points` gjør), i stedet for penalty-fyll-summen — riktig,
siden en uranket spiller ikke har en meningsfull sesong-verdi ennå.

To eksisterende tester kodet det gamle (feil) kontrakts­utfallet
(`ranked === true` for aldri-spilt under `best_n`) og ble oppdatert til å hevde
det korrigerte utfallet. Dette er en bevisst oppførsels-endring drevet av issuet,
ikke en «mens jeg var her»-endring. Den lovlige penalty-fill-stien (spilte ≥1
runde) ble flyttet til sin egen test for å holde de to tilfellene adskilt.
