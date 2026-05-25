# Spec: Sideturnering — 14 nye bonus-kategorier

**Issue:** [#169](https://github.com/jdlarssen/golf-app/issues/169) — flere sideturnering-kategorier (albatross m.fl.).
**Versjon:** MINOR-bump (1.18.0 → 1.19.0). Bruker-synlig funksjon.
**Scope-størrelse:** stor utvidelse — 27 → 41 kategorier (27 + 14). 18 nye IDs.

## Problem

Sideturneringen har 27 kategorier i dag (etter v1.2.0). Flere åpenbare achievements mangler: albatross, hole-in-one, konge-på-par-4 (vi har par-3 og par-5 men ikke par-4), rein-halvdel-konsistens, ren runde uten doubles, hot streaks (back-to-back birdies), skill-utfordring på hardeste hull, comeback-kid, allsidighet-priser, og humor-statistikker. Disse er alle ren scoring-utvidelse — datakildene finnes allerede, kun aggregator-blokker mangler.

Issue #169 lister i tillegg `chip_ins`, `sandy_save` og `longest_putt`. Disse krever ny manuell input i scorekortet (per-hull flag eller yardage) og er ute av scope her — egen issue.

## Prior decisions

Carry forward fra eksisterende sideturnerings-arkitektur (v1.2.0 / migrasjon 0026 / `lib/scoring/sideTournamentConfig.ts`):

- **Tier-vektet poeng-skala:** 10p (hovedkonkurranse), 4p lag / 2p individ (skill+rarity), 2p lag / 1p individ (moderate), -2p (lag-blowup), -1p (individ-humor).
- **Lag-aggregat krever ≥2 medlemmer:** alle team-aggregat-kategorier skipper lag med 1 medlem (collapses to individual).
- **Empty-result-guard:** kategorier med 0 vinnere awardes ikke.
- **Tie-håndtering:** flere teams med samme verdi får alle full pot, deduped til én award per team.
- **DB-constraint som whitelist:** `games_side_disabled_categories_valid` lister gyldige IDs. Migrasjon 0027 utvider den.
- **Klassisk-preset låst:** «Klassisk» er kun de 6 v1.1.x-kategoriene. Nye kategorier går i «Full pakke».
- **Stackable per-spiller/per-hendelse:** turkey og solid awarder flere ganger per runde via `findNonOverlappingStreaks`. Mønstret gjenbrukes for `back_to_back_birdies` og `team_no_bogey_hole_coord`.

## Design

### Input-shape-utvidelse

`SideTournamentInput` får ett nytt felt:
- `courseStrokeIndices: number[]` — 18-element array, SI 1..18 per hull. Call-stedet i `app/games/[id]/leaderboard/page.tsx` har dataen (linje 270 — `select('hole_number, par, stroke_index')`) — kun å bygge arrayen i tillegg til `coursePars`. Bare `hardest_hole_winner` bruker den.

### Nye kategorier — Tier «Skill» (4p lag / 2p individ, eller 4p individ)

#### 1. Albatross — `most_albatrosses_team` + `most_albatrosses_individual` (4p / 2p)

- Predikat: `(netto, par) => netto <= par - 3` på `perHoleNetto`.
- Mønster: speil av most_eagles, strammere terskel.
- **Eagles+-overlapp:** `most_eagles_*` forblir inklusiv (netto ≤ par-2), så albatross teller begge steder. Bevisst valg — back-compat, ingen data-migration. Dokumenteres i picker-tekst.

#### 2. Hole-in-one — `most_hole_in_ones_team` + `most_hole_in_ones_individual` (4p / 2p)

- Predikat: `(gross) => gross === 1` på `perHoleGross` (uavhengig av par — kun par-3 er realistisk, men vi gater ikke eksplisitt).
- **Implementasjons-note:** dagens `countMatchesForPlayer`/`Team` tar netto-predikat. Builder kan enten (a) parametrisere helperen med `field: 'netto'|'gross'`, eller (b) inline-loope direkte. Begge akseptable.

#### 3. Konge på par-4 — `king_par4_team` + `king_par4_individual` (4p / 2p)

- Lavest brutto-sum på par-4-hull (best-ball-brutto for lag, individuell sum for individ).
- Mønster: 1:1 kopi av `king_par3_*`/`king_par5_*`. Predikat: `(h) => coursePars[h] === 4`.
- Gates via `hasPar4Holes` — banen må ha minst ett par-4 hull (alle realistiske baner har).

#### 4. Rein halvdel — `clean_front_9` + `clean_back_9` (4p hver, individ)

- For hver spiller: er alle 9 hull i halvdelen netto ≤ par? Det vil si: ingen bogey eller verre.
- Krav: alle 9 hull i halvdelen må ha netto-data (ellers ekskluderes spilleren).
- Spilleren(e) med en rein halvdel får 4p (kan være flere — alle får poeng).
- Tom result-set når ingen har rein halvdel → ingen award.
- Konseptuelt forskjellig fra `best_brutto_f9_*` (sum) — dette er terskel-basert.

#### 5. Ren runde — `no_double_plus_round` (4p individ)

- For hver spiller: er alle 18 hull netto ≤ par+1? (Bogey OK, double-bogey eller verre ikke OK.)
- Krav: alle 18 hull må ha netto-data.
- Spillere som oppfyller: 4p hver. Tie-håndtering: flere kan vinne, alle får poeng.
- Sterkere prestasjon enn rein halvdel — krever konsistens over hele runden.

### Nye kategorier — Tier «Moderate» (2p individ)

#### 6. Hardest-hole winner — `hardest_hole_winner` (2p individ)

- Bruker `courseStrokeIndices` for å finne hull med SI=1 (banens hardeste).
- Lavest brutto på det hullet vinner. Tie → alle vinnere får 2p, deduped per team.
- Bruker brutto (ikke netto) siden det er en pur skill-måling — å spille hardeste hullet bra er imponerende uavhengig av HCP.
- Awards-detalj: `holeNumber` (hvor SI=1 ligger) + `score` (brutto-tallet).

#### 7. Comeback kid — `comeback_kid` (2p individ)

- For hver spiller med fullt spilt F9 OG B9: regn `delta = back9_net_sum - front9_net_sum`.
- Mest negative delta vinner (størst forbedring).
- No-improvement-guard: krever `delta < 0`. Hvis alle har likt eller verre back-9 → ingen award.
- Awards-detalj: nytt `delta`-felt på `SideCategoryAward` (eller gjenbruk `score` med negativ verdi — builder velger).

#### 8. All-rounder birdie — `all_par_groups_birdie` (2p individ)

- For hver spiller: har de minst én birdie (netto < par) på et par-3-hull, OG et par-4-hull, OG et par-5-hull?
- Belønner spredning, ikke spesialisering. Spillere som oppfyller alle tre får 2p.
- Krav: banen må ha minst ett hull av hver par-type (sjekkes opp-front).

#### 9. Even-par-runden — `even_par_round` (2p individ)

- For hver spiller med fullt spilt 18 hull: `total_net === par_total`.
- `par_total = sum(coursePars)`.
- Symbolsk award — eksakt par-runde, hverken over eller under.
- Tie-håndtering: flere spillere med eksakt par-total → alle får 2p.

#### 10. Back-to-back birdies — `back_to_back_birdies` (2p stackable, individ)

- For hver spiller: finn alle non-overlapping streaks av lengde 2 med predikat `(netto, par) => netto < par`.
- Stackable: en spiller med birdie-birdie-birdie-par-birdie får 1 award (de tre første teller som én 2-streak, fjerde er separat, men neste-til-siste birdie står alene).
- **Overlap med turkey:** turkey (3 birdies på rad) krever 3 — 2-streak er en lavere terskel. En spiller med 3 birdies på rad får BÅDE turkey (4p) OG back-to-back birdies for de første 2 (2p). Bevisst — turkey er for «hot», back-to-back er for «warm».
- Awards-detalj: `streakStartHole`, `streakEndHole`, `streakLength=2`, `winnerUserId`.
- Lag-koord-bonus: ikke i v1 — for sjeldent verdt ekstra-pott-mekanikken på 2-streak.

### Nye kategorier — Coord-bonus (lag-koord, stackable)

#### 11. Alle birdied bonus — `team_all_birdied_bonus` (4p × N medlemmer)

- For hvert lag med ≥2 medlemmer: har ALLE medlemmer minst én birdie i runden?
- 4p × N (likt med turkey/solid coord-pott).
- Awardes én gang per runde per lag (ikke stackable per hull).
- Mønster: enkel iterasjon over lag → over medlemmer → har de en birdie?

#### 12. Lag-par-hull coord — `team_no_bogey_hole_coord` (2p × N, stackable per hull)

- For hvert hull: har ALLE medlemmer i laget netto ≤ par på samme hull?
- Stackable per hull — laget kan score dette på flere hull i samme runde.
- Mønster: kopier turkey coord-bonus-logikken men med 1-streak-vindu (ikke 3) og predikat `netto <= par`.
- Krav: lag med ≥2 medlemmer.
- Awards-detalj: `holeNumber`, `coordBonus: true`, `streakLength: 1`.

### Nye kategorier — Humor / penalty (-1p)

#### 13. Verste enkelthull — `worst_single_hole_brutto` (-1p individ)

- For hver spiller: høyeste enkelthull-brutto. Speiler `lowest_single_hole_brutto` men MAX i stedet for MIN.
- Tie: alle vinnere får -1p, deduped per team.
- Awards-detalj: `score` (brutto), `holeNumber`.
- **Hvorfor -1p (ikke -2p som snowman):** snowman er lag-blowup, worst-hole er individ-blowup. Mildere penalty for individuell uflaks.

#### 14. Flest double-bogeys — `most_double_bogeys_individual` (-1p individ)

- For hver spiller: antall hull med netto ≥ par+2.
- Spilleren med flest får -1p. Tie: alle får, deduped per team.
- Triggers oftere enn snowman (lag-blowup), så lavere penalty per gang er passende.

### Datamodell

#### Konstanter (`lib/scoring/sideTournamentConfig.ts`)

```ts
SIDE_TOURNAMENT_POINTS = {
  ...eksisterende,
  // Tier 2 — skill+rarity (4p lag / 2p individ, eller 4p individ for terskel-priser)
  mostAlbatrossesTeam: 4,
  mostAlbatrossesIndividual: 2,
  mostHoleInOnesTeam: 4,
  mostHoleInOnesIndividual: 2,
  kingPar4Team: 4,
  kingPar4Individual: 2,
  cleanFront9: 4,
  cleanBack9: 4,
  noDoublePlusRound: 4,
  // Tier 3 — moderate (2p individ)
  hardestHoleWinner: 2,
  comebackKid: 2,
  allParGroupsBirdie: 2,
  evenParRound: 2,
  backToBackBirdies: 2,
  // Coord-bonus (stackable, lag-koord-stil)
  teamAllBirdiedPerMember: 4,
  teamNoBogeyHoleCoordPerMember: 2,
  // Humor / penalty
  worstSingleHoleBrutto: -1,
  mostDoubleBogeysIndividual: -1,
}
```

`SideCategoryId` union + `ALL_CATEGORY_IDS` utvides med 18 nye IDs:
- `most_albatrosses_team`, `most_albatrosses_individual`
- `most_hole_in_ones_team`, `most_hole_in_ones_individual`
- `king_par4_team`, `king_par4_individual`
- `clean_front_9`, `clean_back_9`
- `no_double_plus_round`
- `hardest_hole_winner`
- `comeback_kid`
- `all_par_groups_birdie`
- `even_par_round`
- `back_to_back_birdies`
- `team_all_birdied_bonus`
- `team_no_bogey_hole_coord`
- `worst_single_hole_brutto`
- `most_double_bogeys_individual`

#### Migrasjon (`supabase/migrations/0027_side_tournament_bonus_categories.sql`)

Utvider `games_side_disabled_categories_valid`-constrainten med de 18 nye IDs. Drop + re-add i én transaksjon.

#### Input-shape (`SideTournamentInput`)

Nytt felt `courseStrokeIndices: number[]` — 18-element array. Bygges i `app/games/[id]/leaderboard/page.tsx` parallelt med `coursePars`. Brukes kun av `hardest_hole_winner`.

#### Picker (`components/admin/SideCategoriesPicker.tsx`)

14 nye entries fordelt på grupper:
- **Skill** (allerede eksisterende gruppe): Albatross, Hole-in-one, Konge på par-4, Rein halvdel (F9+B9 som én collapsable entry eller to separate), Ren runde
- **Moderate**: Hardest-hole, Comeback kid, All-rounder, Even-par, Back-to-back birdies
- **Coord-bonus** (ny gruppe, eller integrer i Skill): Alle birdied, Lag-par-hull coord
- **Humor** (ny gruppe, eller pakk inn under Skill): Verste enkelthull, Flest double-bogeys

Builder velger om coord/humor blir egne grupper eller integreres. Norske labels: «Flest albatrosser», «Flest hole-in-one», «Konge på par-4», «Rein front-9», «Rein back-9», «Ren runde (ingen double)», «Best på hardeste hull», «Comeback kid», «Allsidig birdie-spiller», «Even-par-runden», «To birdier på rad», «Alle birdied (lag-bonus)», «Lag-par-hull (lag-bonus)», «Verste enkelthull», «Flest double-bogeys».

#### Leaderboard-view (`app/games/[id]/leaderboard/SideTournamentView.tsx`)

14 nye render-blokker. Følg mønstret fra eagles/lowest_single_hole_brutto. Group-mapping i `GROUP_BY_CATEGORY` for hver ny ID.

## Edge Cases & Guardrails

- **Solo strokeplay / matchplay:** lag-aggregat-kategoriene (albatross_team, hole_in_one_team, king_par4_team) skipper når <2 lag med ≥2 medlemmer. Coord-bonus-kategoriene (`team_all_birdied_bonus`, `team_no_bogey_hole_coord`) skipper lag med 1 medlem (samme som turkey/solid coord-bonus). Individ-versjonene triggers fortsatt.
- **Spillere uten netto-data:** comeback_kid, clean_*, no_double_plus_round, even_par_round, all_par_groups_birdie krever fullstendig spilt 18 hull (eller halvdel for clean_*). Spillere som mangler hull skippes — ingen feilkast.
- **Hardest-hole winner med tied SI:** hver hull har unik SI 1..18 per design (`course_holes` har UNIQUE constraint per (course_id, tee_box_id, stroke_index)) — ingen tie-problem.
- **Banen mangler par-4:** `king_par4_*` skipper (samme `hasParXHoles`-gate som king_par3/par5).
- **Banen mangler en av par-3/4/5:** `all_par_groups_birdie` skipper (kan ikke møte kriteriet hvis hull-type ikke finnes).
- **Eksisterende ferdigspilte spill:** med `side_disabled_categories = '{}'` (Full pakke) får automatisk de 18 nye kategoriene aktivert ved neste leaderboard-fetch. Risk: lav. Spillerne ser «nye utmerkelser» på gamle spill (feel-good, ikke pengetap).
- **DB-constraint atomær:** migrasjon 0027 må drop + re-add constrainten i én transaksjon.
- **Stackable kategorier kan oversvømme leaderboard:** back_to_back_birdies og team_no_bogey_hole_coord kan triggers mange ganger. Leaderboard-view må håndtere multiple awards av samme kategori per team (samme mønster som turkey/solid stackable).
- **Eagle+ inkluderer albatross:** dokumenteres i picker-hjelpetekst slik at admins forstår at albatross «teller dobbelt» i Full pakke.

## Key Decisions

- **Scope:** 14 nye kategorier (18 IDs) — alle Gruppe A-kandidater fra issue #169 + 10 nye fra brainstorm-runde. Gruppe B (chip-ins, sandy save, longest putt) er ute av scope — egen issue.
- **Stor utvidelse i én kontrakt:** valgt over 2-3 mindre PR-er fordi alle endringene følger samme mønster (kategori-blokk i `calculateSideTournament`, ny ID i picker, ny view-blokk). Splitting ville duplisert review-burden uten å redusere kompleksitet.
- **Eagles+ forblir inklusiv:** back-compat, ingen data-migration.
- **Hole-in-one er gross-basert** (ikke avledet fra netto).
- **Worst-hole + double-bogeys = -1p individ:** mild humor-penalty, mindre alvorlig enn snowman -2p (lag-blowup).
- **Comeback-kid individ-only:** lag-aggregat er ikke meningsfullt definert for back-9-forbedring.
- **Back-to-back birdies overlapper med turkey:** bevisst — turkey er strengere tier (3-streak, 4p), back-to-back er ungrere mål (2-streak, 2p). Spillere med 3-streak får begge.
- **Default-state = aktiv i Full pakke** for nye kategorier.
- **`courseStrokeIndices` ekstra input-felt** — minimal ekstra propagering siden leaderboardet allerede har dataen.

**Claude's Discretion under build:**
- Parametrisering av `countMatchesForPlayer`/`Team` for å støtte både netto- og gross-predikater (parametrisering vs. inline).
- Felt-navn for comeback-kid's delta (`delta` på `SideCategoryAward` vs. gjenbruk av `score` med negativ verdi).
- Picker-grupper (humor som egen gruppe vs. integrert).
- Hvor `hardestHoleWinner`-blokken faller i `calculateSideTournament`-rekkefølgen (anbefaler etter king_par5 siden alle er par-hull-baserte).
- Test-fixtures (basert på eksisterende `sideTournament.test.ts`-stil).
- Versjon-bump til `1.19.0` og CHANGELOG-tagline.

## Success Criteria

- [ ] 18 nye IDs i `SideCategoryId` + `ALL_CATEGORY_IDS` + `SIDE_TOURNAMENT_POINTS` med korrekte poeng-verdier (per tabell over).
- [ ] `SideTournamentInput.courseStrokeIndices` lagt til som nytt felt og populert i `app/games/[id]/leaderboard/page.tsx`.
- [ ] Migrasjon `0027_side_tournament_bonus_categories.sql` opprettet og applied via Supabase MCP. `list_migrations` viser den.
- [ ] 14 nye if-blokker i `calculateSideTournament` (én per kategori — albatross/hole-in-one/king-par4 har team+individ-par i samme «kategori», men hver type-variant er sin egen if-blokk). Hver med isDisabled-gate, empty-guard, og `award()`-kall.
- [ ] Minst 20 nye tester i `lib/scoring/sideTournament.test.ts`. Minimum dekning:
  - Albatross (1 lag + 1 individ)
  - Hole-in-one (1 lag + 1 individ + 1 «ingen ace = ingen award»)
  - Konge på par-4 (1 lag + 1 individ + 1 «ingen par-4-hull = skipped»)
  - Rein halvdel (1 happy F9 + 1 «en bogey = ingen rein»)
  - Ren runde (1 happy + 1 «en double = ingen ren»)
  - Hardest-hole winner (1 happy + 1 tie)
  - Comeback-kid (1 happy + 1 «ingen forbedring = ingen award»)
  - All-rounder (1 happy + 1 «mangler par-5-birdie»)
  - Even-par-runden (1 happy + 1 «over par = ingen award»)
  - Back-to-back birdies (1 happy med 2 streaks + 1 «3-streak teller som 1 award + en separat»)
  - Alle birdied bonus (1 happy + 1 «en spiller mangler birdie = ingen bonus»)
  - Lag-par-hull coord (1 happy med 2 hull + 1 «en spiller bogey på hull = ingen»)
  - Worst-hole (1 happy)
  - Flest double-bogeys (1 happy + 1 «ingen doubles = ingen award»)
- [ ] `SideCategoriesPicker.tsx` viser alle 14 nye kategorier med norske labels og riktig gruppering.
- [ ] `SideTournamentView.tsx` rendrer awards for alle 14 nye kategorier med detail-tekst som matcher mønster.
- [ ] `package.json` bumpet til `1.19.0` og CHANGELOG.md har ny minor-serie-tagline + Teknisk-detaljer.

## Gates

Etter hver chunk (typisk per 2-3 kategorier):

```bash
npx vitest run lib/scoring/sideTournament.test.ts
npx tsc --noEmit
npx eslint lib/scoring/sideTournament.ts lib/scoring/sideTournamentConfig.ts
```

Full suite før evaluering:

```bash
npm run test
```

UI spot-check (manuell): bekreft at picker viser alle 14 nye kategorier under riktig gruppe, at toggle-state lagres riktig, og at leaderboard-renderingen ikke krasjer på awards med stackable/coord-bonus.

## Files Likely Touched

- `lib/scoring/sideTournamentConfig.ts` — 18 nye IDs + 18 nye poeng-konstanter
- `lib/scoring/sideTournament.ts` — `SideCategory`-union, `SideTournamentInput.courseStrokeIndices`-felt, evt. parametrisering av `countMatchesForPlayer`/`Team`, 14 nye if-blokker
- `lib/scoring/sideTournament.test.ts` — minst 20 nye tester
- `supabase/migrations/0027_side_tournament_bonus_categories.sql` — constraint-utvidelse
- `app/games/[id]/leaderboard/page.tsx` — `courseStrokeIndices`-array bygges og passes til `calculateSideTournament`
- `components/admin/SideCategoriesPicker.tsx` — 14 nye picker-entries i grupper
- `app/games/[id]/leaderboard/SideTournamentView.tsx` — 14 nye render-blokker + group-mapping
- `package.json` — version-bump til 1.19.0
- `CHANGELOG.md` — ny minor-serie-tagline + Teknisk-detaljer

## Out of Scope

- **Gruppe B (chip-ins, sandy save, longest putt)** — krever ny scorekort-UX. Egen issue.
- **Most-pars-in-a-row** — duplikat av Solid.
- **Strict eagles split** (ekskluder albatross) — back-compat-risk.
- **Slow-starter / fast-starter** — overlap med comeback-kid.
- **Achievement-badges på profil** — egen feature (krever historisk aggregering på tvers av spill).
- **Animasjoner for sjeldne hendelser** (hole-in-one feiring) — egen UX-issue.
- **Lag-koord-bonus for albatross/hole-in-one** (alle medlemmer scorer samme sjelden hendelse) — for sjeldent til å rettferdiggjøre ekstra-pott-mekanikken.
- **Per-spiller hole-win individuell-versjon** (vs. dagens lag-basert `hole_win`) — separat kategori-konsept som krever egen avgjørelse om netto- vs. brutto-sammenligning, hvem som er motstander, etc.
