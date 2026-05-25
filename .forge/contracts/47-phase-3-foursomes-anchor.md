# Arkitektur-anker: Ryder Cup fase 3 — foursomes matchplay (2v2 alt-shot)

**Type:** Anchor-doc, ikke build-kontrakt. Foursomes er den arkitektonisk mest krevende fasen — ny scoring-modell som ikke mapper rent til dagens per-user per-hole score-tabell. Full build-kontrakt skrives når fase 3 starter.

**Parent:** [#47](https://github.com/jdlarssen/golf-app/issues/47) (lukket ved fase 1-merge)
**Bygger på:** Fase 1 — cup-grunnmur. Uavhengig av fase 2.

## Retning

Ny `game_mode = 'foursomes_matchplay'`. 2v2 alt-shot: **én ball per lag**, spillerne alternerer slag. Per hull = lagets faktiske slag-antall (ikke individuell-score). Sammenlikn lag1.score vs lag2.score per hull som matchplay.

**Det fundamentale arkitektur-spørsmålet:** dagens [`scores`-tabell](supabase/migrations/0001_initial_schema.sql) keyer `(game_id, user_id, hole_number)`. For foursomes har laget én score per hull, ikke per spiller. To muligheter:

**A. Texas-scramble-pattern (anbefalt utgangspunkt):**
- Kaptein-spilleren (deterministisk valgt via `min(userId)` per side, som Texas i dag) eier `scores`-radene
- Begge spillere kan taste, men score lagres mot kaptein-id
- Ingen DB-skjema-endring nødvendig — gjenbruker Texas-mønsteret 1:1
- Forutsetter at fase 1 ikke har gjort scores-modellen mer rigid

**B. Eksplisitt team-scoring:**
- Ny kolonne `scores.team_number` (nullable), eller helt ny `team_scores`-tabell
- Mer normalt datamodell, men krever skjema-arbeid og påvirker eksisterende scoring-queries

**Default-strategi:** A først (Texas-pattern). B er fallback hvis vi finner harde edge-cases ved bygg.

## Constraints fase 1 må respektere

- **Ikke gjør `scores`-tabellen mer rigid** — fase 1 må ikke legge til constraints som forutsetter at hver spiller har score per hull. La det stå åpent for Texas-pattern.
- **Cup-leaderboard-aggregator må håndtere foursomes-result-shape** — beskrevet i fase 2-anker
- **Scorekort-arkitektur i fase 1** (for singles) bør ikke anta «én bruker per scorekort». Selv singles-scorekortet bør lese fra `scores`-tabellen generisk, slik at fase 3 kan bytte til «team-scorekort hvor begge taster» uten å rive opp UX-pattern.

## Key unknowns (avgjøres ved build)

- **Scorekort-UX:** to spillere på samme scorekort, begge kan taste samme hull. Real-time-sync så de ikke overskriver hverandre? Anbefalt: siste-skriver-vinner med tydelig visning av hvem som tastet sist (timestamp + initialer).
- **Combined handicap:** foursomes bruker kombinert handicap (NGF-konvensjon: 50% av (lavest + høyest) per 2-mannslag, eller spesifikk WHS-formel). Trenger ny helper `foursomesTeamHandicap(player1Hcp, player2Hcp)`.
- **Tee-valg per spiller:** foursomes på Ryder Cup-nivå er kjønnsdelt-tee tillatt (par med ulik tee). Tørny støtter allerede [per-spiller-tee fra #48](https://github.com/jdlarssen/golf-app/issues/48) — gjenbrukes uendret.
- **Hvem taster først (åpning)?** I real-spill bestemmes det av kapteinen. Tørny: bare la begge ha lik tilgang.
- **Validator-regler:** krev eksakt 4 spillere fordelt 2v2 i game-form. Speil par-stableford-mønsteret.

## Avhengigheter

- **Fase 1 må være shipped** — bygger direkte på cup-wrapper
- **Ingen avhengighet til fase 2 (four-ball)** — uavhengige scoring-modes
- **Fase 4 (templating)** vil bygge på dette for full Ryder Cup-presets

## Estimat

Stor — ~5-7 dager: ny scoring-modell (team-score per hull → matchplay-overlay), team-scorekort-UX, kapteinship-mønster, sync/realtime for samtidig-tasting, combined-handicap-helper, validator, tester.

## Out of scope for fase 3

- **Greensome** (begge slår fra tee, plukker beste, alt-shot derfra) — egen variant. Defer til behov.
- **Mixed foursomes** (par av ulike kjønn) — håndteres automatisk via eksisterende per-spiller-tee-mekanisme.

## Build-kontrakt skrives ved fase 3-start

Foursomes har høyest risiko for arkitektur-overraskelser. Build-kontrakten må starte med ny scout-runde mot da-eksisterende kode + grundig diskusjon av scorekort-UX. Estimer 2-3 timer på selve kontrakt-skrivingen pga. kompleksitet.
