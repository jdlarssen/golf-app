# Players-first opprett-flyt + valgbar spillmodus + variabel lagstruktur — designdokument

**Dato:** 2026-05-23
**Status:** Godkjent design, klart for implementeringsplan
**Foranliggende:** [GitHub Issue #41](https://github.com/jdlarssen/golf-app/issues/41) — blokkerer klubb-skala
**Dekker:** #41 (denne epic-en), [#46](https://github.com/jdlarssen/golf-app/issues/46) (solo-turnering), delvis [#43](https://github.com/jdlarssen/golf-app/issues/43) (stableford — solo-varianten)

## Bakgrunn

Dagens admin-flyt for å opprette spill er hardkodet rundt én bestemt format-pakke: 4 lag × 2 spillere = nøyaktig 8 spillere, best-ball-netto-scoring. Hardkodingen ligger spredt på tre nivåer (UI: `GameForm.tsx` med `nextAvailableTeam` + `togglePlayer`-guard; validation: `gamePayload.ts` med team-balance-check; DB: `game_players.team_number/flight_number NOT NULL CHECK 1..4`). Det blokkerer både klubb-skala (større felt enn 8) og alle nye spillmoduser på roadmap (#43–#47).

Denne epic-en bryter opp hardkodingen og introduserer en arkitektur for valgbar spillmodus + variabel lagstruktur. Vi shipper en konkret andre modus — **Stableford (solo)** — i samme leveranse for å validere at arkitekturen faktisk fungerer for noe annet enn best-ball.

## Scope og avgrensing

**Inkludert i denne leveransen:**
- DB-migrasjon som åpner for flere modes (game_mode + mode_config).
- Refaktorering av GameForm-flyten til «spillere først, så modus, så lagstruktur».
- Scoring-router-lag i `lib/scoring/` med to konkrete moduser: dagens best-ball-netto + ny solo stableford.
- Full spiller-opplevelse for solo stableford: opprett → invitasjoner → tasting → leaderboard → reveal → completion-mail.
- Side-tournaments (LD/CTP) fungerer for solo-modus uten egen design-runde — de er per-spiller, ikke per-lag.
- Migrering av det ene eksisterende prod-spillet (status finished) til `game_mode='best_ball_netto'` via default-verdi.

**Eksplisitt utenfor scope:**
- Par-stableford og 4-mann-stableford (vises som disabled «kommer snart»-tiles i UI — egne issues senere).
- Andre spillmoduser fra roadmap: Matchplay (#45), Texas scramble (#44), Ryder Cup (#47).
- Klubb-skala-relaterte ting: groups-tabell (#49), admin per gruppe (#50).
- Stableford-modifikatorer (modified stableford, vegas, etc.) — standard poeng-tabell holder.
- Endring av «best ball netto» fra hardkodet 4×2 til variabel lagstruktur — bortsett fra at det nå er eksplisitt valgt via modus + lagstørrelse-tiles.

## Mentale modell: to ortogonale aksene

Sentralt: vi skiller **modus** fra **lagstruktur** som to selvstendige valg, fordi de er konseptuelt forskjellige og kan kombineres fritt.

- **Modus** = scoring-system. Hva bestemmer hvem som vinner?
  - Stableford: poeng per hull (par=2, birdie=3, ...), høyest total vinner.
  - Best ball netto: sum av beste netto-resultat per hull per lag, laveste vinner.
- **Lagstruktur** = hvor mange spillere per lag.
  - Solo (1), Par (2), 4-mann (4).

For v1 lanserer vi kun to konkrete kombinasjoner:
- **Stableford + Solo** (ny).
- **Best ball netto + Par** (dagens, men nå eksplisitt valgt).

Andre kombinasjoner vises i UI-en som disabled-tiles med «kommer snart»-tekst. Det er en bevisst beslutning: gir admin en tydelig roadmap-melding uten ekstra implementasjonskode, og fremtidige moduser kan «slå på» en kombinasjon ved å aktivere en tile.

## Beslutninger (med begrunnelser)

### 1. Discriminated union + JSONB i DB-laget

`games`-tabellen får to nye kolonner: `game_mode TEXT NOT NULL` (CHECK begrenset til kjente moduser) og `mode_config JSONB NOT NULL DEFAULT '{}'`. Mode-spesifikk konfigurasjon (lagstørrelse, antall lag, stableford-poeng-tabell) lagres i JSONB-blobben.

Alternativene var (a) egen tabell per modus, (b) ren TS-router uten DB-endring. (a) ble forkastet fordi det krever dobbel join overalt, full RLS-rewrite per ny modus, og er overkill for et planlagt felt på ~5 moduser. (b) ble forkastet fordi RLS-policy ikke kan gate per modus uten en kolonne å filtrere på, og fordi modus blir «magisk» usynlig i schema-en.

JSONB-valget gir oss fleksibilitet til å legge til nye moduser uten DB-migrasjon (kun mode-spesifikk validator i app-laget), samtidig som vi beholder typesikkerhet i TS-laget via discriminated unions.

### 2. `team_number` og `flight_number` blir nullable

For solo-modus eksisterer det ingen lag — derfor kan ikke disse kolonnene være `NOT NULL` lengre. Vi beholder CHECK-constraints for området (1..4 når satt), men tillater null. En ny CHECK sikrer at de er konsistent satt eller konsistent null (ikke én av dem).

RLS-policy fra `0002_rls_policies.sql` som bruker `flight_number` for «samme flight ser hverandre»-visibility må utvides. For solo-modus erstattes flight-visibility med «alle game-medlemmer ser hverandre under aktivt spill», siden det uansett er individuell konkurranse og det ikke er noe «mitt lag vs deres lag»-narrativ å beskytte.

### 3. Modus låses etter publisering

Når spillet er publisert kan ikke modus byttes — admin må slette og lage nytt hvis hun ombestemmer seg. Begrunnelse: bytte av modus midt i en turnering korrumperer scoring-historikken (samme `scores`-rader, ulik tolkning). Slett-flyten finnes allerede med navn-konfirmasjon, så friksjonen er akseptabel for en sjeldent forekommende hendelse. Bytte er fritt mens spillet er kladd (ikke publisert).

### 4. Stableford bruker netto-score, standard poeng-tabell

Standard tabell (etter netto-strokes mot par): par=2, birdie=3, eagle=4, double-eagle=5, bogey=1, double-bogey-eller-værre=0. Lagres som `pointsTable: 'standard'` i `mode_config` for å åpne for modifikatorer senere uten DB-migrasjon.

Tiebreak-regelen gjenbruker eksisterende 5-tier-cascade fra `lib/scoring/tiebreaker.ts`, men anvendt på poeng (høyest vinner) i stedet for strokes (lavest vinner): siste 9 poeng, så 6, så 3, så hele 18, så countback per hull. Færre kodelinjer enn å skrive en ny cascade for stableford.

### 5. Modus-velger med ikoner, lagstørrelse-velger uten

Modus-tiles får ikoner som signaliserer scoring-konseptet (stilisert poeng-tavle for stableford, lag-flagg-grid for best-ball). Lagstørrelse-tiles bruker bare tall + tekst («Solo / 1p», «Par / 2p», «4-mann / 4p»). Begrunnelse: modus er det semantisk distinkte hovedvalget; lagstørrelse er en sekundær parameter. Hierarkiet i UI-en speiler den mentale modellen.

### 6. Disabled-tiles for fremtidige modes-kombinasjoner

Når admin har valgt en modus, vises alle tre lagstørrelse-tiles, men de som ikke er implementert i v1 er grayed-out med liten «kommer snart»-tekst. Eksempler:
- Modus = Stableford: Solo aktiv, Par disabled, 4-mann disabled.
- Modus = Best ball: Par aktiv, Solo og 4-mann disabled.

Begrunnelse: ingen kostnad for å vise dem (rene UI-tiles), tydelig kommunikasjon av roadmap, og når en ny kombinasjon implementeres er det kun en flag som flippes.

### 7. Modus-chip i admin-listen, ingen filter

`/admin/games`-listen får en liten chip ved siden av hvert spillnavn som viser modus («Stableford» eller «Best ball»). Bruker dagens `StatusChip`-mønster med ny variant for modus. Holder admin orientert når flere moduser blandes.

Vi legger IKKE inn et modus-filter på listen i v1 — med ~5 spill totalt er det ikke nødvendig, og kan komme som senere QoL-justering hvis volum vokser.

### 8. Reveal-flyt for solo: topp 3 podium med collapsed rangering

Når en solo stableford-turnering avsluttes, viser reveal-flyten:
- **Topp 3 podium** med 1., 2., 3. plass — gull / champagne / sølv-bronse fargekoding, konfetti på vinneren. Reuser dagens podium-pattern fra best-ball reveal med tilpasninger.
- **Resten av rangeringen** vises collapsed under podiet (klikk-til-utvid). Holder fokus på vinnerne uten å skjule informasjonen for de nysgjerrige.

Skaler-er for 4 spillere så vel som 30. Hvis det er færre enn 3 totalt, vises bare de som faktisk har spilt — ingen tomme podium-trinn.

### 9. Spiller-opplevelse: minimal endring fra best-ball

For å minimere refaktor-risiko og holde UX-konsistens gjenbruker vi mest mulig av eksisterende komponenter for solo-modusen, med små tilpasninger:

- **Spill-hjem-side:** Fjerner «du er på lag X»-strip-en, erstatter med «individuell stableford-turnering»-undertittel.
- **Scorekort-flyt:** Toppen viser «Dine poeng: N» i stedet for «Lagets totalsum: N». Per-hull-tasting er identisk. Når et hull er ferdig-tastet vises både netto-score og stableford-poeng for hullet (f.eks. «-1 netto, 3 poeng»).
- **Lever-flyt:** Tekst-justering — «Lever ditt scorekort» i stedet for «Lever lagets scorekort».
- **Leaderboard underveis:** Ny flat-liste-variant sortert på poeng. Hver rad: rank, spillernavn, poeng-total, chip med «X hull spilt». Ingen lag-gruppering, ingen lag-totaler. Reuser dagens fairway-bakgrunn og typografi-tokens for visuell konsistens.

### 10. Side-tournaments uten egen design-runde

LD- og CTP-side-tournaments er per-spiller (admin plukker vinneren per hull), ikke per-lag. Eksisterende UI for å sette side-tournament-vinnere bruker allerede en flat spiller-velger, så det fungerer like for solo og lag-modes. Kun små copy-justeringer ved behov.

## Datamodell

### `games`-tabellen

To nye kolonner:

| Kolonne | Type | Constraints | Beskrivelse |
|---------|------|-------------|-------------|
| `game_mode` | text | NOT NULL, CHECK i (`'best_ball_netto'`, `'stableford'`), DEFAULT `'best_ball_netto'` for backfill | Modus-discriminator |
| `mode_config` | jsonb | NOT NULL, DEFAULT `'{}'::jsonb` | Mode-spesifikk konfig (lagstørrelse, poeng-tabell, ...) |

Default droppes ETTER backfill av det eksisterende spillet, slik at nye spill må velge modus eksplisitt.

### `mode_config`-shape per modus

```
best_ball_netto: { team_size: 2, teams_count: 4 }
stableford:      { team_size: 1, points_table: 'standard' }
```

TypeScript-typen er en discriminated union på `kind`-felt for å gi narrowing i koden:

```typescript
type GameModeConfig =
  | { kind: 'best_ball_netto'; team_size: 2; teams_count: 4 }
  | { kind: 'stableford'; team_size: 1; points_table: 'standard' };
```

Fremtidige varianter (par-stableford, 4-mann-stableford) utvides typen uten DB-migrasjon — kun mode-validator i app-laget må håndtere den nye konfig-shape.

### `game_players`-tabellen

Endringer:
- `team_number` blir nullable, CHECK forblir 1..4 når satt.
- `flight_number` blir nullable, CHECK forblir 1..4 når satt.
- Ny CHECK: `team_number` og `flight_number` må være konsistent satt eller konsistent null (ikke én av dem).

### RLS-policy-justering

Dagens flight-baserte visibility i `0002_rls_policies.sql` utvides: for spill der `flight_number is null` (solo-modus) gjelder en bredere policy — alle game-medlemmer ser hverandres scores under aktivt spill. Etter `games.status = 'finished'` er all visibility allerede åpen for alle game-medlemmer, så ingen endring der.

## UI-flyt: opprett-spill

```
1. Bane + tee + navn + dato (uendret topp-seksjon)
2. Velg spillere — flat checkbox-liste, ingen auto-lagtilordning
3. Velg modus — to tiles med ikoner
   ├── 🏌️ Stableford
   └── ⛳ Best ball netto
4. Velg lagstørrelse — tre tiles (modus-spesifikk aktivering)
   ├── Solo (1p)
   ├── Par (2p)
   └── 4-mann (4p)
5. Lag-tilordnings-grid (vises kun hvis lagstørrelse ≥ 2)
   └── Best ball + Par: dagens 4×2-grid med spillere fra steg 2
6. Lagre som kladd / Publiser
```

**Aktive kombinasjoner i v1:**
- Stableford + Solo
- Best ball netto + Par

**Validering ved publisering:**
- Stableford solo: minst 1 spiller, ingen øvre grense.
- Best ball netto par: nøyaktig 8 spillere, alle plassert i 4 lag à 2 (dagens regel uendret).

## Scoring-arkitektur

Mode-router i `lib/scoring/index.ts` som switcher på `games.game_mode` og delegerer til mode-spesifikk modul. Eksisterende `bestBall.ts` flyttes til `lib/scoring/modes/bestBallNetto.ts` uten funksjonell endring — kun rename + ny eksport-shape. Ny `lib/scoring/modes/stableford.ts` for solo-stableford-beregning. Felles helpers (`courseHandicap`, `strokeAllocation`, `tiebreaker`, `scoreShape`, `scoreTone`) forblir i `lib/scoring/`-root og gjenbrukes på tvers.

Mode-router returnerer en discriminated union (`ModeResult`) slik at konsumenter (leaderboard-views) får eksplisitt narrowing per modus.

## Migrering av eksisterende data

Prod inneholder per d.d. ett enkelt spill (status `finished`). Migrasjon:
- `game_mode`-kolonne får `DEFAULT 'best_ball_netto'` → eksisterende rad får automatisk korrekt verdi.
- `mode_config` får `DEFAULT '{}'::jsonb` initialt, og en `UPDATE`-setning fyller inn `{ team_size: 2, teams_count: 4 }` for alle pre-eksisterende best-ball-spill.
- DEFAULT på `game_mode` droppes etter backfill for å tvinge eksplisitt valg på nye spill.

`game_players`-rader for det eksisterende spillet har `team_number` og `flight_number` satt allerede — ingen endring nødvendig.

## Test-strategi

- **`lib/scoring/modes/stableford.ts`:** Ny test-fil (`stableford.test.ts`) med samme TDD-mønster som `bestBall.test.ts`. Dekker standard poeng-tabell, edge-cases (eagle, double-eagle, double-bogey-eller-værre), tiebreak-cascade.
- **`lib/scoring/modes/bestBallNetto.ts`:** Eksisterende `bestBall.test.ts` flyttes/oppdateres med ny import-sti, ingen test-endring.
- **`lib/scoring/index.ts` (mode-router):** Liten test som verifiserer at router delegerer riktig per `game_mode`.
- **`lib/games/gamePayload.ts`:** Eksisterende `actions.test.ts` utvides med solo-stableford-test-suite (samme dekningsmønster som best-ball-tests).
- **`GameForm.tsx`:** I dag uten component-test (kjent gap). Vi legger til minimal component-test for kritiske flow-paths før refaktorering: «velg modus → lagstørrelse-tiles vises betinget», «velg solo stableford → ingen lag-grid». Reduserer regresjonsrisiko.
- **Leaderboard-views:** Eksisterende tester for best-ball-view består. Ny component-test for `SoloStablefordView` med representativ data.

## Implementerings-rekkefølge (overordnet)

Konkret fase-deling formuleres i implementeringsplanen, men overordnet:

1. **DB-migrasjon + RLS-justering** først, fordi alt annet bygger på det.
2. **Scoring-router + mode-modulene** (TDD: solo stableford grønn før UI rør den).
3. **Validation-laget** refaktoreres til mode-aware payload-bygging.
4. **GameForm-restrukturering** med players-first-flyten og mode/lagstørrelse-velgere.
5. **Leaderboard-views** for solo stableford (ny `SoloStablefordView` + state-router).
6. **Reveal-flyt + completion-mail** for solo stableford (podium-component med collapsed rest).
7. **Side-tournaments verifisering** (sannsynligvis kun copy-justering, sjelden ny kode).
8. **Admin-liste modus-chip + small details**.

## Åpne risiko-punkter

- **RLS-endring** krever testing med multiple game_modes side om side for å sikre at policy ikke utilsiktet åpner eller stenger noe.
- **GameForm-refaktorering** er den største enkeltkomponenten i admin (~1000+ LOC i dag). Pre-test before refactor reduserer risiko, men det er fortsatt mest sannsynlige stedet for regresjon.
- **Eksisterende leaderboard-views** har flere states (3, 4, 5, reveal). Hver må håndtere både best-ball og solo. State-routing-logikken må utvides — ikke triviell.
- **Discriminated union i TS-laget** krever at alle nye konsumenter narrower riktig. Vi har 5 kjente konsumenter i dag; nye må følge mønsteret.

## Oppfølgings-issues etter denne leveransen

Som naturlige neste steg (filer egne issues, ikke shipped her):
- Par-stableford (2-mann, best-ball-stableford-aggregering).
- 4-mann-stableford (4-mann, best-ball-stableford-aggregering).
- Modified stableford-modifikatorer.
- Andre roadmap-moduser: Matchplay (#45), Texas scramble (#44), Ryder Cup (#47).
- Klubb-skala-relaterte: groups (#49), admin per gruppe (#50).
