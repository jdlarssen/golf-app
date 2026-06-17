# Kontrakt: Liga standings — spiller uten tellende runder er ikke rangert (#664)

## Kontekst

`computeLeagueStandings` har fire `standingsModel`-grener: `total`, `average`, `best_n`, `points`.

I `total`-grenen (linje 156–177 i `lib/league/computeLeagueStandings.ts`) mangler en guard
for spillere som **aldri spilte en tellende runde** under `missedRoundPolicy='penalty'` +
`pointsBased=true` (stableford).

Problemet: `penaltyForRound` returnerer `0` for stableford (`config.pointsBased = true`). En
spiller som hoppet over alle tellende runder akkumulerer dermed `sum = 0` og forblir
`ranked = true` — semantisk umulig å skille fra en spiller som faktisk spilte og scoret 0
stableford-poeng i alle runder.

De tre andre modellene setter korrekt `ranked = false` for spillere med `roundsPlayed === 0`:
- `average`: eksplisitt `if (played.length === 0) ranked = false` (linje 123–124)
- `best_n`: `if (candidates.length === 0) ranked = false` (linje 134–135)
- `points`: `if (roundsPlayed === 0) ranked = false` (linje 155)

Slagspill (`pointsBased=false`) i `total`-grenen er ikke rammet: straffen der er
`worst+1 > 0`, så en aldri-spilt-spiller skiller seg ut rent verdimessig. Men det er
likevel semantisk galt at de er `ranked=true`. Begge tilfellene bør fikses med
én guard.

## Scope

**I scope:**
- Guard i `total`-grenen: `if (roundsPlayed === 0) ranked = false` (før verdi-sum)
- Co-located test (Type A) som skiller «aldri spilt» vs «spilte og fikk 0 poeng»
- Eksisterende tester grønn etter endringen

**Utenfor scope:**
- Endringer i de andre modellene (de har allerede riktig guard)
- UI-endringer for å vise «ikke rangert»-spillere annerledes
- Endringer i `penaltyForRound`-funksjonen

## Filer som endres

- `lib/league/computeLeagueStandings.ts` — legg til `if (roundsPlayed === 0) ranked = false` i `total`-grenen
- `lib/league/computeLeagueStandings.test.ts` — ny test som skiller tilfellene

## Akseptkriterier

1. Spiller som aldri spilte en tellende runde → `ranked=false` i `total`+stableford+penalty
2. Spiller som aldri spilte en tellende runde → `ranked=false` i `total`+slagspill+penalty (konsistens)
3. Spiller som faktisk spilte og fikk 0 stableford-poeng i alle runder → `ranked=true`
4. Ny test (Type A) som verifiserer skillet mellom tilfellene 1 og 3
5. Alle eksisterende tester grønn
6. `npx vitest run lib/league/computeLeagueStandings.test.ts` grønn
7. `npx tsc --noEmit` ren

## Risiko / anmerkninger

- Lav risiko: endringen berører kun `total`-grenen, er én-linje, og speiler et allerede
  etablert mønster fra de tre andre modellene.
- Den eksisterende testen «penalises a player who played nothing under the penalty policy»
  (linje 116–122) forventer `ranked=true` for en aldri-spilt slagspillspiller. Den må
  oppdateres til `ranked=false` — eller fjernes og erstattes av den nye testen som dekker
  begge tilfeller korrekt.

## Implementeringsplan

1. **Skriv failing test** — nytt `it`-blokk i stableford-describe som bekrefter
   `ranked=false` for aldri-spilt + `ranked=true` for spilte-0-runder
2. **Kjør → rød** — bekreft at testen feiler mot dagens kode
3. **Legg til guard** — `if (roundsPlayed === 0) ranked = false` ETTER at `roundsPlayed`
   er satt, MEN FØR `value`-summen (selve if-blokken i `total`-grenen)
4. **Oppdater slagspill-testen** — endre `ranked` forventning til `false`
5. **Kjør → grønn** — alle tester grønne
6. **tsc** — ren
7. **Commit + bump** — patch 1.132.12, CHANGELOG under åpen tema
