# Design — Netto-tall som helper-tekst på spillerkort

**Issue:** [#19 — E-lite-stack med netto under brutto på hull-skjerm i live-mode](https://github.com/jdlarssen/golf-app/issues/19)

**Status:** Godkjent 2026-05-16. Klar for implementasjonsplan.

## Problem

På hull-skjermen viser hvert spillerkort i dag brutto-scoren (det store tallet i score-symbolet) og et `+N SLAG`-merke ved siden av navnet for handicap-slag. Brukeren har ingen rask måte å se *netto*-scoren — hvor mange slag som faktisk teller i konkurransen. Ved 4 brutto med 1 slag fått må brukeren regne i hodet for å vite at netto blir 3.

Issue-en var deferred fra v1.0-leveransen. Vi tar den nå som første post-launch polish.

## Mål

Surface netto-tallet diskret men kontinuerlig på hver spillers kort, uten å rope om handicap-slag som vi allerede signaliserer med `+N SLAG`-badgen.

## Løsning

Vi bruker den eksisterende helper-tekst-slot-en (11px muted tekst under navnet) til å vise netto-tallet.

**Tre tilstander:**

| Tilstand | Helper-tekst |
|---|---|
| `score == null` (ingen score satt) | `"Tap kort = par. Bruk − / +."` |
| `hideNetto === true` (reveal-active) | `""` (tom) |
| Ellers | `"Netto X"` der `X = score − extraStrokes` |

### Hvorfor «Netto X» alltid, ikke bare når extraStrokes > 0

Netto eksisterer i alle tre slag-tilfeller:
- **extraStrokes > 0** (vanlig): netto < brutto
- **extraStrokes == 0** (ingen slag): netto = brutto
- **extraStrokes < 0** (plus-golfer): netto > brutto

Én konsistent regel er enklere å lese enn betinget logikk. Brukeren ser alltid samme tekst-form og vet hvor de skal kikke.

### Hvorfor erstatte «Bekreftet»

«Bekreftet»-teksten dupliserer signal som allerede formidles av:
1. Gylden border-farge på kortet (`rgba(201,169,97,0.5)` mot grå `#E5E0D3`)
2. Sync-pulse-linja nederst i listen (`SyncStatusLine`)

Når netto-tallet flytter inn i slot-en, går «Bekreftet» ut. Reveal-active-tilstanden (hvor netto skjules) får en tom slot — visuelle signaler er nok.

### Hva skjer i reveal-modus

- **Reveal-active** (admin har valgt `score_visibility = 'reveal'`, status `active`): `hideNetto = true` → helper-slot er tom. `+N SLAG`-badgen er også skjult (uendret oppførsel).
- **Reveal-finished** (samme spill, status `finished`): `hideNetto = false` → helper viser «Netto X» som i live.
- **Live (default)** (alle spill med `score_visibility = 'live'`): `hideNetto = false` → helper viser «Netto X».

## Rydding av død kode

Mens vi er i `ScoreCard.tsx`:

1. **Fjern unreachable else-grenen** i helper-tekst-logikken:
   ```ts
   } else {
     helperText = 'Justert · tap igjen for å bekrefte';
   }
   ```
   Caller (`HoleClient.tsx:189`) setter `confirmed = score != null`, så denne grenen kan ikke nås. Rester fra en planlagt to-stegs confirm-flyt som ikke ble implementert.

2. **«Bekreftet»-strengen fjernes** (erstattet av tom slot eller «Netto X»).

3. **`confirmed`-propen beholdes** — den brukes også til border-fargen og er ikke død, bare redundant med `score != null`. En evt. opprydning av API-en er en separat refactor utenfor scope her.

## Out of scope

Disse berøres ikke i #19:
- Score-symbolet (sirkel/firkant + tall) på høyresiden av kortet
- `+N SLAG`-badgen ved siden av navnet
- Scorekort-oversikt (`/games/[id]/scorecard`) — egen issue [#20](https://github.com/jdlarssen/golf-app/issues/20)
- Hull-leaderboard (`/games/[id]/leaderboard/holes`) — har allerede netto-info per spiller
- Multi-player scorekort (`#17`) — egen brainstorming-runde
- `confirmed`-propens API i ScoreCard — egen refactor hvis aktuelt

## Tester som må endres

I `components/hole/ScoreCard.test.tsx`:

- **Slett** (hvis finnes): test for «Justert · tap igjen for å bekrefte»-grenen.
- **Slett**: test som asserter «Bekreftet»-tekst når score er satt.
- **Legg til**:
  - «Renders `Netto X` when score is set and extraStrokes > 0» — eksempel: score 5, extraStrokes 2 → finner «Netto 3»
  - «Renders `Netto X` when score is set and extraStrokes = 0» — eksempel: score 5, extraStrokes 0 → finner «Netto 5»
  - «Renders `Netto X` when score is set and extraStrokes < 0» — eksempel: score 5, extraStrokes −1 → finner «Netto 6» (plus-golfer)
  - «Renders instruction text when score is null» — finner «Tap kort = par. Bruk − / +.»
  - «Renders empty helper when hideNetto is true and score is set» — ingen «Netto»-tekst, ingen «Bekreftet»

## Bumpe-type

PATCH (`v1.0.10`). Brukeren kan gjøre nøyaktig det samme som før — bare med litt mer informativt helper-tekst.

## CHANGELOG-entry-utkast

```markdown
### [1.0.10] - 2026-05-16

**Du ser nå netto-tallet ditt diskret under navnet på hvert hull, så du slipper å regne i hodet.**

<details>
<summary>Teknisk</summary>

#### Changed
- `ScoreCard` helper-tekst viser nå «Netto X» (= score − extraStrokes) når score er satt, i stedet for «Bekreftet». Konsistent for både plus-, scratch- og handicap-spillere.
- Helper-slot er tom i reveal-active mode (samme regel som `+N SLAG`-badgen som allerede skjules der).

#### Removed
- Unreachable «Justert · tap igjen for å bekrefte»-grenen i helper-tekst-logikken (rester fra ikke-implementert to-stegs flyt).
- «Bekreftet»-teksten — den dupliserte signalet fra gylden border + sync-pulse.

</details>
```

## Closing-kommentar-utkast (på issue #19)

```markdown
## Teknisk

- `components/hole/ScoreCard.tsx`: helper-tekst-logikken erstattet med tre-tilstands-regel (score == null → instruksjon, hideNetto → tom, ellers → «Netto X»).
- Fjernet unreachable else-gren + «Bekreftet»-strengen.
- `components/hole/ScoreCard.test.tsx`: byttet ut tester for «Bekreftet»/«Justert» med ny dekning for de tre nye tilstandene + plus-golfer-edgecase.
- Commit: <SHA>

## For Jørgen

Du ser nå **netto-tallet ditt** under navnet på hvert spillerkort på hull-skjermen — for eksempel «Netto 3» når du har scoret 4 med 1 slag fått. Slipper å regne det i hodet. Det vises også for plus-golfere som «gir tilbake» et slag på hullet. I skjult-modus (når admin har valgt at netto-tall skal avsløres ved spillslutt) er linja tom — akkurat som «+N SLAG»-merket allerede er skjult der.
```
