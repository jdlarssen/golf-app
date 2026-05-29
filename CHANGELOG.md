<!-- ─────────────────────────────────────────────────────────────────────
     Format-konvensjoner: les docs/changelog-conventions.md FØR ny oppføring.
     Tre-lags struktur (tema-heading + tagline-blockquote + Teknisk-details),
     språk-kvalitet på taglines (humanizer-skill), og minor-serie-wrapping
     er dokumentert der.
     ───────────────────────────────────────────────────────────────────── -->

# Changelog

Alle bruker-synlige endringer i Tørny logges her. Versjonering følger [Semantic Versioning](https://semver.org/lang/no/).

Pre-1.0.0 (`0.x.y`) regnes som alpha — vi er fortsatt under uttesting med kompisgjengen. Disiplinen ble innført ved `0.2.0`; alt før det er samlet under «Pre-disiplin».

Hver oppføring begynner med en kort stakeholder-tagline på vanlig norsk satt som blockquote (`> …`) — hva endringen betyr for deg som bruker — etterfulgt av en sammenfoldbar **Teknisk**-seksjon med utvikler-prosa i [Keep a Changelog](https://keepachangelog.com/no/)-stil. Minor-serier (`0.X.y`) er gruppert under et tema-heading med kort sammendrag; kun den ferskeste serien står åpen, alle eldre er sammenfoldet som standard for å holde fila lett å scrolle.

Regler for når en bump utløses er beskrevet i [CLAUDE.md](CLAUDE.md) under «Versjonering / CHANGELOG».

---

## 1.51.y — Round Robin (roterende partnere)

Issue [#280](https://github.com/jdlarssen/golf-app/issues/280), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Firespillers-format der partner-konstellasjonen bytter hvert sjette hull — alle spiller med og mot hverandre. Valgbart under Kompis i opprett-spill-wizarden.

### [1.51.0] - 2026-05-30

> Du kan nå opprette et Round Robin-spill for fire kompiser. Partnerne bytter hvert sjette hull — hull 1–6 spiller du med én, hull 7–12 med en annen og hull 13–18 med den siste — slik at alle har spilt med og mot hverandre når runden er ferdig. Appen regner best netto per side hvert hull, og den med flest hullseire totalt vinner. Du finner spillformen under Kompis i opprett-spill-wizarden.

<details>
<summary>Teknisk</summary>

Round Robin gjenbruker fourball matchplay-motorens per-hull-beregning (`applyAllowance` + `bestBallForHole` + `classifyMatchplayHole`) og handicap-modell (allowance_pct, 85 % WHS-standard). Scoring-modulen er en tynn rotasjons- og aggregeringswrapper — ingen ny tabell (rotasjonen er ren deterministisk funksjon av spillerslot + hull).

#### Added
- [`supabase/migrations/0055_round_robin.sql`](supabase/migrations/0055_round_robin.sql) — seed av format-rad + intent-mapping (sekundær under Kompis, sort_order=100).
- `app/admin/games/new/sections/RoundRobinSetup.tsx` — wizard-step som viser fire spillerslotter (A/B/C/D) med rotasjonsforklaring. Ingen shuffle-knapp (alle permutasjoner gir identiske totaler). Type C-render-test.

#### Changed
- `app/admin/games/new/useGameFormState.ts` — `isRoundRobin`-flag, `roundRobinAllowancePct`-state (default 85), `roundRobinOrder` (deterministisk valgrekkefølge), `roundRobinPlayersValid` (krever nøyaktig 4 spillere), `canPublish` + `missingForPublish` wired for Round Robin.
- `app/admin/games/new/GameWizard.tsx` — renderer `RoundRobinSetup` og `AllowanceField` for `round_robin_allowance_pct`, skjuler generisk `TeamSizeSelector` for Round Robin. Hidden input for allowance-prosenten i FormData.
- `app/admin/games/new/GameForm.tsx` — `round_robin_allowance_pct?: number` lagt til `InitialValues`.
- `app/admin/games/new/useGameFormState.ts` — `defaultTeamSizeForMode` returnerer 1 for `round_robin`.

#### Tests
- Type C: `RoundRobinSetup.test.tsx` (2) — slots med spillerlabels, placeholder-rader ved <4 spillere.

</details>

---

## 1.50.y — Nines / Split Sixes (poeng per hull for tre)

<details>
<summary><strong>1.50.y — Nines / Split Sixes (poeng per hull for tre) (1 oppføring) — klikk for å vise</strong></summary>

Issue [#278](https://github.com/jdlarssen/golf-app/issues/278), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Enda et kompis-format der poengene kommer fra hvor godt du spiller hvert hull, ikke fra sluttsummen. For nøyaktig tre spillere, med to varianter: Nines og Split Sixes.

### [1.50.0] - 2026-05-30

> Ny spillform for kompisrunden: Nines / Split Sixes, for nøyaktig tre spillere. Hvert hull deler ut en pott etter hvem som spilte det best. I Nines er det ni poeng å fordele (fem til lavest, tre til nest, ett til høyest), i Split Sixes seks (fire, to, null). Spiller dere likt på et hull, deler dere poengene likt. Du taster slag som vanlig, velger netto eller brutto, og appen kårer den med flest poeng sammenlagt.

<details>
<summary>Teknisk</summary>

Bygget på Skins-mønstret: poengene utledes fra det vanlige strokeplay-scorekortet, så ingen egen input-tabell eller registreringssteg. Hvert hull er uavhengig (ingen carryover som i Skins). Mangler en spiller score på et hull, står hullet pending til alle tre har tastet, mens senere hull avgjøres normalt.

#### Added
- [`lib/scoring/modes/nines.ts`](lib/scoring/modes/nines.ts) — `compute(ctx)`: pott per hull (Nines 5–3–1, Split Sixes 4–2–0) fordelt på effective-score-rangering, likt-deles-likt ved tie, pending-hull uten carryover. 22 Type A-tester.
- [`supabase/migrations/0054_nines.sql`](supabase/migrations/0054_nines.sql) — seed av format-rad «Nines / Split Sixes» + intent-mapping (sekundær under Kompis). Ingen ny tabell.
- `NinesSetup.tsx` — variant-velger (Nines / Split Sixes) + netto/brutto-velger i wizarden.
- `NinesView.tsx` + `NinesPodium.tsx` — poeng-tabell med per-hull-fordeling + podium for avsluttet spill.

#### Changed
- `lib/scoring/modes/types.ts` + `lib/scoring/index.ts` — ny `nines`-modus i `GameMode`, `GameModeConfig` (`nines_variant` + `nines_scoring`), `ModeResult` og compute-routeren, samt `MODE_LABELS`.
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `validateNines` (nøyaktig 3 spillere, individuell) + `parseGameMode`-støtte + regresjonstester.
- `lib/games/allowanceCopy.ts`, `lib/formats/modeGuide.ts`, `lib/formats/icons.tsx`, hull-`page.tsx`, leaderboard-`page.tsx` — brutto-hjelpetekst, spiller-forklaring, format-ikon, GameRow-union og leaderboard-routing.

#### Tests
- Type A: `nines.test.ts` (22) + 6 nines-cases i `gamePayload.test.ts`. Type C: `NinesView.test.tsx` + `NinesSetup.test.tsx`.

</details>

</details>

---

## 1.49.y — Bingo Bango Bongo (tre poeng per hull)

<details>
<summary><strong>1.49.y — Bingo Bango Bongo (tre poeng per hull) (1 oppføring) — klikk for å vise</strong></summary>

Issue [#277](https://github.com/jdlarssen/golf-app/issues/277), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Den første spillformen der poengene ikke kommer fra slag, men fra tre prestasjoner per hull. Sosial kompisrunde for 2–4 spillere.

### [1.49.0] - 2026-05-29

> Ny spillform for kompisrunden: Bingo Bango Bongo, for 2 til 4 spillere. Hvert hull gir tre poeng å kjempe om: bingo til den som først er på green, bango til den som ligger nærmest når alle er på green, og bongo til den som først er i hull. Du taster slag som før og krysser av de tre vinnerne per hull. Hvem som helst i flighten kan registrere, og leaderboardet kårer den med flest poeng sammenlagt.

<details>
<summary>Teknisk</summary>

Bygget på Wolf-mønstret for kategorisk per-hull-input: poengene er rene prestasjons-poeng og utledes ikke fra slag. Det vanlige scorekortet står urørt — de tre velgerne legges på som et ekstra lag per hull. CTP/LD-sideturnering fungerer derfor fortsatt ut av boksen.

#### Added
- [`supabase/migrations/0053_bingo_bango_bongo.sql`](supabase/migrations/0053_bingo_bango_bongo.sql) — tabell `bingo_bango_bongo_holes` (bingo/bango/bongo-user-id per hull, alle nullable), delt lese/skrive-RLS for alle spillere i spillet + admin, og seed av format-rad + intent-mapping (sekundær under Kompis).
- [`lib/scoring/modes/bingoBangoBongo.ts`](lib/scoring/modes/bingoBangoBongo.ts) — `compute(ctx)`: 1 poeng per kategori per hull, aggregert per spiller (bingos/bangos/bongos/sum), rangert på sum med bingos→bongos som tiebreak. 20 Type A-tester.
- `lib/bbb/` — `getBingoBangoBongoHoles` (tag-cachet), `setBingoBangoBongoHole` (`'use server'`, låser når spillet er avsluttet), `subscribeBingoBangoBongo` (realtime).
- `BingoBangoBongoEntry.tsx` — tre chip-rader (bingo/bango/bongo) med «Ingen»-valg, delt registrering, optimistisk lagring, integrert under det vanlige scorekortet.
- `BingoBangoBongoView.tsx` + `BingoBangoBongoPodium.tsx` — per-spiller-tabell (Bingo/Bango/Bongo/Sum) + podium for avsluttet spill.

#### Changed
- `lib/scoring/modes/types.ts` + `lib/scoring/index.ts` — ny `bingo_bango_bongo`-modus i `GameMode`, `GameModeConfig`, `ModeResult`, `ScoringContext` og compute-routeren, samt alle `Record<GameMode,…>`-maps (`MODE_LABELS`, `modeValidators`, `bruttoHelperFor`, `MODE_GUIDE`, m.fl.).
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `validateBingoBangoBongo` (2–4 spillere, individuell).
- `HoleClient.tsx` + hull-`page.tsx`, leaderboard-`page.tsx`, `lib/formats/icons.tsx` — scorekort-integrasjon, leaderboard-routing og format-ikon.

#### Tests
- Type A: `bingoBangoBongo.test.ts` (20) + `lib/bbb/`-helper-tester. Type C: `BingoBangoBongoEntry.test.tsx` + `BingoBangoBongoView.test.tsx`.

</details>

</details>

---

## 1.48.y — 4BBB Stableford (lag-variant synliggjort)

<details>
<summary><strong>1.48.y — 4BBB Stableford (lag-variant synliggjort) (1 oppføring) — klikk for å vise</strong></summary>

Issue [#282](https://github.com/jdlarssen/golf-app/issues/282), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Stableford for lag à 2 fantes allerede, men gjemte seg bak et kryptisk «Par»-valg. Nå heter varianten 4BBB og får en egen forklaring, uten ny scoring under panseret.

### [1.48.0] - 2026-05-29

> Stableford for lag à 2 har fått et tydelig navn: 4BBB. Velg Stableford først, så Solo eller 4BBB. På et 4BBB-lag spiller dere hver deres ball, og den beste poengsummen av dere to teller på hvert hull. Appen forklarer regelen rett i spillform-kortet, så ingen lurer på hva «Par» betød.

<details>
<summary>Teknisk</summary>

Ingen ny scoring, game_mode eller migrasjon: lag-Stableford (team_size 2) regnet allerede beste poeng per hull (4BBB). Endringen er ren synliggjøring + variant-bevisst navngiving.

#### Added
- [`lib/games/formatLabel.ts`](lib/games/formatLabel.ts) — `formatDisplayLabel(mode, modeConfig)` navngir stableford-familien med team_size 2 som «4BBB Stableford» / «4BBB Modifisert Stableford», ellers `MODE_LABELS[mode]`. Ren, server-trygg modul.
- [`lib/formats/modeGuide.ts`](lib/formats/modeGuide.ts) — `STABLEFORD_4BBB_GUIDE` + `resolveModeGuide(mode, teamSize)`: spiller-forklaring for 4BBB (beste poeng per hull teller).
- Egen 4BBB-rad i `/spillformer`-oppslagsverket.

#### Changed
- [`components/ModeGuideCard.tsx`](components/ModeGuideCard.tsx) + [`components/ui/ModeChip.tsx`](components/ui/ModeChip.tsx) — valgfri `modeConfig`-prop viser 4BBB-navn + -guide på game-home og admin-flatene. Uten prop: uendret.
- [`app/admin/games/new/TeamSizeSelector.tsx`](app/admin/games/new/TeamSizeSelector.tsx) — team_size-2-tilen heter «4BBB» (hint «Lag à 2, beste poeng teller») for stableford-familien. Andre lag-moduser beholder «Par».
- Admin spill-liste henter `mode_config` for å vise 4BBB-chip.

#### Tests
- Type A: `formatLabel.test.ts`, `modeGuide.test.ts`. Type C: 4BBB-variant i `ModeGuideCard.test.tsx` + `ModeChip.test.tsx`. Oppdaterte `TeamSizeSelector`- og `GameForm`-queries fra «Par» til «4BBB» i stableford-kontekst.

#### Avvik fra issue #282
- Issue-en spesifiserte ny `fourbb_stableford.ts`-scoring-modul + ny `formats`-rad. Begge droppet: scoringen finnes allerede i `stableford.ts` (team-MAX), og Jørgen valgte å la 4BBB leve som variant under Stableford-kortet, ikke som eget format-kort.

</details>

</details>

---

## 1.47.y — Modifisert Stableford (pro-skala med minuspoeng)

<details>
<summary><strong>1.47.y — Modifisert Stableford (pro-skala med minuspoeng) (1 oppføring) — klikk for å vise</strong></summary>

Issue [#281](https://github.com/jdlarssen/golf-app/issues/281), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Modifisert Stableford er Stableford med proff-skala: birdie og eagle belønnes ekstra, mens dobbeltbogey eller verre gir minuspoeng. Premierer å satse foran å ligge trygt på par.

### [1.47.0] - 2026-05-29

> Ny spillform: Modifisert Stableford. Samme Stableford-poeng du kjenner, men med proff-skala: birdie og eagle gir mye, og dobbeltbogey eller verre trekker fra. Poengene kan gå i minus, så her lønner det seg å satse. Solo eller par, og du velger handicap som vanlig når du oppretter spillet.

<details>
<summary>Teknisk</summary>

#### Added
- [`lib/scoring/modes/modifiedStableford.ts`](lib/scoring/modes/modifiedStableford.ts) — ny scoring-modul med pro-poeng-tabellen (albatross+ 8, eagle 5, birdie 2, par 0, bogey −1, dobbeltbogey+ −3; condor caps på 8; ikke-spilt 0). Gjenbruker stableford-motoren via parameterisert `computeWithPointsTable` og returnerer `kind: 'stableford'`, så leaderboard/podium-visningen er uendret. Type A-tester dekker tabellen (inkl. albatross-cap + null→0), solo-totaler med negative poeng, ranking med negativ total, og team-MAX med negativ.
- [`lib/scoring/modes/types.ts`](lib/scoring/modes/types.ts) — ny `modified_stableford` `GameMode` + `GameModeConfig`-variant (`points_table: 'modified'`, solo/par), `MODE_LABELS`-entry «Modifisert Stableford», og `isStablefordFamily(mode)`-helper.
- [`supabase/migrations/0052_modified_stableford.sql`](supabase/migrations/0052_modified_stableford.sql) — seeder format-rad + tre sekundære intent-mappings (kompis/klubb/solo). Gjenbruker stableford-ikonet.
- [`lib/formats/modeGuide.ts`](lib/formats/modeGuide.ts) — spiller-rettet regelforklaring (poeng-skala + minuspoeng-advarsel).

#### Changed
- [`lib/scoring/modes/stableford.ts`](lib/scoring/modes/stableford.ts) — motoren parameterisert med en poeng-funksjon og en contributor-regel slik at standard og modified deler all solo-/team-logikk. Standard-oppførselen er uendret (eksisterende tester grønne).
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `modified_stableford`-validator (gjenbruker stableford-spiller-parsingen).
- Leaderboard-, scorekort-, wizard-, mail- og game-home-flatene ruter `modified_stableford` via `isStablefordFamily`. Hull-siden og scorekortet bruker den modifiserte poeng-tabellen for live «Dine poeng».
- [`app/games/[id]/holes/[holeNumber]/HoleClient.tsx`](app/games/[id]/holes/[holeNumber]/HoleClient.tsx) — diskret advarsel over score-input om at poengene kan gå i minus (andre advarsels-flate ved siden av spillform-guiden).

#### Tests
- Type A: `modifiedStableford.test.ts` + router-delegering i `index.test.ts`. Type C: minus-poeng-banner i `HoleClient.test.tsx`. Eksisterende stableford-suite uendret og grønn.

</details>

</details>

---

## 1.46.y — Spillformer forklart for spillere

<details>
<summary><strong>1.46.y — Spillformer forklart for spillere (2 oppføringer) — klikk for å vise</strong></summary>

Issue [#299](https://github.com/jdlarssen/golf-app/issues/299). Spillere som blir invitert til en ukjent spillform får nå en kort forklaring rett på spill-siden, og kan bla gjennom alle formene i et eget oppslagsverk. Lavere terskel for å bli med på noe nytt.

### [1.46.1] - 2026-05-29

> Avslutter du et Skins-spill rett etter et delt hull, viser resultatlista nå at de skinsene ikke ble vunnet. Før forsvant de fra oversikten.

<details>
<summary>Teknisk</summary>

#### Fixed
- [`lib/scoring/modes/skins.ts`](lib/scoring/modes/skins.ts) + [`types.ts`](lib/scoring/modes/types.ts) — henger-skins ble under-rapportert når et spill ble avsluttet tidlig med et gap rett etter et delt hull ([#303](https://github.com/jdlarssen/golf-app/issues/303)). `SkinsResult.unwonSkins = frozen ? 0 : carriedPot` nullstilte den hengende potten så snart et hull var pending, slik at henger-banneret forsvant. Scoring-modulen kjenner ikke `gameStatus`, så feltet er erstattet med rå `SkinsResult.carriedPot` (den hengende potten ved siste resolverte hull, frozen eller ikke). [`SkinsView`](app/games/[id]/leaderboard/SkinsView.tsx) — som allerede mottar `gameStatus` — avgjør label: banneret vises når `gameStatus === 'finished' && carriedPot > 0` (dekker både komplett runde med delt siste hull og tidlig-avsluttet spill med trailing pending), og holdes skjult under aktivt spill der potten fortsatt er i spill. Kun display — spiller-totalene var alltid korrekte.
- Banner-copy presisert: «Siste hull ble delt» → «Siste spilte hull ble delt» (presist for tidlig-avsluttede spill der siste *spilte* hull, ikke siste hull-nummer, var delt).

#### Tests
- 2 nye Type A scoring-tester: rå `carriedPot` eksponert ved pending-freeze; tidlig-avslutning på delt hull + trailing pending → `carriedPot` = rå hengende pott (ikke 0). Eksisterende `unwonSkins`-assertions re-pekt til `carriedPot`.
- SkinsView-render-testen utvidet: frozen-finished-scenario viser banneret; samme pott under aktivt spill holder banneret skjult.

</details>

### [1.46.0] - 2026-05-29

> Får du en invitasjon til en spillform du ikke kjenner? Nå ligger det en kort forklaring rett på spill-siden. Trykk «Slik funker det», så er du i gang. Vil du lese deg opp på forhånd, finner du alle formene samlet under «Spillformer» på hjem-siden.

<details>
<summary>Teknisk</summary>

#### Added
- [`lib/formats/modeGuide.ts`](lib/formats/modeGuide.ts) — statisk `MODE_GUIDE`-katalog: et player-rettet ett-linjes sammendrag + 2–3 «korte regler»-punkter for alle 10 spillformene (inkl. Skins, som landet parallelt). Egen kilde fra `formats.short_description` (som er admin-terse for wizarden). Type A completeness-test ([`modeGuide.test.ts`](lib/formats/modeGuide.test.ts)) håndhever ikke-tomt innhold per modus.
- [`components/ModeGuideCard.tsx`](components/ModeGuideCard.tsx) — gjenbrukbar utvidbar modus-forklaring bygd på native `<details>` (server-renderbar, tastatur-tilgjengelig, reduced-motion-trygt). Faller defensivt tilbake til kun modus-navn for ukjente/legacy `game_mode`-verdier. Type C render-test dekker struktur + fallback.
- [`app/spillformer/page.tsx`](app/spillformer/page.tsx) — nytt oppslagsverk som lister alle formene i pedagogisk rekkefølge, hver som et `ModeGuideCard`.

#### Changed
- [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) — nytt «SPILLFORM»-kort på spillerens game-side (både `scheduled`-ventestaten og draft/active/finished-visningen) som viser `ModeGuideCard` for spillets modus.
- [`app/page.tsx`](app/page.tsx) — ny «Spillformer»-tile i hjem-navet som lenker til oppslagsverket.

#### Tests
- Type A completeness (`modeGuide.test.ts`) + Type C render (`ModeGuideCard.test.tsx`) dekker alle modusene. Hele suiten grønn.

</details>

</details>

---

## 1.45.y — Skins (tredje kompis-format i epic)

<details>
<summary><strong>1.45.y — Skins (1 oppføring) — klikk for å vise</strong></summary>

Issue [#275](https://github.com/jdlarssen/golf-app/issues/275), tredje kompis-format i [#270](https://github.com/jdlarssen/golf-app/issues/270). Skins er hull-for-hull-klassikeren: lavest score vinner skinnet, og deler dere hullet, ruller potten videre til neste hull.

### [1.45.0] - 2026-05-29

> Ny spillform: Skins. Hvert hull er verdt 1 skin, og lavest score tar det. Deler dere hullet, ruller skinnet videre til neste hull, som da er verdt mer. 2–4 spillere, og du velger netto eller brutto når du oppretter spillet. Resultatlista viser hvem som tok hvor mange skins, så dere kan gjøre opp en pott dere avtaler selv.

<details>
<summary>Teknisk</summary>

#### Added
- [`supabase/migrations/0051_skins.sql`](supabase/migrations/0051_skins.sql) — seeder `skins`-format-row + `format_intent_mapping[skins, kompis, primary, sort_order=70]`. Ingen ny tabell — carryover er en ren funksjon av eksisterende `scores`, akkurat som Nassau.
- [`lib/scoring/modes/skins.ts`](lib/scoring/modes/skins.ts) — `compute(ctx)` med sekvensiell carryover-state. Hvert hull legger 1 skin i potten; `atStake = carriedIn + 1`. Unik laveste effective-score vinner hele potten (`carriedPot` resettes); to eller flere på laveste = carryover (potten ruller videre). Pending hull (mangler score) fryser resolving — alle senere hull blir også pending. `unwonSkins` = potten som henger ved rundeslutt (standard Skins, ingen omspill). Gross/net via `mode_config.skins_scoring` med defensiv fallback til 'net'. 26 Type A unit-tester dekker enkel vinner, 2-/3-/4-veis delt, multi-tied sekvens (hull 1–3 delt → hull 4 scooper 4 skins), pending, uvunne skins, gross vs net, 2- og 4-spiller, ranking + tiebreak.
- [`lib/scoring/modes/types.ts`](lib/scoring/modes/types.ts) — `GameMode` + `GameModeConfig` + `MODE_LABELS` utvidet med `skins`; nye `SkinsResult`, `SkinsHoleRow`, `SkinsPlayerLine`, `SkinsHoleOutcome`-typer; `ModeResult` utvidet.
- [`app/admin/games/new/sections/SkinsSetup.tsx`](app/admin/games/new/sections/SkinsSetup.tsx) — wizard step 2-seksjon med scoring-toggle (netto/brutto) + carryover-forklaring. `useGameFormState` utvidet med `skinsScoring`, `isSkins`, `skinsPlayersValid` (2–4 spillere).
- [`app/games/[id]/leaderboard/SkinsView.tsx`](app/games/[id]/leaderboard/SkinsView.tsx) — spiller-totals øverst (sortert på skins vunnet, prominent), per-hull-tabell som viser carryover-kjeden (på spill / delt → ruller videre / venter / vunnet av), og en egen linje for uvunne skins når potten henger ved rundeslutt. Reveal-mode følger Wolf/Nassau-pattern.
- [`app/games/[id]/leaderboard/SkinsPodium.tsx`](app/games/[id]/leaderboard/SkinsPodium.tsx) — 1./2./3.-plass på `totalSkins`, confetti-burst på first-mount per browser-sesjon, rest-listen (rank 4+) i collapsed liste.
- [`validateSkins`](lib/games/gamePayload.ts) — payload-validator med 2–4 spillere, solo-format (team/flight null), `skins_scoring` gross|net parsing. 10 unit-tester.
- Skins-banner i [`HoleClient.tsx`](app/games/[id]/holes/[holeNumber]/HoleClient.tsx) — viser «X skins på spill» på hull-flaten + et hint når potten har rullet videre. Rent informativt (ingen modal, til forskjell fra Wolf).
- Auth-gate E2E ([`e2e/games/skins.spec.ts`](e2e/games/skins.spec.ts)) speiler Wolf/Nassau-mønstret.

#### Changed
- `Record<GameMode, …>`-mapper + uttømmende `switch`-er utvidet for type-completeness (ReadyStep, TeamSizeSelector, `MODE_LABELS`, `bruttoHelperFor` i [`allowanceCopy.ts`](lib/games/allowanceCopy.ts), lokal `GameRow`-union i [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx)). `validateSkins` wiret i `parseGameMode` + `modeValidators`.
- [`renderSkins`](app/games/[id]/leaderboard/page.tsx) router-case etter Nassau.
- [`app/admin/games/new/GameWizard.tsx`](app/admin/games/new/GameWizard.tsx): render `<SkinsSetup>` når `isSkins`, hidden `skins_scoring`-input, skjul TeamSizeSelector. `skins_scoring` lagt til i `initialValues`-passthrough.
- [`app/games/[id]/holes/[holeNumber]/page.tsx`](app/games/[id]/holes/[holeNumber]/page.tsx): når `game_mode='skins'`, kjør `skins.compute` over nåværende scores og send `skinsAtStake` + `skinsCarriedIn` ned til `HoleClient`.

#### Tests
- 26 Type A unit-tester for scoring-modulen.
- 10 validator-tester (`gamePayload.test.ts`).
- 2 render-tester (SkinsSetup + SkinsView).
- Lightweight auth-gate E2E. Carryover-scenariet («vunnet på hull 4») dekkes av Type A unit-test, ikke tung E2E — riktig hjem per test-disiplinen.

Tredje av 7 kompis-batch-formats. Resten: BBB, Nines, Acey Deucey, Round Robin.

</details>

</details>

---

## 1.44.y — Nassau (andre kompis-format i epic)

<details>
<summary><strong>1.44.y — Nassau (3 oppføringer) — klikk for å vise</strong></summary>

Issue [#276](https://github.com/jdlarssen/golf-app/issues/276), andre kompis-format i [#270](https://github.com/jdlarssen/golf-app/issues/270). Nassau er klassikeren: front 9, back 9 og hele runden er tre separate konkurranser i samme runde. Vinn én seksjon og du har én seier; vinn alle tre og du tok «Hele tavla».

### [1.44.2] - 2026-05-29

> Spillere som har fått lov til å opprette turneringer uten å være administrator, kan endelig gjøre det. Før stoppet en tilgangssperre dem med «Klarte ikke å lagre spillet», selv om de hadde fått tilgang.

<details>
<summary>Teknisk</summary>

#### Fixed
- [`app/admin/games/new/actions.ts`](app/admin/games/new/actions.ts) — `createGameInternal` kjørte `games`- og `game_players`-INSERT gjennom den request-scopede klienten, men RLS-policyene `games admin write` / `game_players admin write` krever `is_admin()`. Trusted-non-admin-skapere (#198-allowlista) feilet derfor INSERT-en stille siden #198 ble merget 2026-05-25, og landet på `error=db_game`. Nå velges `writeClient = isAdmin ? supabase : getAdminClient()` (service-role-bypass for trusted), samme mønster som #223 Fase 4 i courses-actions. Publish-roster-readen bruker samme klient, så pending-spiller-sperra ser hele rosteret — RLS skjulte ellers ennå-ikke-delte spillere og hoppet stille over sjekken.

#### Tests
- [`app/admin/games/new/actions.test.ts`](app/admin/games/new/actions.test.ts) — regresjonstester som beviser at admin-klienten faktisk brukes for trusted-skapere (draft + publish) og ikke for admin. Den gamle #198-testen mocket `games.insert` til å lykkes uansett klient, og fanget derfor aldri RLS-gapet.

Verifisert via Supabase MCP (read-only): `fornes.even@yahoo.no` er `is_admin=false`, og `games`/`game_players`-policyene matcher migrasjon 0002 (ikke endret manuelt) — altså en bug, ikke konfigurasjonsdrift. Issue [#230](https://github.com/jdlarssen/golf-app/issues/230).

</details>

### [1.44.1] - 2026-05-29

> Spiller du fra en tee der dame- eller junior-par er annerledes enn herre-par, viser nå leverings-siden, godkjenning og leaderboardens hull-fane din egen par. Et 5-slag på et hull som er par 5 for deg teller som par, ikke bogey.

<details>
<summary>Teknisk</summary>

Oppfølger til [#240](https://github.com/jdlarssen/golf-app/issues/240) — tre display-flater brukte fortsatt `par_mens` (eller lagets representant-par) i stedet for spillerens egen par. Alle tre gjenbruker `parForPlayer`/`hasParDifference`/`formatOtherGendersPar` fra [`lib/games/parDisplay.ts`](lib/games/parDisplay.ts); ingen endring i scoring- eller leaderboard-helperne.

#### Fixed
- [`app/games/[id]/submit/page.tsx`](app/games/[id]/submit/page.tsx) — «DITT KORT»-preview mapper nå rad-par via `parForPlayer(parByGender, me.tee_gender)` i stedet for `h.par_mens`, og viser avvik-asterisk (`ParAsideInline`) i par-kolonnen. En damespiller ser nå sin egen par og slag-shape i preview før innlevering.
- [`app/games/[id]/approve/page.tsx`](app/games/[id]/approve/page.tsx) — godkjennings-tabellen bruker scorekort-eierens (`p.tee_gender`) par for både par-tall og `scoreShape`/`scoreTone`, med avvik-asterisk. Admin/flight-mate ser eierens par, ikke herre-par.
- [`app/games/[id]/leaderboard/holes/page.tsx`](app/games/[id]/leaderboard/holes/page.tsx) — per-spiller-rad bruker `pc.par` (per-spiller) i stedet for `row.par` (lagets) på både brutto-celle-tone og «+/− mot par»-merket. Begge fikset (samme rot-årsak) etter brukerbeslutning.

Ingen nye tester: pure-logic-helperne er dekket i `parDisplay`/`parResolver` (#240), asterisk-rendering i `HoleClient.test.tsx`. Submit/approve er server-komponenter som fetcher fra Supabase — per test-disiplin ikke verdt redundante render-tester.

</details>

### [1.44.0] - 2026-05-28

> Ny spillform: Nassau. Front 9, back 9 og hele runden er tre separate konkurranser — vinn alle tre og det heter «Hele tavla». 2–4 spillere, velg netto eller brutto når du oppretter spillet.

<details>
<summary>Teknisk</summary>

#### Added
- [`supabase/migrations/0050_nassau.sql`](supabase/migrations/0050_nassau.sql) — seeder `nassau`-format-row + `format_intent_mapping[nassau, kompis, primary, sort_order=60]`. Ingen ny tabell — scoring leser eksisterende `scores`.
- [`lib/scoring/modes/nassau.ts`](lib/scoring/modes/nassau.ts) — `compute(ctx)` rangerer tre seksjoner (front 9 / back 9 / total 18) hver for seg via samme `rankTeams`-cascade + `UNPLAYED_PADDING=999`-strategi som `soloStrokeplay`. Aggregert unit-ranking med primær units desc / sekundær total18EffectiveStrokes asc / tertiær userId asc tiebreak. Push på tie (klassisk Nassau-regel) — tied seksjon = ingen unit deles ut. Gross/net-toggle via `mode_config.nassau_scoring` med defensiv fallback til 'net'. 25 Type A unit-tester dekker hele matrisen (clean-win per seksjon, push, sweep, pending, partial play, gross vs net, unit-aggregering, tiebreak).
- [`lib/scoring/modes/types.ts`](lib/scoring/modes/types.ts) — `GameMode` + `GameModeConfig` utvidet med `nassau`-variant; nye `NassauResult`, `NassauSection`, `NassauSectionLine`, `NassauUnitLine`-typer; `ModeResult` utvidet.
- [`app/admin/games/new/sections/NassauSetup.tsx`](app/admin/games/new/sections/NassauSetup.tsx) — wizard step 2-seksjon med kun scoring-toggle (netto/brutto). Mye enklere enn WolfSetup (ingen rotasjon, ingen shuffle). `useGameFormState` utvidet med `nassauScoring`, `isNassau`, `nassauPlayersValid` (2-4 spillere).
- [`app/games/[id]/leaderboard/NassauView.tsx`](app/games/[id]/leaderboard/NassauView.tsx) — tre stacked seksjoner med per-seksjon-rangering. Push viser «Delt 1.-plass» uten highlight. Pending viser «Venter på spilte hull». Reveal-mode følger Wolf-pattern (blanket venterom-card når `score_visibility=reveal` og `status=active`).
- [`app/games/[id]/leaderboard/NassauPodium.tsx`](app/games/[id]/leaderboard/NassauPodium.tsx) — 1./2./3.-plass på aggregert unit-count med F9/B9/T18-badges per podium-step. Sweep-celebration «Hele tavla!» + «Tok alle tre seksjoner» når en spiller har `units=3`. Confetti-burst på first-mount per browser-sesjon (sessionStorage-gate). Rest-listen (rank 4+) i collapsed `<details>`.
- [`validateNassau`](lib/games/gamePayload.ts) — payload-validator med 2-4 spillere range, solo-format (team/flight null), `nassau_scoring` gross|net parsing. 12 unit-tester.
- Auth-gate E2E ([`e2e/games/nassau.spec.ts`](e2e/games/nassau.spec.ts)) speiler Wolf-mønstret.

#### Changed
- `Record<GameMode, …>`-mapper utvidet for type-completeness: `ENABLED_COMBOS` (TeamSizeSelector), `MODE_SUMMARY_LABELS` (ReadyStep), `MODE_LABELS` (types), `bruttoHelperFor` (allowanceCopy). Lokal `GameRow.game_mode`-union i [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx).
- [`renderNassau`](app/games/[id]/leaderboard/page.tsx) router-case etter Wolf — speiler `renderSoloStrokeplay` (ingen separat per-hull-tabell).
- [`app/admin/games/new/GameWizard.tsx`](app/admin/games/new/GameWizard.tsx): render `<NassauSetup>` når `isNassau`, hidden `nassau_scoring`-input, skjul TeamSizeSelector. `wolf_scoring` lagt til i `initialValues`-passthrough.

#### Tests
- 25 Type A unit-tester for scoring-modulen.
- 12 validator-tester (`gamePayload.test.ts`).
- 2 render-tester (NassauSetup + NassauView + NassauPodium).
- Lightweight auth-gate E2E.

Andre av 7 kompis-batch-formats. Resten: Skins, BBB, Nines, Acey Deucey, Round Robin.

</details>

</details>

---

## 1.43.y — Wolf-format (første kompis-format i epic)

<details>
<summary><strong>1.43.y — Wolf-format (1 oppføring) — klikk for å vise</strong></summary>

Issue [#274](https://github.com/jdlarssen/golf-app/issues/274), første kompis-format i [#270](https://github.com/jdlarssen/golf-app/issues/270). Wolf er en sosial 4-spillers spillform der én av dere er Wolf på hvert hull — vedkommende velger partner (2v2), går Lone Wolf (1v3, dobler innsatsen), eller deklarer Blind Wolf før noen slår (tredobler). Like hull bærer potten videre.

### [1.43.0] - 2026-05-28

> Ny spillform: Wolf. Fire spillere, og én av dere er Wolf på hvert hull — velg partner, gå alene som Lone Wolf (dobler), eller bli Blind Wolf før noen slår (tredobler). Like hull bærer potten videre til neste. Velg netto eller brutto når du oppretter spillet.

<details>
<summary>Teknisk</summary>

#### Added
- [`supabase/migrations/0049_wolf.sql`](supabase/migrations/0049_wolf.sql) — ny `wolf_hole_choices`-tabell (én rad per `(game_id, hole_number)` med wolf_user_id + choice + partner_user_id + entered_by), CHECK-constraint `partner_only_when_partner_choice` håndhever choice/partner-konsistens, RLS-policies for read/insert/update/delete (wolf-spilleren selv eller admin). Seed format-row + `format_intent_mapping[wolf, kompis, primary]`.
- [`lib/scoring/modes/wolf.ts`](lib/scoring/modes/wolf.ts) — full `compute(ctx)` med rotation (hull 1-16 lineær, 17-18 trailing-wolf), stake/carry-over-mekanikk, point-tabell (partner 2/1, lone 4/1, blind 6/2), gross vs net allokering via `strokesForHole`. 52 Type A unit-tester via `it.each` dekker hele scoring-matrisen.
- [`lib/scoring/modes/types.ts`](lib/scoring/modes/types.ts) — `GameMode` + `GameModeConfig` utvidet med `wolf`-variant; nye `WolfResult`, `WolfHoleRow`, `WolfPlayerCell`, `WolfPlayerLine`, `WolfChoice`, `WolfHoleOutcome`, `WolfHoleChoice`-typer; `ScoringContext.wolfChoices` optional input.
- [`lib/wolf/getWolfChoices.ts`](lib/wolf/getWolfChoices.ts) — tag-cachet (`game-${id}`) admin-client fetch av wolf-valg per spill. [`lib/wolf/setWolfChoice.ts`](lib/wolf/setWolfChoice.ts) — server-action med 8 validerings-cases + RLS-feilkonvertering. [`lib/wolf/subscribeWolfChoices.ts`](lib/wolf/subscribeWolfChoices.ts) — realtime-sub på alle event-typer.
- [`app/admin/games/new/sections/WolfSetup.tsx`](app/admin/games/new/sections/WolfSetup.tsx) — wizard step 2-seksjon med scoring-toggle (netto/brutto) + 4 rotation-slots med shuffle-knapp. `useGameFormState` utvidet med `wolfScoring`, `wolfOrder` (deterministisk Fisher-Yates via splitmix32-PRNG), `shuffleWolfOrder()`, `isWolf`, `wolfPlayersValid`.
- [`app/games/[id]/holes/[holeNumber]/WolfChoiceModal.tsx`](app/games/[id]/holes/[holeNumber]/WolfChoiceModal.tsx) — 5-knappers modal (3 partnere + Lone + Blind) med Escape-to-close og inline-feil. [`wolfRotation.ts`](app/games/[id]/holes/[holeNumber]/wolfRotation.ts) — client-helper for å bestemme Wolf per hull.
- [`HoleClient.tsx`](app/games/[id]/holes/[holeNumber]/HoleClient.tsx) integration: wolf-badge over score-card, auto-modal når current user er Wolf og ingen choice finnes, realtime-sync av wolf-valg mellom de 4 spillerne.
- [`WolfView`](app/games/[id]/leaderboard/WolfView.tsx) + [`WolfPodium`](app/games/[id]/leaderboard/WolfPodium.tsx) — leaderboard-rendering med per-hull-tabell (Wolf, choice, stake, outcome, per-spiller +poeng) + spiller-totals + 1./2./3.-plass-podium med bragging-stats-strip (Mest Blind Wolf-pott, Mest Wolf-hull). Reveal-modus skjuler tall mens runden er aktiv.
- [`validateWolf`](lib/games/gamePayload.ts) — payload-validator med 4-spillers exact-count, team_number 1-4 unik, wolf_scoring gross|net parsing. 14 unit-tester.

#### Changed
- `Record<GameMode, …>`-mapper utvidet for type-completeness: `ENABLED_COMBOS` (TeamSizeSelector), `MODE_SUMMARY_LABELS` (ReadyStep), `bruttoHelperFor` (allowanceCopy), `MODE_LABELS` (types).

#### Tests
- 52 Type A unit-tester for scoring-modulen (scoring matrix, rotation, stake-carry, gross/net, ranking, pending-handling, blindWolfWins-stat).
- 14 validator-tester (`gamePayload.test.ts`).
- 16 server-helper-tester (`getWolfChoices.test.ts` + `setWolfChoice.test.ts`).
- 15 rotation-helper-tester (`wolfRotation.test.ts`).
- 2 + 7 render-tester (WolfSetup + WolfChoiceModal).
- 2 render-tester (WolfView + WolfPodium).
- Lightweight auth-gate E2E (`e2e/games/wolf.spec.ts`).

Foundation for epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Wolf er første av 7 kompis-batch-formats (resten: Skins, Nassau, BBB, Nines, Acey Deucey, Round Robin).

</details>

</details>

---

## 1.42.y — Foursomes matchplay (Ryder Cup fase 3)

<details>
<summary><strong>1.42.y — Foursomes matchplay (1 oppføring) — klikk for å vise</strong></summary>

Issue [#218](https://github.com/jdlarssen/golf-app/issues/218), fase 3 av [#47](https://github.com/jdlarssen/golf-app/issues/47). Foursomes matchplay (2v2 alternate-shot — én ball per lag, partnerne alternerer slag) er klar for cupen. Lagene møtes hull-for-hull som matchplay, og scorekortet viser dere mot dem hele veien. Tee-rotasjonen avtales av flighten på hull 1.

### [1.42.0] - 2026-05-27

> Foursomes matchplay er klar for cupen. To og to spillere deler én ball og alternerer slag — laget med best score per hull vinner hullet. Før hull 1 velger flighten hvem på hver side som skal teer ut først, så ruller appen med riktig «X slår ut»-hint per hull. WHS-handicapen er forhåndsvalgt til 50 % av differansen mellom lagene; admin kan justere per cup.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon [0048_foursomes_matchplay.sql](supabase/migrations/0048_foursomes_matchplay.sql) — seeder `foursomes_matchplay` i `formats`-tabellen som cup-eligible. Legger til `tournaments.foursomes_allowance_pct` (smallint, default 50, check 0..100) og to nye nullable FK-er på `games`: `foursomes_side1_tee_starter_user_id` + `foursomes_side2_tee_starter_user_id`. Storage-pattern A: ingen skjema-endring på `scores` — kaptein-userId (lex-min per side) eier lagets scores-rader, samme mønster som Texas scramble. Resten av alternate-shot-familien ([#289 Greensome](https://github.com/jdlarssen/golf-app/issues/289), [#290 Chapman](https://github.com/jdlarssen/golf-app/issues/290), [#291 Gruesome](https://github.com/jdlarssen/golf-app/issues/291)) adopterer samme mønster.
- [`lib/scoring/modes/foursomesMatchplay.ts`](lib/scoring/modes/foursomesMatchplay.ts) — ny scoring-modul med WHS-diff-formel: `highSideExtraHCP = round(|side1CombinedCH - side2CombinedCH| × allowance_pct / 100)`, lavlaget får 0 strokes, høylaget får extra-HCP allokert via SI (hardeste hull først). Gjenbruker `pickTeamCaptain`, `classifyMatchplayHole`, `computeMatchResult`, `strokesForHole`. 16 unit-tester dekker HCP-diff, mat-em («3&2»), AS, 18-hull-vinner («2up»), unplayed-hole, allowance 0/100, mixed-tee parByGender, empty-shell (0/1/3 spillere), captain-pick, holesPlayed-correctness.
- [`app/games/[id]/foursomesActions.ts`](app/games/[id]/foursomesActions.ts) — ny `setFoursomesTeeStarter`-server-action med side-membership-validering på både kaller og valgt user, write til riktig `foursomes_side{N}_tee_starter_user_id`-kolonne, revalidateTag på game-id.
- [`FoursomesTeeStarterBanner`](app/games/[id]/holes/[holeNumber]/FoursomesTeeStarterBanner.tsx) — klient-banner på hull 1 når sidens tee-starter ikke er valgt, viser to navn-knapper som ruter til server-actionen via `useTransition`. `FoursomesTeeHint` viser per hull «X slår ut» basert på odd/even-hull (standard foursomes-rotasjon).

#### Changed
- [`GameMode`, `MODE_LABELS`, `GameModeConfig`, `ModeResult`](lib/scoring/modes/types.ts) utvidet med `foursomes_matchplay` + tilhørende result-shapes (`FoursomesSide`, `FoursomesSidePlayer`, `FoursomesHoleRow`, `FoursomesMatchplayResult`). Mode-router-case wired i [lib/scoring/index.ts](lib/scoring/index.ts).
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts): ny `validateFoursomesMatchplay`-validator (speiler fourball: 2v2-fordeling, duplikat-sjekk, range-validert `foursomes_allowance_pct` med default 50 i draft). `parseGameMode` + `modeValidators`-map utvidet. 14 nye gamePayload-tester.
- [`lib/cup/getCupSnapshot.ts`](lib/cup/getCupSnapshot.ts): foursomes-gren etter fourball — `computeFoursomesMatchplay` mater cup-aggregatoren med `{ winnerSide, formatted }`. `matchGameMode`-typen utvidet. [`computeCupLeaderboard.CupMatchInput.gameMode`](lib/cup/computeCupLeaderboard.ts) tar `'foursomes_matchplay'` så cup-UI kan velge lag-fokusert «X til Lag Skog» (matchet i `app/cup/[id]/page.tsx` og `app/admin/cup/[id]/page.tsx`).
- [`lib/cup/actions.ts`](lib/cup/actions.ts): cup-create/edit-form persisterer ny `foursomes_allowance_pct` (parser med range 0..100, default 50). `CupSetup` får en ny `AllowanceField` for foursomes som forklarer WHS-diff-formelen i nettoHelper/bruttoHelper.
- [`app/admin/games/new/page.tsx`](app/admin/games/new/page.tsx): `CupGameMode` utvidet med `foursomes_matchplay`. `loadCupContext` leser `foursomes_allowance_pct` (default 50) og setter labelPrefix='Foursomes'. `buildCupInitialValues` har egen gren for foursomes så match-en arver cup-en sin allowance.
- [`useGameFormState`](app/admin/games/new/useGameFormState.ts), [`GameWizard`](app/admin/games/new/GameWizard.tsx) og [`GameForm`](app/admin/games/new/GameForm.tsx) eksponerer `foursomesAllowancePct` + dedikert `AllowanceField` i Section 3 + hidden input i submit-payload.
- [`lib/games/scorecardLayout.ts`](lib/games/scorecardLayout.ts): ny `mode === 'foursomes_matchplay'`-gren produserer 2-kolonne Layout B (én per side, kaptein-userId som score-eier, lag-display «Per/Knut»). `courseHandicap` per kolonne = WHS-effective ekstra-HCP. Match-status faller gjennom til singles' 2-kolonne `computeMatchplayRunningStatus`-grenen uten endring. Ny `isFoursomes`-flag på `ScorecardLayout`.
- [`app/admin/cup/[id]/page.tsx`](app/admin/cup/[id]/page.tsx): ny «+ Foursomes match»-knapp ved siden av singles/fourball; grid blir 3-kolonner på `sm+`.
- [`app/games/[id]/holes/[holeNumber]/page.tsx`](app/games/[id]/holes/[holeNumber]/page.tsx): foursomes-flight collapses til én lag-kort (Texas-pattern). Tee-starter-banner rendres over `HoleClient` på hull 1 når valget ikke er gjort; hint vises på alle hull etter at valget er låst. [`getGameWithPlayers`](lib/games/getGameWithPlayers.ts) SELECT-en leser nå `foursomes_side1/2_tee_starter_user_id` via cache.
- Exhaustive-map-utvidelser i [`ReadyStep`](app/admin/games/new/sections/ReadyStep.tsx), [`TeamSizeSelector`](app/admin/games/new/TeamSizeSelector.tsx), [`bruttoHelperFor`](lib/games/allowanceCopy.ts) og lokale GameRow-unions i [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) — strukturelle konsekvenser av å utvide `GameMode`-unionen.

#### Tests
- 16 `foursomesMatchplay.test.ts`-cases (Type A).
- 14 nye gamePayload-cases for foursomes-validatoren.
- 3 nye `scorecardLayout.test.ts`-cases (happy 2v2 med WHS-diff, non-captain ser kaptein som score-eier, ikke-2-2 → Layout A fallback).
- 10 nye `foursomesActions.test.ts`-cases (server-action authz + happy path).

Dette er første format i alternate-shot-familien som lander i prod; mønstret (storage-pattern A + Layout B head-to-head + diff-basert allowance + per-game tee-starter-felt) gjenbrukes i [#289 Greensome](https://github.com/jdlarssen/golf-app/issues/289), [#290 Chapman](https://github.com/jdlarssen/golf-app/issues/290) og [#291 Gruesome](https://github.com/jdlarssen/golf-app/issues/291) når de implementeres.

</details>

</details>

---

## 1.41.y — Admin format-mapping (Fase 3 av format-katalog-epic)

<details>
<summary><strong>1.41.y — Admin format-mapping (1 oppføring) — klikk for å vise</strong></summary>

Issue [#273](https://github.com/jdlarssen/golf-app/issues/273), fase 3 av [#270](https://github.com/jdlarssen/golf-app/issues/270). Ny admin-side `/admin/formats` med matrix-view for å styre hvilke spillformer som dukker opp i wizardens step 2 — uten å trenge en kode-deploy. Hver endring logges til `admin_audit_log` og synes i bunnen av siden.

### [1.41.0] - 2026-05-27

> Ny side i Sekretariatet: «Formats». Som admin kan du nå styre hvilke spillformer som dukker opp i wizardens step 2 per arrangement, hvilke som er primary (stort kort) og hvilke som er cup-eligible. Endringene blir synlige neste gang noen åpner wizarden, og du ser de siste 50 endringene loggført nederst på siden.

<details>
<summary>Teknisk</summary>

#### Added
- [`/admin/formats`](app/admin/formats/page.tsx) — server-component med admin-gate, leser `getAllFormatsWithMappings()` + `getFormatMappingAudit(50)`, rendrer `FormatsManager` + `AuditLogList`. Mobil viser 3 intent-tabs (Kompis/Klubb/Solo) + cup-accordion; desktop viser full matrix med stjerne+hake per celle.
- [`lib/formats/getAllFormatsWithMappings.ts`](lib/formats/getAllFormatsWithMappings.ts) — admin-view-helper som henter ALLE formats + ALLE mapping-rader (inkl. is_visible=false / is_active=false). Ikke `unstable_cache`-d siden admin skal se fersk state etter mutasjon.
- [`lib/formats/audit.ts`](lib/formats/audit.ts) — `recordFormatMappingChange()` (wrapper rundt `logAdminEvent` med F3-spesifikt payload) + `getFormatMappingAudit(limit)` (leser `admin_audit_log` filtrert på `event_type='format_mapping_change'`).
- [`app/admin/formats/actions.ts`](app/admin/formats/actions.ts) — 4 server-actions: `toggleVisibility`, `togglePrimary`, `toggleCupEligible`, `toggleActive`. Hver er idempotent (no-op hvis `next === current`), validerer server-side (siste primary kan ikke fjernes; ikke-synlig primary er ikke lov), skriver audit-rad, og kaller `revalidateTag('format-mapping', 'max')` så wizarden ser oppdatert state.
- [`FormatsManager`](app/admin/formats/FormatsManager.tsx) — client-komponent som eier `useOptimistic`-state for hele matrix + cup-section + active-flags. Renderer både desktop matrix og mobile tabs i samme DOM via Tailwind responsive klasser. Server-action submission kjøres i `startTransition` — React rollback-er state automatisk ved feil.
- [`AuditLogList`](app/admin/formats/AuditLogList.tsx) — siste 50 endringer med norsk visningstekst per change-type. Accordion på mobil, åpen seksjon på desktop.
- [`RowStatusChip`](app/admin/formats/RowStatusChip.tsx) — Aktiv/Inaktiv/Ny pill med klikk-handler for active-toggle.
- [`FormatsIcon`](components/icons/Icons.tsx) — ny 3×3-grid-ikon i samme stil som resten av iconset-en, brukt på admin-tile.

#### Changed
- [`app/admin/page.tsx`](app/admin/page.tsx) — ny «Formats»-tile i admin-grid (admin-only), pekes på `/admin/formats`. Eksisterende tile-mønster bevart.
- [`lib/admin/auditLog.ts`](lib/admin/auditLog.ts) — `AdminAuditEventType`-union utvidet med `'format_mapping_change'`.

#### Tests
- 4 Type C render-tester: `FormatsManager.test.tsx` (matrix + tabs + action-dispatching), `RowStatusChip.test.tsx`, `AuditLogList.test.tsx` (entries + empty-state).

Foundation for epic [#270](https://github.com/jdlarssen/golf-app/issues/270) — siste fase. F1 (datamodell), F2 (intent-først wizard) og F3 (admin-mapping) sammen gir kompletten katalog-styrings-løype.

</details>

</details>

---

## 1.40.y — Intent-først wizard (Fase 2 av format-katalog-epic)

<details>
<summary><strong>1.40.y — Intent-først wizard (1 oppføring) — klikk for å vise</strong></summary>

Issue [#272](https://github.com/jdlarssen/golf-app/issues/272), fase 2 av [#270](https://github.com/jdlarssen/golf-app/issues/270). «Sett opp ny runde» starter nå med et arrangement-valg (Kompis / Klubb / Cup / Solo) som filtrerer spillformene i neste steg. Cup-flyten er smeltet inn som ett av de fire valgene — den separate «Opprett ny Cup»-knappen er borte, alt skjer fra samme inngang.

### [1.40.0] - 2026-05-27

> Når du oppretter en ny runde, velger du først hva slags arrangement: Kompis-runde, Klubb-turnering, Cup eller Solo. Steg 2 viser bare formats som passer til det du har valgt, så listen er kortere og mer relevant. Cup-oppsettet ligger nå i samme flyt — du trenger ikke å lete etter en egen «Opprett ny Cup»-knapp lenger.

<details>
<summary>Teknisk</summary>

#### Added
- [`IntentSelector`](app/admin/games/new/IntentSelector.tsx) — ny wizard step 1 med 4 intent-kort (Kompis / Klubb / Cup / Solo) i 2×2 mobil-grid. Hvert kort er ≥140px høyt med ikon over tekst, radiogroup-aria-mønster så tastatur-nav fungerer.
- [`FormatGrid`](app/admin/games/new/FormatGrid.tsx) — ny wizard step 2 hovedflyt (Kompis / Klubb / Solo). Leser `getFormatsForIntent(intent)` fra F1-helperen, partisjonerer på `is_primary` i UI-laget. Primary-kort i 2×2-grid, sekundære i 2-kolonners kompakt strip.
- [`CupSetup`](app/admin/games/new/CupSetup.tsx) — ny wizard step 2 cup-variant. Lag-navn (2 felt), points-to-win, fourball-allowance-toggle og multi-select av cup-eligible formats. Gjenbruker `createTournamentDraft`-action; multi-select er UI-only i fase 2 (default-all), persistens utsatt til Wave-2-issue.
- [`SideTournamentsBanner`](app/admin/games/new/SideTournamentsBanner.tsx) — informasjons-banner nederst i step 2 som peker til Klar-steget for side-tournament-oppsett.
- [`lib/formats/icons.tsx`](lib/formats/icons.tsx) — slug → ikon-komponent-mapping for de 6 seedede formats + en generisk fallback for fremtidige slugs. 28×28 inline-SVG i samme stil som `ModeSelector` for visuell konsistens.

#### Changed
- [`GameWizard`](app/admin/games/new/GameWizard.tsx) — 4-stegs → 5-stegs flyt. Nye steg-titler: Arrangement → Format → Bane og tidspunkt → Spillere → Klar. Cup-creation diverger til 2-stegs flyt (Intent → CupSetup) som submitter direkte til `createTournamentDraft`. Cup-link (`?tournament_id=...`) går fortsatt gjennom standard 5-stegs flyt med format låst via `lockGameMode`.
- [`useGameFormState`](app/admin/games/new/useGameFormState.ts) — ny `formatChosen`-boolean så step 2 kan vite om bruker har klikket et format eller om `gameMode` bare er default-en. Settes til true når `handleModeChange` kalles eller når `initialValues.game_mode`/`lockGameMode` passerer eksplisitt format inn.
- [`app/admin/games/new/page.tsx`](app/admin/games/new/page.tsx) og [`app/opprett-spill/page.tsx`](app/opprett-spill/page.tsx) — pre-fetcher format-katalogen for alle ikke-cup-intents + cup-eligible-listen parallelt (4 unstable_cache-queries), passerer til wizard som props.

#### Tests
- 14 GameWizard-render-tester oppdatert til 5-stegs flyt + ny cup-intent-test. Mode-navigasjon i hver test starter nå med intent-valg + format-valg før bane/spillere/klar.

</details>

</details>

---

## 1.39.y — Netto/brutto-bryter på tvers av alle spillmodi

<details>
<summary><strong>1.39.y — Netto/brutto-bryter på tvers av alle spillmodi (2 oppføringer) — klikk for å vise</strong></summary>

Issue [#266](https://github.com/jdlarssen/golf-app/issues/266), oppfølger til [#217](https://github.com/jdlarssen/golf-app/issues/217). Bryteren som fourball-flyten fikk i forrige runde rulles ut til alle spillmodi: stableford, slagspill, singles matchplay, best ball og Texas scramble har nå samme valg mellom netto (med prosent-andel av handicap) og brutto (uten handicap). Mode-navnene er ryddet opp samtidig — `best_ball_netto` og `solo_strokeplay_netto` mister `_netto`-suffixet siden de nå kan spilles begge veier.

### [1.39.1] - 2026-05-27

> Klargjort under panseret for en mye større format-katalog. Du ser ingenting nytt i appen ennå — alt blir aktivert etter hvert som de nye spilltypene lander.

<details>
<summary>Teknisk</summary>

#### Added
- [supabase/migrations/0047_formats_and_intent_mapping.sql](supabase/migrations/0047_formats_and_intent_mapping.sql) — `formats`-tabell som master-katalog over spilltyper (slug, display_name, icon_key, scoring_module, is_active, is_cup_eligible) og `format_intent_mapping`-tabell for admin-styrt wizard-placement per intent (kompis/klubb/solo). RLS: read for alle authenticated, write kun for admin. CHECK-constraint `primary_implies_visible` på mapping-tabellen. Seeded de 6 eksisterende formats — stableford, best_ball, texas_scramble, solo_strokeplay, singles_matchplay (cup-eligible) og fourball_matchplay (cup-eligible) — med default mapping.
- [lib/formats/getFormatsForIntent.ts](lib/formats/getFormatsForIntent.ts) — tag-cached server-helper som henter synlige formats for en intent, sortert primary-først. `getCupEligibleFormats()`-helper for Cup step-2-pickeren. Begge tagget `format-mapping` for invalidasjon fra senere admin-mutasjoner.
- [lib/formats/validateGameMode.ts](lib/formats/validateGameMode.ts) — `isValidActiveGameMode(slug)` for server-action-validering ved opprettelse av nye games (erstatter DB-CHECK).

#### Removed
- `games_mode_check`-CHECK-constraint på `public.games`. Server-action-validering tar over fordi `formats`-tabellen er ny sannhets-kilde — hver fremtidig format-issue trenger kun en INSERT i `formats`, ingen CHECK-rebuild. Constraint-en ble re-bygget av migrasjon 0046; 0047 dropper den til fordel for formats-katalogen.

Foundation for epic [#270](https://github.com/jdlarssen/golf-app/issues/270) (intent-først wizard-redesign). Issuet: [#271](https://github.com/jdlarssen/golf-app/issues/271).

</details>

### [1.39.0] - 2026-05-27

> Du kan nå spille brutto (uten handicap) i alle spillmodi — ikke bare fourball. Nytt valg øverst i «Format»-seksjonen lar deg bytte mellom netto (med en andel av handicap) og brutto (ingen handicap). Stableford, slagspill, singles matchplay, best ball og Texas scramble har nå samme bryter som fourball fikk i forrige runde.

<details>
<summary>Teknisk</summary>

#### Added
- Generalisert [`<AllowanceField>`](components/admin/AllowanceField.tsx) i `components/admin/` — mode-agnostisk netto/brutto-toggle med parametrisert `fieldName`, `defaultPct`, `legend`, `description`, `nettoHelperText`, `bruttoHelperText`, `inputLabel`. Kontrollerbar/ukontrollerbar hybrid; `lastNettoPct`-memo så brutto→netto-bytte gjenoppretter forrige verdi; radio-group-navn deriveres fra `fieldName` så flere instanser på samme side ikke kolliderer. 7 unit-tester dekker toggle-tilstandsmaskinen.
- Migrasjon [0046_drop_netto_suffix.sql](supabase/migrations/0046_drop_netto_suffix.sql) — `best_ball_netto` → `best_ball`, `solo_strokeplay_netto` → `solo_strokeplay`. Atomisk transaksjon: drop check constraint, backfill rader, recreate constraint med ny verdi-sett. Kjøres via Supabase MCP samtidig som kode-deploy.
- [`bruttoHelperFor()`](lib/games/allowanceCopy.ts) — per-mode brutto-forklarende tekst delt mellom GameForm og GameWizard så samme copy ikke duplikat-vedlikeholdes. Stableford → «poeng beregnes på gross mot par», matchplay → «scratch-matchplay», osv.

#### Changed
- [GameForm](app/admin/games/new/GameForm.tsx) og [GameWizard](app/admin/games/new/GameWizard.tsx) Section 3 (Format) rendrer nå `<AllowanceField>` for alle modi: fourball (eksisterende), best_ball/stableford/singles_matchplay/solo_strokeplay (ny, skriver til `hcp_allowance_pct`, default 100), texas_scramble (ny, skriver til `texas_team_handicap_pct`, default per team-size 25/10). Texas-AllowanceField har `key={teamSize}` så toggle-state re-initialiseres ved team-size-bytte.
- [`useGameFormState`](app/admin/games/new/useGameFormState.ts): `hcpAllowance` og `texasHandicapPct` endret fra `string` til `number` for å matche AllowanceField-API. `allowanceNum`-alias droppet — staten selv er numerisk. Boundary-konvertering til `String(...)` der HTML `value`-prop eller `InitialValues`-type-kontrakten krever det.
- Mode-rename gjennomført på tvers av kodebasen (~50 filer): `GameMode`-union, `MODE_LABELS`, scoring-modul-filnavn (`bestBallNetto.ts` → `bestBall.ts`, `soloStrokeplayNetto.ts` → `soloStrokeplay.ts`), validator-funksjonsnavn (`validateBestBallNetto` → `validateBestBall`, etc.), mail-templates, leaderboard-views, test-fixturer og JSDoc-kommentarer. Mode-router-resultattype `BestBallNettoResult` ble `BestBallResult`; lokal per-hull-helper i `bestBall.ts` renamed til `BestBallHole` for å unngå navnekollisjon.

#### Removed
- [Section 6 (`AdvancedSettingsSection`)](app/admin/games/new/sections/AdvancedSettingsSection.tsx) mister allowance-blokken (både non-texas HCP-allowance-input og Texas Lag-handicap-input + tilhørende `Input`-import og state-destructures). Section 6 har nå kun peer-approval + visibility + sideturnering — single-purpose «Innstillinger».
- [`<FourballAllowanceField>`](components/cup/FourballAllowanceField.tsx) slettet (sammen med tom `components/cup/`-mappe) — alle tre callere (cup-create-form, GameForm, GameWizard) migrert til den generaliserte `<AllowanceField>` med fourball-spesifikke props.

</details>

</details>

---

## 1.38.y — Four-ball matchplay (Ryder Cup fase 2)

<details>
<summary><strong>1.38.y — Four-ball matchplay (Ryder Cup fase 2) (1 oppføring) — klikk for å vise</strong></summary>

Issue [#217](https://github.com/jdlarssen/golf-app/issues/217), fase 2 av [#47](https://github.com/jdlarssen/golf-app/issues/47). Cup-grunnmuren fra fase 1 utvides med four-ball matchplay: 2 mot 2 med best-ball-aggregering per hull, matchplay-overlay som regner ut «X up», «AS» og «3&2» på samme måte som singles-matchplay. Hver cup setter sin egen handicap-andel: netto med valgfri prosent, eller helt brutto.

### [1.38.0] - 2026-05-26

> Du kan nå sette opp fourball-matches (2 mot 2) i Ryder Cup-turneringene dine. Hvert lag har to spillere, hver med sin egen ball. Laget vinner hullet med den laveste netto-scoren av de to, og lagene møtes hull-for-hull som matchplay. Du velger handicap-andelen per cup: 85 % for en vanlig runde med kompisene, eller 0 % for ekte Ryder Cup-stemning helt uten handicap.

<details>
<summary>Teknisk</summary>

#### Added
- Ny scoring-modus `fourball_matchplay` i [lib/scoring/modes/fourballMatchplay.ts](lib/scoring/modes/fourballMatchplay.ts) — 2v2 best-ball med matchplay-overlay. Komponerer eksisterende helpers: `applyAllowance` + `strokesForHole` per spiller, `bestBallForHole` for lag-best per hull, og `classifyMatchplayHole` + `computeMatchResult` (begge fra singles) for hull-utfall og match-format. Empty-shell defensive ved 0/1/3-spiller-context. 17 unit-tester dekker happy-path, mat-em, AS, allowance 0/50/85/100, blandet-kjønn-tees, og partial-state.
- Migrasjon [0045_fourball_matchplay.sql](supabase/migrations/0045_fourball_matchplay.sql) utvider `games_mode_check` med `fourball_matchplay` og legger til `tournaments.fourball_allowance_pct` (smallint, 0..100, default 85 = WHS-standard). `0` betyr brutto, `1..100` betyr netto med den prosenten — én kolonne dekker begge tilstander.
- Validator [`validateFourballMatchplay`](lib/games/gamePayload.ts) håndhever 4 spillere fordelt 2-2 ved publish, range 0..100 på `fourball_allowance_pct`. 13 nye validator-tester.
- Shared client component [components/cup/FourballAllowanceField.tsx](components/cup/FourballAllowanceField.tsx) — netto/brutto-toggle med synlig allowance-input når netto er valgt. Brukes både i cup-create-form og game-wizard. Cross-wizard-utrulling av samme mønster på andre game-modes spores i [#266](https://github.com/jdlarssen/golf-app/issues/266).
- [getCupSnapshot](lib/cup/getCupSnapshot.ts) generaliserer side1/side2 til arrays for å støtte både singles (1+1) og fourball (2+2). For fourball-matches kjøres `computeFourballMatchplay` og navn joines med «/» (eks. «Per/Knut mot Lise/Eva»). Cup-leaderboard viser lag-fokusert result-tekst («3&2 til Lag Skog») for fourball, spiller-fokusert for singles.
- Per-game scorekort ([app/games/[id]/scorecard/page.tsx](app/games/%5Bid%5D/scorecard/page.tsx)) og match-leaderboard ([app/games/[id]/leaderboard/page.tsx](app/games/%5Bid%5D/leaderboard/page.tsx)) får fourball-rendring: 4 spillere fordelt 2+2 i scorecard-kolonner, matchplay-status i header («Laget ditt er X up etter N hull»), lag-best highlightet per hull, og ny `FourballMatchplayView` med lag-navn fra `tournaments` når matchen tilhører en cup.

#### Changed
- Cup-detalj-side ([app/admin/cup/[id]/page.tsx](app/admin/cup/%5Bid%5D/page.tsx)) erstatter «+ Opprett match»-link med to knapper: «+ Singles match» og «+ Fourball match», hver med riktig `?game_mode=` query.
- Game-wizard ([app/admin/games/new/page.tsx](app/admin/games/new/page.tsx), [GameWizard.tsx](app/admin/games/new/GameWizard.tsx), [GameForm.tsx](app/admin/games/new/GameForm.tsx)) leser `?game_mode=` og pre-fyller mode + team_size + match-label («Fourball N» basert på antall eksisterende fourball-matches i cupen). For fourball pre-fylles `fourball_allowance_pct` fra cup-rad, og netto/brutto-toggle vises i wizarden. Banner-copy speiler valgt modus.
- `CupMatchInput`-shape utvidet med valgfri `gameMode`-discriminator så UI kan velge spiller- vs. lag-fokusert result-tekst.

</details>

</details>

---

## 1.37.y — Funn-seksjon på hjem-siden

<details>
<summary><strong>1.37.y — Funn-seksjon på hjem-siden (2 oppføringer) — klikk for å vise</strong></summary>

Issue [#257](https://github.com/jdlarssen/golf-app/issues/257). Liten oppfølger til selv-påmeldings-flyten: når du logger inn ser du nå åpne turneringer du kan melde deg på rett på hjem-siden, og forespørslene dine som venter på godkjenning.

### [1.37.1] - 2026-05-26

> Velkomst-teksten på hjem-siden bytter nå når det faktisk finnes en åpen turnering du kan melde deg på. Før kunne du se «Be en arrangør om å invitere deg» rett over en seksjon med turneringer å melde seg på — litt rart. Nå sier den «Velg en turnering under» i stedet.

#### Fixed
- [app/page.tsx](app/page.tsx) — `getDiscoverableGames`-fetchen flyttet opp før empty-state-grenen så `hasDiscoveryContent`-flagget kan styre velkomst-tekstvalget. Tre-grens-conditional: `canCreateGame` → opprett-CTA, `hasDiscoveryContent` → «Velg en turnering under», ellers «Be en arrangør om å invitere deg».
- [app/HomeDiscoverySection.tsx](app/HomeDiscoverySection.tsx) tar nå `data`-prop i stedet for å gjøre egen fetch. Caller (`page.tsx`) henter data én gang og gjenbruker det for både tekstvalg og rendring.

### [1.37.0] - 2026-05-26

> Når du logger inn på Tørny ser du nå alle åpne turneringer du kan melde deg på, rett på hjem-siden. Hvis du har sendt en forespørsel som venter på godkjenning, dukker den også opp her, så du slipper å lete etter den i innboksen.

#### Added
- [lib/games/getDiscoverableGames.ts](lib/games/getDiscoverableGames.ts) — server-side helper som henter to lister via admin-client: åpne spill (`registration_mode = 'open'`, status pre-active) brukeren ikke er påmeldt og ikke har aktiv forespørsel på, pluss egne pending-rader fra `game_registration_requests`. Filtrerer i SQL via `not('id', 'in', ...)` med set-union av joined + requested game-ids.
- [app/HomeDiscoverySection.tsx](app/HomeDiscoverySection.tsx) — server-component med to lister (open games m/ «Meld meg på»-knapp til `/signup/[shortId]`, pending requests m/ status-tekst). Returnerer `null` når begge listene er tomme så hjem-sidens dagens tom-tilstand beholdes.
- Seks Vitest-tester for helperen dekker tom-tilstand, exclude-allerede-påmeldte, exclude-pending-request, course-join-mapping, team-request-mapping, og approved-filter (pending kun, ikke approved).

#### Changed
- [app/page.tsx](app/page.tsx) wirer `HomeDiscoverySection` inn for non-admin-brukere mellom velkomst-section og footer. Admin/trusted-creator ser ingen endring — de har egne CTAer for å opprette spill.

</details>

---

## 1.36.y — Selv-påmelding til turnering

<details>
<summary><strong>1.36.y — Selv-påmelding til turnering (2 oppføringer) — klikk for å vise</strong></summary>

Issue [#199](https://github.com/jdlarssen/golf-app/issues/199). Du kan nå sette opp et spill og dele en lenke i stedet for å invitere hver spiller manuelt. For Scramble og andre lagspill kan spillerne samle sitt eget lag, og kapteinen melder på medspillerne med navn eller e-post. Du velger selv om hvem som helst med lenken kan melde seg på, om du vil godkjenne hver påmelding, eller om du fortsatt vil styre invitasjonene som du gjør i dag.

### [1.36.1] - 2026-05-26

> Påmeldings-lenken bruker nå ren engelsk i URL-en (`/signup/...`) i stedet for `/påmelding/...`, slik at å-tegnet ikke lager trøbbel når lenken deles via SMS eller e-post.

<details>
<summary>Teknisk</summary>

#### Fixed
- Vercel-edge feilet å rute URL-encoded `/p%C3%A5melding/...` til siden — ASCII-pathen `/signup/[shortId]` unngår problemet helt. Filsystem-rename: `app/påmelding` → `app/signup`, `app/admin/games/[id]/påmeldinger` → `app/admin/games/[id]/signups`, `e2e/påmelding` → `e2e/signup`. Alle URL-strenger i koden, mail-templates, proxy-whitelist og tester er oppdatert. Norsk UI-tekst («Påmeldinger»-overskrifter, mail-subjects, knappe-tekster) står urørt — det er kun selve URL-pathen som er ASCII.

</details>

### [1.36.0] - 2026-05-26

> Sett opp spillet, kopier lenken, og slipp den i Slack-gruppa, lagpraten eller hvor folk enn er, så melder de seg på selv. Da slipper du å sende invitasjoner én etter én. Vil du ha mer kontroll? Sett påmeldingen til «forespørsel — jeg godkjenner», og du får varsel hver gang noen ber om plass. Kapteinen kan samle sitt eget Scramble-lag: kjente Tørny-brukere får varsel i innboksen, ukjente e-poster får en invitasjon. Spillerne kan også trekke seg selv hvis det skjer noe — du slipper å rydde plassen for dem som faller fra.

<details>
<summary>Teknisk</summary>

#### Added
- Fire nye migrasjoner ([supabase/migrations/0041_games_self_registration_columns.sql](supabase/migrations/0041_games_self_registration_columns.sql) m.fl.) gir `games.registration_mode` (`invite_only`/`manual_approval`/`open`), `games.registration_type` (`solo`/`team`/`both`), og en 8-char `short_id` per spill for delbar lenke. Ny `game_registration_requests`-tabell holder pending-forespørsler + audit-trail for godkjenninger og lag-formasjon. To nye RLS-policies på `game_players` lar spilleren inserte egen rad i open-modus og slette egen rad pre-start.
- Offentlig påmeldings-flate på `/påmelding/[shortId]` med tre flyter: open (direkte-påmelding), manual_approval (forespørsel med valgfri hilsen), og invite_only (les-bare-melding). Kaptein-flyt for lag-påmelding lar første spiller fylle inn medspillere fra eksisterende-bruker-roster eller via e-post.
- Admin-side `/admin/games/[id]/påmeldinger` med approve/reject (cascade for lag-medlemmer), filter-tabs for status, og kopier-lenke-knapp på `/admin/games/[id]`.
- Fem nye notifikasjons-typer (`team_invite`, `registration_request`, `registration_approved`, `registration_rejected`, `team_member_withdrew`) m/ Zod-skjemaer, NotificationCard-rendering og deeplinks i innboksen.
- Fire nye mail-templates ([lib/mail/registrationRequest.ts](lib/mail/registrationRequest.ts), [registrationApproved.ts](lib/mail/registrationApproved.ts), [registrationRejected.ts](lib/mail/registrationRejected.ts), [teamInvitation.ts](lib/mail/teamInvitation.ts)) — best-effort send med gating på `shouldAlsoSendMail` (off-app-terskel), unntatt team-invitation som alltid sendes til ukjente e-poster.
- Rate-limit-helper [lib/auth/registrationRateLimit.ts](lib/auth/registrationRateLimit.ts) med tre buckets (per bruker, per IP, per spill) på `consume_admin_rate_limit`-RPC. Honeypot-felt på alle public server-actions.
- Self-withdraw-flyt på dedikert konfirmasjons-side `/games/[id]/trekk-fra` per destructive-actions-pattern. Notify til kaptein hvis trekk-spilleren var lag-medlem.

#### Changed
- `GameWizard` har nytt «Påmelding»-felt-gruppe på format-steget med radio for modus og type. «Type»-radio er disablet for spill-moder uten lag-konsept (stableford, singles_matchplay, solo_strokeplay_netto). Spiller-steget blir valgfritt når modus er ikke-invite_only — admin kan opprette tomme spill og la folk melde seg på selv.
- `app/(auth)/login/actions.ts:verifyCode` sjekker `games.registration_type` før den auto-inserter solo-rader i `game_players` etter OTP-aksept — unngår CHECK-constraint-brudd på team-only spill.
- `lib/notifications/types.ts` utvidet med fem nye `kind`-verdier og Zod-skjemaer. `registration_request.request_id` er optional fordi open-modus ikke har en request-rad å peke til (kun manual_approval).

#### Notes
- `registration_mode = 'open'` for ukjente e-poster krever at `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION` er aktivert i Vercel ([#166](https://github.com/jdlarssen/golf-app/issues/166)). Hvis flagget er av, faller open-modus tilbake til «kjente brukere kan melde seg på» og ukjente møter samme `user_not_found`-feilen som før.
- Deferred team-attach for ukjente brukere skjer på `/påmelding/[shortId]/team`-siden, ikke i auth-hooken. Siden detekterer en pending `invitations`-rad for spillet og tilbyr en «Bli med på lag»-knapp som plukker nyeste kaptein-request via `created_at DESC`-heuristikk.
- 2770 LOC fordelt over 14 chunks. Tests: 1369 grønne ved feature-completion.

</details>

</details>

---

## 1.35.y — Trygghetsnett for tee-lengde

<details>
<summary><strong>1.35.y — Trygghetsnett for tee-lengde (1 oppføring) — klikk for å vise</strong></summary>

Et mykt varsel under banelengde-feltet i bane-admin når tallet ligger utenfor det som er typisk for norske baner. Fanger tastefeil før de havner i databasen, uten å blokkere lagring ([#236](https://github.com/jdlarssen/golf-app/issues/236)).

### [1.35.0] - 2026-05-26

> Når du taster inn banelengde for en tee i bane-admin, sier appen nå fra hvis tallet ser uvanlig ut for norske forhold. Du blir ikke stoppet fra å lagre — det er bare en hjelpende hånd for å fange åpenbare tastefeil. Hvilket «typisk» intervall som gjelder, avhenger av hvilke kjønn du har lagt inn rating for på tee-en (herre, dame, junior, eller en kombinasjon).

<details>
<summary>Teknisk</summary>

#### Added
- [lib/courses/teeLengthWarning.ts](lib/courses/teeLengthWarning.ts) — pure helper `getTeeLengthWarning(tee)` som regner ut warning-tekst fra `length_meters` + hvilke gender-blokker (mens/ladies/juniors) som er fylt ut. Range-grenser er romslige (±100m) rundt typiske norske tall: herrer 5300–6600 m, damer 4700–5900 m, junior 4400–5600 m. Union-strategi for tee-er med flere gender-ratings (vanligst). Returnerer `null` når ingen gender er aktiv eller length-feltet er tomt/ugyldig. 25 unit-tester dekker alle 7 gender-kombinasjoner + grense-verdier + invalid input.
- `warning?: string | null`-prop på [components/ui/Input.tsx](components/ui/Input.tsx) som rendrer i `text-warning` (amber) på samme plass som `hint`. Prioritet: `error` > `warning` > `hint`. Eksisterende callsites upåvirket.

#### Changed
- [app/admin/courses/CourseForm.tsx](app/admin/courses/CourseForm.tsx) sender `getTeeLengthWarning(tee)` til Banelengde-input-en for hver tee-boks. Warning oppdateres reaktivt når admin endrer length-feltet eller toggler dame-/junior-rating-blokkene.

#### Notes
- DB CHECK på `tee_boxes.length_meters` (1000–12000) endres ikke; warning er ren UI-veiledning og blokkerer ikke lagring. Server-actions berøres ikke.
- Bevisst en hårsbredd videre enn de eksakte tallene i issue #236 (5400–6500 / 4800–5800 / 4500–5500) for å unngå falske advarsler på grenseverdier som 6550 m på en lang herretee.
- Wirer side om side med per-kjønn typisk slope/CR-hint fra 1.30.1 (issue #235). De to gir komplementær veiledning: slope/CR-hint som statisk anker mot tastefeil, length-warning som dynamisk respons på faktisk innskrevet tall.

</details>

</details>

---

## 1.34.y — Per-kjønn-overstyring av hull-par

<details>
<summary><strong>1.34.y — Per-kjønn-overstyring av hull-par (1 oppføring) — klikk for å vise</strong></summary>

Issue [#240](https://github.com/jdlarssen/golf-app/issues/240). Tørny støtter nå at hull kan ha avvikende par for damer eller junior — typisk dame-par-5 der herrer spiller par-4 fordi dame-tee er plassert kortere før et vannhinder. Stableford-poenget regnes riktig per spiller, og par-displayer viser en liten stjerne på hull med par-avvik.

### [1.34.0] - 2026-05-26

> Spillere på dame-tee eller junior-tee får nå riktig par-referanse på hull der tee-en er plassert kortere enn herrenes. Du som arrangerer kan registrere avvik per kjønn i bane-redigeringen — for det vanlige tilfellet der alle kjønn har samme par, ser admin og spillere ingen forskjell.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `supabase/migrations/0040_course_holes_per_gender_par.sql` — `course_holes` har nå `par_mens`, `par_ladies`, `par_juniors` (alle NOT NULL, CHECK 3-6). Backfill setter alle tre kolonner lik gammel `par`-verdi før gammel `par` droppes (forced cutover — ingen produksjons-baner hadde avvikende par på migrasjons-tidspunktet).
- `lib/scoring/modes/parResolver.ts` — `parFor(hole, gender)` returnerer `parByGender[gender ?? 'mens']` eller `hole.par` som fallback. Brukes av alle 4 mode-modulene.
- `lib/games/parDisplay.ts` — `hasParDifference`, `formatOtherGendersPar`, `parForPlayer`-helpere + 14 unit-tester. UI-laget bruker disse til avvik-indikator (statisk `<sup title="...">`-asterisk; tooltip på desktop, long-press på iOS).
- Per-kjønn-par-seksjon i CourseForm: ekspandert toggle under hovedhull-listen for «Avvikende par for damer» og «Avvikende par for junior». Default-kollapset for ~99 % av baner; åpen ved mount på edit-flyt hvis kursen faktisk har avvik. Fjern-knapp tilbakestiller per-kjønn-overstyring til hovedraden. 9 nye tester i `CourseForm.test.tsx`.

#### Changed
- `ScoringHole` får valgfri `parByGender: { mens; ladies; juniors }`-felt. `ScoringPlayer` får valgfri `teeGender: 'mens' | 'ladies' | 'juniors'`. Begge optional — eksisterende test-fixtures uten dem faller tilbake til `hole.par`.
- Alle 4 mode-moduler (`stableford.ts`, `bestBallNetto.ts`, `singlesMatchplay.ts`, `texasScramble.ts`) leser nå par via `parFor(hole, player.teeGender)`. Stableford-poeng-beregningen er den eneste modus som påvirker ranking; de andre tre eksponerer per-spiller-par på celle-shape for UI-rendering. Texas scramble bruker kapteinens (lex-minste userId) `teeGender` som lag-representant. 13 nye scoring-tester.
- Legacy `lib/leaderboard.ts` (best-ball-netto-routen) får parallell støtte: `LbHole.parByGender`, `LbPlayer.teeGender`, `PlayerHoleCell.par` (per-spiller), `TeamHoleRow.parByGender` (propagert for UI). Speilet mode-router-shape.
- Alle 14 SELECT-call-sites mot `course_holes` plukker alle tre par-kolonner. 6 mapper-call-sites (leaderboard, hull-detail, scorecard, submit, approve, statistikk-side + 4 mail-helper-blokker) fyller `parByGender` på ScoringHole og `teeGender` på ScoringPlayer.
- Server-actions for kurs-opprettelse/-edit parser `hole_${i}_par_mens/_ladies/_juniors` fra FormData og setter alle tre kolonner i `course_holes`-INSERT. Tee-boks `par_total_<gender>` regnes nå ut fra summen av per-kjønn-hull-par (auto-sync).
- HoleHero, leaderboard-hull-tab og scorekort viser asterisk etter par-tallet på hull med avvik. Title-attributtet sier «Damer: 5, junior: 4».
- Scorekortet bruker `parForPlayer(parByGender, me.tee_gender)` istedenfor hardkodet `par_mens` for spillerens egen rad (også for stableford-poeng-beregningen i LayoutB).

#### Notes
- Stroke-index per kjønn er ikke i scope — dame-tee bruker normalt samme SI-fordeling. Hvis et behov dukker opp: egen kontrakt.
- Blandet-kjønn Texas-scramble-lag bruker kapteinens `teeGender` som lag-par-default. Fungerer for vanlige tilfeller; sjeldne edge-cases (lag på 4 med to herrer og to damer på avvikende-par-hull) får herre-par fordi kapteinen typisk er en herre. Refines hvis bruk-mønsteret krever det.
- Historiske spill: `course_holes` er ikke frozen ved game-start, så en endring av `par_ladies` på en bane kan endre stableford-poeng for ferdige spill på den banen. Pre-eksisterende svakhet (gjelder også gammel `par` og `stroke_index`); ikke utvidet i denne lanseringen.

</details>

</details>

---

## 1.33.y — Sekretariatet, friksjons-rydding

<details>
<summary><strong>1.33.y — Sekretariatet, friksjons-rydding (2 oppføringer) — klikk for å vise</strong></summary>

Tredje runde med små admin-polish-grep fra fase 1 av [#223](https://github.com/jdlarssen/golf-app/issues/223). Mål: kortere vei til recovery når noe går skeivt i bane-skjemaet. Patch lagt på toppen som forvarsler admin når par eller stroke-indeks endres på en bane med spill som pågår.

### [1.33.1] - 2026-05-26

> Når du endrer par eller stroke-indeks på en bane som brukes i et spill som pågår eller er planlagt, spør appen nå om du er sikker. Mid-runde-endringer påvirker netto-resultatet for spillere som allerede har levert kort, så du får sjansen til å avbryte før lagring går gjennom. Bane-navn og tee-data trigger ingen advarsel — kun hull-endringene som faktisk skifter scoringen.

<details>
<summary>Teknisk</summary>

#### Added
- `hasHoleChanges(initial, current)`-helper i [app/admin/courses/CourseForm.tsx](app/admin/courses/CourseForm.tsx) sammenligner per-hull `par` og `stroke_index` med baselinen fra server. Returnerer `false` når initial-listen er undefined (create-flyten har ingen baseline) eller når alle par/SI matcher. Defensive default ved manglende hull i initial.
- Ny prop `affectedGamesCount` (default 0) på `CourseForm`. `onSubmit`-handler trigger `window.confirm` kun når både `affectedGamesCount > 0` og `hasHoleChanges` returnerer true. Cancel kaller `event.preventDefault()` så form-state beholdes uendret.
- [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/%5Bid%5D/edit/page.tsx) henter `count: 'exact', head: true` mot `games` filtrert på `course_id` + `status IN ('active', 'scheduled')` parallelt med hull/tee-fetchene. Resultatet sendes som prop til `CourseForm`. Count-feil defaultes til 0 (fail-open) så transient DB-feil ikke blokkerer redigering.
- Fem nye vitest-cases for `hasHoleChanges` (no-change, par-change, SI-change, manglende initial, kortere initial-liste) og fem cases for confirm-gaten (vises ved par-endring + count > 0, ikke ved uendrede hull, ikke ved count 0, ikke på /new, entall-form ved count 1).

#### Notes
- Tee-data (slope/CR/length) trigger ikke advarselen fordi `game_players.course_handicap` fryses ved game-start. Kun per-hull-par og stroke-indeks leses live av scoring-laget under et pågående spill.
- Server-action `updateCourse` har ingen ny blokk — advarselen er rent UX-laget. Admin kan fortsatt lagre par-endringer mid-spill om de gjør det bevisst.
- `window.confirm` valgt over custom modal for å matche eksisterende mønster i [DeleteCourseButton.tsx](app/admin/courses/%5Bid%5D/edit/DeleteCourseButton.tsx). Plain-text-begrensningen er årsaken til at dialogen viser antall, ikke spill-navn.

</details>

### [1.33.0] - 2026-05-26

> En liten «Tøm dette kjønnet»-lenke i bane-skjemaet rydder slope og CR for ett kjønn med ett trykk. Hjelper hvis du har fylt inn bare det ene feltet og får «kan ikke lagre halve sett»-feilen.

<details>
<summary>Teknisk</summary>

#### Added
- «Tøm dette kjønnet»-lenke i [GenderRatingBlock](app/admin/courses/CourseForm.tsx) i bane-skjemaet — nullstiller `slope_<gender>` og `course_rating_<gender>` i ett klikk uten å kollapse blokken. Synlig kun når minst ett felt har innhold.
- Visibility-regelen for herrer-blokken er asymmetrisk: skjult på new-flyten så lenge feltene matcher default (slope 113 / CR 70.0), synlig på edit-flyten så snart minst ett felt har innhold. Hindrer at admin utilsiktet tømmer prefylte defaults på en fersk bane.
- Ni nye Vitest-tester i [CourseForm.test.tsx](app/admin/courses/CourseForm.test.tsx) som dekker visibility-regelen (new vs edit, herrer-default vs damer-tom), clear-handler-semantikk, og at blokken forblir ekspandert etter Tøm. Refs [#238](https://github.com/jdlarssen/golf-app/issues/238).

#### Changed
- «Fjern dame-rating» / «Fjern junior-rating»-knappene erstattes av én konsekvent «Tøm dette kjønnet»-lenke på alle tre kjønn. Etter Tøm forblir blokken ekspandert med tomme felt — tom slope + tom CR for et kjønn er gyldig submit-state, så ingen affordance for å re-kollapse trengs.
- `toggleGenderExpand` forenklet til `expandGender` siden clear-pathen er flyttet ut i sin egen funksjon `clearGender`.

#### Notes
- Ingen endring i server-actions, migrasjoner eller validering. Partial-rating-feilmeldingen («Hver tee må ha både slope og CR (eller ingen av dem) per kjønn») trigger fortsatt korrekt — den nye knappen er en raskere recovery-flyt for samme feil, ikke en omveiing av regelen.

</details>

</details>

---

## 1.32.y — «Sist spilt»-indikator på bane-listen

<details>
<summary><strong>1.32.y — «Sist spilt»-indikator på bane-listen (1 oppføring) — klikk for å vise</strong></summary>

Issue [#239](https://github.com/jdlarssen/golf-app/issues/239). Vedlikeholds-flaten for baner viser nå når hver bane sist ble brukt, og lar deg sortere og filtrere på det.

### [1.32.0] - 2026-05-26

> Bane-listen viser nå når hver bane sist ble brukt i et spill, og du kan sortere på det. Det nye filteret «Spilt siste 30 dager» plukker ut banene som er i bruk nå. Det blir enklere å skille aktive baner fra gamle eksperimenter når katalogen vokser.

#### Added
- Ny pure helper `app/admin/courses/derive.ts` med `deriveLastPlayedAt(games)` + flyttet `deriveCourseItem` ut av `page.tsx` for å gjøre dem rene testbare uten server-deps. `deriveLastPlayedAt` returnerer MAX av `ended_at` for finished spill og `scheduled_tee_off_at` for active; ignorerer draft + scheduled.
- Ny sort-option «Sist spilt» i `CoursesLedgerClient` (`?sort=last_played`). Sorterer `last_played_at` desc med null-baner sist og navn-asc tie-break.
- Ny filter-chip «Spilt siste 30 dager» (`?recent=1`). Cutoff beregnes client-side på render-tid via `Date.now()`; vinduet er en konstant i komponenten (30 dager).
- 11 nye unit-tester i `app/admin/courses/derive.test.ts` for `deriveLastPlayedAt` + `deriveCourseItem`. 11 nye tester i `CoursesLedgerClient.test.tsx` for kicker-prioritet, ny sort, ny filter, URL-state-roundtrip.

#### Changed
- `getCourses` embed-fetcher nå `games(status, scheduled_tee_off_at, ended_at)` i samme PostgREST-call (var: `games(status)`). Ingen ekstra round-trip; embed-shapen er fortsatt single-fetch.
- `rowKicker` prioriterer «Sist spilt {dato}» når banen har vært spilt; ellers fallback til eksisterende «Endret»/«Lagt til»-logikk.
- `CoursesLedgerItem` utvidet med `last_played_at: string | null`. `SortBy`-union utvidet med `'last_played'`. `Filters` utvidet med `playedRecently: boolean`.

#### Notes
- Ingen migrasjon. `games.scheduled_tee_off_at` (fra [0010](supabase/migrations/0010_scheduled_status_and_tee_off.sql)) og `games.ended_at` (fra [0001](supabase/migrations/0001_initial_schema.sql)) finnes allerede.
- Cache er react `cache`-wrappet og refetcher per request — nye spill plukkes opp på neste page-load uten `revalidateTag`-kobling.
- Den eksisterende statiske «sortert nyeste først»-teksten på `CourseCountLine` er ikke oppdatert til å speile dynamisk sort. URL-styrt sort kan misvise tellelinjen; egen oppgave hvis det blir et problem.

</details>

---

## 1.31.y — Ryder Cup-stil cuper

<details>
<summary><strong>1.31.y — Ryder Cup-stil cuper (2 oppføringer) — klikk for å vise</strong></summary>

Fase 1 av [#47](https://github.com/jdlarssen/golf-app/issues/47). Du kan nå binde flere matchplay-runder sammen til én lag-vs-lag-cup, og følge fordelingen av point på et felles leaderboard. Patch på toppen ([#234](https://github.com/jdlarssen/golf-app/issues/234)): liten kopier-snarvei på tee-rating-skjemaet.

### [1.31.1] - 2026-05-26

> Du kan nå kopiere herrer-rating-en til damer og junior med ett klikk når du legger inn en ny bane eller redigerer en eksisterende. Knappen «Kopier til alle kjønn» dukker opp under herrer-feltene så snart slope og CR er fylt ut, og forsvinner igjen når begge andre kjønn har egne verdier. Justér gjerne etterpå om damene faktisk skal ha en annen slope.

#### Added
- [app/admin/courses/CourseForm.tsx](app/admin/courses/CourseForm.tsx) `copyMensToAllGenders(index)` — én ny click-handler som setter `slope_ladies`/`course_rating_ladies`/`slope_juniors`/`course_rating_juniors` til herrer-verdiene og auto-ekspanderer kollapsede dame/junior-blokker. Tekst-lenke-stil-knapp (`text-[11px] text-muted hover:text-text`) rendres mellom herrer-blokken og dame-toggle-en, kun synlig når herrer er fullt utfylt og minst ett dame/junior-felt mangler verdi.
- Seks nye Vitest-cases i [app/admin/courses/CourseForm.test.tsx](app/admin/courses/CourseForm.test.tsx) — dekker synlighet (herrer-tom, begge kjønn-fulle), klikk-ekspansjon med riktig verdi, overskriv-semantikk på allerede-fylte dame-felt, og per-tee uavhengighet i en to-tee-konfigurasjon.

#### Notes
- Overskriv-semantikk er bevisst: klikket setter alltid dame/junior til herrer-verdiene. Forenkler mental modell mot «fyll-bare-tomme»; admin kan justere etterpå hvis tallene faktisk skal være forskjellige (per issue-tekst).
- `par_total` per kjønn kopieres ikke. Den er auto-beregnet fra hull-pars og er kun lese-verdi i `GenderRatingBlock`-fieldset-en.
- Utsatt fra Fase 1 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223).

### [1.31.0] - 2026-05-26

> Du kan nå sette opp en cup som binder flere matchplay-runder sammen mot hverandre. Lag «Team Skog» og «Team Sjø» kan møtes over flere matches gjennom helgen, og første lag til point-målet (typisk 4,5 av 8) vinner cupen. Hver match teller som vanlig — vunnet match = 1 point, halvert (AS) = 0,5 til hvert lag. Når cupen avsluttes går det ut en e-post til alle deltakere med vinneren og sluttresultatet.

#### Added
- Ny migrasjon [supabase/migrations/0039_tournaments.sql](supabase/migrations/0039_tournaments.sql) med `tournaments`-tabell (navn, lag-navn, points_to_win, status draft/active/finished, winner_team) + `games.tournament_id` (FK med `ON DELETE SET NULL`) + `games.tournament_match_label`. RLS lar alle innloggede lese cup-en.
- Ren scoring-aggregator [lib/cup/computeCupLeaderboard.ts](lib/cup/computeCupLeaderboard.ts) — mapper match-summary-er til lag-points (1 / 0,5 / 0) og deklarerer vinner når point-mål er nådd. 11 unit-tester dekker alle kombinasjoner (vunnet, halvert, in-progress, blanding, vinner-deklarert, eksplisitt winner_team fra DB).
- Komposisjons-laget [lib/cup/getCupSnapshot.ts](lib/cup/getCupSnapshot.ts) — laster tournament + matches + game_players + scores + course_holes, kjører `singlesMatchplay.compute` per match, aggregerer til master-leaderboard. Returnerer `{tournament, leaderboard, roster}` for både admin-detalj og offentlig leaderboard.
- Server-actions i [lib/cup/actions.ts](lib/cup/actions.ts): `createTournamentDraft`, `updateTournament`, `startTournament` (krever ≥2 matches), `finishTournament` (avgjør winner_team fra leaderboard), `deleteTournament`. Alle gated på `requireAdmin`. Start/finish kjører best-effort `Promise.allSettled`-fan-out til deltakere via to nye Resend-maler i [lib/mail/cupStartedNotification.ts](lib/mail/cupStartedNotification.ts) og [lib/mail/cupFinishedNotification.ts](lib/mail/cupFinishedNotification.ts).
- Admin-flate på [app/admin/cup/](app/admin/cup): list-side, opprett-side, detalj-side (cup-info, master-leaderboard-preview, lag-roster, matches-liste, start/avslutt-knapper), og dedikert slett-konfirmasjons-side per destructive-actions-pattern.
- Offentlig master-leaderboard på [app/cup/[id]/page.tsx](app/cup/%5Bid%5D/page.tsx). Store lag-point med `font-serif tabular-nums 5xl`, champagne-gold-accent på vinner-lag når cup-en er ferdig. Auth-gated av `proxy.ts` (innlogget-only, ikke admin-only).
- «Cuper»-tile på [app/admin/page.tsx](app/admin/page.tsx) med count av aktive cuper.

#### Changed
- [app/admin/games/new/page.tsx](app/admin/games/new/page.tsx) leser nå `?tournament_id=` og pre-fyller `game_mode='singles_matchplay'` + `lock_game_mode=true` + auto-genererer match-label «Singles N». Submit redirecter tilbake til `/admin/cup/[id]` med revalidateTag for `tournament-${id}`. Hidden inputs i både `GameForm` og `GameWizard.FormDataInputs` slik at både wizard-mode og full-mode-form-en sender med cup-koblingen.
- `lib/database.types.ts` regenerert med nye `tournaments`-rad + `games.tournament_id` / `tournament_match_label`-kolonner.

</details>

---

## 1.30.y — Spill-invitasjoner med bell-prikk

<details>
<summary><strong>1.30.y — Spill-invitasjoner med bell-prikk (2 oppføringer) — klikk for å vise</strong></summary>

Issue [#182](https://github.com/jdlarssen/golf-app/issues/182). Notifikasjons-systemet kobler seg nå på spill-rosteren. Når admin legger en spiller til på et spill kommer bell-prikken med en gang, både for kompiser som allerede har Tørny og for nye som inviteres på e-post. Patch på toppen ([#235](https://github.com/jdlarssen/golf-app/issues/235)) la til typisk-range-hint på slope/CR-feltene i bane-skjemaet.

### [1.30.1] - 2026-05-26

> Når du taster slope og CR for en tee, ser du nå hva som er typisk på norske baner — gjør det lettere å fange opp en tastefeil før du lagrer.

#### Added
- [app/admin/courses/CourseForm.tsx](app/admin/courses/CourseForm.tsx) — `TYPICAL_HINTS`-const per kjønn (mens/ladies/juniors) mapper til `{slope, cr}`-tekst. Videresendes til `Input`-komponentens eksisterende `hint`-prop ([components/ui/Input.tsx:29-31](components/ui/Input.tsx:29)), som rendrer muted `text-xs`-tekst rett under feltet. Identisk visuell vekt med eksisterende banelengde-hint.
- Hint-tall: herre slope 110–135 / CR 67–72, dame 115–140 / 68–73, junior 95–125 / 60–68. Bruker norsk lang-tankestrek (U+2013) per humanizer-konvensjon.
- Fire nye vitest-cases dekker hver av de tre kjønns-blokkene + at hint forsvinner når en blokk kollapses. Eksisterende 16 CourseForm-tester upåvirket.

#### Notes
- Statisk hint, ingen dynamisk soft-warning på verdier utenfor typisk range. Begrunnelse: holder kompleksiteten lav og fanger den dominerende feilen («CR-tall i slope-feltet») ved at admin ser intervallet før de taster.
- Beholder eksisterende herre-placeholder (113 / 70.0). Damer/junior beholder tomme placeholders — vi vil ikke pre-foreslå konkrete tall der admin oftere taster verdier som avviker fra suggested-value.
- Utsatt fra Fase 1 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223). Ingen DB-migrasjon, ingen scoring-impact.

### [1.30.0] - 2026-05-26

> Spillere som blir lagt til et spill får nå et varsel i appen, i tillegg til e-posten. Bell-prikken lyser så snart admin har lagt deg på rosteren, slik at du oppdager turneringen før spillet starter.

#### Added
- Ny helper `lib/notifications/notifyInvitedToGame.ts`: henter spill + inviter, bygger `invite`-payload og kaller `notify()` best-effort. Skipper finished-spill. Brukes fra alle tre nye call-sites under.
- Ny «Inviter spillere»-card på `/admin/games/[id]` for draft/scheduled-spill: substring-søk i registrerte brukere med per-rad «+ Legg til», pluss e-post-invite-felt under. Mode-aware kapasitets-banner gjør best-ball-card-en utilgjengelig ved 8/8.
- Server-actions `addExistingPlayerToGame` + `inviteEmailToGame` (`app/admin/games/[id]/inviteToGameActions.ts`). Authz via `requireAdminOrTrustedCreator`, status-/kapasitets-/duplikat-checks, idempotent UNIQUE-violation-håndtering.
- Mail-utvidelse `lib/mail/inviteNotification.ts` tar valgfri `gameName`-param. Game-scoped subject: «Du er invitert til {gameName} på Tørny», med spill-navnet også i body-en. Eksisterende friend/admin-invite-bruk er uendret.

#### Changed
- `createGameDraft` + `createAndPublishGame` (`app/admin/games/new/actions.ts`) fyrer `notifyInvitedToGame` for hver ny spiller på rosteren (skipper inviter selv).
- Edit-flytens `updateGameInternal` (`app/admin/games/[id]/edit/actions.ts`) snapshot-er pre-update-rosteren og fyrer notify kun for spillere som er nye i diff-en. Eksisterende spillere får ikke duplikat-varsel når admin lagrer uten endring.
- `verifyCode`-actionen (`app/(auth)/login/actions.ts`) plukker opp game-scoped pending invitasjoner etter OTP-verify, inserter spilleren i `game_players`, og fyrer notify deferred. Login-redirecten kjører uavhengig av om side-effektene lykkes.
- Mark-as-read-hooken på `/admin/games/[id]` markerer nå også `invite`-kind for spillet, slik at bell-prikken forsvinner straks admin/invitee åpner runden.

#### Notes
- `inviteSchema` (`lib/notifications/types.ts`) er uendret — `game_id` forblir strikt ikke-null. Friend-invite og admin-invite uten spill-kontekst fyrer fortsatt kun e-post (ingen in-app-notifikasjon).
- Card-rendering er server-fetcha (limit 200 registrerte brukere) — kompis-skala fyller aldri taket, klubb-skala kan trenge paginering senere.

</details>

---

## 1.29.y — Selv-registrering for nye spillere

<details>
<summary><strong>1.29.y — Selv-registrering for nye spillere (1 oppføring) — klikk for å vise</strong></summary>

Lar nye besøkende få OTP-kode på `/login` uten admin-mellomledd, bak en kill-switch og to lag rate-limit. Forberedelse til å åpne tornygolf.no for spillere utenfor kompisgjengen ([#166](https://github.com/jdlarssen/golf-app/issues/166)).

### [1.29.0] - 2026-05-26

> Nye besøkende kan nå skrive inn e-posten sin på innloggings-siden og få kode — uten at en admin må invitere dem først. Funksjonen er av i starten og slås på i Vercel manuelt etter at vi har testet den på preview. Et stille rate-vern på baksiden stopper noen som prøver å spamme inn forsøk.

#### Added
- [lib/auth/loginRateLimit.ts](lib/auth/loginRateLimit.ts) — `consumeLoginRateLimit({ email, ip })` gjenbruker `consume_admin_rate_limit`-RPC med nye bucket-prefikser (`login:email:<email>`, `login:ip:<ip>`). Default: 3 sendCode per e-post per 15 min, 10 per IP per 15 min. Service-role-call for å unngå GRANT-justering på en pre-auth RPC. Fail-open på DB-feil så en transient outage ikke låser alle ute. Sju unit-tester dekker happy-path, begge bucket-deny-stier, lowercase-normalisering, custom-limits, RPC-error- og throw-fail-open.
- Ny env-var `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION` (default `false`). Når `true`: ikke-inviterte e-poster får `shouldCreateUser=true` mot Supabase Auth OTP og en konto blir laget ved første `verifyOtp`. Kill-switch: sett tilbake til `false` i Vercel og redeploy.
- Conditional hjelpe-tekst under e-post-feltet på `/login` («Skriv inn e-posten din. Er du ny her, lager vi en konto til deg.») kun synlig når flagget er på. Server-resolved env-verdi sendes som prop til client-komponenten så Next.js sin `NEXT_PUBLIC_*`-inlining ikke bites mot client-side condition.
- Tre nye Vitest-suiter på `/login` server-action: flag-on/off-routing, rate-limit-deny på e-post- og IP-bukket (samme `rate_limited`-redirect, ingen leak av hvilken bucket som tripp), honeypot-kortcircuit verifiserer at rate-limit-RPC ikke kalles. Ny component-test for `SendCodeForm` som dekker hjelpe-tekst-toggle. Playwright-smoke utvidet til å asserere default-off-state.

#### Changed
- Empty-state-kopi på `/` for ikke-creator endret fra «Du er klar. Admin setter opp neste runde.» til «Du er klar. Be en arrangør om å invitere deg til neste runde.» Mykere tone for self-registrerte som ikke har en admin i tankene.
- [app/(auth)/login/actions.ts](app/(auth)/login/actions.ts) `sendCode` får nytt rate-limit-trinn mellom honeypot og `signInWithOtp`. Bytte-rekkefølge: honeypot (cheap) → rate-limit (DB-call) → Supabase OTP (kvote-tellende). Begge bucket-trips redirecter til samme `?error=rate_limited` som Supabase sin egen throttle — bruker ser ingen forskjell.

#### Notes
- Trusted-creator-allowlisten utvides IKKE. Self-registrerte uten admin/trusted-status får ingen mulighet til å opprette spill selv før [#22](https://github.com/jdlarssen/golf-app/issues/22) (RLS-revisjon) lander. Det er bevisst — onboarding-kanalen åpnes først, RLS-åpning er sin egen jobb.
- Ingen DB-migrasjon. Gjenbruker eksisterende `admin_action_rate_limit`-tabell og `consume_admin_rate_limit`-RPC fra `0026_admin_action_rate_limit.sql`. Bucket-strengen er generisk.
- Cloudflare Turnstile / CAPTCHA er bevisst utelatt (overkill for current scale). Egen kontrakt hvis abuse-vinduer viser at rate-limit alene ikke holder.

</details>

---

## 1.28.y — Bane-tilgang for kompis-gjengen

<details>
<summary><strong>1.28.y — Bane-tilgang for kompis-gjengen (2 oppføringer) — klikk for å vise</strong></summary>

Fase 4 (og siste fase) av epic [#223](https://github.com/jdlarssen/golf-app/issues/223). Trusted creators får tilgang til Sekretariatet med en filtrert tile-grid, og kan opprette + oppdatere baner gjennom samme courses-katalogen som admin bruker. Patch lagt på toppen som åpner Lanseringer-flaten direkte fra Sekretariatet.

### [1.28.1] - 2026-05-26

> Du finner nå Lanseringer rett fra Sekretariatet. En ny flis ved siden av Resultatprotokoll tar deg inn på publiserings-flaten, og viser dato for siste lansering rett under tittelen.

#### Added
- Ny `SparkleIcon` i [components/icons/Icons.tsx](components/icons/Icons.tsx) — SVG-pendant til ✨-emojien som banneret og innboks-kortet allerede bruker, slik at de tre lanserings-flatene har samme visuelle uttrykk.
- Lanseringer-flis i [app/admin/page.tsx](app/admin/page.tsx) `TilesGrid` (admin-only branch, 5. flis etter Resultatprotokoll). Henter siste publiserte dato fra `product_updates` parallelt med de andre tile-tellingene; meta-teksten faller tilbake til «Ingen publisert ennå» når tabellen er tom.

#### Changed
- `TileIconKind`-unionen utvidet med `'sparkle'`, og `TilesSkeleton` renderer nå 5 placeholders for å unngå skeleton-til-innhold-flicker.

### [1.28.0] - 2026-05-25

> Trusted creators kan nå legge til og oppdatere baner selv, ikke bare opprette spill. Når en kompis i allowlist-en logger inn ser de Sekretariatet med en Baner-tile, og kan vedlikeholde katalogen som om de var admin — men kun baner de selv har laget kan slettes.

#### Added
- Ny `requireAdmin(supabase)`-helper i [lib/admin/auth.ts](lib/admin/auth.ts) ved siden av `requireAdminOrTrustedCreator`. Redirecter trusted-non-admin til `/admin` og ikke-trusted ikke-admin til `/`. Brukt til å self-gate alle admin-only ruter under `/admin/spillere`, `/admin/games` (unntatt `/new`), og `/admin/lanseringer` (innført i forrige refactor-commit).
- Ownership-check på `deleteCourse`: trusted creators kan kun slette baner de selv har laget (`courses.created_by === user.id`); admin uberørt. Ny error-melding `not_owned` på `/admin/courses` med teksten «Du kan kun slette baner du selv har laget.»
- [lib/format/displayName.ts](lib/format/displayName.ts) — felles helper trukket ut fra edit-page sin lokale variant. Brukes nå også av activity-ledger på `/admin`.

#### Changed
- [app/admin/layout.tsx](app/admin/layout.tsx) gater nå på admin-eller-trusted. Tile-grid på [app/admin/page.tsx](app/admin/page.tsx) filtreres per rolle: trusted ser kun Baner-tile, admin ser alle fire.
- Bane-write-actions (`createCourse`, `updateCourse`, `deleteCourse`, `restoreTee`) bytter til `getAdminClient()` for skrivinger når caller er trusted-non-admin. Bypasser RLS-policiene som krever `is_admin()`. Samme small-bet-mønster som #198 etablerte for spill-opprettelse.
- Activity-ledger på `/admin` viser faktisk creator-navn for bane-events (var: hardkodet «Sekretariatet»). Fanger en latent display-feil som trusted creators ville eksponert dag 1.

#### Fixed
- Inline `requireAdmin`-helper i [app/admin/courses/[id]/edit/actions.ts](app/admin/courses/%5Bid%5D/edit/actions.ts) er fjernet til fordel for delt helper i `lib/admin/auth.ts` — én sannhetskilde for rolle-gating på courses-flyten.

</details>

</details>

---

## 1.27.y — Arkiv-UI og delbare filter-lenker

<details>
<summary><strong>1.27.y — Arkiv-UI og delbare filter-lenker (3 oppføringer) — klikk for å vise</strong></summary>

Fase 3 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223). Soft-arkiverte tees kan gjenåpnes fra edit-flaten, bane-listens filter-state ligger i URL-en, og legacy-rader uten `updated_by` er backfilt fra `created_by`.

### [1.27.2] - 2026-05-25

> Andre forsøk på samme fix. Når du gjenåpner en arkivert tee og klikker «Lagre endringer» rett etterpå, holder tee-en seg nå aktiv. Forrige fix (1.27.1) løste serverside-cachen, men ikke selve skjemaet — som tegnet med innholdet fra før gjenåpningen og dermed sendte det videre på neste lagring.

<details>
<summary>Teknisk</summary>

#### Fixed
- [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/[id]/edit/page.tsx) gir nå `<CourseForm key={teeSetKey}>` der `teeSetKey` er sortert join av aktive tee-IDer. Når en archive eller restore endrer tee-settet, unmounter React den gamle form-instansen og monterer en frisk. Uten dette beholdt `useState(initialTees)` sitt opprinnelige 2-tee-state etter restore-redirect — selv om server-komponenten re-rendret med 3 tees som ny `initialData`, leste `useState` bare initial-verdien på første mount.

#### Notes
- Roten var en klassisk Next.js client-component-felle: server-side data fra props endrer seg, men client-state initialisert fra props gjør det ikke (useState-initializer kjører kun én gang). Manifestasjonen så ut som en cache-bug (1.27.1-feildiagnose), men `revalidatePath` rørte ikke client-state.
- Forge-evaluator + vitest fanget ikke dette fordi testene mocket props og verifiserte rendering — ikke hvordan client-state overlever en server-side re-render.
- Lærdom: for client-components der server-data endres dynamisk (via server-action redirect tilbake til samme route), gi en `key` som signaliserer datasett-endring. CourseForm har samme felle for hull-data, men hull endres ikke via separate server-actions, så det manifesterer ikke der.

</details>

### [1.27.1] - 2026-05-25

> Når du gjenåpner en arkivert tee og klikker «Lagre endringer» rett etterpå, blir tee-en nå værende aktiv. Tidligere kunne et stille mellomledd i Next.js-cachen gjøre at edit-skjemaet fortsatt så tee-en som arkivert, så lagringen re-arkiverte den.

<details>
<summary>Teknisk</summary>

#### Fixed
- [app/admin/courses/[id]/edit/actions.ts](app/admin/courses/[id]/edit/actions.ts) `restoreTee` kaller nå `revalidatePath` på edit-pathen, `/admin/courses` og `/admin/games/new` før redirect. Uten dette returnerte Supabase JS-en sitt fetch-cache-hit (samme URL + params) den stale `archived_at IS NULL`-listen fra før restore. CourseForm rendret derfor med 2 av 3 tees, og en påfølgende Lagre sendte FormData uten den restaurerte tee-en — `updateCourse` regnet den som «fjernet» og soft-arkiverte den på nytt.
- Ny regresjons-assert i `actions.test.ts` happy-path: verifiserer at `revalidatePath` kalles for alle tre paths som leser archived_at-tilstanden.

#### Notes
- Funnet under manuell røyk-test på preview ([PR #228](https://github.com/jdlarssen/golf-app/pull/228)) av Fase 3. Reproduksjon: arkivér en tee → Gjenåpne → klikk Lagre uten andre endringer → tee re-arkiveres. Forge-evaluatoren fanget det ikke (testet hver server-action isolert, ikke restore-så-Lagre-flyten).
- Lærdom: server-actions som muterer data lest av samme route MÅ kalle `revalidatePath`. Supabase JS bruker `fetch` internt, og Next.js auto-cacher fetch-responser på URL+params-nøkkel.

</details>

### [1.27.0] - 2026-05-25

> Du kan nå gjenåpne en arkivert tee fra bane-redigeringen — den dukker opp igjen i skjemaet og kan velges for nye spill. Bane-listens søk, sortering og chip-filter lagres nå i URL-en, så en filtrert visning er bokmerke-bar og kan deles via lenke. Eldre baner uten «Sist endret av»-navn har fått det fylt ut bakover-i-tid.

<details>
<summary>Teknisk</summary>

#### Added
- [app/admin/courses/[id]/edit/actions.ts](app/admin/courses/[id]/edit/actions.ts) `restoreTee` server-action — clearer `tee_boxes.archived_at`, bumper `courses.updated_at` + `updated_by` (restore er en bane-endring), og redirecter til `?status=restored`. Defensive guards: tee må eksistere, høre til riktig bane, og være arkivert. Sju unit-tester dekker happy path + alle tre reject-stier + non-admin + unauth + db-error.
- [app/admin/courses/[id]/edit/ArchivedTeesSection.tsx](app/admin/courses/[id]/edit/ArchivedTeesSection.tsx) — ny server-component med `<details>`-wrapper som lister soft-arkiverte tees med Gjenåpne-knapp per rad. Navne-kollisjons-chip når en arkivert tee har samme navn som en aktiv (visuelt advarsels-flagg; ingen DB-blokk).
- [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/[id]/edit/page.tsx) — fetcher arkiverte + aktive tees parallelt (`Promise.all`), derivér `has_active_name_conflict`, render `ArchivedTeesSection` mellom CourseForm og DeleteCourseButton. Banner-handler for `?status=restored` + nye error-koder `tee_not_found` / `tee_not_archived`.
- Migration `0038_courses_backfill_updated_by.sql` — `update public.courses set updated_by = created_by where updated_by is null and created_by is not null`. Idempotent; backfilt 1 rad i prod ved kjøring.
- Regresjons-test i `actions.test.ts` som driver `updateCourse` med full FormData-payload — fanger v1.26.1-fellen mekanisk (hvis `MAX_TEE_BOXES` flyttes tilbake bak `'use client'`-grensen, asserterer den at insert-loop-en iterere).

#### Changed
- [app/admin/courses/CoursesLedgerClient.tsx](app/admin/courses/CoursesLedgerClient.tsx) — bytter `useState`-backing-store for `useSearchParams` + `router.replace` (med `startTransition` og `{ scroll: false }`). URL-format: `?q=stik&sort=updated_at&ladies=1&juniors=1&active=1`. Defaults skrives ikke. Ny eksportert `readStateFromParams`-helper for pure-test-dekking.
- `CoursesLedgerClient.test.tsx` — eksisterende 17 interaksjons-tester refaktorert til å mocke `next/navigation` med en `useSyncExternalStore`-backet store, så `fireEvent`-drevne URL-skriv faktisk gjør komponenten re-render. Pluss 8 nye tester for URL-init + URL-write + default-omission.

#### Notes
- Restore lever som dedikert server-action (ikke bundlet med CourseForm-save) for å holde begge flytene enkle. Form-save er en stor batch-mutation; restore-intent håndteres separat og redirecter til en frisk reload av edit-flaten.
- DB har ingen unique-constraint på `(course_id, name)` i tee_boxes — restore til navne-konflikt med en aktiv tee tillates uten å blokkere. Navne-kollisjons-chip-en flagger det visuelt så admin kan endre navnet etter behov.
- URL-replace, ikke push — filter-tweaks er ikke historikk-aktivitet. Browser-back tar admin ut av siden, ikke gjennom filter-historikk. Bevisst tradeoff for enklere mental modell.
- 0038-backfill er trygg for live spill (rører kun `courses.updated_by`-kolonnen). Rader med `created_by IS NULL` forblir uendret (ingen kilde-data).
- Per-kjønn-overstyring av hull-par fortsetter som egen Fase når det blir reelt smerte-punkt. Krever endring i alle 4 mode-implementasjoner som leser `hole.par` direkte.

</details>

</details>

---

## 1.26.y — Vedlikeholds-trygghet og filter på bane-admin

<details>
<summary><strong>1.26.y — Vedlikeholds-trygghet og filter på bane-admin (2 oppføringer) — klikk for å vise</strong></summary>

Fase 2 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223). Audit-felter på baner, soft-archive av tees i bruk, og sort + filter på bane-listen.

### [1.26.1] - 2026-05-25

> Lagring av bane-endringer fungerer igjen. En regresjon fra v1.25.0 stoppet save-knappen på `/admin/courses/[id]/edit` og `/admin/courses/new` med feilmeldingen «Minst én tee-boks må legges til» — selv når du faktisk hadde tees i skjemaet.

<details>
<summary>Teknisk</summary>

#### Fixed
- `MAX_TEE_BOXES`-konstanten flyttet fra [CourseForm.tsx](app/admin/courses/CourseForm.tsx) (en `'use client'`-modul) til en ny server-trygg fil [constants.ts](app/admin/courses/constants.ts). Next.js 16 wrapper eksporter fra `'use client'`-moduler som placeholder-funksjoner når de brukes serverside; `for (let i = 0; i < MAX_TEE_BOXES; ...)` ble til `0 < function` som evaluerer til `false`, så tee-parsing-loopen iterere aldri. Konsekvens: ALLE Save-forsøk på admin/courses/new + admin/courses/[id]/edit returnerte `tee_required`-feil.
- `CourseForm.tsx` re-eksporterer fortsatt `MAX_TEE_BOXES` for client-konsumenter; importerer nå fra `./constants`. Server-actions i `new/actions.ts` og `[id]/edit/actions.ts` importerer direkte fra `./constants`.

#### Notes
- Regresjonen kom inn i Fase 1 (v1.25.0) da CourseForm ble rewrite'et som `'use client'`-modul med konstanten eksportert derfra. Forge-evaluator + 1126/1126 vitest-tester fanget ikke buggen siden den manifesterer kun ved faktisk form-submission i Next.js-runtime — ikke i isolerte client-component-tester. Type-systemet ser fortsatt importen som `number` (TypeScript er ikke klar over `'use client'`-wrappingen).
- Lærdom for senere faser av #223: smoke-test ALLE write-paths (Save + form-submission), ikke bare read-paths (page-load).

</details>

### [1.26.0] - 2026-05-25

> Når du endrer en bane, husker Tørny nå hvem som endret hva og når. Du kan fjerne en tee selv om den brukes i et historisk spill — spillet beholder tee-en, men den forsvinner fra bane-admin. Bane-listen har fått sortering (Sist endret, Flest aktive spill) og chip-filter (Har dame-tee, Har junior-tee, Aktive spill).

<details>
<summary>Teknisk</summary>

#### Added
- Migration `0037_courses_audit_and_tee_archive.sql` — `courses.updated_at` (NOT NULL DEFAULT now()) + `courses.updated_by` (FK til users, nullable) + `tee_boxes.archived_at` (timestamptz, nullable).
- [app/admin/courses/[id]/edit/actions.ts](app/admin/courses/[id]/edit/actions.ts) `updateCourse` setter `updated_at = now()` + `updated_by = user.id` ved hver lagring. Soft-archive-logikk delt mellom hard-delete (tees uten spill-referanser) og `archived_at`-set (tees i bruk).
- [app/admin/courses/CoursesLedgerClient.tsx](app/admin/courses/CoursesLedgerClient.tsx) utvidet: sort-dropdown (Nyeste først / Sist endret / Flest aktive spill) + chip-toggles for Har dame-tee, Har junior-tee, Aktive spill. AND-kombinert med søk. Eksporterte pure helpers `applySortAndFilter` + `rowKicker` for testing.
- [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/[id]/edit/page.tsx) kicker viser «Lagt til DATO av NAVN» eller «Sist endret DATO av NAVN» basert på 60-sek-buffer mellom `created_at` og `updated_at`. Navn faller tilbake til ingenting hvis updated_by er NULL eller bruker er slettet.
- Tester: 13 nye vitest-cases i `CoursesLedgerClient.test.tsx` (sort + filter UI, pure-helper-coverage, rowKicker, regresjon-tester for søk).

#### Changed
- [app/admin/courses/page.tsx](app/admin/courses/page.tsx) `getCourses` utvidet til å embedde `tee_boxes(archived_at, slope/CR per kjønn)` + `games(status)` for å derivere `tee_count`, `has_ladies_tee`, `has_juniors_tee`, `active_game_count` per bane. Ny eksportert `deriveCourseItem`-helper.
- [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/[id]/edit/page.tsx) — tee_boxes-select filtrer `archived_at IS NULL` så arkiverte tees skjules fra CourseForm; courses-select inkluderer audit-felter + user-embed via begge FK-er.
- [lib/games/newGameFormData.ts](lib/games/newGameFormData.ts) — embed-resultat filtreres på `archived_at === null` så new-game-picker-en bare viser aktive tees.
- [lib/database.types.ts](lib/database.types.ts) — regenerert med nye kolonner.
- Feilmelding `tee_in_use` fjernet fra error-map siden den ikke lenger trigges (alle tee-removals lykkes nå via hard-delete eller soft-archive).

#### Notes
- DB-kolonnen `par_total_<g>` og tee_box_id-FK fra `games` er uendret. Historiske spill leser fortsatt sin (kanskje arkiverte) tee via `games.tee_box_id`-join — `getGameWithPlayers`, scorecard-rendering og leaderboards trenger ingen filter.
- `game_players.course_handicap` er frosset ved game-start ([0001](supabase/migrations/0001_initial_schema.sql)), så historiske handicap-er påvirkes ikke selv om en tee-rad senere får oppdatert slope/CR. Tee-edit-fleksibilitet er trygt.
- Soft-archive er en-veis i Fase 2; un-arkivér-UI er Fase 3 av #223. Hvis admin gjør en feil må de rekonstruere tee-en eller SQL-resette `archived_at` manuelt.
- Per-kjønn-overstyring av hull-par ble vurdert for Fase 2 men flyttet til egen Fase basert på scoring-code-impact-funn (krever endring i 4 mode-implementasjoner).

</details>

</details>

---

## 1.25.y — Mobile-first bane-admin

<details>
<summary><strong>1.25.y — Mobile-first bane-admin (1 oppføring) — klikk for å vise</strong></summary>

Å opprette og redigere baner skal gå like raskt på telefon som på PC. Fase 1 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223) fjerner de største tastatur-popups-friksjonene i `/admin/courses`.

### [1.25.0] - 2026-05-25

> Å opprette en bane på telefon er nå tre trykk per hull i stedet for 18 tastatur-popups. Par-total regnes ut fra hullene, dame- og junior-rating dukker opp først når du legger dem til, og bane-listen har fått søk.

<details>
<summary>Teknisk</summary>

#### Added
- Tap-radio-knapper `[3] [4] [5]` for par per hull i [CourseForm.tsx](app/admin/courses/CourseForm.tsx). 18 tastatur-popups erstattes med tre-knapps-grupper som eksponeres som `role="radio"`/`aria-checked` for screen-reader-konsistens. SI beholder number-input siden 1–18 er for mange knapper og brukeren må kunne taste fritt.
- Progressive disclosure for dame- og junior-rating per tee. Tee-blokken viser kun herre-rating som standard; `+ Legg til dame-rating`/`+ Legg til junior-rating` utvider blokken. `Fjern dame-rating`/`Fjern junior-rating`-lenke kollapser + nullstiller verdiene. Edit-flyten starter expand'et hvis tee har lagrede tall i DB.
- `Dupliser`-knapp per tee. Kopierer alle numre (slope, CR, lengde) for alle kjønn, men tømmer navn og dropper `id` så det blir en ny rad ved lagring. Skjules ved `MAX_TEE_BOXES = 7`.
- Søk på `/admin/courses` — ny client-component [CoursesLedgerClient.tsx](app/admin/courses/CoursesLedgerClient.tsx) som tar fetched courses som prop og rendrer søk-input + filtrert ledger. Substring case-insensitive på banenavn. Empty-state «Ingen baner matcher «X»» ved 0 treff.
- Eksportert helper `sumHolePars(holes)` i `CourseForm.tsx` for både UI (read-only par-total per kjønn) og indirekte tests.
- Tester: 16 nye vitest-cases i `CourseForm.test.tsx` (tap-button-state, auto-par-total, progressive disclosure, dupliser), 4 i `CoursesLedgerClient.test.tsx` (søk-filter, empty-state, trim).

#### Changed
- `app/admin/courses/CourseForm.tsx` — `TeeBoxData`-typen dropper `par_total_<gender>`-feltene fra form-input. `par_total` deriveres automatisk fra hullene og vises som read-only sum per kjønn-rating.
- `app/admin/courses/new/actions.ts` + `app/admin/courses/[id]/edit/actions.ts` — `parseGenderRating` returnerer `{slope, course_rating}` (ikke lenger `par_total`). `par_total_<gender>` settes til `sum(holes.par)` server-side hvis kjønnet har komplett slope + CR; ellers `null`. `isPartiallyFilled` sjekker 2 felt nå (1 fylt = partial).
- `app/admin/courses/[id]/edit/page.tsx` — `tee_boxes`-select dropper `par_total_*`-kolonnene siden form ikke trenger dem.
- Feilmelding `tee_partial_rating` oppdatert: «Hver tee må ha både slope og CR (eller ingen av dem) per kjønn.»

#### Notes
- Eksisterende baner med ulik `par_total_<g>` per kjønn skrives over med `sum(holes.par)` ved neste lagring. Migrasjons-safe: vi antar identisk hull-par for alle kjønn (sann for ~99% av norske baner). Per-kjønn-overstyring er Fase 2-utvidelse hvis det blir aktuelt.
- DB-kolonnen `par_total_<gender>` beholdes — andre kode-stier (`lib/games/teeRating.ts`, scorecard-rendering, game-edit) leser fortsatt fra den. Bare form-input forsvinner.
- Out of scope for Fase 1: SI smart-preset, lengde-warning, audit-felter, archive-flow, eksplisitt tee-sletting-impact-warning. Senere faser i [#223](https://github.com/jdlarssen/golf-app/issues/223).

</details>

</details>

---

## 1.24.y — Kjønn og spillerklasse i profilen

<details>
<summary><strong>1.24.y — Kjønn og spillerklasse i profilen (2 oppføringer) — klikk for å vise</strong></summary>

Tørny husker nå om du spiller fra herretee, dametee eller juniortee, og foreslår riktig tee når noen oppretter et spill du skal være med på. Issue [#92](https://github.com/jdlarssen/golf-app/issues/92).

### [1.24.1] - 2026-05-25

> Når du bytter bane mens du setter opp et spill, beholdes nå dame- og junior-merkene på spillerne du har valgt. Tidligere måtte du klikke dem inn igjen.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/games/new/useGameFormState.ts` — `setCourseId` re-deriver `playerGenders` fra `playerGenderDefault(p.gender, p.level)` istedenfor å sette til `{}`. Regresjon fra v1.24.0: bane-bytte etter mount kollapset alle M/D/J-toggles til `'M'`, så admin måtte klikke seg gjennom dame- og junior-spillere på nytt. `tee_box_id` nullstilles fortsatt (tee-id er bane-spesifikk). Ny eksportert helper `deriveDefaultGenders(players)` deles mellom mount-initializer og bane-bytte. Issue [#222](https://github.com/jdlarssen/golf-app/issues/222).

#### Notes
- +6 nye vitest-cases i `app/admin/games/new/useGameFormState.test.ts` dekker bane-bytte-regresjonen, `initialValues.player_genders`-precedence ved mount, at bane-deselect (tomt `course_id`) også re-deriver, og at `tee_box_id` fortsatt nullstilles ved bane-bytte.

</details>

### [1.24.0] - 2026-05-25

> Du kan nå sette kjønn og spillerklasse i profilen din. Når noen oppretter et spill du skal være med på, foreslår Tørny riktig tee for deg, så damer og juniorer slipper å havne på herretee ved et uhell.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0036_users_gender_level.sql` — to nye enum-typer (`user_gender` med `'mens'|'ladies'`, `player_level` med `'junior'|'normal'|'senior'`) + `users.gender` nullable + `users.level` NOT NULL DEFAULT `'normal'`. Adskilt fra `tee_box_gender`-enumen (#48) som beskriver *tee-en*, ikke *spilleren*. Ingen backfill — eksisterende brukere har `gender = NULL` og driver soft-prompt på `/profile`.
- `lib/games/playerGenderDefault.ts` — pure helper som mapper `(gender, level)` til `'M'|'D'|'J'`-toggle-default i game-wizard. Regel: `level === 'junior'` overstyrer kjønn; senior påvirker ikke toggle i dag. 8 unit-tester dekker alle kombinasjoner.
- `app/complete-profile/{page,actions}.tsx` — to nye påkrevde radio-grupper i onboarding (kjønn: ingen pre-valg; spillerklasse: pre-valgt «Voksen»). Server-action validerer mot enum-allowlist.
- `app/profile/page.tsx` — `GenderSoftPrompt`-server-component rendres som Card øverst på `/profile` når `users.gender IS NULL`. «Sett kjønn»-knapp scroller til `#kjonn`-anchor på edit-fieldsetet. Kortet forsvinner straks gender er satt (re-render etter `updateProfile`).
- `app/profile/ProfileFormBody.tsx` — kjønn + spillerklasse-felt med dirty-tracking (Lagre-knappen aktiveres ved endring i radio-grupper).
- `app/admin/spillere/[id]/{page,actions}.tsx` — speiler `/profile`-mønsteret. Admin kan sette/endre for inviterte spillere før de logger på første gang. Ingen soft-prompt i admin-flate.

#### Changed
- `lib/games/newGameFormData.ts` — utvider users-select med `gender, level`; `UserRow` + `PlayerOption` propagerer feltene videre.
- `app/admin/games/[id]/edit/page.tsx` — samme utvidelse for edit-flyten.
- `app/admin/games/new/GameForm.tsx` — `PlayerOption`-type får `gender: 'mens'|'ladies'|null` + `level: 'junior'|'normal'|'senior'`.
- `app/admin/games/new/useGameFormState.ts` — `playerGenders`-initial deriveres fra `playerGenderDefault(p.gender, p.level)` per spiller når `initialValues?.player_genders` ikke er satt (edit-flyt beholder per-spill overrides).
- `app/profile/actions.ts` + `app/admin/spillere/[id]/actions.ts` — `updateProfile` og `updateUser` aksepterer + validerer gender + level før upsert.
- `lib/database.types.ts` — regenerert med nye enums + felt.

#### Notes
- Test-suite: +8 nye tester for `playerGenderDefault`. Eksisterende `ProfileFormBody.test.tsx` + `GameForm.test.tsx` + `GameWizard.test.tsx` oppdatert med default-fixtures (gender=null, level=normal eller mens/normal).
- Solo-flyten påvirkes uten ekstra endringer — GameForm bruker `player_${pid}_gender` FormData-key uavhengig av modus.
- `gender` er nullable bevisst — eksisterende brukere uten verdi forblir null til soft-prompt-en spørres. Auto-default i wizard faller tilbake til 'M' for null-gender (med mindre level=junior).

</details>

</details>

---

## 1.23.y — Lanseringer-kanal: in-app drypp + månedsbrev

<details>
<summary><strong>1.23.y — Lanseringer-kanal: in-app drypp + månedsbrev (1 oppføring) — klikk for å vise</strong></summary>

Tørny får sin egen kanal for å fortelle deg om nye funksjoner. Når noe er ute, dukker det opp et lite drypp på hjem-siden og en oppføring i innboksen. En gang i måneden får du en oppsummering på mail. Du kan melde deg av mailen fra profilen din eller via lenken nederst i mailen. Issue [#202](https://github.com/jdlarssen/golf-app/issues/202).

### [1.23.0] - 2026-05-25

> Når noe nytt kommer i Tørny, får du nå et lite varsel på hjem-siden og en oppføring i innboksen. Én gang i måneden får du også en oppsummering på mail. Du er påmeldt fra start; meld deg av månedsbrevet i profilen din om du heller vil ha fred.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0035_product_updates.sql` — to nye tabeller (`product_updates` med admin-curated lanseringer, `product_update_digests` med audit + idempotens-row per måned) + `users.product_updates_unsubscribed_at` opt-out-kolonne + utvider `notifications.kind`-CHECK med `'product_update'`. RLS: alle innloggede leser `product_updates` (banner + innboks-flate), digests kun via service-role.
- `lib/notifications/types.ts` — ny `product_update`-kind med zod-schema (`source_id` uuid, `title`, `body`, valgfri `link` som må starte med `/`, valgfri `cta_label`). 5 nye tester for happy path, full payload, ekstern-link-avvisning, manglende title, tom title.
- `lib/productUpdates/unsubscribeToken.ts` — HMAC-SHA256 sign/verify-helpers for mail-unsub-tokens (1 års TTL, constant-time `timingSafeEqual`-sammenligning, `expMs` som ms-timestamp så `split('.')` ikke brytes av ISO `.000Z`). 9 tester for round-trip, tampered sig, tampered userId, exp, tom/garbage-tokens, manglende secret, determinisme.
- `lib/productUpdates/publish.ts` — `publishProductUpdate(input)` inserter rad og fan-outer in-app-notifikasjon til alle brukere via `Promise.allSettled`. Best-effort per mottaker.
- `lib/productUpdates/digest.ts` — `sendDigestForPeriod(opts)` + `previousMonthPeriod(nowMs)` pure helper. Beregner forrige kalendermåned i Europe/Oslo, idempotens-sjekk via `product_update_digests` UNIQUE, fan-out via `Promise.allSettled`, inserter audit-row. Returnerer discriminated union (`sent` / `already_sent` / `no_updates`). 5 tester for periode-grenser inkl. årsskifte og skuddår.
- `lib/mail/productUpdateDigest.ts` — Resend-mail-helper med subject `Nytt i Tørny — [måned]`, inline HTML + plain-text, RFC 8058 `List-Unsubscribe`-header + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. 9 tester inkl. inline-snapshot av plain-text-body.
- `lib/format/date.ts` — `formatMonthLongNb('mai 2026')` for periode-etiketter.
- `app/admin/lanseringer/{page,actions,actions.test}.ts(x)` — admin-flate gated av `requireAdmin()`. Skjema for publisering (title/body/link/cta), månedsbrev-card med «Send månedsbrev nå»-knapp (disabled når allerede sendt for forrige periode), liste over siste 20 lanseringer. 10 action-tester for non-admin-redirect, validering (title/body/link/cta), happy-path, og alle tre digest-utfall.
- `app/api/cron/product-update-digest/route.ts` + `vercel.json` — daglig cron 08:00 UTC med intern 1.-i-måneden-gate (Vercel Hobby-friendly). Bearer-token auth via `CRON_SECRET`.
- `app/api/unsubscribe/product-update/route.ts` — GET (browser, render branded HTML) + POST (RFC 8058 one-click fra mail-klient). Begge verifiserer HMAC-token, oppdaterer `users.product_updates_unsubscribed_at`.
- `components/products/ProductUpdateBanner.tsx` (server) + `ProductUpdateBannerClient.tsx` (client) — banner på `/` med champagne-stripe, sparkle-emoji, title + body, valgfri CTA-knapp, og 44px-tap-target lukke-knapp. Optimistisk dismiss + `markOneAsRead`-call via `useTransition`. 5 tester.
- `app/profile/ProfileFormBody.{tsx,test.tsx}` — ny «Mail-innstillinger»-seksjon med checkbox for månedsbrev-opt-in. Dirty-tracking inkluderer toggle. 4 tester.

#### Changed
- `app/page.tsx` — mounter `<ProductUpdateBanner userId={...} />` like under `<InstallBanner>` i en `<Suspense fallback={null}>`-grense.
- `components/notifications/NotificationCard.tsx` — `EMOJI`-map utvidet med `product_update: '✨'`, `buildCardContent` mapper `payload.title → title`, `payload.body → detail`.
- `app/innboks/InboxClient.tsx` — `buildDeeplink` returnerer `payload.link ?? '/innboks'` for `product_update`-kind.
- `app/profile/{page,actions}.ts` — leser `product_updates_unsubscribed_at`, sender `productUpdatesOptIn` til `ProfileFormBody`. `updateProfile` skriver `null` (påmeldt) eller `now()` (avmeldt) basert på checkbox.

#### Notes
- Cron-pattern: «daglig 08:00 UTC + intern dato-gate» istedenfor `0 8 1 * *` siden Vercel Hobby kapper cron til 1/dag. Gir også atomær deploy-safety — en deploy 1. i måneden kan ikke endre cron-fyringen midt i kjøringen.
- Link-feltet i `product_updates` valideres til intern-only (`startsWith('/')`) som defense mot phishing-misbruk via mail-kanalen. Trade-off: kan ikke peke til Discord/eksterne ressurser. Akseptabelt for MVP.
- RFC 8058 ikke strengt påkrevd for Tørnys volum (< 5000 mail/dag mot Gmail/Yahoo), men implementert riktig fra start — gratis kvalitets-signal for inbox-placement.
- `.env.example` dokumenterer to nye secrets: `CRON_SECRET` (Vercel Bearer-token) og `PRODUCT_UPDATE_UNSUB_SECRET` (HMAC-nøkkel for unsub-tokens). Begge må settes i Vercel Dashboard før cron + unsub fungerer i prod.
- Test-suite vokst fra 1031 → 1062 (+31 nye tester).

</details>

</details>

---

<details>
<summary><strong>1.22.y — Hurtig-oppsett for nye spill (1 oppføring) — klikk for å vise</strong></summary>

## 1.22.y — Hurtig-oppsett for nye spill

Opprett-spill-flyten er omarbeidet til fire korte steg i stedet for én lang side med seks seksjoner. Format → bane → spillere → klar. «Tilpass alle detaljer» henter fram dagens fullform for power-users som vil styre alt. Issue [#203](https://github.com/jdlarssen/golf-app/issues/203).

### [1.22.0] - 2026-05-25

> Som admin setter du nå opp et spill i fire korte steg, ikke seks seksjoner på én lang side. Velg format, så bane og tidspunkt, så spillere — og til slutt sjekker du sammendraget før du publiserer. Trenger du flere detaljer (sideturnering, peer-godkjenning, HCP-allowance), finner du dem bak «Tilpass alle detaljer» på siste steg.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/GameWizard.tsx` — 4-stegs orkestrator (Format → Bane → Spillere → Klar) med URL-state via `?step=` og `?view=`. Stepper-header («Steg N av 4 · tittel») med tynn progress-bar som respekterer `prefers-reduced-motion`. Per-steg-validering på Neste-knappen.
- `app/admin/games/new/useGameFormState.ts` — felles state-hook som GameForm og GameWizard begge konsumerer. All state, derived flags, memos, validitets-flags og handlers ligger her — én kilde til scoring-/validerings-reglene.
- `app/admin/games/new/sections/` — fem ekstraherte presentasjons-komponenter:
  - `BasicsSection.tsx` (spillnavn + bane + tee + tee-off + valgfri synlighet/sideturnering)
  - `PlayersSection.tsx` (søk + chips + filtrert liste + mode-aware counter)
  - `TeamsAssignmentSection.tsx` (matchplay-sider / lag-grid / flights / per-spiller-tee)
  - `AdvancedSettingsSection.tsx` (HCP-allowance, peer-godkjenning, valgfri visibility)
  - `ReadyStep.tsx` (wizard-only steg 4: summary-kort + advanced disclosure + publish/draft + escape-hatch)
- `lib/games/autoGameName.ts` — `suggestGameName({ courseName, scheduledTeeOffAt })` bygger forslag som «Stiklestad 25. mai» fra bane + tee-off. Wizard pre-fyller spillnavnet på steg 4 før admin redigerer (gated på `nameTouched`-flag).
- `lib/games/autoGameName.test.ts` (8 tester) + `app/admin/games/new/GameWizard.test.tsx` (9 tester) — dekker happy-paths for solo og best-ball, escape-hatch + tilbake bevarer state, auto-name + manuell override, og FormData-skjema speiler GameForm-payloaden.

#### Changed
- `app/admin/games/new/GameForm.tsx` (1819 → 347 linjer) — refaktorert til presentasjons-komponent som stacker de fire seksjonene + form-skeleton. Konsumerer `useGameFormState`. Brukes fortsatt 1:1 av edit-flyten (`/admin/games/[id]/edit`) og av wizard-en når admin klikker «Tilpass alle detaljer».
- `app/admin/games/new/page.tsx` og `app/opprett-spill/page.tsx` — rendrer nå `<GameWizard>` i stedet for `<GameForm>`. Samme props, samme server-actions, samme FormData-skjema. Edit-flyten (`/admin/games/[id]/edit/page.tsx`) er uberørt — bruker fortsatt `<GameForm>`.

#### Notes
- **Server-actions er uberørte.** `createGameDraft`, `createAndPublishGame`, og edit-equivalentene mottar identisk FormData (`game_mode`, `team_size`, `player_${i}_*`, `hcp_allowance_pct`, `side_*`, etc.) som før. Ingen databasemigrasjon, ingen API-endring.
- **Hopp til full-form og tilbake bevarer wizard-state.** «Tilpass alle detaljer» bytter `view = 'full'` og passer wizard-state som `initialValues` til GameForm. «← Tilbake til hurtig-oppsett» flipper tilbake til siste steg.
- **Uncontrolled-felter** (score_visibility-radios, side_ld_count/ctp_count, SideCategoriesPicker) håndteres som default-fallback ved skip av advanced disclosure — sentral disiplin matcher GameForm-oppførselen før refactor.
- Test-suite vokst fra 1022 → 1031 (+9 wizard-tester). Eksisterende GameForm-/actions-tester passerer uendret.

</details>

</details>

---

<details>
<summary><strong>1.21.y — Sideturnering — 14 nye bonus-kategorier (1 oppføring) — klikk for å vise</strong></summary>

## 1.21.y — Sideturnering — 14 nye bonus-kategorier

Sideturneringen vokser fra 27 til 41 kategorier. Nye bragder dekker albatross, hole-in-one, konge-på-par-4, rein 9-tur, ren runde uten double-bogey, comeback-priser, og to nye lag-bonuser. To humor-kategorier (verste enkelthull og flest double-bogeys) gir mild straff. Som standard er alle nye skrudd på i Full pakke-presetet. Issue [#169](https://github.com/jdlarssen/golf-app/issues/169).

### [1.21.0] - 2026-05-25

> Sideturneringen har fått 14 nye bragder du kan jakte på — albatross, hole-in-one, konge på par-4, rein 9-tur og ren runde for ferdighet, comeback kid og to-birdier-på-rad for de hete rundene, «alle birdied» og «lag-par-hull» for laget, pluss litt humor med verste enkelthull og flest double-bogeys. I admin-panelet slår du av enkeltkategorier per spill. Full pakke har alle på fra start.

<details>
<summary>Teknisk</summary>

#### Added
- 18 nye kategori-IDs i `lib/scoring/sideTournamentConfig.ts` (`SideCategoryId`-union + `ALL_CATEGORY_IDS` + `SIDE_TOURNAMENT_POINTS`-map). Fordelt på 4 tier:
  - **Skill (4p/2p eller 4p individ):** `most_albatrosses_team/_individual` (netto ≤ par−3), `most_hole_in_ones_team/_individual` (gross = 1), `king_par4_team/_individual` (lavest brutto på par-4 hull), `clean_front_9` + `clean_back_9` (alle 9 hull netto ≤ par), `no_double_plus_round` (alle 18 hull netto ≤ par+1).
  - **Moderate (2p individ):** `hardest_hole_winner` (best brutto på SI=1-hullet), `comeback_kid` (mest negativ delta fra F9-net til B9-net), `all_par_groups_birdie` (birdie på par-3, 4 og 5 hver), `even_par_round` (sum(netto) = sum(coursePars)), `back_to_back_birdies` (2-streak, stackable).
  - **Coord-bonus (lag-koord, stackable):** `team_all_birdied_bonus` (4p × N når alle medlemmer har minst én birdie), `team_no_bogey_hole_coord` (2p × N stackable per hull der hele laget har netto ≤ par).
  - **Humor (-1p individ):** `worst_single_hole_brutto` (høyest enkelthull-brutto), `most_double_bogeys_individual` (flest netto ≥ par+2).
- Migrasjon `0027_side_tournament_bonus_categories.sql` — utvider `games_side_disabled_categories_valid` constrainten med de 18 nye IDs (atomær drop+re-add).
- `SideTournamentInput.courseStrokeIndices: number[]` — nytt 18-element-felt for stroke-index per hull. Brukes kun av `hardest_hole_winner`. Bygges i `app/games/[id]/leaderboard/page.tsx` parallelt med `coursePars`.
- `SideCategoryAward.delta?: number` — nytt felt brukt av `comeback_kid` for å rendre «snudd X slag på back-9».
- 28 nye tester i `lib/scoring/sideTournament.test.ts` — dekker happy paths, ties, empty-guards, par-type-mangler og disqualifications for hver av de 14 kategoriene.
- 14 nye picker-entries i `components/admin/SideCategoriesPicker.tsx`. Ny gruppe «Minuspoeng» som samler snowman (-2p) + de to nye humor-kategoriene (-1p hver).
- 14 nye render-blokker i `app/games/[id]/leaderboard/SideTournamentView.tsx` med matchende `CATEGORY_GROUPS`/`PANEL_GROUPS`-oppføringer.

#### Changed
- `calculateSideTournament` i `lib/scoring/sideTournament.ts` — 14 nye if-blokker etter snowman (kategori #19). `SideCategory`-union utvidet. `countMatchesForPlayer`/`Team` brukt på netto for albatross; inline gross-loop for hole-in-one siden helperne er netto-bare per design.
- Snowman flyttet fra «Bragder»-gruppen til ny «Minuspoeng»-gruppe i picker og fra `achievement`-panel-seksjon til `penalty`-panel-seksjon i view, slik at alle negativ-poeng-kategorier står samlet.
- `lib/games/sideTournamentPayload.test.ts` — sanity-assertion oppdatert fra 27 til 45 ID-er (27 eksisterende + 18 nye).

#### Notes
- Eagles+ (netto ≤ par−2) forblir inklusiv — en albatross teller både under `most_eagles_*` og som egen `most_albatrosses_*`-kategori. Bevisst valg: back-compat med ferdigspilte spill, ingen data-migrasjon. Flagget i picker-hjelpetekst.
- Eksisterende ferdigspilte spill med `side_disabled_categories = '{}'` (Full pakke) får automatisk de 18 nye kategoriene aktivert ved neste leaderboard-fetch. Spillere kan se «nye utmerkelser» dukke opp på historiske runder hvor noen har gjort en albatross eller hole-in-one — feel-good, ikke regression.
- Test-suite vokst fra 958 → 986 (+28 nye tester).

</details>

</details>

---

<details>
<summary><strong>1.20.y — Handicap-chip på hjem-siden (1 oppføring) — klikk for å vise</strong></summary>

## 1.20.y — Handicap-chip på hjem-siden

Handicapen din vises nå alltid øverst på hjem-siden så du ser hvor du står. Får en aksent-farge når den ikke har vært bekreftet på fire uker, så du oppdager passivt at den er gammel. Issue [#209](https://github.com/jdlarssen/golf-app/issues/209) — komplementerer [#168](https://github.com/jdlarssen/golf-app/issues/168) sitt prompt-kort i venterommet.

### [1.20.0] - 2026-05-25

> Handicapen din vises nå øverst på hjem-siden, alltid synlig. Trykk for å oppdatere. Hvis den ikke har vært bekreftet på fire uker, får den en aksent-farge — så du oppdager selv at den er gammel uten at appen må mase.

<details>
<summary>Teknisk</summary>

#### Added
- `components/handicap/HandicapChip.tsx` + 7 tester — server-component pill med «HCP»-label + tall (norsk komma via `toLocaleString('nb-NO', ...)`). Klikkbar `SmartLink` til `/profile?next={encodedNextPath}` med ≥44px tap-target. Stale-tilstand (≥ 4 uker per gjenbrukt `isHandicapStale`) bytter til `border-accent + text-accent`-styling; fresh er nøytral. Tester dekker label/tall-rendering, desimal-formatering inkl. default `54.0`, href-encoding, begge styling-tilstander, og aria-label.

#### Changed
- `app/page.tsx` — profile-query utvidet med `hcp_index, handicap_updated_at` (ingen ny round-trip). Chip rendres i `PageHeader.action`-slot i non-empty state, og midtstilt mellom welcome-paragrafen og CTA-knappen i empty state. Defensiv: rendres bare når begge feltene er satt.

#### Notes
- «HCP» som label er bevisst engelsk forkortelse — etablert kortform i norsk golf-miljø, ikke flagget som anglisisme.
- Tap-flyten gjenbruker `safeNextPath`-mekanikken fra [#168](https://github.com/jdlarssen/golf-app/issues/168) — ingen nye redirect-kodebaner.
- Chip vises kun på `/`. På `/games/[id]` står #168 sitt prompt-kort allerede klart.
- Test-suite vokst fra 979 → 986 (+7 nye chip-tester).

</details>

</details>

---

<details>
<summary><strong>1.19.y — Handicap-sjekk før runden (1 oppføring) — klikk for å vise</strong></summary>

## 1.19.y — Handicap-sjekk før runden

Spilleren får et inline-kort i venterommet før hvert spill hvis handicapen ikke har vært bekreftet på fire uker. Forhindrer at runden beregnes mot en utdatert verdi fordi noen glemte å oppdatere etter sist. Issue [#168](https://github.com/jdlarssen/golf-app/issues/168).

### [1.19.0] - 2026-05-25

> Hvis handicapen din er eldre enn fire uker, spør appen nå før spillet starter om den fortsatt er riktig. Da slipper du å oppdage etter runden at slag-allokeringen ble feil.

<details>
<summary>Teknisk</summary>

#### Added
- `supabase/migrations/0034_users_handicap_updated_at.sql` — ny `users.handicap_updated_at timestamptz not null default now()`-kolonne. Backfill til `now()` for eksisterende brukere — alle starter «ferske» og får fire-uker grace før første prompt.
- `lib/handicap/staleness.ts` + 10 tester — `HANDICAP_STALENESS_WEEKS = 4` konstant + `isHandicapStale(updatedAt, now?)`-helper. Aksepterer både `Date` og ISO-streng. Boundary er stale ved nøyaktig fire uker; null/undefined er stale.
- `components/handicap/HandicapConfirmCard.tsx` — inline `Card` med tittel «Sjekk handicapen din», brødtekst med relativ tid (`formatRelativeNb`), og to knapper: «Ja, stemmer» (server-action) og «Oppdater» (lenker til `/profile?next=/games/[id]`).
- `app/games/[id]/actions.ts` med `confirmHandicap(gameId)`-server-action. Bumper `users.handicap_updated_at = now()` for innlogget bruker og `revalidatePath('/games/[id]')` så kortet forsvinner på neste render.
- `app/profile/safeNext.ts` + 11 tester — `safeNextPath()` validerer at `?next=`-target er en relativ same-origin-sti (avviser protocol-relative URL-er, absolutte URL-er, fragment-only og non-string). Open-redirect-vern.

#### Changed
- `app/profile/actions.ts` — `updateProfile` leser `next` fra FormData, validerer via `safeNextPath`, og redirecter dit ved suksess. Fallback til `/profile?profile=updated` når `next` mangler. Error-redirects preserver `next` så form-en overlever validation-feil.
- `app/profile/ProfileFormBody.tsx` — ny `next?`-prop renderer skjult input når den er gyldig. «Avbryt»-lenken respekterer `next` istedenfor hardkodet `/`.
- `app/profile/page.tsx` — leser `searchParams.next`, sender gjennom `safeNextPath` før form-en får den.
- `app/profile/actions.ts`, `app/complete-profile/actions.ts`, `app/admin/spillere/[id]/actions.ts` — alle tre UPDATE-ene stamper `handicap_updated_at = now()`. Unconditional: hvem som enn lagrer form-en endorser hcp-verdien. Admin-edit teller også — slipper å mase spilleren rett etter at Jørgen fikset det.
- `app/games/[id]/page.tsx` — scheduled-grenen henter `users.hcp_index + handicap_updated_at` for innlogget spiller via slim direct-call (ikke cachet — cross-game fan-out ved profil-edit ville krevd dyr invalidering). Rendrer `<HandicapConfirmCard />` mellom header og Hero hvis stale.

#### Notes
- Kortet vises kun for `status === 'scheduled'`. Active/finished-spill er forbi freeze-vinduet — ingen «for sent»-melding (det ville bare blitt mas).
- Kortet er ikke-blokkerende — spilleren kan ignorere det og bare scrolle videre.
- «Ja, stemmer» gir ingen toast-bekreftelse. Kortet forsvinner, det er bekreftelse nok.
- Test-suite vokst fra 947 → 979 (+32 nye tester: 10 staleness + 11 safeNext + utvidelser).

</details>

</details>

---

<details>
<summary><strong>1.18.y — Lag-scorekort (1 oppføring) — klikk for å vise</strong></summary>

## 1.18.y — Lag-scorekort

Scorekort-flaten viser nå begge spillerne side om side i alle lag-baserte spillformer (best-ball, par-stableford, matchplay og Texas scramble). Tidligere fikk du bare ditt eget scorekort — selv i 2-mannslag der partner og du deler resultat. Issue [#17](https://github.com/jdlarssen/golf-app/issues/17).

### [1.18.0] - 2026-05-25

> Når du spiller best-ball, par-stableford, matchplay eller Texas scramble, viser scorekortet nå deg og partner (eller motstander i matchplay) ved siden av hverandre per hull — som på papir. Lenken på spilloversikten heter «Lagets scorekort» eller «Match-scorekort» istedenfor «Mitt scorekort» når det er aktuelt. Texas-spillere som ikke er lag-kaptein får endelig se lagets faktiske score (før viste flaten blanke felt).

<details>
<summary>Teknisk</summary>

#### Added
- `lib/games/scorecardTitle.ts` + test (7 caser) — single source of truth for tittel + CTA-label per modus. Matchplay → «Match-scorekort», lag-baserte (best-ball, par-stableford team_size=2, texas) → «Lagets scorekort», solo → «Mitt scorekort».
- `lib/games/teamCaptain.ts` + test (5 caser) — `pickTeamCaptain(userIds)` ekstrahert fra `lib/scoring/modes/texasScramble.ts` til delt helper. Texas-scoring (kaptein eier scores-radene i DB) og scorekort-flaten (non-captain må slå opp captain for å hente lagets score) bruker samme lex-min-algoritme. Texas-modulen beholder en wrapper rundt helperen.
- `lib/games/scorecardLayout.ts` + test (11 caser) — `resolveScorecardLayout(game, players, me, revealActive, fmt)` returnerer enten Layout A (single-player tabell) eller Layout B (side-om-side). Texas → Layout A med captain-userId + lag-handicap (sum(member.CH) × team_handicap_pct / 100). Reveal-active → Layout A uansett modus (beholder reveal-prinsippet). Best-ball/par-stableford → Layout B med same-team-partner. Matchplay → Layout B med motstander (annet team_number). Defensiv fallback til Layout A hvis team-modus mangler partner.
- Tester for Texas non-captain-flow (issue #17 bonus-fix) — verifiserer at `scoreUserIds` returnerer captain-userId, ikke me-userId.

#### Changed
- `app/games/[id]/scorecard/page.tsx` — full rewrite. Server-komponenten bruker `resolveScorecardLayout` til å bestemme Layout A vs B, og rendrer riktig tabell. Layout B-tabellen har kolonner `# | Par | Spiller1 | Spiller2` der hver spiller-celle viser slag (stor) + sekundærtall (netto eller stableford-poeng) under. SI-kolonne droppet i Layout B for plass på iPhone-bredde. Footer i Layout B viser per-spiller-totaler + lag-total (eller match-status for matchplay: «Du er 2 up etter 8 hull»).
- `app/games/[id]/scorecard/page.tsx` (data-fetch) — bruker admin-client for scores-query siden RLS kan blokkere partners scorer under uvanlig flight-konfigurasjon. Authz beholdes call-site via `me ∈ players` og at `scoreUserIds` kun inneholder lag-medlemmer / motstander basert på `game_players`-radene.
- `app/games/[id]/page.tsx` — CTA-label på «Mitt scorekort»-Card-en på spilloversikten bruker `scorecardTitle().cardLabel` slik at den speiler tittelen på scorekort-flaten. `GameRow`-typen utvidet med `mode_config` (re-bruker shape fra `GameForHole`).

#### Fixed
- Texas scramble non-captain ser nå lagets faktiske score på `/scorecard`. Før viste flaten blanke felt fordi `scores`-radene eies av lag-kapteinen (lex-min userId), og scorekort-flaten queryet på `me.user_id`. Nå queryes captain-userId via `pickTeamCaptain(teamMembers)`.

#### Notes
- Reveal-modus («skjul netto til spillet er ferdig»): Layout B faller tilbake til Layout A under aktivt spill med visibility=reveal. Beholder reveal-prinsippet om å skjule andres data inntil game.status=finished.
- Solo-modi (stableford team_size=1, solo strokeplay) er uendret — fortsatt single-player Layout A med «Mitt scorekort»-tittel.
- Test-suite vokst fra 924 → 947 (+23 nye tester: 7 scorecardTitle + 5 teamCaptain + 11 scorecardLayout).

</details>

</details>

---

<details>
<summary><strong>1.17.y — Allowlist for trusted creators (1 oppføring) — klikk for å vise</strong></summary>

## 1.17.y — Allowlist for trusted creators

Mulighet for å la utvalgte spillere opprette egne turneringer uten å gjøre dem til admin. Liten variant av [#22](https://github.com/jdlarssen/golf-app/issues/22) — vi tester først om noen faktisk vil bruke det, før vi bygger full rolle-modell. Issue [#198](https://github.com/jdlarssen/golf-app/issues/198).

### [1.17.0] - 2026-05-25

> Som admin kan du gi utvalgte spillere lov til å opprette egne turneringer. Det legger til en «Opprett spill»-inngang på forsiden hos dem som er på lista.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/admin/trustedCreators.ts` — kode-basert allowlist (`TRUSTED_CREATOR_EMAILS`) + `isTrustedCreator(email)`-helper. Case-insensitiv, null-trygg, trimmer whitespace. Seeded med `fornes.even@yahoo.no`. Toggle nye brukere ved å pushe ny commit til lista — bevisst valg for small-bet-MVP-en (ingen DB, ingen ny rolle, ingen RLS-touch).
- `lib/admin/auth.ts` — `requireAdmin()` og `requireAdminOrTrustedCreator()` deler én `loadRole`-helper som slår opp `users.is_admin + email` i én query. Begge redirecter til `/login` ved manglende session og til `/` ved manglende tilgang. `loadRole` returnerer `{ userId, email, isAdmin, isTrusted }` — call-sites bruker `isAdmin` for å route success-redirects og audit-id-er.
- `app/opprett-spill/page.tsx` — ny rute utenfor `/admin/*` som gjenbruker `GameForm` fra admin-flyten, men kjører i `AppShell` (ikke `AdminShell`) slik at trusted ikke-admin ikke ser Sekretariat-shellen. Gated av `requireAdminOrTrustedCreator`.
- `lib/games/newGameFormData.ts` — `getNewGameFormData()`-cache-helper (courses + roster). Ekstrahert fra `app/admin/games/new/page.tsx` slik at `/opprett-spill` deler samme fetch + React-cache. Ingen oppførselsendring i admin-flyten.
- Tre nye actions-tester i `app/admin/games/new/actions.test.ts` — trusted-non-admin tillates og setter `games.created_by` til deres userId; ikke-trusted ikke-admin redirecter til `/`; admin-flyten uendret.

#### Changed
- `app/admin/games/new/actions.ts` — inline `is_admin`-sjekk byttet ut med `requireAdminOrTrustedCreator()`. `created_by` settes nå fra helper-returverdi (`userId`) i stedet for inline `user.id`. Admin-happy-path er uendret semantisk; trusted-allowlisten åpner samme code-path uten DB-endringer.
- `app/page.tsx` — selecter nå `email`-feltet i tillegg til `name, is_admin, profile_completed_at`. Tomt-tilstand-CTA og non-empty-tilstand-seksjon vises for `is_admin || isTrustedCreator(email)`. Admins lenkes fortsatt til `/admin/games/new` (uendret Sekretariat-flyt); trusted-non-admin lenkes til `/opprett-spill`.

#### Notes
- Ingen DB-migrasjoner, ingen nye tabeller, ingen RLS-policy-endringer. INSERT mot `games` skjer fortsatt via request-scoped client — RLS lar `authenticated`-brukere insertere så lenge `created_by = auth.uid()`, så admin-bypass var ikke nødvendig.
- Aksepterte rough edges: success-redirect peker fortsatt på `/admin/games/[id]?status=…` (admin-layouten bouncer trusted-bruker derfra til `/`, der spillet vises i «Mine spill»-lista). Valideringsfeil under create bouncer trusted via `/admin/games/new?error=…` → `/`. Polish kun hvis adopsjon > 30 % i 30-dagers observasjons-vinduet.
- Observasjons-SQL etter 30 dager: `select created_by, count(*), min(created_at), max(created_at) from games where created_by in (select id from users where email = any('{fornes.even@yahoo.no, …}'::text[])) group by created_by;`
- Test-suite: 13 nye tester (10 `isTrustedCreator`-unit + 3 trusted-creator actions-tester), 924 totalt grønne.

</details>

</details>

---

<details>
<summary><strong>1.16.y — Texas scramble (5 oppføringer) — klikk for å vise</strong></summary>

## 1.16.y — Texas scramble

Ny spillmodus for laget som vil spille sosialt — én ball per lag, alle slår fra beste slag. Skalerer fra 2-mannslag (par-format) til 4-mannslag (klassisk firma-cup). Lag-handicap regnes etter NGF-aggregatet (25 % av summert HCP for 2-mannslag, 10 % for 4-mannslag), justerbart per spill. Issue [#44](https://github.com/jdlarssen/golf-app/issues/44).

### [1.16.4] - 2026-05-25

> Admin-flaten for Texas scramble-spill viser kun lag som faktisk har spillere, og dropper Flights-seksjonen siden flight automatisk speiler lag-tilordningen. Reduserer visuelt støy på Texas-detalj-sider.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/games/[id]/page.tsx` — ny `isTexas`-narrowing (`game.game_mode === 'texas_scramble'`). Påvirker to seksjoner: (a) Lag-grid-en (linje 580-585) filtrerer nå Texas-spill etter samme regel som par-stableford — kun lag med spillere vises, ingen tomme «(tom)»-placeholders; (b) Flights-seksjonen (linje 615) skipper for Texas siden flight = team mekanisk (validatoren håndhever `flight_number = team_number`). Speilet par-stableford-pattern: vi vil ikke duplisere Lag-seksjonen som Flights.

#### Notes
- Player-facing game-home (`app/games/[id]/page.tsx`) trenger ingen Texas-spesifikk endring: «Din info»-cardet viser «Lag X / Flight Y»-paret som leser fint for Texas, og FlightRoster fungerer fordi Texas-spillere har `flight_number` satt (= team_number) i motsetning til solo-modi.
- Mode-label «Texas scramble» fra `MODE_LABELS` brukes automatisk i admin-detail-pagens Format-card.

</details>

### [1.16.3] - 2026-05-25

> Når Texas scramble-spillet avsluttes får hver spiller mail med lagets plassering og lagets netto-total. Mailen navngir lagkameratene dine («Du spilte med Bjørn, Carla og Dagfinn») slik at du ser hvem du gikk runden med uten å åpne leaderboardet.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'texas_scramble'`-gren med `teamRank`, `teamTotalNet`, `teamTotalGross`, `teamPartnerNames: string[]` og `totalTeams`. Body-builder rendrer «Laget endte på X. plass av N lag med Y slag netto (Z brutto). Du spilte med Bjørn og Carla. Solid plassering!» — celebration-cascade speilet par-stableford (1. → Gratulerer, 2./3. → Solid, 4+ → nøytral). Ny `formatPartnerList`-helper bygger norsk komma-separert oppstilling med «og» før siste navn («Bjørn, Carla og Dagfinn»). 5 nye snapshot-tester dekker 2-mannslag, 4-mannslag, 4.-plass uten celebration, tom partner-liste (defensiv), og null playerFirstName.
- `lib/mail/gameFinishedRecipients.ts` — ny `buildTexasScrambleRecipients` bygger per-spiller mottakerliste. Hver spiller på et lag får samme `teamRank`, `teamTotalNet`, `teamTotalGross`, men sin egen `teamPartnerNames` (alle lag-medlemmer minus seg selv). Filtrer ut tomme/null-navn defensivt. 3 nye tester: 2-mannslag, 4-mannslag, og defensiv håndtering av spiller uten email.

#### Notes
- Texas scramble v1 er nå produksjons-klart. Hele 1.16.y-serien dekker: admin-UI (1.16.0), hull-page med ett kort per lag (1.16.1), leaderboard + podium (1.16.2), og mail (1.16.3).
- Drive-distribusjons-regelen ikke håndhevet (honor-system per spec).
- 3-mannslag ikke i v1 (15 % NGF-default kommer som egen issue hvis brukerne ber om det).
- Test-suite vokst fra 903 → 911 (8 nye mail-tester: 5 i sendGameFinishedNotification, 3 i buildGameFinishedRecipients).

</details>

### [1.16.2] - 2026-05-25

> Når Texas-spillet er i gang ser alle lagene sin sanntids-plassering rangert på laveste lag-netto. Når spillet avsluttes feires vinner-laget på podiet med konfetti, og resten av rangeringen ligger sammenfoldet under.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/TexasScrambleView.tsx` — ny live/active leaderboard-view for Texas. Speilet SoloStrokeplayView visuelt: fairway-backdrop, Fraunces-for-tall typografi, champagne-tint på vinneren. Forskjellene fra SoloStrokeplay-mønsteret: én rad per lag (ikke per spiller), lag-navn «Lag N» med medlemsnavn på sekundærlinjen, sub-tittel «Texas scramble · Sortert på laveste lag-netto», missing-hull-chip vises hvis laget ikke har spilt alle 18 hull.
- `app/games/[id]/leaderboard/TexasScramblePodium.tsx` — ny finished-state podium for Texas. Topp 3 lag på podiet (1.-plass i midten, 2. venstre, 3. høyre), konfetti-burst på 1.-plass én gang per browser-sesjon (distinkt sessionStorage-key `torny-texas-scramble-podium-confetti-seen-${gameId}`), `prefers-reduced-motion` håndtert via globals.css-default på .reveal-up og .confetti-piece-klassene. Resten av rangeringen i collapsed `<details>` under podiet.
- `app/games/[id]/leaderboard/page.tsx` — ny `renderTexasScramble`-helper og branch i mode-routeren. Bygger ScoringContext fra DB-radene, kjører `computeModeResult`, narrower på `kind === 'texas_scramble'`, og velger view per `game.status` (finished → TexasScramblePodium, ellers TexasScrambleView).

#### Notes
- State #3/#3.5-«venterom» bevisst skipped — alle lag-medlemmer ser hverandre umiddelbart (samme RLS-policy som stableford/matchplay/solo-strokeplay).
- `missingHoles`-chip vises kun når laget faktisk mangler hull. Sammenligninger mellom lag med ulike missing-counts er matematisk meningsløse; chip-en signaliserer dette til admin.

</details>

### [1.16.1] - 2026-05-25

> Hullsiden for Texas scramble viser nå ett scorekort per lag i stedet for ett per spiller. Alle på laget ser samme stepper, og hvem som helst kan taste — tappet havner på lagets felles rad. Avataren på kortet viser lag-nummeret, og under står medlemmenes fornavn. «Lever lagets scorekort»-knappen erstatter «Lever scorekort» for Texas-spill.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/holes/[holeNumber]/page.tsx` — ny `isTexas`-narrowing. For Texas-spill collapses flight-medlemmer til ÉN `ClientPlayer` per lag i stedet for én per spiller. Kapteinen (`lex-min userId` blant lag-medlemmer) eier scores-radene; `playersForClient`-entry-en setter `userId = captainUserId`, `name = "Lag N · Navn1, Navn2"`, `initial = String(team_number)` (avatar-tall), `extraStrokes = strokesForHole(teamHandicap, hole.stroke_index)` der `teamHandicap = round(combined-CH × team_handicap_pct / 100)`. Submit-state propagerer som «innlevert hvis NOEN på laget har submitted_at» — alle medlemmer ser samme låst-tilstand når én leverer.
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` — ny `isTexas`-narrowing. `me`-lookup faller tilbake til `players[0]` for Texas (siden non-captain-medlemmer ikke matcher captain-userId-en på sitt eget myUserId). Submit-knapp-tekst: «Lever lagets scorekort» for Texas (mellom «Lever ditt scorekort» for stableford solo og «Lever scorekort» for best-ball).

#### Notes
- Scores skrives med `entered_by = myUserId` (uendret), `user_id = captainUserId` for Texas — audit-trail bevares per tap, men `scores`-radens identitet er lag-kapteinen.
- Real-time-subscription er per-game (ikke per-user), så alle lag-medlemmer ser samme oppdatering når kapteinens rad endres. Ingen ekstra subscription-arbeid nødvendig.
- RLS: insert-policy `scores insert by flight` tillater write til `user_id = captainUserId` fra non-captain-medlem siden de er i samme flight (flight_number = team_number for Texas). Verifisert mot 0002_rls_policies.sql.
- Submit-flow i seg selv er ikke endret — hver spiller har fortsatt sin egen `submitted_at`. En strammere «kun én submit per lag»-policy er en separat design-oppgave, ikke nødvendig for v1.

</details>

### [1.16.0] - 2026-05-25

> Du kan nå opprette Texas scramble-spill — velg Texas scramble som modus, velg 2- eller 4-mannslag, og fordel spillerne. Lag-handicap settes automatisk etter NGF-tabellen (25 % for 2-mannslag, 10 % for 4-mannslag) og kan justeres som i best ball. Hullsiden og leaderboardet for Texas kommer i neste lansering.

<details>
<summary>Teknisk</summary>

#### Added
- `supabase/migrations/0033_texas_scramble.sql` — widener `games_mode_check` til 5 verdier: `'best_ball_netto'`, `'stableford'`, `'singles_matchplay'`, `'solo_strokeplay_netto'`, `'texas_scramble'`. Fikser latent bug for matchplay og solo strokeplay som var shipped i TS-koden men aldri persisterbart i prod (0 rader for begge — ingen hadde prøvd ennå). Atomic widen som sletter den gamle CHECK-en og legger til en ny med samme navn.
- `lib/scoring/modes/texasScramble.ts` — ny scoring-motor som grupperer spillere på `team_number`, velger lag-kaptein (lex-min `userId`) som scores-rad-eier, regner `teamHandicap = round(sum-CH × team_handicap_pct / 100)` etter NGF-konvensjon, allokerer per hull via eksisterende `strokesForHole`, og rangerer lag på lavest `totalNet` med 5-tier tie-break-cascade. 22 unit-tester dekker shape, kaptein-utvelging, lag-HCP-utregning, per-hull netto, totaler/missing, ranking, tie-break, og edge cases (tomt lag, 9-hulls bane, alle null).
- `lib/scoring/modes/types.ts` — `GameMode` utvidet med `'texas_scramble'`. `MODE_LABELS[texas_scramble] = 'Texas scramble'`. Ny `GameModeConfig`-variant `{ kind: 'texas_scramble', team_size: 2 | 4, teams_count: number, team_handicap_pct: number }`. Nye result-typer `TexasScramblePlayerCell`, `TexasScrambleHoleRow`, `TexasScrambleTeamLine`, `TexasScrambleResult`. `ModeResult`-unionen utvidet.
- `lib/scoring/index.ts` — mode-router-switch ruter `'texas_scramble'` til ny engine.
- `lib/games/gamePayload.ts` — ny `validateTexasScramble` validerer at hvert lag har eksakt `team_size` spillere (2 eller 4 — 3-mannslag utsatt til v1.1 → `unsupported_mode_size_combo`), at `team_handicap_pct` er 0..100 (utenfor → `bad_allowance`), og at `flight_number = team_number` per spiller (DB-CHECK `game_players_team_flight_consistency`). 16 nye validator-tester.
- `app/admin/games/new/ModeSelector.tsx` — ny `TexasScrambleIcon` (senterstilt flagg med tre golfballer på rad under, signaliserer ett lag rundt én ball) og en femte tile «Texas scramble». Grid-layout justert fra `grid-cols-2 sm:grid-cols-4` til `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` slik at 5 tiles wrapper pent på alle breakpoints.
- `app/admin/games/new/TeamSizeSelector.tsx` — `ENABLED_COMBOS[texas_scramble] = new Set([2, 4])`. 4-mannslag aktiveres her som første modus som bruker `team_size: 4`.
- `app/admin/games/new/GameForm.tsx` — ny `isTexas`-narrowing, `defaultTexasHandicapPct`-helper (25 for 2-mannslag, 10 for 4-mannslag), `handleTeamSizeChange`-wrapper som re-defaulter handicap-prosenten ved lagstørrelse-endring under Texas-modus. Lag-grid utvidet med variabel slot-count per lag (2 eller 4). Lag-handicap-felt erstatter HCP-allowance-feltet i Settings-seksjonen for Texas (allowance-kolonnen settes til 100 som no-op via hidden input siden DB-kolonnen er NOT NULL). 8-spiller-limit fra payload-laget begrenser Texas til 4 lag á 2 eller 2 lag á 4 spillere; lag 3 og 4 skjules visuelt når team_size=4.
- `app/admin/games/[id]/edit/page.tsx` — SELECT utvidet med `mode_config` slik at edit-flyten kan pre-fylle `team_size` og `texas_team_handicap_pct` fra persistert state.
- `app/games/[id]/page.tsx` — lokal `game_mode`-union utvidet med `'texas_scramble'`.

#### Notes
- Tre tilstøtende komponenter mangler fortsatt Texas-grenen og kommer i etterfølgende lanseringer i 1.16.y-serien: (a) hull-page rendrer per-spiller-rader uavhengig av modus i dag, Texas trenger ett kort per lag (alle medlemmer ser samme stepper); (b) leaderboard-route har ingen `renderTexasScramble`-branch enda — Texas-spill faller derfor gjennom til best-ball-grenen som kaster på shape-mismatch; (c) `gameFinishedNotification`-mail mangler Texas-grenen så avsluttede Texas-spill får default best-ball-mail. Inntil hele 1.16-serien er ute, ikke publiser Texas-spill i prod.
- Drive-distribusjons-regelen (autentisk Texas: hver spiller må bidra med minst N drives per runde) håndheves ikke i v1 — honor-system. Egen issue hvis brukerne ber om tracking.
- 3-mannslag bevisst utsatt (15 % NGF-default). Egen issue hvis brukerne ber om det.
- WHS-tiered handicap-formel (35/15 for 2-mannslag, 25/20/15/10 for 4-mannslag) som alternativ til NGF-aggregatet kommer eventuelt som `mode_config.handicap_formula: 'whs_tiered' | 'ngf_aggregate'` i v2 hvis brukerne ber om det.

</details>

</details>

---

<details>
<summary><strong>1.15.y — In-app innboks (5 oppføringer) — klikk for å vise</strong></summary>

## 1.15.y — In-app innboks

Tørny får en innboks. Bjelle øverst-til-høyre på alle sider viser en champagne-prikk når det venter et nytt varsel, og en dedikert /innboks-flate samler hele historikken. Varslene wires inn etappevis (issue [#25](https://github.com/jdlarssen/golf-app/issues/25)): invitasjoner, peer-godkjenninger, scorekort-events og spill-avsluttet. Siste fase kuttet mail-spammen til aktive brukere — du får ikke lenger mail om noe som allerede er på skjermen din.

### [1.15.4] - 2026-05-24

> Mail-spam-reduksjonen som kom i 1.15.2 fungerer nå strammere. Tidligere kunne en aktiv bruker likevel få mail hvis siste «jeg er her»-pingen var mellom 5 og 30 minutter gammel; nå matcher pinge-frekvensen og mail-vinduet samme 5-minutters-terskel.

<details>
<summary>Teknisk</summary>

#### Fixed
- `proxy.ts` last_seen_at-WHERE-debouncen senket fra 30 min til 5 min for å matche `OFF_APP_THRESHOLD_MS` i [\`lib/notifications/notify.ts\`](https://github.com/jdlarssen/golf-app/blob/main/lib/notifications/notify.ts). Tidligere mismatch (notify.ts gated på 5 min, proxy debouncet 30 min) kunne gi mail til en aktiv bruker hvis siste pinge var 5–30 min gammel — en konservativ default fra Phase 4 av [#25](https://github.com/jdlarssen/golf-app/issues/25), men ikke maksimal spam-reduksjon. Konstanten ekstrahert til ny `lib/notifications/thresholds.ts` (uten `server-only`) slik at både notify.ts og proxy.ts importerer fra samme sted; cross-reference-kommentaren forhindrer ny mismatch.
- DB-cost: ~12 UPDATEs per bruker per time mot 2 før, men trivielt selv ved klubb-skala (100+ aktive brukere = ~1200 writes/time ≈ 0,3/s).

</details>

### [1.15.3] - 2026-05-24

> Et raskt dobbelt-trykk på «Lever scorekort» sender ikke lenger flere varsler eller mail. Ble du sittende uten å vite om første trykk gikk gjennom, og trykte igjen, får admin én melding — ikke to.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/submit/actions.ts` — re-submit av et allerede levert scorekort dupliserte tidligere peer-varsler, admin-varsler og admin-mail fordi `.is('submitted_at', null)`-guarden returnerer `error == null` selv ved 0 rader endret. Switch til `.update(...).select('user_id')` + early-return på tom rad-liste; revalidate + redirect kjører fortsatt så UX-en matcher en fersk submit. Arvet legacy-bug fra mail-flyten; Phase 3 av [#25](https://github.com/jdlarssen/golf-app/issues/25) forsterket konsekvensen ved å duplisere in-app-varsler i tillegg. Ny `app/games/[id]/submit/actions.test.ts`-test asserterer at en re-submit ikke fyrer notify eller mail.

</details>

### [1.15.2] - 2026-05-24

> Du får færre mail når du er aktiv. Hvis du har vært i Tørny de siste fem minuttene når noen leverer scorekort eller avslutter et spill du er med i, dukker varselet kun opp i innboksen din. Mailen kommer som før hvis det er en stund siden du var her.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/submit/actions.ts` — `submitScorecard` filtrerer nå admin-mottakerlisten på `shouldAlsoSendMail` fra notify() før mail-blasten fyres. Aktive admin-er (last_seen_at < 5 min — terskel definert i `lib/notifications/notify.ts:OFF_APP_THRESHOLD_MS`) får kun in-app-varselet; off-app-admin-er får mail som backup. Notify-feil → ikke send mail (samme rasjonale som inni notify() ved insert-error: vi vil ikke maile uten in-app).
- `app/admin/games/[id]/actions.ts` — `endGame` speiler samme pattern for spillerne. Per-spiller `sendMailByUserId`-map bygges fra notify-resultatene; `mailRecipients = recipients.filter(...)` filtrerer før «Resultatet er klart»-blasten.
- `app/admin/games/[id]/avslutt/actions.ts` — `endGameWithSideWinners` speiler endGame-gatingen for sideturnerings-flyten.
- `lib/mail/gameFinishedRecipients.ts` — `FinishedMailRecipient`-interface utvidet med `userId: string` slik at action-laget kan matche notify-utfall mot mail-mottakerlisten. Alle grenene (best-ball, stableford solo/team, singles matchplay, solo strokeplay) oppdaterer recipient-objektene tilsvarende.

#### Notes
- Phase 4 av 4 i issue [#25](https://github.com/jdlarssen/golf-app/issues/25) — innboks-epic-en er nå komplett. PR-er: [#173](https://github.com/jdlarssen/golf-app/pull/173) (Phase 1 — datalag), [#180](https://github.com/jdlarssen/golf-app/pull/180) (Phase 2 — bjelle + /innboks), [#185](https://github.com/jdlarssen/golf-app/pull/185) (Phase 3 — event-wiring), denne PR-en (Phase 4 — mail-gating).
- `invite`-event er IKKE wired i mail-gatingen — Phase 3 wired heller ikke selve invite-notify-call-en siden `invitations.game_id` er null i dagens kode (sporet i [#182](https://github.com/jdlarssen/golf-app/issues/182)). Når game-scoped invitations lander vil mail-gatingen følge samme pattern.
- `last_seen_at`-oppdateringen var allerede wired i `proxy.ts` (best-effort fire-and-forget med Postgres-side WHERE-clause-debounce på 30 min). Bekreftet i Task 4.1, ingen ny kode lagt til. Det betyr at gating-threshold-en (5 min off-app) er strammere enn proxy-debounce-en (30 min) — en aktiv bruker kan i teorien få mail hvis deres siste last_seen_at-skriving er 5–30 min gammel. Akseptabel konservativ default — backup-mail er bedre enn manglende varsel.
- Mail-templatene endret seg ikke; alle 39 mail-snapshot-tester er fortsatt grønne. Action-testene (`app/games/[id]/submit/actions.test.ts`, `app/admin/games/[id]/actions.test.ts`) fikk notify-mock + `userId`-felter i fixturene for å gjenopprette deterministisk mail-fyring i happy-path. Tre nye gating-tester ble lagt til (off-app filter + notify-feil fail-closed) for å assertere kontrakten direkte. Test-suite på 840 grønne.
- 5-min vs 30-min terskel-mismatchen sporet i oppfølgings-issue for å vurdere alignment senere.

</details>

### [1.15.1] - 2026-05-24

> Innboksen lever nå. Du får varsel når noen leverer scorekort, godkjenner ditt eget kort, eller avslutter et spill du er med i. Mailen sendes fortsatt parallelt; neste lansering kutter mailen til de som allerede er aktive i appen.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/submit/actions.ts` — `submitScorecard` varsler nå (a) flight-medlemmer som må peer-godkjenne (`peer_approval_request`-kind) gated på `require_peer_approval` og non-null `flight_number`, og (b) admin-er om at scorekort er levert (`scorecard_submitted`-kind). Begge loopene fyres via Promise.allSettled — feiler stille i notify() og logges som console.error. Mail til admin sendes uavhengig (Phase 3 = sikkerhetsnett); Phase 4 vil gate på shouldAlsoSendMail. select-en på games-raden utvidet med `require_peer_approval`; en ny game_players-query henter flight-medlemmer i samme Promise.all som de eksisterende admin- og submitter-queries.
- `app/games/[id]/approve/actions.ts` — `approveScorecard` varsler nå submitter (`scorecard_approved`-kind) med game.name + approver.name. Wrappet i try/catch slik at en notify-feil aldri blokkerer parent-action.
- `app/admin/games/[id]/actions.ts` — `adminApproveScorecard` speiler peer-approve-flyten med `scorecard_approved`-notify til submitter (approver-navn settes til actorName fra requireAdmin()). `endGame` varsler alle deltakere (`game_finished`-kind) parallelt med eksisterende mail-blast. players-select utvidet med `user_id`.
- `app/admin/games/[id]/avslutt/actions.ts` — `endGameWithSideWinners` speiler `endGame`-loopen for sideturnerings-flyten; samme players-select-utvidelse + game_finished-notify-loop.
- `app/games/[id]/page.tsx` — mark-as-read for både `invite`- og `scorecard_approved`-kinder etter auth-check (spill-hjem er deeplink-target for begge). Best-effort.
- `app/games/[id]/approve/page.tsx` — mark-as-read for `peer_approval_request` ved entry.
- `app/admin/games/[id]/page.tsx` — mark-as-read for `scorecard_submitted` ved entry; gated på userId (helperen forventer non-null).
- `app/games/[id]/leaderboard/page.tsx` — mark-as-read for `game_finished` etter auth-check.

#### Notes
- Phase 3 av 4 i issue [#25](https://github.com/jdlarssen/golf-app/issues/25). Phase 4 vil gate mail-sending på `shouldAlsoSendMail` fra notify() slik at aktive brukere ikke får mail i tillegg til in-app-varsel.
- `invite`-event (game-scoped invitation) ble *ikke* wired i denne fasen siden det ikke finnes en game-scoped invite-flyt i koden i dag. `app/invite/actions.ts` håndterer friend-invite (ingen game_id), og `app/admin/spillere/actions.ts` håndterer admin-invite (heller ingen game_id). Når en game-scoped invite-flyt lander vil notify-callen tilføyes der; mark-as-read-hooken på spill-hjem er allerede på plass.
- Test-suite holder på 837 grønne — eksisterende submit/approve/end-game-tester dekker happy-path uten å mocke notify() (notify-feil svelges via Promise.allSettled / try-catch og endrer ikke parent-action-redirect).

</details>

### [1.15.0] - 2026-05-24

> Innboksen finnes nå som flate i appen — bjelle øverst-til-høyre og en /innboks-side. Selve varslene tikker inn fra og med neste fase; per i dag rendrer innboksen seg som tom for alle.

<details>
<summary>Teknisk</summary>

#### Added
- `hooks/useUnreadNotificationsCount.ts` — client-hook med initial `count: 'exact', head: true`-query mot `notifications`-tabellen + Supabase realtime-sub på `postgres_changes` (INSERT + UPDATE) som lokalt mutérer telleren (INSERT-ulest +1, UPDATE som flipper read_at justerer i begge retninger, Math.max-floor mot negativ teller). Cleanup ved unmount eller userId-bytte. Gjenbruker `subscribeRealtimeChannel`-helperen for setAuth-jwt-håndtering og leak-resistant kanal-suffiksing. 8 tester dekker null-userId-no-op, initial-fetch, INSERT-inkrement (kun ulest), UPDATE-mark-lest-dekrement, UPDATE-mark-ulest-inkrement, floor-på-0, og realtime-cleanup.
- `components/notifications/NotificationBell.tsx` — SmartLink til /innboks med lokalt-tegnet 22px bell-svg (line-icon stil) + 8px champagne-prikk (var(--accent), border-2 av --bg) absolutt-posisjonert øverst-til-høyre når `count > 0`. Ingen tellertall — kun signal-dott per design (mindre visuell støy). aria-label varierer med count. Returnerer null når userId mangler. Tap-target min-h-11 min-w-11 (44px). 7 tester dekker rendring, prikk-toggle, aria-label-format, null-userId, og tap-target.
- `components/notifications/NotificationCard.tsx` — per-kort UI for innboks-listen med emoji-bobble per kind (📨 invite, ✋ peer_approval_request, 📋 scorecard_submitted, ✅ scorecard_approved, 🏆 game_finished), tittel + 1-linjes detalj fra payload (handlings-orientert norsk), champagne-stripe + font-medium for uleste, opacity-80 + font-normal for leste, relativ tidsstempel via `Intl.RelativeTimeFormat('nb-NO', { numeric: 'auto' })`, button med min-h-11 tap-target og caller-styrt onTap. 12 tester dekker payload→title/detail per kind, emoji-mapping, relativ-tid, unread-stripe-toggle, font-medium-toggle, tap-handler og tap-target.
- `lib/notifications/groupByDay.ts` — `groupNotificationsByDay`-helper bucketer notifications per kalender-dag i lokal tid med «I dag»/«I går»/dato-label. `formatDayLabel` håndterer fire nivåer (i dag, i går, dato uten år, dato med år). 8 tester dekker tom input, single-dag-bucket, multi-dag-bucketing, rekkefølge-bevaring, og forrige-år-fallback.
- `app/innboks/page.tsx` + `app/innboks/InboxClient.tsx` + `app/innboks/actions.ts` — /innboks-rute. Server-component fetcher inntil 100 nyeste notifications-rader for current user (eksplisitt user_id-filter for å bruke partial-indexen). Client håndterer optimistic-mark-read ved tap, server-action via useTransition + router.push til deeplink (invite/scorecard_approved → /games/[id], peer_approval_request → /approve, scorecard_submitted → /admin/games/[id], game_finished → /leaderboard). «Marker alle som lest»-knapp synlig kun ved minst ett ulest. Tom-tilstand bruker `<MailEnvelope>` + PullQuote. 10 nye InboxClient-tester.
- `components/ui/TopBar.test.tsx` — 5 tester for ny `userId?: string | null`-prop og action+bell-co-existence.

#### Changed
- `components/ui/TopBar.tsx` — ny valgfri `userId?: string | null`-prop. Når satt rendres `<NotificationBell userId={userId}>` lengst til høyre (med `ml-1` etter eventuell action-chip, ellers `ml-auto`). Legal/privacy + admin/loading skipper bjella (offentlig hhv. skeleton-tilstand).
- Wired userId-prop på 21 page-flater: alle admin-flater + alle profile-flater + games/[id]/{,submit,approve,scorecard,leaderboard}. Per-page-mønsteret er bevisst eksplisitt — `getProxyVerifiedUserId()` er en ren x-torny-user-id-header-lookup uten DB-roundtrip, så cost-en er minimal.
- `app/page.tsx` — bjella mountes ved siden av BrandMark i en flex-rad siden home ikke har TopBar (BrandMark er en wordmark, ikke en lenke).
- `app/games/[id]/leaderboard/RevealBruttoView.tsx` — ny required `userId: string | null`-prop forwardet fra leaderboard-page (komponenten har egen TopBar).
- `lib/notifications/markRead.ts` — utvidet med valgfri `notificationId?: string`-parameter for per-tap-marking fra innboks. Eksisterende kind+entityId-filtre uendret. `buildMarkReadQuery`-tester utvidet til 4 cases.

#### Notes
- Phase 2 av 4 i issue [#25](https://github.com/jdlarssen/golf-app/issues/25). Phase 1 leverte datalag (1.14.3). Phase 3 wires inn de 5 events i eksisterende server-actions; Phase 4 aktiverer off-app mail-gating.
- Per d.d. er innboksen tom for alle siden ingen server-action ennå kaller `notify()`. Bjella forblir uten prikk inntil Phase 3.
- Test-suite vokst fra 786 → 837 (+51 nye Phase 2-tester).

</details>

</details>

---

<details>
<summary><strong>1.14.y — Stableford-runde-polish (4 entries) — klikk for å vise</strong></summary>

## 1.14.y — Stableford-runde-polish

Polish etter første reelle stableford-runde med kompisene. Du kan nå føre slag for hele flighten i solo stableford, fortsette runden fra første tomme hull, og se sideturneringen på stableford-leaderbordet etter avsluttet spill. Hele appens norske copy er også strammet for AI-tells og engelske kalker — først via humanizer (1.14.3), så et no-nb-pass mot code-switched English som var igjen (1.14.4), og til slutt en oppfølger som fanget «Stackbare» + «Lag-koord»-forkortelsen (1.14.5).

### [1.14.5] - 2026-05-24

> To anglisismer i sideturnerings-flyten ryddet: «Stackbare bonuser» heter nå «Bonuser som stables», og den Tørny-interne forkortelsen «Lag-koord» heter «Lag-bonus» på alle bruker-rettede flater. Tre gruppe-titler i «Slik gis poengene»-panelet som var glemt i forrige pass («Skill og rarity», «Moderate», «Achievements») følger nå samme oversettelse som admin-pickeren.

<details>
<summary>Teknisk</summary>

#### Changed
- `components/admin/SideCategoriesPicker.tsx` — «Stackbare bonuser — kan utløses flere ganger samme runde.» → «Bonuser som stables — kan utløses flere ganger samme runde.» Pointslabel for Turkey/Solid: «4p / spiller + lag-koord» / «2p / spiller + lag-koord» → «… + lag-bonus».
- `app/games/[id]/leaderboard/SideTournamentView.tsx` — alle 8 bruker-rettede forekomster av «Lag-koord»/«lag-koord» byttet til «Lag-bonus»/«lag-bonus»: chip-labels for Turkey/Solid lag-koord, rule-tekster («Lag-koord utløses om hele laget …»), og pointsPerId-strenger («4p × N lag-koord-bonus» → «4p × N lag-bonus»).
- `app/games/[id]/leaderboard/SideTournamentView.tsx` — tre PANEL_GROUPS-titler som ble glemt i 1.14.4-passet: «Skill og rarity» → «Ferdighet og sjeldenhet», «Moderate» → «Moderat», «Achievements» → «Bragder». GROUP_LABELS-en (rendret for fane-overskriftene) ble fikset i 1.14.4, men PANEL_GROUPS (rendret i «Slik gis poengene»-panelet) hadde duplikatene som humanizer-/no-nb-passet ikke fanget.

#### Notes
- Bevisst beholdt: kode-kommentarer og test-describe-blocks bruker fortsatt «lag-koord» som domain-jargon (per CLAUDE.md `### Språk` — kode/kommentarer/tester er engelsk-mixed, ikke bruker-synlig).
- 107 tester på tvers av endrede områder grønne — ingen UI-snapshot-assertions brutt.
- Lærdom: en grundigere no-nb-audit bør lete i parallelle data-strukturer i samme fil (GROUP_LABELS + PANEL_GROUPS hadde nesten-duplikater hvor bare den ene ble fikset). Lagt til som hint i CLAUDE.md «Språk-kvalitet»-seksjonen.

</details>

### [1.14.4] - 2026-05-24

> Engelske ord embedded i norske setninger er ryddet: «gender» → «kjønn» i bane-administrasjon, sideturnerings-gruppene heter nå «Bragder», «Minuspoeng» og «Ferdighet og sjeldenhet» (var «Achievements», «Penalty» og «Skill og rarity»), «Custom»-preset heter «Egendefinert», og 12 «Best ...»-labels på leaderbordet er endret til «Beste ...».

<details>
<summary>Teknisk</summary>

#### Changed
- `no-nb:no-nb`-skillet kjørt over hele appen for å fange code-switched English (engelske ord embedded i norske setninger). Dette er en kategori humanizer ikke pågriper like systematisk siden mønstrene ofte ikke ser ut som AI-tells på overflaten.
- **Bane-administrasjon** (`app/admin/courses/CourseForm.tsx`, `app/admin/courses/new/page.tsx`, `app/admin/courses/[id]/edit/page.tsx`, `lib/admin/gameErrorMessages.ts`) — 7 forekomster av «gender» → «kjønn». Inkluderer «per gender», «gender-rating» → «rating-sett per kjønn», «spillers gender» og «tee-gender».
- **Sideturnering** (`app/games/[id]/leaderboard/SideTournamentView.tsx`, `components/admin/SideCategoriesPicker.tsx`) — gruppe-titler oversatt: «Skill og rarity» → «Ferdighet og sjeldenhet», «Moderate» → «Moderat», «Achievements» → «Bragder», «Penalty» → «Minuspoeng». «Custom»-preset-chip → «Egendefinert». «preset» → «forhåndsvalg», «togglerne» → «bryterne», «Hole-wins» → «Hull-seire», «bogey-fri-streak» → «bogey-fri rekke», «kan trigge»/«trigger» → «kan utløses»/«utløses», «(penalty)» trailer → «(minuspoeng)».
- **«Best» som mid-sentence-adjektiv** (6 labels per fil × 2 filer = 12 forekomster) → «Beste» i `'Best netto totalt 18'`, `'Best netto front/back 9'`, `'Best brutto totalt 18'`, `'Best brutto front/back 9'`. Norsk bestemt form for superlative adjektiver mid-sentence.

#### Notes
- Audit dispatched som single Opus-subagent etter at brukeren oppdaget «Fyll inn rating for hver gender»-strengen som humanizer-passet hadde glemt. Audit-en fant ~22 distinkte code-switched English forekomster fordelt på 6 filer.
- Bevisst beholdt: golf-termer (`best ball`, `stableford`, `matchplay`, `tee`, `leaderboard`, `Slope`, `CR`, `Course Rating`, `Hole-win` singular), achievement-navn (Turkey, Solid, Snowman), kode-identifikatorer + kommentarer + JSDoc (per CLAUDE.md-konvensjon).
- 116 tester på tvers av endrede områder grønne — ingen snapshot-/string-assertion brutt.
- CLAUDE.md «Språk-kvalitet i bruker-rettet copy»-seksjonen utvidet med «Code-switching i bruker-rettet kopi»-paragraf som dokumenterer mønsteret eksplisitt, slik at framtidige no-nb-pass kan lete spesifikt etter dette.

</details>

### [1.14.3] - 2026-05-24

> Hele Tørnys norske copy er polert: feilmeldinger, banner-tekster, mail-malene og knappe-tekster er strammet for AI-tells og engelske kalker. Du merker det som mer naturlig norsk på alle flatene. Under panseret er også datalaget for in-app innboks lagt inn — usynlig for deg ennå (fase 1 av 4 mot varslings-senter, [#25](https://github.com/jdlarssen/golf-app/issues/25)).

<details>
<summary>Teknisk</summary>

To uavhengige arbeidsstrømmer landet samme dag og delte versjonsnummer. Begge er samlet her for å holde semver-historikken ren (én versjon, én dato, én oppføring).

#### Changed — humanizer-pass på brukerrettet norsk
- 27 filer på tvers av mail-templates, auth-flyt, UI-primitives, spille-flyt og admin-flyt fikk en gjennomgang med `humanizer:humanizer`-skillet (fra `floka-marketplace`). Mønstrene fulgte etablert vokabular fra [PR #170](https://github.com/jdlarssen/golf-app/pull/170): anglisismer, em-dash-kjeder, «X-spillet»-redundans, særskriving, curly quotes og significance-puffery.
- **Mail** (`lib/mail/gameFinishedNotification.ts`, `lib/mail/scorecardSubmittedNotification.ts`, `docs/email-templates.md`) — em-dash-kjeder splittet, passiv-opener byttet ut («Vi mottok forespørsel om å endre…» → «Du har bedt om å endre…»), idiomatisk definitt-form («leaderboard er åpen» → «leaderboardet er åpent»).
- **Auth-flyt** (`app/(auth)/login/page.tsx`, `app/complete-profile/page.tsx`) — anglism «på login» fjernet, US-decimal i feilmelding (`54.0` → `54,0`), passiv-formulering («det navnet folk kjenner deg som» → «navnet du går under»).
- **UI-primitives** (`components/sync/SyncBanner.tsx`, `components/pwa/InstallInstructionsModal.tsx`) — feilmelding-tone («Tillatelse manglet» → «Du mangler tilgang», «Lagring mislyktes» → «Klarte ikke å lagre»), «nett-tilkoblingen» → «nettforbindelsen», em-dash-kjede i iOS-instruksjoner splittet.
- **Spille-flyt** (`components/hole/*.tsx`, `app/games/[id]/approve/*.tsx`, `app/games/[id]/leaderboard/*.tsx`) — «Tap» → «Trykk» (4 steder, anglism), AI-hedge i confirm-dialog, filler «akkurat nå» fjernet, synonym-overlap droppet i RevealBruttoView.
- **Admin-flyt** (12 filer i `app/admin/` + `lib/admin/gameErrorMessages.ts`) — em-dash-tells (~10 steder), «Vennligst»-overforbruk strammet, tailing-fragmenter omsporet, generisk «Noe gikk galt» → konkret «Klarte ikke å fullføre handlingen», «spennings-moment»-særskriving → «spenningsmoment».

#### Added — notifications-datalag (#25 Phase 1)
- `supabase/migrations/0032_notifications.sql` — `public.notifications`-tabell (polymorf med kind-discriminator + JSONB payload), RLS-policies (select/update kun egne), 2 indekser (uleste-partial + full-historikk), realtime-publikasjon. Applied mot prod via Supabase MCP.
- `lib/notifications/types.ts` — `NotificationKind`-union for de 5 v1 events (`invite`, `peer_approval_request`, `scorecard_submitted`, `scorecard_approved`, `game_finished`) + Zod-skjema per kind. `parseNotificationPayload()` validerer payload mot kind før insert. Bruker `z.guid()` (permissiv UUID-shape) framfor strict RFC 9562 `z.string().uuid()` siden test-sentinels og nil-UUID skal kunne valideres.
- `lib/notifications/notify.ts` — `notify()`-helper inserter notification-rad via admin-client (bypass RLS) + returnerer `shouldAlsoSendMail`-flagg basert på `users.last_seen_at` (off-app hvis null/ugyldig/> 5 min siden). Insert + last_seen_at-lookup kjøres i parallell. Feiler stille på DB-error (returnerer `shouldAlsoSendMail: false` for å unngå mail-uten-in-app). `shouldSendMailFallback()` er pure-helper eksportert for testing og direkte bruk.
- `lib/notifications/markRead.ts` — `markNotificationsRead({userId, kind?, entityId?})` UPDATEr matching uleste rader til `read_at = now()`. Bruker `getServerClient()` (cookies) — RLS-policy `notifications_update_own` gir authz «gratis». Kompositoriske filtre: bare userId (marker alle), userId+kind (alle av kind), userId+kind+entityId (game-scoped). Brukes både fra /innboks-knapper og fra server-side helpers på målsider.
- `zod ^4.4.3` lagt til som ny dep for payload-validering.
- 10 nye unit-tester (3 types, 4 notify, 3 markRead).

#### Notes
- Begge arbeidsstrømmer landet 2026-05-24 og fikk hver sin bump til 1.14.3 — humanizer-passet bumpet uavhengig av notifications-foundation som var commited noen timer tidligere. Konsolidert til én oppføring 2026-05-24 ([#181](https://github.com/jdlarssen/golf-app/issues/181)) for stakeholder-lesbarhet; git-historikken bevarer fortsatt begge commits separat (`9eb9aeb` notifications-foundation + `e488f8a` humanizer-pass).
- 5 parallelle humanizer-subagenter dispatched, hver mot disjoint overflate (mail / auth / UI-primitives / spille / admin). Alle 39 mail-tester grønne — verifisert at ingen subject-/body-snapshots ble brutt.
- Bevisst bevart: mail-subject «Resultatet er klart — ${gameName}» (5 snapshot-tester asserter eksakt streng), brand-tagline «Tørny — fyr opp golfturneringen» (kanonisk), «Sekretariat»-stemmen i admin-flatene, og engelske side-tournament-kategori-navn (Turkey/Solid/Snowman — bevisste achievement-navn).
- Foundation-commits for notifications er prefikset `chore(notifications)` siden de ikke endrer bruker-synlig oppførsel — kun datalag og helpers ikke ennå kalt fra noen actions. Phase 2 leverer bjelle + /innboks UI; Phase 3 wires inn de 5 events; Phase 4 aktiverer off-app mail-gating.

</details>

### [1.14.2] - 2026-05-24

> Når et stableford-spill med sideturnering avsluttes, vises sideturneringen som en egen fane på leaderbordet — akkurat som for best ball. Tidligere var sideturneringen helt usynlig på stableford selv om du hadde valgt å legge den til.

#### Added
- `app/games/[id]/leaderboard/page.tsx` — ny `renderStablefordWithSideTournament`-helper henter LD/CTP-vinnere fra `game_side_winners`, bygger `SideTournamentInput` per spiller/lag (perHoleGross + perHoleNetto med `strokesForHole`-justering), og pakker hoved-podiet + `SideTournamentView` inn i `LeaderboardTabs`. Solo-stableford mapper hver spiller til en «team of 1» med løpende teamId — lag-aggregerte sidekategorier (most_birdies_team etc.) faller bort som forventet via `userIds.length >= 2`-filteret i sideTournament.ts, mens individ-kategorier + LD/CTP + Snowman fungerer normalt. Par-stableford bruker eksisterende team_number-gruppering; nettoBestBallPerHole = MIN av lagets to spilleres netto per hull, samme logikk som best-ball-grenen lenger oppe.
- `renderStableford` ble async for å støtte sideturnerings-fetchen — kalt fra `LeaderboardBody` som allerede er async, så ingen call-site-endringer.

#### Changed
- `app/games/[id]/leaderboard/SoloStablefordPodium.tsx` + `TeamStablefordPodium.tsx` — ny `chromeless?: boolean`-prop (default false) som hopper over `Shell` (AppShell-wrapper) og `Header` (back-pil + kicker) når satt. Brukes når podiet rendres inni `LeaderboardTabs` — outer-callern eier AppShell + TopBar. Speilar `State4View.chromeless`-pattern. Eksisterende standalone-bruk (uten sideturnering) er upåvirket.

### [1.14.1] - 2026-05-24

> «Fortsett runden»-knappen på spill-hjem sender deg nå direkte til første tomme hull i stedet for alltid hull 1. Etter å ha tastet hull 1-9 og lagt fra deg telefonen, åpner appen rett på hull 10 når du tar opp igjen.

#### Changed
- `app/games/[id]/page.tsx` — `PrimaryCtaSection` fetcher nå listen av hull med score (i stedet for kun count via `head: true`) og sekvensielt-scanner 1→18 etter første hull uten score. Resultatet sendes som `nextHole`-prop til `PrimaryCta` og brukes i både «Start runden» og «Fortsett runden»-linkene (tidligere hardkodet `/holes/1`). For full-runde-state (`ready_to_submit`) er verdien ubrukt — CTA-en routes til `/submit` der i stedet, så fallback til 1 ved 0 tastede hull dekker både not_started og in_progress.

### [1.14.0] - 2026-05-24

> I solo stableford kan nå én spiller fungere som «marker» og taste slag for alle i flighten — akkurat som i best ball. Tidligere kunne hver spiller kun se og taste sitt eget scorekort.

#### Changed
- `app/games/[id]/holes/[holeNumber]/page.tsx` — flight-filtreringen i hull-siden behandler nå hele spillerlisten som én flight når `me.flight_number == null` (solo-modus: stableford og solo strokeplay netto), i stedet for å filtrere ned til kun `[me]`. Konsekvens: en av spillerne kan markere for alle de andre i samme spill — typisk bruksmønster når 1-4 kompiser går runden sammen og én av dem fører kortet. Best-ball- og matchplay-modus beholder per-flight-filtreringen som før (flight_number er satt i de modusene).

#### Notes
- `HoleClient`-komponenten støtter allerede multi-player rendering (`cards.map` itererer over alle innsendte spillere, `onSetScore(playerId, value)` godtar hvilken som helst userId), så ingen client-side endringer var nødvendige. Den eksisterende «Bekreft alle scorer»-bekreftelses-gaten på BottomActionBar gjelder fortsatt — marker må fylle inn for alle spillerne før «Neste hull» aktiveres, samme regel som best ball.

</details>

---

<details>
<summary><strong>1.13.y — Slagspill (3 entries) — klikk for å vise</strong></summary>

## 1.13.y — Slagspill

Klassisk slagspill (solo strokeplay netto) er nå tilgjengelig. Velg Slagspill som modus, meld på spillerne, og lavest netto-total over runden vinner. Hver spiller fører sitt eget kort — perfekt for klubbmesterskap og kompis-runder uten lag-fokus.

### [1.13.2] - 2026-05-24

> Når slagspillet avsluttes får spillerne mail med sin plassering og totalt antall netto-slag. Admin-flaten viser «Slagspill» konsistent for solo-strokeplay-spill.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'solo_strokeplay_netto'`-gren med `rank`, `totalNetStrokes`, `totalGrossStrokes` og `totalPlayers`. Body-builder rendrer personlig plassering med netto-total og brutto som side-note: «Du endte på 2. plass av 8 med 72 slag netto (78 brutto)». Celebration-cascade speilar solo-stableford-grenen (1. → «Gratulerer med seieren!», 2-3 → «Solid plassering!», 4+ → nøytral). 6 nye tester dekker 1.-plass + netto/brutto, 2.-plass + solid, 3.-plass + solid, 4.-plass nøytral, plain-text-felter, og fallback når `playerFirstName` er null.
- `lib/mail/gameFinishedRecipients.ts` — ny `buildSoloStrokeplayRecipients`-helper bygger per-spiller mottakerliste fra `SoloStrokeplayResult`. Speilet solo-stableford-pattern strukturelt: kjører `computeLeaderboard` mode-router, narrower på `kind === 'solo_strokeplay_netto'`, og mapper hver spiller til mode-payload med rank + slag-totaler. Defensive fallbacks: hvis mode-router returnerer noe annet enn `solo_strokeplay_netto`, faller helperen tilbake til nøytral best-ball-default. Spillere uten email droppes (samme regel som de andre grenene). 3 nye tester dekker rank + slag-utregning, drop av spillere uten email (totalPlayers reflekterer FULL turnering), og brutto/netto-diff når HCP gir ekstra slag.

#### Changed
- `app/admin/games/[id]/page.tsx` — `isSolo`-narrowing utvidet til å dekke `solo_strokeplay_netto` i tillegg til solo-stableford (`team_size === 1`). Konsekvenser: admin-detalj-siden skjuler Lag-seksjon + Lag/Flight-kolonner for slagspill-spill (én spiller = én deltager), og Format-cardet viser «Slagspill» fra `MODE_LABELS` konsistent. `modeLabel`-JSDoc oppdatert til å reflektere at matchplay og slagspill begge leser ren mode-label.

#### Notes
- Phase 4 markerer epic #46 (solo strokeplay netto) som ferdig. Tidligere faser leverte scoring + validation (Phase 1), GameForm-UI med slagspill-modus (Phase 2), og leaderboard-view + podium (Phase 3). Mailen og admin-polish-en var de siste manglende stykkene før formatet er produksjons-klart.

</details>

### [1.13.1] - 2026-05-24

> Når slagspillet er i gang ser spillerne et leaderboard rangert på laveste netto-total. Avsluttet spill viser podium for topp 3 — 1.-plassen feires med konfetti.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/SoloStrokeplayView.tsx` (+ test) — live/post-finished leaderboard for solo strokeplay netto. Flat liste sortert på `totalNetStrokes` (lavest øverst, klassisk slagspill-format), speilar `SoloStablefordView` 1:1 med disse forskjellene: hoved-tallet er «slag» (ikke «poeng»), sekundær-linje viser brutto-total ved siden av hull-spilt («N brutto · N hull spilt»), sub-tittel «Slagspill · Sortert på laveste netto». Topp 3 får Medallion (gull/sølv/bronse), 4+ får rank-disc. Champagne-tinted Card kun for vinneren. 12 tester dekker rad-rendring, sortering, brutto-display, «slag»-label (ikke «poeng»), Medallion-vs-rank-disc, tabular-nums på netto-tallet, formatRevealName, tom liste, ukjent spiller-fallback, sub-tittel-tekst og tied-spillere.
- `app/games/[id]/leaderboard/SoloStrokeplayPodium.tsx` (+ test) — finished-state-view ved `game.status === 'finished'`. Speilar `SoloStablefordPodium` med samme 3-trinns podium-layout (1. midten, 2. venstre, 3. høyre), champagne accent for vinneren, sølv/bronse for 2-3, og rest-listen i collapsed `<details>`-element for rank 4+ med både netto og brutto-totaler. Distinkt sessionStorage-key `torny-solo-strokeplay-podium-confetti-seen-${gameId}` — verifisert via dedikert test at den ikke kolliderer med stableford-key-en. 19 tester dekker podium-trinn-rendring, slag-label (ikke poeng), hull-chip, konfetti-burst, konfetti-key-isolasjon, suppression når sessionStorage allerede har sett-flagg, champagne accent, collapsed details-rest med netto + brutto, ≤3-spillere-skip, 2- og 1-spiller-edge-cases, tom liste, formatRevealName-bruk, ukjent-fallback, sub-tittel og lavest-først-rangering.

#### Changed
- `app/games/[id]/leaderboard/page.tsx` — ny `renderSoloStrokeplay`-helper og branch i `LeaderboardBody`. Følger samme mønster som `renderStableford` og `renderMatchplay`: bygger `ScoringContext` fra DB-radene, kjører `computeModeResult`, narrower på `kind === 'solo_strokeplay_netto'` og velger view per `game.status` (finished → podium, ellers live-view). `teamNumber` sendes som null siden solo-strokeplay-validatoren håndhever solo-modus. State #3/#3.5-«venterom» bevisst skipped (samme RLS-pattern som stableford og matchplay — alle spillere ser hverandre umiddelbart).

#### Notes
- Scoring-motor + validator landet i Phase 1 (PR #159), admin-UI-flyten i Phase 2 (PR #160). Denne fasen lukker leaderboard-gapet slik at slagspill-spill rendres riktig fra start til finished-podium. Mail-template + admin/games-detalj-polish kommer i Phase 4 av epic #46.

</details>

### [1.13.0] - 2026-05-24

> Du kan nå opprette slagspill-turneringer — klassisk golf-format der hver spiller fører eget kort og laveste netto-total vinner. Velg Slagspill som modus og meld på spillerne.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/ModeSelector.tsx` — fjerde tile «Slagspill» for solo strokeplay netto. Ny `StrokeplayIcon` (scorekort med tre score-linjer + blyant til høyre, samme stroke-stil som de andre tile-ikonene) signaliserer at hver spiller fører eget kort. Grid-layout byttet fra `grid-cols-1 sm:grid-cols-3` til `grid-cols-2 sm:grid-cols-4` slik at iPhone får 2×2-stacking (hver tile ~halve skjermbredden, komfortabel scanning) og tablet/desktop får 4-i-rad-symmetri. Beskrivelses-tekst: «Individuelt scorekort. Lavest netto-total vinner.» `ModeSelector.test.tsx` utvidet med assertion for slagspill-tile-rendering, beskrivelses-tekst, aria-checked-toggle og click → `onChange('solo_strokeplay_netto')`.
- `app/admin/games/new/GameForm.tsx` — solo strokeplay netto-grenen gjenbruker hele solo-stableford-UI-flyten via utvidet `isSolo`-narrowing-flag (`teamSize === 1 && (gameMode === 'stableford' || gameMode === 'solo_strokeplay_netto')`). Konsekvenser:
  - **Flat spiller-liste**: ingen lag-grid og ingen flight-seksjon — alle valgte spillere persisteres med `team_number = null` og `flight_number = null` (gamePayload-validatoren `validateSoloStrokeplayNetto` nullstiller defensivt uansett form-input).
  - **TeamSizeSelector synlig**: Solo aktiv, Par + 4-mann grayed-out som «kommer snart» (par/4-mann strokeplay er fremtidige varianter — par = fyrball strokeplay; 4-mann = bestest av 4 totaler). I motsetning til matchplay som skjuler hele TeamSizeSelector siden 1v1 er den eneste meningsfulle kombinasjonen.
  - **Per-spiller-tee-seksjon**: vises (slagspill krever individuell HCP-allokering for korrekt slope/CR per spiller). Section-nummer 4 (delt med solo-stableford siden ingen 4. Lag-seksjon ligger foran).
  - **Validering**: ≥1 spiller for publish, ingen øvre cap (i motsetning til matchplay som capper på 2). `missingForPublish` gjenbruker eksisterende «minst én spiller»-copy fra solo-stableford-grenen.
  - **Hidden inputs**: `game_mode = 'solo_strokeplay_netto'`, `team_size = 1`, ingen `stableford_team_size` (det hører kun til stableford-modus). Player-radene bærer tomme `team`/`flight`-strenger som validatoren tolker som null.
  - `defaultTeamSizeForMode` returnerer 1 også for `solo_strokeplay_netto` så form-state alltid har gyldig `team_size`.
- `app/admin/games/new/GameForm.test.tsx` — 7 nye tester for slagspill-flyten: TeamSizeSelector synlig med Solo aktiv + Par/4-mann disabled, hidden inputs (`game_mode='solo_strokeplay_netto'`/`team_size=1`/ingen `stableford_team_size`), flat spiller-liste (ingen 4. Lag- eller 5. Flights-heading), canPublish=true ved 1 spiller + øvrige felt satt, canPublish=false ved 0 spillere (med korrekt missingForPublish-copy «minst én spiller»), per-spiller-tee-seksjons-heading «4. Tee per spiller», ingen øvre spiller-cap (alle 8 spillere kan velges), og hidden-input-payload med tomme team/flight-strenger.

#### Notes
- Scoring-motor + payload-validator landet i Phase 1 (PR #159) — denne fasen aktiverer kun admin-UI-flyten. Solo-strokeplay-leaderboard-view kommer i Phase 3 (klassisk slagspill-tabell med plassering/totaler/topp-celebrasjon); mail-template + admin/games-detalj-polish kommer i Phase 4 av epic #46.
- TeamSizeSelector beholder `ENABLED_COMBOS.solo_strokeplay_netto = Set([1])` defensivt — `Record<GameMode, …>` krever alle keys, og Par/4-mann markeres som «kommer snart» istedenfor å fjernes helt (skaper en eksplisitt roadmap-signal for fremtidige varianter).

</details>

</details>

---

<details>
<summary><strong>1.12.y — Matchplay (3 oppføringer) — klikk for å vise</strong></summary>

## 1.12.y — Matchplay

Matchplay-turneringer mellom to spillere er nå tilgjengelig. Velg Matchplay som modus og tilordne én spiller til Side 1 og én til Side 2 — vinneren av hvert hull (laveste netto) får et hull-poeng, og matchen avgjøres som «X up» (etter 18 hull) eller «X&Y» (mat-em før hull 18) etter golfreglene.

### [1.12.2] - 2026-05-24

> Når matchen avsluttes får begge spillere mail med matchresultatet («Du vant 3&2 over Per» / «Du tapte 1up mot Per» / «AS — uavgjort»). Admin-flaten viser Sider i stedet for Lag for matchplay-spill.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'singles_matchplay'`-gren med `matchResult` (`'won' | 'lost' | 'tied'`), `formattedResult` (golf-format: «3&2» / «1up» / «AS»), `opponentName` (motspillerens fornavn, `null` faller tilbake til «motstanderen») og `selfSide` (1 eller 2). Body-builder rendrer tre grener:
  - **won**: «Du vant {formatted} over {opponent}. Gratulerer med seieren!»
  - **lost**: «Du tapte {formatted} mot {opponent}. Godt spilt — kanskje revansje neste runde?»
  - **tied**: «Matchen mot {opponent} endte uavgjort (AS). En jevn match — kanskje neste gang.»
  - 5 nye tester dekker won / lost / tied / null-opponent-fallback / null-firstName-fallback. HTML escaper opponent-navn (XSS-defense), formatted-strengen rendres direkte siden den genereres internt fra tall.
- `lib/mail/gameFinishedRecipients.ts` — ny `buildMatchplayRecipients`-helper bygger per-spiller mottakerliste fra `SinglesMatchplayResult`. Hver spiller får motspillerens fornavn via `sideByUserId`-lookup (scoring-laget tuple-garantien gir oss 1+1) og matchResult mappet fra `result.result.winner` ('side1'/'side2'/'tied') sett FRA mottakerens `selfSide`. Defensive fallbacks: hvis matchen ikke er avgjort (`result.result === null` — sjelden gitt endGame-validering) eller hvis mode-router returnerer noe annet enn `singles_matchplay`, faller helperen tilbake til nøytral best-ball-default. 6 nye tester dekker side 1 vinner / side 2 mat-em (3&2) / AS / spiller uten mail / motspiller uten navn / live (ikke avgjort) → fallback.

#### Changed
- `app/admin/games/[id]/page.tsx` — ny `isMatchplay`-narrowing-flag (`game.game_mode === 'singles_matchplay'`) + tre tilpasninger:
  - **Lag-terminologi**: «Antall lag X / 4» blir «Antall sider X / 2», Lag-seksjonen tittel «Lag» blir «Sider» (kun viser Side 1 og Side 2, aldri 3/4), spillerlistens «Lag»-kolonne blir «Side», og «Leverte scorekort»-listen viser «Side N» i stedet for «Flight N · Lag N» for matchplay.
  - **Flights-seksjonen skjules**: flight = side mekanisk (validatoren håndhever `flight_number = team_number` for matchplay), så Flights-listen ville duplisert Sider-listen rett over — speilet par-stableford-pattern fra 1.11.2.
  - **Fremgang-kortet**: bytter «Hvor langt hver flight har kommet» til «Hvor langt hver side har kommet», og labelen «Flight N» til «Side N» for konsistens med resten av detail-pagen.

#### Notes
- Phase 4 markerer epic #45 (singles matchplay v1) som ferdig. Tidligere faser leverte scoring + validation (Phase 1), GameForm-UI med side-tilordning (Phase 2), og MatchplayMatchView-leaderboarden (Phase 3). Mailen og admin-polish-en var de siste manglende stykkene før formatet er produksjons-klart.

</details>

### [1.12.1] - 2026-05-24

> Når matchen er i gang ser begge spillerne sin sanntids match-status («X up etter Y hull»), og når matchen er over feires vinneren med resultat i golf-standard format («3&2», «1up», «AS»).

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/MatchplayMatchView.tsx` (+ test) — ny match-view for singles matchplay. Erstatter leaderboard-grenene når `game_mode === 'singles_matchplay'`. Kombinerer live-state og finished-state i én komponent siden matchen er den samme historien som gradvis avgjøres — banner-formen bytter automatisk basert på `result.result`. Fire vertikalt-stablete seksjoner:
  - **Status-banner** øverst: «{Vinner} vant {formatted}»-card med Medallion + champagne-accent ved avgjort match (mat-em eller spilt 18 hull med vinner), «Matchen endte AS»-card uten konfetti ved tied-resultat etter 18 hull, «{Leder} leder {N} up»-card ved live-state midt i runden, «Alt likt etter N hull»-card ved tied-state midt i runden, og «Matchen er ikke startet ennå»-card ved 0 hull spilt.
  - **Sider-header**: to rader (S1 + S2) med spiller-navn (via `formatRevealName`) og course-handicap. Lederside får hårfin champagne-accent (`border-accent/60 bg-accent/[0.05]`).
  - **Per-hull-grid**: tabell med en rad per `MatchplayHoleRow` (skalerer til 9-hulls-baner ved kortere hulls-array). Kolonner: Hull, Par, Side 1 (gross + Nnet hvis extra), Side 2 (gross + Nnet), Vinner (S1/S2/=/—). Vinner-side får `font-semibold text-score-under-fg` på gross-cellen for visuell bekreftelse.
  - **Match-meta**: kompakt rad med Spilt / Igjen / Status — alle `tabular-nums` for konsistent skanning.
  - Konfetti fyrer en gang per browser-sesjon når matchen er avgjort med en vinner (`result.result.winner !== 'tied'`). SessionStorage-key `torny-matchplay-result-confetti-seen-${gameId}` er distinkt fra stableford-podiene (verifisert via dedikert test). AS-resultat får ingen konfetti.
  - Defensiv fallback: hvis `result.holes.length === 0` (scoring-laget returnerer empty-shell når sidene mangler) viser view-en en «Matchen kan ikke vises»-card i stedet for tom UI.
  - 22 nye tester dekker live/finished/AS-grener, konfetti-key-isolasjon, side-header med HCP + manglende info, per-hull-grid (uplayed/tied/won/extra strokes/9-hulls-bane), match-meta-tall og defensiv empty-shell-fallback.

#### Changed
- `app/games/[id]/leaderboard/page.tsx` — ny `renderMatchplay`-helper og branch i `LeaderboardBody`. Følger samme mønster som `renderStableford`: bygger `ScoringContext` fra DB-radene, kjører `computeModeResult`, narrower på `kind === 'singles_matchplay'` og rendrer `MatchplayMatchView` direkte. State #3/#3.5-«venterom» er bevisst skipped: matchplay-spillere ser hverandre umiddelbart (samme RLS-policy som stableford). `team_number` videresendes fra DB siden matchplay-validatoren håndhever 1+1-tilordning på påmelding.

#### Notes
- View-en kombinerer live + podium i én komponent i stedet for å speile stableford-mønstret (View + Podium). Matchplay har ingen rangering å vise — det er én match som har én løpende status, og finished-feiringen er en banner-bytte snarere enn en separat layout-omveltning.
- Per-spiller-scorecardet (når spiller taster slag) er IKKE endret i denne fasen — hver spiller fører fortsatt sitt eget kort. Match-status på scorecardet kan legges til senere som forbedring.
- Phase 4 av epic #45 dekker matchplay-mail-template (gameFinishedNotification med matchplay-copy) og admin/games-detalj-polish.

</details>

### [1.12.0] - 2026-05-24

> Du kan nå opprette matchplay-turneringer mellom to spillere — velg Matchplay som modus, tilordne én spiller til Side 1 og én til Side 2. Vinneren av hvert hull får poeng; matchen avgjøres som «X up» eller «X&Y» etter golfreglene.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/ModeSelector.tsx` — ny `MatchplayIcon` (to flagg-stenger speilet mot hverandre med et «vs»-prikk i midten, samme stroke-stil som `BestBallIcon`/`StablefordIcon`) og en tredje tile «Matchplay» med beskrivelses-teksten «1v1 hull-for-hull. Vinneren avgjøres som «X up» eller «X&Y».». Grid-layout byttet fra `grid-cols-2` til `grid-cols-1 sm:grid-cols-3` slik at iPhone får vertikal stack (komfortabel scanning) og tablet/desktop får 3-kolonners symmetri. `ModeSelector.test.tsx` utvidet med assertion for matchplay-tile-rendering, beskrivelses-tekst, aria-checked-toggle og click → `onChange('singles_matchplay')`.
- `app/admin/games/new/GameForm.tsx` — ny `isMatchplay`-narrowing-flag + matchplay-spesifikke grener:
  - **Side-tilordnings-UI**: ny seksjon «4. Sider» som vises når ≥1 spiller er valgt og mode=matchplay. To dropdowns (Side 1 + Side 2) som tilordner spilleren til `teamByPlayer[pid] = 1 | 2`. Lag-grid (best-ball/par-stableford) og flight-seksjon rendres ALDRI for matchplay.
  - **`assignPlayerToSide`-handler** med swap-semantikk: hvis admin velger en spiller som allerede står på den andre siden, swappes okkupantene automatisk (én klikk fremfor to). `flightByPlayer[pid]` settes til `side` (samme som team_number, speiler par-stableford-mønstret for å oppfylle DB-CHECK `game_players_team_flight_consistency`).
  - **`orderedPayload` for matchplay**: itererer side 1 først, så side 2 — gir deterministisk `player_0` (side 1) + `player_1` (side 2)-rekkefølge i FormData. Hver rad bærer `team_number = side` og `flight_number = side`.
  - **`matchplayPlayersValid`-validitet**: krever nøyaktig 2 spillere, én på side 1 og én på side 2.
  - **`missingForPublish` for matchplay**: «2 spillere» (0 valgt), «1 spiller til» (1 valgt), «for mange spillere — matchplay krever nøyaktig 2» (≥3 valgt), «én spiller på hver side» (2 valgt men ikke 1+1).
  - **Spiller-cap på 2**: `atCap = isMatchplay ? selectedPlayerIds.length >= 2 : requiresTeams && >= 8` disabler 3.-spiller-checkboxen.
  - **Counter-copy**: «X av 2 spillere valgt» (primary når 2 er valgt, ellers muted).
  - **`TeamSizeSelector` skjules** (`{!isMatchplay && <TeamSizeSelector …/>}`): valget «Solo/Par/4-mann» har ingen mening for matchplay siden det kun er 1v1.
  - **Per-spiller-tee-seksjon** (M/D/J): vises også for matchplay (matchplay krever individuell HCP-allokering). Section-nummer 5 deles med par-stableford.
  - `defaultTeamSizeForMode` returnerer 1 også for `singles_matchplay` så form-state alltid har gyldig `team_size`.
- `app/admin/games/new/GameForm.test.tsx` — 12 nye tester for matchplay-flyten: TeamSizeSelector skjules, hidden inputs (`game_mode`/`team_size`/ingen `stableford_team_size`), side-tilordnings-UI vises ved ≥1 spiller, lag-grid + flight-seksjon vises aldri, «Trekk tilfeldig» skjules, spiller-cap på 2, counter «X av 2», canPublish=true ved gyldig 1+1, canPublish=false ved 1 spiller (med korrekt missingForPublish), canPublish=false ved 2 spillere på samme side, swap-semantikk i dropdown-bytte, hidden inputs (`player_0_team=1`/`player_1_team=2`/flight=team), per-spiller-tee-seksjons-heading.

#### Notes
- Scoring-motor + payload-validator landet i Phase 1 (PR #155) — denne fasen aktiverer kun UI-flyten. Matchplay-view (hull-for-hull-tabell med «AS»/«X up»/«X&Y»-status) kommer i Phase 3; matchplay-mail-templates + admin/games-detalj-polish kommer i Phase 4 av epic #45.
- TeamSizeSelector beholder `ENABLED_COMBOS.singles_matchplay = Set([1])` defensivt selv om komponenten ikke rendres for matchplay — TypeScript-en `Record<GameMode, …>` krever alle keys, og fjerning av entryen ville tvunget oss til `Partial<Record<>>`. Defensiv kode er trygt.

</details>

</details>

---

<details>
<summary><strong>1.11.y — Par-stableford (3 oppføringer) — klikk for å vise</strong></summary>

## 1.11.y — Par-stableford

Stableford-turneringer kan nå spilles som par (4BBB / fyrball). Velg Stableford som modus og Par som lagstørrelse, så kan du melde på 2/4/6/8 spillere fordelt på 1–4 lag à 2 — laget får poengene fra det høyeste stableford-resultatet på hvert hull.

### [1.11.2] - 2026-05-24

> Når par-stableford-runden avsluttes får spillerne mail om lagets plassering og poeng, ikke en generisk best-ball-mail. Admin-flaten viser lag-grupperingen korrekt for par-spill — kun de lag som faktisk har spillere vises, og redundante Flight-kolonner er skjult.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'stableford', variant: 'team'`-gren med `teamRank`, `teamTotalPoints`, `teamPartnerName` (fornavn eller hele navnet hvis fornavn ikke kan parses, `null` for defensiv-fallback) og `totalTeams`. Solo-grenen er nå eksplisitt merket `variant: 'solo'` for symmetri. Body-builder rendrer team-grenen som «Laget endte på X. plass av N lag med Y poeng» + en partner-setning «Du og {partner} satt sammen på lag.» (droppet helt hvis partnernavn er `null`). Celebration-tilegget (1.-plass: «Gratulerer med seieren!», 2./3.: «Solid plassering!») er løftet ut til en `celebrationFor()`-helper som begge grenene deler. 4 nye snapshot-style tester dekker 1.-plass, 2.-plass (med partnernavn), 4.-plass (uten celebration) og null-partner-fallback.
- `lib/mail/gameFinishedRecipients.ts` — team-stableford-grenen bygger per-spiller mottakerliste der hver mottaker får sin egen `teamPartnerName` slik at Ada ser «Du og Bjørn satt sammen» og Bjørn ser «Du og Ada satt sammen». Selectsen utvidet med `team_number` (NOT NULL siden 0030, gratis å ta med for begge moduser), og scoring-context-en sender `teamNumber` videre slik at `computeTeam()` faktisk grupperer riktig. 4 nye tester: 4 spillere på 2 lag (begge får rett partnernavn), 8 spillere på 4 lag (totalTeams reflekterer lag, ikke spillere), spillere uten mail droppes men team-totalene består, partner uten navn → `teamPartnerName: null`.

#### Changed
- `app/admin/games/[id]/page.tsx` — fetcher nå `mode_config` slik at vi kan skille `isParStableford` fra solo-stableford og fra best-ball. Tre tilpasninger basert på narrow-ingen:
  - Spillform-raden i Format-cardet viser «Par-stableford» (i stedet for «Stableford») når `mode_config.team_size === 2`.
  - Lag-grid viser kun lag som faktisk har spillere for par-stableford (1-4 lag), i stedet for hardkodede 4 lag med «(tom)»-placeholdere. Best-ball beholder fast 4-grid siden formatet alltid er 4 lag à 2.
  - Spillere-tabellen dropper Flight-kolonnen for par-stableford (flight = team mekanisk siden Phase 2 — kolonnen ville duplisert Lag-tallet). Best-ball viser begge kolonnene som før. Solo dropper begge.
  - Flights-seksjonen skjules for par-stableford (samme grunn — duplikat av Lag-seksjonen).
  - «Leverte scorekort»-listen viser kun «Lag N» for par-stableford, og dropper hele lag/flight-linjen for solo.
  - «Antall lag X / 4»-raden i Påmelding-cardet skjules for solo (alltid 0).

#### Notes
- Mode-aware-mail er backwards-compatible: existing solo-spill og best-ball-spill får samme mail-copy som før (solo-snapshot-testene er kun strammet til å sende `variant: 'solo'` eksplisitt). Defensive narrowing — hvis mode-router returnerer noe uventet faller helperen til best-ball-grenen.
- Phase 4 lukker epic #43. Par-stableford er nå end-to-end shipped: scoring + validation (Phase 1, #151), admin GameForm (Phase 2, #152), live-leaderboard + podium (Phase 3, #153) og mail + admin-detalj-polish (denne fasen).

</details>

### [1.11.1] - 2026-05-24

> Når par-stableford-runden er i gang ser spillerne nå et lag-leaderboard med begge partnernes poeng. Avsluttet spill viser podium for topp 3 lag — 1.-plassen feires med konfetti.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/TeamStablefordView.tsx` (+ test) — ny live-leaderboard for par-stableford. Speilet `SoloStablefordView` strukturelt: flat liste sortert på lag-poeng (høyest øverst), 1.-plass får champagne-tinted Card + `Medallion`, 2–3 får sølv/bronse-`Medallion`, 4+ får ren rank-disc. Hver rad viser «Lag N» + begge partnernes fornavn (via `firstName()` + `formatRevealName`-fallback for kallenavn-only-spillere) + total stableford-poeng (`tabular-nums`). Tied lag deler rank med «Delt N. plass med Lag X»-melding. 11 nye tester dekker rendring, rekkefølge, partnernavn, medallion vs rank-disc, tied-with, tomt result, manglende playerInfo og tomme lag.
- `app/games/[id]/leaderboard/TeamStablefordPodium.tsx` (+ test) — ny finished-reveal-view for par-stableford. Speilet `SoloStablefordPodium`: 3-trinns podium med 1.-plass i midten (champagne `Medallion` 48px, `border-accent` + champagne-shadow), 2.-plass venstre (silver `Medallion` 36px), 3.-plass høyre (bronse `Medallion` + `border-warning/40`). Hver podium-trinn viser «Lag N» + begge partnernes fornavn + lag-total. 1.-plass får `ConfettiBurst` som auto-fyrer på første mount per browser-sesjon (sessionStorage-key `torny-par-stableford-podium-confetti-seen-${gameId}` — distinkt fra solo-key for å unngå krysstinta state). Resten av lagene (rank 4+) ligger i collapsed `<details>` under podiet. Skalerer ned ved <3 lag (1 lag → kun midten; 2 lag → midten + venstre). 16 nye tester dekker podium-trinn, partnernavn, konfetti-key-isolasjon (både separat fra solo og at samme team-key skipper re-burst), champagne-accent, rest-listen, skalerings-grenene og fallback-tilstander.

#### Changed
- `app/games/[id]/leaderboard/page.tsx` — `renderStableford`-routeren håndterer nå begge variantene av `StablefordResult`. Tidligere `notFound()`-fallback for `variant === 'team'` (Phase 1-midlertidig kode) er erstattet med en variant-router som velger `TeamStablefordView`/`TeamStablefordPodium` for team-spill og `SoloStablefordView`/`SoloStablefordPodium` for solo. State4-flippen (finished vs live) er identisk på begge: finished → podium med konfetti, alt annet → flat live-leaderboard.
- `renderStableford`-opts-typen utvidet med `team_number: number` på player-radene, og ScoringContext-en sender `teamNumber` til scoring-motoren når `mode_config.team_size === 2` (gjenbrukes for lag-gruppering i `computeTeam()`). Solo-spill får fortsatt `teamNumber: null` siden scoring-laget ignorerer feltet på solo-grenen.

#### Notes
- Spillerinfo (`playersById` med `{ name, nickname }` per userId) gjenbrukes fra solo-flyten — ingen ekstra DB-roundtrips. `getGameWithPlayers` cachen leverer alt teamdata + user-meta i ett kall.
- Mode-aware mail-utvidelse (gameFinishedNotification med par-stableford-copy) kommer i Phase 4 — utvidelsen her er rent UI på leaderboard-flaten.

</details>

### [1.11.0] - 2026-05-24

> Du kan nå opprette par-stableford-turneringer (fyrball / 4BBB). Velg Stableford som modus, så Par som lagstørrelse — admin tilordner 2/4/6/8 spillere til lag à 2.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/GameForm.test.tsx` — 7 nye tester for par-stableford-flyten: hidden input `stableford_team_size`, lag-grid-synlighet, «Trekk tilfeldig»-knapp er skjult for par-stableford, publish-validitet for 4 spillere på 2 lag, blokkering ved odd count, blokkering ved ujevn lag-fordeling, og at flight-seksjonen ikke rendres.

#### Changed
- `app/admin/games/new/TeamSizeSelector.tsx` — `ENABLED_COMBOS.stableford` utvidet fra `{1}` til `{1, 2}` så Par-tile er aktiv for stableford. 4-mann er fortsatt grayed-out.
- `app/admin/games/new/GameForm.tsx` — tre nye narrowing-flags (`isSolo`, `isBestBall`, `isParStableford`) styrer mode-spesifikke grener av validering, lag-grid-synlighet, og copy. Par-stableford-spesifikke endringer:
  - Lag-grid renderes så snart admin har valgt ≥2 spillere (i motsetning til best-balls 8-krav). Helper-tekst: «Inntil 4 lag à 2 spillere. Hvert lag må ha enten 0 eller 2 spillere. Tomme lag publiseres ikke.»
  - Publish-validering krever ≥2 spillere, partall antall, alle tilordnet et lag, og hvert ikke-tomt lag à 2.
  - `missingForPublish` melder «partall antall spillere» eller «lag-fordeling (par à 2)» med mode-presis copy.
  - «Trekk tilfeldig»-knappen er kun synlig for best-ball (par-stableford har variabelt antall spillere — admin tilordner manuelt i fase 2). «Tøm lag» vises hvis det er noe å tømme.
  - Flight-seksjonen skipper helt; payloaden setter `flight_number = team_number` automatisk via `orderedPayload`.
  - Per-spiller-tee-seksjonen (M/D/J) gjenbrukes fra solo-flyten siden flight-seksjonen ikke rendres.
  - Hidden input `stableford_team_size` (verdi `'1'` eller `'2'`) sendes når mode = stableford slik at `validateStableford`-routeren i `lib/games/gamePayload.ts` velger riktig validator-gren.
- `app/admin/games/new/TeamSizeSelector.test.tsx` — eksisterende «Solo aktiv, Par disabled»-test oppdatert til «Solo + Par aktiv, 4-mann disabled». To nye tester: caller `onChange(2)` ved Par-klikk, og 4-mann-klikk ignoreres.

#### Notes
- Scoring-motor + payload-validator landet i Phase 1 (PR #151) — denne fasen aktiverer kun UI-flyten. Lag-leaderboard + team-podium kommer i Phase 3; mail-tekster + admin/games-detalj-polish kommer i Phase 4 av epic #43.
- Drag-tilfeldig-knappen for par-stableford ble bevisst utelatt fra Phase 2 for å holde scope strammere — kan generaliseres til 2/4/6/8 spillere i en senere fase hvis det blir vondt UX.

</details>

</details>

---

<details>
<summary><strong>1.10.y — Stableford spillerflyt (6 oppføringer) — klikk for å vise</strong></summary>

## 1.10.y — Stableford spillerflyt

Stableford-turneringer er nå spillbare end-to-end. Scorecard viser per-hull-poeng ved siden av netto-scoren, leaderboard rangerer spillerne på total stableford-poeng, og når runden avsluttes feires topp 3 med et eget podium — vinnerne får i tillegg en mail som forteller dem hvor de endte.

### [1.10.5] - 2026-05-23

> «Du trenger 8 spillere»-banneret i admin-flyten er ikke lenger misvisende for stableford. Når du redigerer et stableford-spill skjules det helt, og når du oppretter et nytt spill nevner det at best ball trenger 8 mens stableford holder med 1.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/games/[id]/edit/page.tsx` — `PlayerShortageBanner` tar nå `gameMode`-prop og returnerer `null` for `'stableford'` (banner-en er en nudge om total klubb-størrelse i best-ball-kontekst, ikke per-spill-validering). For `best_ball_netto` med < 8 registrerte: copy presisert til «8 registrerte spillere for best ball».
- `app/admin/games/new/page.tsx` — banner-en kan ikke vite hvilken modus admin lander på (mode-velgeren ligger i form-en under), så copy-en er omskrevet til mode-nøytral: «Du har bare X registrerte spillere. Best ball trenger 8 — stableford holder med 1. Inviter flere fra Spillere-siden.» Singular/plural-bøying av «registrert{e}» og «spiller{e}» basert på `players.length`.

</details>

### [1.10.4] - 2026-05-23

> Bane-listen i admin viser nå datoen i samme korte format som resten av appen — «14. mai» i stedet for «14. mai 2026».

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/courses/page.tsx` — bytter `formatShortDateNbWithYear` → `formatShortDateNb` for «Lagt til {dato}»-linjen i bane-listen. Året er sjelden informativ for inneværende sesong; konsistent med player-flater (f.eks. `app/profile/historikk/page.tsx`). `formatShortDateNbWithYear` beholdes for kontekster der året er meningsfullt (slett-confirmation, spiller-profil).

</details>

### [1.10.3] - 2026-05-23

> Når du åpner et stableford-spill i admin, ser du ikke lenger en tom «Lag»-seksjon eller Lag/Flight-kolonner i spillerlisten. De vises bare for spill som faktisk har lag.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/games/[id]/page.tsx` — `<SectionCard ribbon="Lag">` skjules for `game_mode === 'stableford'` (alle `team_number`/`flight_number` er null for solo). Spillere-tabellen dropper Lag- og Flight-kolonnene under samme betingelse.

</details>

### [1.10.2] - 2026-05-23

> Admin-listen viser nå modus per spill, og resten av admin-flyten er forfinet for å støtte stableford-spill side om side med best-ball. Side-tournaments fungerer uendret for begge moduser.

<details>
<summary>Teknisk</summary>

#### Added
- `components/ui/ModeChip.tsx` (+ test) — subtil chip for spillmodus per spill-rad i admin-flater. Bevisst lavmælt sammenlignet med `StatusChip` (border + transparent bg, ikke uppercase) siden modus er permanent metadata, ikke en lifecycle-state som krever oppmerksomhet.
- `MODE_LABELS` i `lib/scoring/modes/types.ts` — single source of truth for norske visnings-labels per modus («Best ball» / «Stableford»). Brukes både av `ModeChip` og av admin/games/[id]-detalj-siden («Spillform»-raden i Format-cardet).
- Norske copy-strenger for fire mode-relaterte error-koder (`mode_required`, `unsupported_mode_size_combo`, `min_players_for_mode`, `mode_locked_after_publish`) i `ERROR_MESSAGES_NEW_GAME`. Manglet før, så admin fikk en tom Banner når payload-validatoren trigget dem.

#### Changed
- `app/admin/games/page.tsx` — ledger-raden viser ny `ModeChip` under meta-linjen så admin har et raskt overblikk over hvilket format hvert spill er konfigurert for. `game_mode` plukkes med i SELECT-listen.
- `app/admin/games/[id]/page.tsx` — header-en har ny `ModeChip` ved siden av `StatusChip`, og «Best ball netto»-strengen fra subtittelen er fjernet (den hardkodet en eneste modus). Format-cardets «Spillform»-rad bruker `MODE_LABELS[game.game_mode]` slik at stableford-spill viser «Stableford» i stedet for «Best ball netto».

#### Notes
- Side-tournament-flyten (`avslutt/page.tsx` + `SideWinnersForm.tsx`) er allerede flat-spiller-basert og fungerer for solo uendret — ingen kode-endring nødvendig. `endGameWithSideWinners` håndterer alle moduser via mode-aware mail-bygging fra fase 6.

</details>

### [1.10.1] - 2026-05-23

> Når en stableford-turnering avsluttes ser spillerne nå et topp 3 podium med 1.-plassen feiret med konfetti. Hele rangeringen ligger ett klikk unna under podiet. Vinnerne får tilpasset «Resultatet er klart»-mail med sin egen plassering og poeng.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/SoloStablefordPodium.tsx` (+ test) — ny reveal-view for `game.status === 'finished'` på stableford-spill. 3-trinns podium med 1.-plass i midten på høyeste trinn (champagne `Medallion` + champagne-tinted Card), 2.-plass venstre (sølv-Medallion + dempet ring), 3.-plass høyre (bronse-Medallion + `border-warning/40`). 1.-plassen får `ConfettiBurst` (gjenbrukt fra `State4View`) som auto-fyrer på første mount per browser-sesjon (sessionStorage-key `torny-stableford-podium-confetti-seen-${gameId}`). Layout skalerer ned ved <3 spillere (1 spiller → kun midten; 2 spillere → midten + venstre).
- `lib/mail/gameFinishedRecipients.ts` (+ test) — ny helper som bygger mottakerlisten for «Resultatet er klart»-mail-blasten. For stableford fetcher den scores + course_holes + course_handicap, kjører `computeLeaderboard` mode-router, og legger per-spiller rank/totalPoints/totalPlayers på hver mottaker. For best-ball returnerer den kun email+name (default nøytral mail-copy).
- `lib/mail/gameFinishedNotification.test.ts` — snapshot-style tester for HTML+text-body i begge moduser, inkl. celebration-tilegg per plassering (1. → «Gratulerer med seieren!», 2/3 → «Solid plassering!», 4+ → nøytral).

#### Changed
- `lib/mail/gameFinishedNotification.ts` — ny `mode`-prop med discriminated union (`{kind:'best_ball_netto'}` eller `{kind:'stableford', rank, totalPoints, totalPlayers}`). Stableford-grenen rendrer en personlig hovedlinje («Du endte på X. plass av N med Y poeng»); udefinert eller best-ball-grenen beholder dagens copy uendret.
- `app/admin/games/[id]/actions.ts` (endGame) + `app/admin/games/[id]/avslutt/actions.ts` (endGameWithSideWinners) — leser nå `game_mode` + `mode_config` + `course_id` fra games-raden og delegerer mottaker-bygging til `buildGameFinishedRecipients`. Mail-loopen passer `mode`-payload videre til mail-helperen.
- `app/games/[id]/leaderboard/page.tsx` — `renderStableford`-grenen velger view per `game.status`: `finished` → `SoloStablefordPodium`, alt annet → `SoloStablefordView` (uendret). Best-ball-grenen er upåvirket.
- `tests/serverActionMocks.ts` — `buildSupabaseMock` får `order` + `limit` som chainable pass-through-er, slik at helpers med sortert SELECT kan testes uten å endre kjøre-tid-koden.

#### Notes
- Side-tournaments for stableford verifiseres i fase 7 (sannsynligvis bare copy-justering). Modus-chip i admin-listen + edge-case-håndtering kommer også i fase 7.
- Confetti respekterer eksisterende `prefers-reduced-motion`-handling via `.confetti-piece { display: none }` i `globals.css` — ingen ekstra reduksjons-logikk trengs.

</details>

### [1.10.0] - 2026-05-23

> Stableford-turneringer er nå spillbare end-to-end. Spillerne taster slag som vanlig, men ser stableford-poeng per hull og en flat leaderboard sortert på totalt poeng.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/SoloStablefordView.tsx` (+ test) — ny leaderboard-view for solo-stableford. Flat liste sortert på `totalPoints` (høyest øverst), top-3 får Medallion (gull/sølv/bronse), 4+ får ren rank-disc. Hver rad: spillernavn (via `formatRevealName`), poeng-total i `score-num`, og «N hull spilt»-undertekst. Reuser `LeaderboardBackdrop` (samme fairway-vinje som best-ball state #4) og samme Card-padding/typografi-tokens.
- `app/games/[id]/leaderboard/page.tsx` — `renderStableford`-grenen short-circuiter LeaderboardBody før state #3/#3.5/reveal-active-routingen. Bygger `ScoringContext` fra game + players + holes + scores, kjører `computeLeaderboard` mode-router, og rendrer SoloStablefordView med en `Map<userId, {name, nickname}>`.

#### Changed
- `app/games/[id]/holes/[holeNumber]/page.tsx` — for stableford fetcher server-en i tillegg alle hull-pars/SI + alle av brukerens scorer slik at vi kan summere stableford-poeng server-side (både `myStablefordTotal` og `myStablefordForCurrentHole`). Best-ball-modus dropper de to ekstra queryene. Flight-filteret kollapses til `[me]` når `flight_number` er null (solo).
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` — ny `gameMode`-prop styrer to ting: (1) en «Dine poeng: N»-subtittel under headeren (live-oppdatert via server-snapshot + Dexie-delta for current hull), (2) bottom-bar-CTA bytter fra «Lever scorekort» til «Lever ditt scorekort» for solo.
- `components/hole/ScoreCard.tsx` — ny valgfri `stablefordPoints`-prop. Når satt, vises «· N poeng» rett etter «Netto X» på samme helper-tekst-linje. Skjules sammen med netto-info når `hideNetto` er true (reveal-active). Alle eksisterende callsites er upåvirket (prop er null som default).
- `app/games/[id]/submit/page.tsx` — TopBar-kicker bytter fra «Lever scorekort» til «Lever ditt scorekort» for solo, og info-Card-en viser «Individuell stableford · CH N» i stedet for «Lag X · Flight Y · CH N» (lag/flight er null for solo).
- `app/games/[id]/page.tsx` — Solo-modus dropper «Lag X · Flight Y»-rad-en og viser i stedet en «Individuell stableford-turnering»-subtittel + CH-only-rad. I scheduled-state-en bytter «DIN FLIGHT»-roster med en ny «DELTAKERE»-roster (`SoloRoster`) som lister alle game-medlemmer.
- `lib/games/getGameWithPlayers.ts` — `GameForHole` utvides med `game_mode` + `mode_config` slik at konsumenter slipper å re-fetche. SELECT-listen oppdatert tilsvarende.

#### Notes
- Reveal-flow for stableford (podium + collapsed rest + completion-mail) er holdt til fase 6 av epic #41. Midt-runde og post-finished bruker samme SoloStablefordView i v1.10.0.
- Side-tournaments (LD/CTP) for stableford verifiseres i fase 7 — sannsynligvis bare copy-justering siden eksisterende UI bruker flat spiller-velger uten lag-kontekst.

</details>

</details>

---

<details>
<summary><strong>1.9.y — Valgbar spillmodus (1 oppføring) — klikk for å vise</strong></summary>

## 1.9.y — Valgbar spillmodus

Tørny er ikke lenger låst til 4 lag à 2 spillere best-ball. Admin-flyten viser nå tydelige modus-tiles for Stableford og Best ball netto, og lagstørrelser som ennå ikke er aktivert vises som «kommer snart» så roadmapen er synlig der den hører hjemme.

### [1.9.0] - 2026-05-23

> Når du oppretter et nytt spill ser du nå et tydelig valg mellom Stableford og Best ball netto. Spillerne plukkes først som en flat liste, og lag-grid-en dukker opp først hvis spillformatet krever lag. Lagstørrelser som ennå ikke er tilgjengelige vises som «kommer snart» så du ser hvor det bærer.

#### Added
- `app/admin/games/new/ModeSelector.tsx` (+ test) — to tiles for spillmodus med inline-SVG-ikoner (stilisert poeng-tavle for Stableford, 2×2-flagg-grid for Best ball netto). ARIA: `<fieldset>` + `role="radiogroup"` + tabbable `role="radio"`-button-er. Aktiv tile får forest border + inset-ring (primary-soft).
- `app/admin/games/new/TeamSizeSelector.tsx` (+ test) — tre tiles (Solo / Par / 4-mann). `ENABLED_COMBOS`-mapping styrer hvilke som er aktive per modus (Stableford → 1, Best ball netto → 2); inaktive vises grayed-out (`opacity-50`) med liten «kommer snart»-tekst over accent-deep. Disabled tiles ignorerer klikk og rapporterer `aria-disabled`.
- `app/admin/games/new/GameForm.test.tsx` (ny) — baseline-component-tests (5 stk) + nye fase-4-tests (5 stk): default mode/size, auto-bytte ved mode-change, hidden inputs i FormData, lock_game_mode-state for edit.

#### Changed
- `app/admin/games/new/GameForm.tsx` — players-first-flow: spiller-toggle setter bare `selectedPlayerIds` (ingen `nextAvailableTeam`-auto-fill lengre). Lag-grid + flights-seksjon rendres kun når `team_size >= 2`. Solo-modus får dedikert «Tee per spiller»-seksjon siden flights-seksjonen ikke gjelder. Counter «X av 8 spillere» bytter til «X spillere valgt» for solo (ingen øvre tak). Hidden inputs sender `game_mode` + `team_size` med i FormData; team/flight-feltene sender tom streng for solo.
- `app/admin/games/[id]/edit/page.tsx` — leser `game_mode` fra DB og pre-fyller form-en. `lock_game_mode` settes for ikke-draft spill så ModeSelector + TeamSizeSelector blir disabled (matcher backend mode-lock-guarden fra 0030).

#### Notes
- Aktive kombinasjoner i v1.9.0: Stableford + Solo (kommer ende-til-ende i v1.10.0) og Best ball netto + Par (dagens, men nå eksplisitt valgt). Par-stableford og 4-mann-stableford forberedes som disabled tiles — ingen DB-migrasjon nødvendig når en kombinasjon aktiveres, bare en mapping-utvidelse i `TeamSizeSelector.ENABLED_COMBOS`.
- Påfølgende fase 5/7 av epic #41 wires spillerflyten (scorecard + leaderboard) for stableford.

</details>

---

<details>
<summary><strong>1.8.y — Mørk modus (12 oppføringer) — klikk for å vise</strong></summary>

## 1.8.y — Mørk modus

Tørny følger nå mobilens mørk-modus-innstilling. Har du iPhonen på Dark Appearance, blir Tørny mørk når du åpner appen — uten at noe annet endrer seg.

### [1.8.12] - 2026-05-23

> Admin-listene over baner og spill har fått en designpass — Sekretariatet-paletten er gjennomført, og oversikten leser nå like premium som resten av appen.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/courses/page.tsx` — empty-state-flaten løftet til samme champagne-medallion-treatment som `admin/games`-listen (bruker `<ChampagneMedallion>` + `<BaneIcon>` + serif-tittel + body-tekst, i stedet for en flat surface-boks med én tekstlinje). BrassRibbon-kicker byttet fra «Baner · protokoll» til «Baner · katalog» — semantisk mer korrekt for en bane-liste (det er ikke en saksprotokoll). Footer-hint endret tilsvarende til «Tap en bane for å redigere katalogen.»
- `app/admin/games/page.tsx` — subtitle-kopi tightened: «X spill · sortert kronologisk» → «X spill · sortert nyeste først» (parallell med `admin/courses` og lettere å lese). Empty-state-kopi endret fra «turneringen» → «runden» / «rundene» (Tørny støtter også hverdagsrunder, ikke bare turneringer — i tråd med headingen «Sett opp ny runde» på `/admin/games/new`).
- `app/admin/games/page.tsx` + `app/admin/courses/page.tsx` — `reveal-up`-animasjons-stagger capped på rad 8 (`Math.min(i, 8)`) så lange listene (opp til 40 rader) ikke drar siste rad ut over ~½ sekund. Matcher `.lb-row`-mønsteret i `globals.css`. Closes [#129](https://github.com/jdlarssen/golf-app/issues/129).

</details>

### [1.8.11] - 2026-05-23

> Leaderboarden etter en ferdigspilt runde har nå en subtil fairway-vinje med flaggstang i bakgrunnen — atmosfære uten å konkurrere med leader-cardet.

<details>
<summary>Teknisk</summary>

#### Added
- `components/illustrations/LeaderboardBackdrop.tsx` — ny inline-SVG-komponent som tegner tre horisont-linjer og en enslig flaggstang med vimpel + ball. Bruker `currentColor` med wrapperens `text-accent` (champagne), opacity 0.07 i lys modus og 0.10 i dark via ny CSS-variabel `--leaderboard-backdrop-opacity`. `preserveAspectRatio="xMidYEnd meet"` forankrer scenen i bunnen av container-en så toppen aldri konkurrerer med leader-cardet. Closes [#27](https://github.com/jdlarssen/golf-app/issues/27).
- `components/illustrations/LeaderboardBackdrop.test.tsx` — smoke-test for ARIA-hidden, posisjon, tint og className-merge.

#### Changed
- `app/games/[id]/leaderboard/State4View.tsx` — `Shell` wrapper-en pakker nå innholdet i en `relative isolate`-container med `LeaderboardBackdrop` som første barn og selve innholdet i en `relative` søsken. Gjelder både chromeless (tab-modus) og standalone-modus.
- `app/globals.css` — ny token `--leaderboard-backdrop-opacity` (0.07 lys / 0.10 dark) styres fra både `prefers-color-scheme: dark`-blokk og `[data-theme='dark']`-blokk.

#### Notes
- SVG ble valgt fremfor raster (`next/image`) fordi vektor skalerer perfekt på alle viewports, `currentColor` gir gratis dark-mode-toning, og inline SVG matcher resten av kodebasen (`components/icons/`). Closes [#36](https://github.com/jdlarssen/golf-app/issues/36) — `next/image`-pipeline er ikke nødvendig for de subtile dekorative bakgrunnene Tørny trenger.
- Backdrop respekterer eksisterende `prefers-reduced-motion`-håndtering uten endring — illustrasjonen er statisk, ingen animasjon å suppressere.

</details>

### [1.8.10] - 2026-05-23

> Profil-utfylling etter første innlogging er pusset opp — passer nå inn i Tørny-stilen sammen med resten av appen, med en varmere velkomst og roligere typografi-rytme.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/complete-profile/page.tsx` — onboarding-overskriften byttet fra generisk `<PageHeader title>` til en flat header med champagne-tonet `Kicker` («Velkommen til Tørny»), Fraunces-serif `h1`, og Inter-body undertittel («Fortell oss litt om deg, så er du klar til å spille.»). Erstatter den gamle «Velkommen! Fyll inn detaljene dine …»-prosaen inni cardet. Submit-knapp-label endret fra «Fullfør profilen» (repeterte tittelen) til «Sett i gang» — action-orientert Tørny-stemme. Form-spacing pustet ut fra `space-y-4` til `space-y-5`. Closes [#128](https://github.com/jdlarssen/golf-app/issues/128).

#### Notes
- Ingen funksjonsendringer: feltene (navn, kallenavn, hcp_index), validering (server-action), redirect-flyten (`/` ved completed, `/login` ved no-session) og error-message-mapping er uendret.
- Bruker etablerte UI-primitives + semantic tokens (`var(--text)`, `var(--muted)`, `var(--accent)`) — dark mode arver gratis fra resten av appen.
- TopBar bevisst utelatt: `/complete-profile` er obligatorisk onboarding-flyt etter første OTP-innlogging, så det er ingen tilbakeknapp å vise.

</details>

### [1.8.9] - 2026-05-23

> Admin-listene over baner og spill bruker nå samme top-bar som resten av appen — konsistent navigasjon på tvers av Tørny.

<details>
<summary>Teknisk</summary>

#### Changed
- `components/ui/TopBar.tsx` — utvidet med `action?: ReactNode`-prop som slotter en node (typisk en `<SmartLink>`-chip) inn på høyre side via `ml-auto`. Kicker forblir absolute-sentrert via `left-1/2 -translate-x-1/2`. Pass `action={null}` for å rendere en usynlig spacer-chip med samme dimensjoner — bevarer effektiv sentrering på filtrerte listevisninger som ellers ville mistet høyre-elementet.
- `app/admin/games/page.tsx` — migrert ad-hoc `flex justify-between`-div til `<TopBar action={...} />`. `filterFinished`-grenen sender `action={null}` (i stedet for v1.8.7s `invisible`-chip), så Resultatprotokoll-oppførselen fra [#113](https://github.com/jdlarssen/golf-app/issues/113) er bevart: «+ Nytt»-knappen skjult, «Sekretariatet»-kicker fortsatt sentrert.
- `app/admin/courses/page.tsx` — migrert ad-hoc top-bar til `<TopBar action={<SmartLink>+ Ny</SmartLink>} />`. Closes [#127](https://github.com/jdlarssen/golf-app/issues/127).

</details>

### [1.8.7] - 2026-05-23

> To rare UX-flater i admin/games er ryddet: «+ Nytt»-knappen er borte i Resultatprotokoll-arkivet, og sideturnering-toggle kan nå aktiveres uavhengig av lag-status under spill-opprett. Du slipper å scrolle opp-ned for å aktivere sideturnering etter å ha satt opp lag.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/games/page.tsx` — «+ Nytt»-chipsen skjules (via `invisible`-Tailwind-class) i Resultatprotokoll-visningen (`?status=finished`). Beholder layout-slot-en med samme padding så «Sekretariatet»-labelen forblir sentrert mellom BackLink og høyre kant. Closes [#113](https://github.com/jdlarssen/golf-app/issues/113).
- `app/admin/games/new/GameForm.tsx` — fjernet `sideTournamentEligible`-gaten (`distinctTeams >= 2`) og dens bruk på sideturnering-checkboxen. Toggle er nå alltid enable-able så lenge `lockSideTournament` ikke er satt (sistnevnte gjelder spill som allerede er publisert). Help-text «Krever minst 2 lag for å aktiveres» fjernet. LD/CTP-config viser så fort sideturnering er checked. Gaten var redundant siden `lib/games/gamePayload.ts:162-172` allerede krever eksakt 4 lag × 2 spillere ved publish — et publisert Tørny-spill har alltid 4 lag, så «≥2 lag»-sjekken kunne aldri feile. Closes [#115](https://github.com/jdlarssen/golf-app/issues/115).

#### Notes
- Forward-compatible med [#41](https://github.com/jdlarssen/golf-app/issues/41) (variable lagstruktur som epic) — endringene introduserer ingen nye antakelser om lagsantall, kun fjerner en redundant UI-gate. Når #41 lander og hardkoding 4×2 byttes ut med per-modus-validering, vil sideturnering-toggle-en allerede oppføre seg riktig uten gate.

</details>

### [1.8.6] - 2026-05-23

> Tilbake-pilen fra leaderboarden tar deg nå tilbake til Min historikk når du kom fra den listen. Bruker en eksplisitt URL-param i stedet for nettleser-history (som ikke var pålitelig i PWA-modus).

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/profile/historikk/page.tsx` — «Se resultatliste»-lenken peker nå på `/games/${id}/leaderboard?from=/profile/historikk` istedenfor bare `/games/${id}/leaderboard`. Eksplisitt signal til leaderboard-pagen om hvor «Tilbake» skal lande.
- `app/games/[id]/leaderboard/page.tsx` — `SearchParams`-typen utvidet med `from?: string | string[]`. Ny `validateFromParam`-helper validerer at verdien er en relativ sti under en kjent Tørny-prefiks (`/profile/`, `/admin/`, `/games/`, eller root `/`) og rejecterer absolutte URL-er, protokoll-relative URL-er (`//evil.com`), og strenger lengre enn 200 tegn — så `?from=` ikke kan brukes som open-redirect-vektor. Validert verdi vinner over `?return=hole`-fallback.
- Issue [#117](https://github.com/jdlarssen/golf-app/issues/117) lukkes med dette. Tilnærmingen erstatter `document.referrer`-heuristikken som v1.8.3 introduserte og v1.8.4 reverterte (heuristikken brøt i iOS PWA standalone — `document.referrer` settes til appens start_url for hele session-en, så `router.back()`-grenen ble alltid valgt og skapte en ping-pong-loop mellom drilldown og hovedleaderboard).

#### Notes
- Drilldown (`/games/[id]/leaderboard/holes`) propagerer ikke `from` videre — den beholder dagens hardkodede SmartLink → `/games/${id}/leaderboard`. Brukerens navigation-kjede er: historikk → leaderboard (med `from`) → drilldown → leaderboard (med `from` bevart i URL) → historikk. Drilldown-→-back-pilen tar deg tilbake til leaderboarden hvor `from` fortsatt er i URL-en.
- Kun `/profile/historikk` har `?from=` i denne PR-en. Andre entry-points (`/`, `/admin/games`, etc.) beholder dagens oppførsel — kan utvides separat hvis ønskelig.

</details>

### [1.8.5] - 2026-05-23

> Replay-knappen for jubelscenene skjules nå hvis du har «Reduser bevegelse» på i iPhone-innstillinger — så du ikke får en knapp som ikke gjør noe. Konfetti-animasjonen var allerede skjult for brukere med den innstillingen; nå er trigger-knappen det også.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/leaderboard/State4View.tsx` — `ReplayButton` får ny class `confetti-replay-button`. `app/globals.css` (`@media (prefers-reduced-motion: reduce)`-blokken) skjuler knappen med `visibility: hidden` (bevarer 44×44 layout-slot for å holde header-chromet balansert). Dead-tap-UX-en oppstod fordi `.confetti-piece { display: none }` skjuler selve animasjonen for brukere med reduce-motion, men replay-knappen kom uendret gjennom — tap ga ingen visuell respons.

</details>

### [1.8.4] - 2026-05-23

> Tilbake-pilen fra en ferdigspilt leaderboard går tilbake til spillets hjemside igjen — fikser en loop som kunne oppstå mellom lag-drilldown og hovedturneringen i PWA-modus. Konsekvens: tilbake fra leaderboard lander ikke i Min historikk lenger (re-åpner det som et eget arbeid).

<details>
<summary>Teknisk</summary>

#### Fixed
- Revertert v1.8.3 (`fix(leaderboard): tilbake-nav respekterer historikk`, commit `00bd142`). Endringen byttet leaderboard-chevronen fra `SmartLink` til `HistoryBackLink`. Rotårsak til loopen: i iOS PWA standalone-modus settes `document.referrer` til appens start_url for hele session-en. Det er same-origin med `window.location.origin`, så `HistoryBackLink` traff alltid `router.back()`-grenen istedenfor `router.push(fallbackHref)`. Etter en drilldown→leaderboard-push tok `router.back()` deg tilbake til drilldown — der den hardkodede SmartLink-pushen igjen tok deg til leaderboard. Resultat: ping-pong mellom de to flatene. Drilldown-chevronen ble ikke endret i v1.8.3, så asymmetrien (push på drilldown, back på leaderboard) var grunnstammen i loopen.
- Issue [#117](https://github.com/jdlarssen/golf-app/issues/117) re-åpnes. Den riktige løsningen er sannsynligvis en eksplisitt `?from=`-query-param fra `/profile/historikk` (og lignende entry-points) istedenfor en referrer-heuristikk som ikke kan stole på SPA-navigasjon.

</details>

### [1.8.2] - 2026-05-23

> Knappene rundt scorekortet og leaderboarden roer seg ned — primary-knapper kun for hovedhandlinger, sekundære actions går outline-stil.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — «Tilbake til spillet →»-knappen som vises etter levert scorekort byttet fra `variant="primary"` til `variant="secondary"`. Read-only-oppsummering uten klar hovedhandling skal ikke pushe en CTA med primary-fyll. Mid-round-grenen (knapp «Tilbake til hull N →») beholder primary-stilen siden den faktisk fortsetter pågående runde — den ER skjermens hovedhandling.
- `app/games/[id]/leaderboard/holes/page.tsx` — «Totalt — X hull vunnet — N»-summary-baren under team-drilldown byttet fra `bg-primary text-bg-tint` (heavy forest-fyll) til `border border-border bg-surface text-text`. Bar-en er en read-only oppsummering, ikke en CTA — en stille surface med subtil topp-border og accent-kicker bærer hierarkiet uten å trenge høy-kontrast fyll. `text-accent` på «hull vunnet» dempet til `text-muted` siden accent ikke trenger å bære vekten på en rolig flate.

#### Notes
- Per design-prinsipp: én klar primary action per skjerm. Game-home (finished) beholder «🏆 Se leaderboard →» som primary — det ER post-runde-hovedhandlingen. Summary-tekst og navigasjonsknapper som ikke har én tydelig hovedrolle får outline/quiet-stilen.

</details>

### [1.8.1] - 2026-05-23

> Du kan nå spille av jubelscenene igjen — replay-ikonet over leaderboarden trigger fyrverkeriet på nytt.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/leaderboard/ConfettiBurst.tsx` — replay-knappen («Spill av») trigget ikke ny burst i prod. Komponenten hadde tidligere et internt `key={trigger}`-mønster der React noen ganger ikke remountet animasjonen rent. Forenklet til en ren mount-engang-komponent; State4View kontrollerer remount via `<ConfettiBurst key={replayKey} />` på utsiden. Garanterer at CSS-animasjonene restarter fra 0%-keyframen hver gang knappen trykkes.

#### Changed
- `app/games/[id]/leaderboard/State4View.tsx` — tekst-pillen «Spill av» erstattet med ikon-knapp (`ReplayIcon`, counterclockwise pil). 44×44px tap-target (iOS HIG), diskret topp-høyre plassering over leaderboarden. `text-muted` resting tint shifts til `text-accent` på hover/focus så gesten føles belønnet. Plasseringen er identisk i begge moduser (chromeless tabs-mode + standalone solo-mode) — knappen sitter til høyre i header eller inline over tittel.
- `components/icons/Icons.tsx` + `index.ts` — ny `ReplayIcon` (24×24 line-icon, currentColor, 1.5 stroke) i Tørny-iconsettet. Counter-clockwise arc fra 9 til 5 med pil-spiss som peker inn i 9 o'clock.

</details>

### [1.8.0] - 2026-05-19

> Tørny støtter nå mørk modus. Har du iPhonen på Dark Appearance (Innstillinger → Skjerm og lysstyrke → Mørk), bytter Tørny automatisk til en mørk klubbhus-natt-palett. Står den på lys eller automatisk, fortsetter appen å se ut som før. Ingen knapp å trykke — appen følger telefonen.

<details>
<summary>Teknisk</summary>

#### Added
- `--surface-strong` token (deep forest i begge moduser, `#1b4332` light / `#1f3b2c` dark) for surfaces som trenger linen/gold-foreground. Dekker Spill-tile i Sekretariatet, kolonnetitler i `/admin/courses` og `/admin/games`, samt avatar-/hull-strip-current/onboarding-banner i hull-flaten — alle 8 sites migrert fra `var(--primary)`-bg (som ble lys sage i dark og gjorde foreground uleslig).

#### Changed
- `app/layout.tsx` — fjernet `data-theme="light"` på `<html>` og endret `colorScheme: "light"` → `"light dark"` i `viewport`-eksport. `globals.css` har siden v1.7.0 både `[data-theme='dark']`-blokk og `@media (prefers-color-scheme: dark)`; med tvangen borte slår sistnevnte inn automatisk basert på OS-preferanse.
- `@custom-variant dark` (lagt til i v1.7.0) gjør at eventuell fremtidig manuell theme-toggle også vil fungere via `data-theme='dark'`-attribute.

#### Notes
- Migrering av hardkodede farger til semantiske tokens ble gjort i v1.7.0 (refactor-PR #111, 22 filer / ~95 LOC). Visual-verifikasjon i dark mode skjedde via preview-deploy av denne PR-en — der oppdaget vi at `var(--primary)`-bg-surfaces ble uleselige i dark (sage primary + lys foreground), derav `--surface-strong`-tokenet.

</details>

</details>

---

<details>
<summary><strong>1.7.y — Spiller-picker for klubbskala (1 oppføring) — klikk for å vise</strong></summary>

Spill-opprett-formen har nå et søkefelt over spiller-listen. Klar for 100+ spillere når kompisgjengen vokser til klubb-størrelse.

### [1.7.0] - 2026-05-19

> Spiller-listen på spill-opprett (og edit) har nå et søkefelt. Skriv inn navn for å filtrere; valgte spillere vises som chips øverst så du ikke mister oversikten i lange lister. Klargjør for klubbskala når kompisgjengen vokser.

<details>
<summary>Teknisk</summary>

#### Added
- Søke-input + chip-row i `GameForm` (`app/admin/games/new/GameForm.tsx`, brukt av både `/admin/games/new` og `/admin/games/[id]/edit`). Substring-match case-insensitive på `name` / `nickname` / `email`. `useMemo` på filtrerte spillere; ingen server-roundtrip og ingen nye deps.
- Valgte spillere vises som klikkbare chips øverst i seksjon 2 (trykk for å fjerne). Filtrerte listen ekskluderer allerede-valgte siden de står som chips — holder listen kort i klubbskala.
- ARIA-label på søkefelt + chip-knapper. Tab-rekkefølge: chips → søk → filtrert liste. Tap-targets ≥44px.

</details>

</details>

---

<details>
<summary><strong>1.6.y — Eksport (1 oppføring) — klikk for å vise</strong></summary>

Du kan nå laste ned resultatet fra ferdigspilte spill som CSV — praktisk for utskrift og deling utenfor appen.

### [1.6.0] - 2026-05-19

> Etter et spill er avsluttet kan du nå laste ned resultatet som CSV-fil — åpnes rett i Numbers, Excel og Google Sheets. Praktisk hvis du vil henge resultatet opp i klubbhuset eller dele med folk uten Tørny-konto.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/export/route.ts` — server-route som returnerer `text/csv; charset=utf-8`. UTF-8 BOM + semikolon-separert (norsk Excel-locale) + CRLF line endings. Innholdet er en spill-metadata-blokk (navn, eksport-dato, course par) etterfulgt av leaderboard-tabellen med kolonner for plass, lag, spillere, brutto, netto, mot par og hull spilt. Auth-gated samme mønster som leaderboard-siden (cookie-basert server-client, admin eller deltaker i spillet). Begrenset til `status='finished'` — andre statuser gir 404.
- «Last ned resultat (CSV)»-knapp på finished-leaderboarden (`State4View.tsx`), under team-listen. Filnavn er ASCII-safe (`torny-{game-id}-{YYYY-MM-DD}.csv`) for å unngå browser-quirks med æøå i `Content-Disposition`.

</details>

</details>

---

<details>
<summary><strong>1.5.y — Klubbstatistikker (3 oppføringer) — klikk for å vise</strong></summary>

Vinnerliste og «mest aktive»-listen fyller seg automatisk fra ferdigspilte spill. Underlag for både kompisgjengen og kommende klubbskala.

### [1.5.2] - 2026-05-19

> Datoer vises nå konsistent på norsk i hele appen. Tee-off-tidspunktet i admin-detalj-visningen brukte en feilstavet locale-kode «no-NO» (en tag som ikke finnes i den internasjonale standarden), og det er nå rettet til «nb-NO». Ingen synlig endring for deg som bruker, men appen står seg bedre på tvers av nettlesere og fremtidige Node-oppgraderinger.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/format/date.ts` — `formatShortDateNb` («14. mai») og `formatShortDateNbWithYear` («14. mai 2026») som single source of truth for nb-NO-kort-dato på tvers av admin-flatene. Hand-rolled måneds-tabell beholdes (matcher tidligere visuelt output uten trailing dot — `Intl`-ens nb-NO `short` ville gitt «mai.»).
- `lib/format/date.test.ts` — 6 unit-tester for nye helpers (dag uten leading zero, måneds-forkortelse, med/uten år, ISO-string vs. Date-input).

#### Fixed
- `app/admin/games/[id]/page.tsx` — locale-tag «no-NO» (ikke en gyldig BCP 47-tag) endret til «nb-NO» for `Intl.DateTimeFormat`-rendering av tee-off-tidspunkt.
- 7 admin-filer (`app/admin/page.tsx`, `app/admin/courses/page.tsx`, `app/admin/games/page.tsx`, `app/admin/games/[id]/page.tsx`, `app/admin/games/[id]/slett/page.tsx`, `app/admin/spillere/[id]/page.tsx`, `app/admin/spillere/_components/PendingInvitations.tsx`) hadde duplisert lokal `MONTHS_NB`-tabell + `shortNb`-helper — alle henter nå fra `lib/format/date.ts`.

#### Notes
- Interne parse-locales (`en-GB` i `lib/format/teeOff.ts`, `en-US` i `lib/games/gamePayload.ts`, `en-CA` i `app/admin/games/[id]/edit/page.tsx`) er bevart med vilje — de brukes for å ekstraktere stabile numeriske deler / datetime-local input-format, og er ikke bruker-synlige.

</details>

---

### [1.5.1] - 2026-05-19

> Innlogging- og invitasjons-formene har nå en usynlig honeypot mot bot-trafikk. Du som ekte bruker merker ingenting; bot-er som spammer skjemaet får et stilltiende «ok» uten at appen faktisk sender mail eller oppretter invitasjoner.

<details>
<summary>Teknisk</summary>

#### Added
- Honeypot-felt (`name="website"`, hidden + tabIndex=-1 + autoComplete=off) på `app/(auth)/login/_components/SendCodeForm.tsx` (OTP-request-fasen) og `app/admin/spillere/_components/InviteForm.tsx`. Server-actions silent-rejecter når feltet er fylt: logger til Vercel via `console.warn('[honeypot] silent reject', ...)` uten å kalle Supabase signInWithOtp eller inserte i `invitations`.
- Unit-tester som verifiserer silent-reject-pathen for begge skjemaene (`app/(auth)/login/actions.test.ts` + `app/admin/spillere/actions.test.ts`).

</details>

---

### [1.5.0] - 2026-05-18

> Ny side: Klubbstatistikker. Se hvem som har vunnet flest spill og hvem som har vært med på flest spill — toppen markert med champagne-gull. Lenken ligger på profil-siden din.

<details>
<summary>Teknisk</summary>

#### Added
- `app/profile/statistikk/page.tsx` — server-component med to seksjoner (Vinnerliste, Mest aktive). Aggregerer fra `games` × `game_players` × `users`-joins; teller kun `status='finished'`. Top-10 pr. seksjon.
- Vinner-beregning gjenbruker `computeLeaderboard` fra `lib/leaderboard.ts` (som internt bruker `bestBallForHole` + `rankTeams` fra `lib/scoring/`). Alle lag med `rank === 1` regnes som vinnere, så delt 1.-plass krediteres begge lag.
- Lenke fra `app/profile/page.tsx` til den nye siden, plassert i samme «Historikk»-cluster som «Min historikk».

#### Notes
- Bulk-fetch i fire round-trips (games, game_players, course_holes, scores) + in-memory aggregering. Skalerer fint for nåværende volum (<1000 finished games); kan flyttes til en SQL-view ved klubbskala.

</details>

</details>

---

<details>
<summary><strong>1.4.y — Multi-rating tee-bokser (3 oppføringer) — klikk for å vise</strong></summary>

## 1.4.y — Multi-rating tee-bokser

Hver fysisk tee legges nå inn én gang med valgfrie ratings pr. gender (Herrer / Damer / Junior). Lettere dataentry, og du kan fylle ut manglende ratings senere uten å re-opprette tees.

### [1.4.2] - 2026-05-18

> Når du går videre til neste hull eller bakover, fader innholdet kort inn istedenfor å bare poppe på plass. Liten polish, men gjør hull-byttet mykere.

<details>
<summary>Teknisk</summary>

#### Changed
- Subtle fade-inn (180ms, ease-out) på hovedinnholdet i `app/games/[id]/holes/[holeNumber]/page.tsx`. CSS-keyframe i `app/globals.css`. Respekterer `prefers-reduced-motion`.

</details>

---

### [1.4.1] - 2026-05-18

> Bane-redigering lagrer nå alle tee-bokser du har lagt inn. Tidligere mistet du tee 6 og 7 hvis du fylte ut mer enn fem rader.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/courses/new/actions.ts` og `app/admin/courses/[id]/edit/actions.ts` looper nå over `MAX_TEE_BOXES` (importert fra `components/CourseForm`), ikke hardkodet `5`. Tees i posisjon 6 og 7 ble silently dropped fordi server-actionene aldri leste dem fra formData.

</details>

---

### [1.4.0] - 2026-05-17

> Tee-bokser kan nå ha rating for flere kjønn på samme rad — så du legger inn «Gul» én gang med slope/CR for Herrer og Damer, ikke to ganger. Spill-formen er forenklet til én tee-dropdown med M/D/J-toggle pr. spiller. Du kan også fylle ut manglende ratings på eksisterende tees i etterkant.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0029_tee_box_multi_rating.sql` — `tee_boxes` får ni nye nullable rating-kolonner (`slope_${gender}`, `course_rating_${gender}`, `par_total_${gender}` for mens/ladies/juniors) + CHECK at minst én komplett gender-sett må være satt. `game_players` får `tee_gender` enum (`mens`/`ladies`/`juniors`), default `mens`.
- `lib/games/teeRating.ts` — pure helper `getRatingForGender(tee, gender)` som returnerer `{slope, courseRating, par}` eller `null`. 4 unit-tester.
- `tee_missing_rating`-feilmelding for tilfeller der spillerens tee_gender mangler rating på den valgte teen ved publish.
- M/D/J-toggle pr. spiller i `GameForm` (alltid synlig, default M).
- Tre rating-undersjons-kort pr. tee i `CourseForm` (Herrer / Damer / Junior, hver med slope/CR/par).
- Visning av alle tilgjengelige ratings på `/admin/games/[id]`.

#### Changed
- `tee_boxes` migrerer eksisterende data: én-rad-pr-(tee × gender) → én-rad-pr-tee med riktig gender-kolonneset utfylt. Ingen merging av variant-rader (admin rydder manuelt om ønsket).
- `game_players` migrerer: `tee_box_id` (per-tee override fra v1.3.0) → `tee_gender` flag basert på den teens gender.
- Course handicap freezes ved publish bruker nå `getRatingForGender(game.tee_box, player.tee_gender)`. Begge start-paths (`startGame` + `startScheduledGame`).
- `GameForm` har én tee-dropdown (ikke to). Tee-options viser hvilke gender-ratings som er tilgjengelige som badge: `Gul (herre · dame)`.
- `getGameWithPlayers` cache henter nå multi-rating-felter på teen og `tee_gender` pr. spiller.
- «Du spiller fra»-banner på scorekortet bruker `me.tee_gender` for å derive riktig rating fra teens multi-rating-felter.

#### Removed
- `tee_boxes.slope`, `tee_boxes.course_rating`, `tee_boxes.par_total`, `tee_boxes.gender` kolonner — erstattet av per-gender kolonneset.
- `tee_box_gender` enum — ikke lenger brukt.
- `game_players.tee_box_id` — erstattet av `tee_gender`.
- `lib/games/teeResolution.ts` + tester — helper overflødig i den nye modellen.
- «For hvem»-segmented control i `CourseForm` — multi-rating-modellen gjør den unødvendig.
- «Tee for damer»-dropdown i `GameForm` — én tee-dropdown nå.

</details>

</details>

---

<details>
<summary><strong>1.3.y — Mixed-gender tee-bokser (1 oppføring) — klikk for å vise</strong></summary>

## 1.3.y — Mixed-gender tee-bokser

Herrer og damer kan nå spille fra ulike tees i samme runde med korrekt course handicap. Tee-bokser tagges med kjønn (herre/dame/junior) i bane-admin, og spill-formen får en valgfri dame-tee + M/D-toggle pr. spiller.

### [1.3.0] - 2026-05-17

> Du kan nå arrangere spill der herrer og damer spiller fra ulike tees i samme runde — alle får riktig course handicap. Tee-bokser tagges med kjønn i bane-admin, og du kan redigere baner selv om det er ferdigspilte spill på dem.

#### Added
- Migrasjon `0028_tee_box_gender.sql` — `tee_box_gender` enum (`mens`/`ladies`/`juniors`) + `tee_boxes.gender` (NOT NULL, default `'mens'`) + `game_players.tee_box_id` (nullable per-player override)
- «For hvem»-segmented control (Herrer / Damer / Junior) pr. tee-rad i bane-formen (`CourseForm.tsx`)
- «Tee for damer»-dropdown i `GameForm` (valgfri; tom = ingen separat dame-tee, alle spillere på herre-tee)
- M/D-toggle pr. spiller i game-formen — synlig kun når dame-tee er valgt; default M
- `lib/games/teeResolution.ts` med pure helper `resolvePlayerTeeId(gender, ladiesTeeId)` + 3 unit-tester
- «Du spiller fra»-banner øverst på `/games/[id]/scorecard` med tee-navn, kjønn-merkelapp og slope/CR
- Begge tees vises på `/admin/games/[id]` når et spill har per-spiller tee-override
- Ny error-kode `bad_ladies_tee` i `lib/admin/gameErrorMessages.ts` for invalid dame-tee i game-form

#### Changed
- Bane-edit (`courses/[id]/edit/actions.ts`) bruker nå diff-basert tee-update i stedet for delete-all + reinsert-all. Editering av slope/CR/navn/gender tillatt uansett om tees er referert av spill — kun sletting blokkeres hvis tee-en er i bruk (sjekker både `games.tee_box_id` og `game_players.tee_box_id`).
- Course handicap freezes ved publish bruker nå spillerens egen tee (`game_players.tee_box_id ?? games.tee_box_id`) i både `startGame` (draft→active) og `startScheduledGame` (scheduled→active).
- Edit-flyten rekonstruerer M/D-state fra `game_players.tee_box_id` — appen husker forrige valg.
- `getGameWithPlayers` joiner nå `tee_boxes` pr. game_player og på selve spillet, så scorekortet kan rendre tee-info uten ekstra round-trip.

#### Notes
- Oppfølger-issue [#92](https://github.com/jdlarssen/golf-app/issues/92) — `users.gender` + `users.level` for auto-default av M/D-toggle.
- Oppfølger-issue [#93](https://github.com/jdlarssen/golf-app/issues/93) — pre-existing bug der tees 6-7 silent droppes i bane-actions (server-loop går bare 0..5).

</details>

---

<details>
<summary><strong>1.2.y — Utvidet sideturnerings-poeng (1 oppføring) — klikk for å vise</strong></summary>

## 1.2.y — Utvidet sideturnerings-poeng

Sideturneringen får 12 nye kategorier og 3 stackbare achievements (Turkey/Solid/Snowman) du kan slå av/på ved spill-opprett. Best netto totalt 18 forblir 10p-grunnpilaren.

### [1.2.0] - 2026-05-16

> Sideturneringen får 12 nye kategorier å spille om — fra «flest birdier» og «konge på par-3» til stackbare achievements som Turkey (3 birdier på rad) og Snowman (lagets felles katastrofe på ett hull). Du velger selv ved spill-opprett hvilke som er aktive.

<details><summary>Teknisk</summary>

#### Added
- Migrasjon `0026_side_tournament_categories` — `games.side_disabled_categories text[]` for per-spill kategori-toggle. CHECK-constraint validerer mot 27 kjente ID-er. Default tomt array (Full pakke).
- `lib/scoring/sideTournamentConfig.ts` — sentralisert poeng-vekter. Tier-vektet slik at best netto 18 (10p) står alene på topp; nye kategorier topper på 4p/2p (Tier 2) eller 2p/1p (Tier 3). Achievements stackbare. Eksporterer `SideCategoryId`, `ALL_CATEGORY_IDS`, `CLASSIC_DISABLED_CATEGORIES`.
- 10 nye vinner-tar-alt-kategorier i `lib/scoring/sideTournament.ts`: `most_birdies`, `most_eagles`, `most_pars`, `best_brutto_18`, `best_brutto_f9`, `best_brutto_b9`, `king_par3`, `king_par5` (alle med team-aggregat + individ-best), `longest_bogey_free_streak` og `lowest_single_hole_brutto` (individ-only).
- 3 stackbare achievements: **Turkey** (3 netto-birdier på rad, +4p per spiller + lag-koord-bonus 4p × N), **Solid** (5 netto-pars+ på rad, +2p / 2p × N), **Snowman** (hele lagets brutto ≥ par+5 på samme hull, −2p).
- `components/admin/SideCategoriesPicker.tsx` — preset-velger («Klassisk», «Full pakke», «Custom») + grupperte per-kategori-toggles. Dual-version-kategorier kobles til én toggle. Default ved spill-opprett er Klassisk for å matche dagens v1.1.x-oppførsel.
- Grupperte sub-headers i `SideTournamentView` (Hovedkonkurranser / Skill og rarity / Moderate / Hull-konkurranser / Achievements / Penalty). Penalty-gruppen for Snowman bruker eksisterende `text-danger`-token (muted brick `#b8463e`).
- Forklaringer på leaderboardet: Turkey/Solid/Snowman-rader har korte regel-undertekster, og et nytt kollapsibelt «ⓘ Slik gis poengene»-panel øverst på sideturnerings-fanen lister alle aktive kategorier med poeng + regel.
- 122 unit-tester + 2 integrasjonstester for team-size N=1 (1v1v1) og N=4 (4v4). 405/405 grønne.

#### Changed
- `SideTournamentInput`-shape utvidet med `coursePars`, `playerScoresPerHole` og `disabledCategories`. Eksisterende tester oppdatert med tomme defaults; ingen logikk-endring i eksisterende kategori-blokker.
- `parseSideTournamentFromFormData` håndterer nå `side_disabled_categories[]` (FormData.getAll-mønster med multi-checkbox-submit) og validerer mot `ALL_CATEGORY_IDS`. Ny error-kode `bad_side_disabled_categories`.
- Leaderboard-loader (`app/games/[id]/leaderboard/page.tsx`) bygger nå ekte `coursePars` fra `course_holes` og `playerScoresPerHole` fra eksisterende `computeLeaderboard`-output i stedet for stub-defaults.
- `SideCategoryAward` utvidet med optional `winnerUserId`, `coordBonus`, `streakStartHole`/`endHole`/`Length` og `score` for å støtte navn-attribusjon og streak-render i UI.

#### Notes
- Regelsettet er team-size-aware (1v1, 2v2, 4v4) klar for [#41](https://github.com/jdlarssen/golf-app/issues/41), men admin-UI lager fortsatt kun 2v2-spill til den epicen lander.
- Manuelle bragder (chip-ins, sand saves, one-putts, wow-shot) er ute av scope — egen leveranse v1.3.x med ny per-hull-UI for registrering.
- Edge-case test-dekning (same-team-tie dedup + mixed-size game team-aggregate) sporet som follow-up i [#90](https://github.com/jdlarssen/golf-app/issues/90).

</details>

</details>

---

<details>
<summary><strong>1.1.y — Sideturnering (11 oppføringer) — klikk for å vise</strong></summary>

## 1.1.y — Sideturnering

Første nye funksjon shipped etter v1.0.0. Lag kan nå konkurrere parallelt med best-ball-netto via en valgfri sideturnering med seks poeng-kategorier.

### [1.1.10] - 2026-05-16

> To admin-flater som tidligere bare hadde en kjedelig «Ingen X ennå»-tekst (invitasjons-køen og spill-lista) får nå en medaljong + ikon + et lite hint om hva som skjer videre, så de føler seg som invitasjoner heller enn glemte tomstader.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/spillere/_components/PendingInvitations.tsx` — empty state bruker nå `ChampagneMedallion size={64}` med `MailEnvelope`-ikon + serif-tittel + hint "Inviter en spiller ovenfor — så dukker vente-køen opp her." Samme palett-mønster som hjem-skjermens "KLUBBHUSET ER ÅPENT"-state.
- `app/admin/games/page.tsx` — empty state har egen variant per filter: `PinFlag` for "Ingen spill ennå" (CTA mot «+ Nytt»), `Laurel` for "Ingen signerte runder ennå" (resultatprotokollen). Medaljong-størrelse 72px så den passer den større page-konteksten.

</details>

### [1.1.9] - 2026-05-16

> Sensitive admin-handlinger (avslutte spill, godkjenne scorekort, gjenåpne spill/scorekort) skrives nå til en intern audit-log med hvem-gjorde-hva og når, så vi har et data-spor å se etter hvis noe ble endret feil.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0027_admin_audit_log` — `public.admin_audit_log` (id, created_at, actor_user_id FK → users ON DELETE SET NULL, actor_name TEXT NOT NULL snapshot, event_type TEXT, target_type/target_id, payload JSONB). Tre composite-indexer for actor-, event- og target-spørringer. Tabellen er lukket for anon + authenticated; skriv går via service-role admin-client.
- `lib/admin/auditLog.ts` — `logAdminEvent({ actorId, actorName, eventType, targetType, targetId, payload })` skriver via `getAdminClient()`. Fail-soft: console.error ved feil, kaster aldri opp så et transient DB-hikk ikke ruller tilbake en vellykket spill-avslutning. `AdminAuditEventType`-union er single source of truth for hvilke events vi auditerer.
- 4 unit-tester for happy-path, default-felter, error-swallow, og throw-swallow.

#### Changed
- `endGame`, `endGameWithSideWinners`, `adminApproveScorecard`, `reopenScorecard`, `reopenGame` kaller `logAdminEvent` etter den primære DB-write-en lykkes. Hver requireAdmin-helper plukker også `users.name` så snapshot-felten kan settes uten ekstra round-trip.

</details>

### [1.1.8] - 2026-05-16

> Admin-invitasjons-flyten har nå rate-limiting (20 per admin, 30 per IP per minutt), så et bug eller kompromittert konto ikke kan sende ut bursts av invitasjoner og brenne mail-budsjettet.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0026_admin_action_rate_limit` — tabell `public.admin_action_rate_limit` (fixed-window-teller per bucket) + RPC `consume_admin_rate_limit(p_bucket, p_max, p_window_seconds)` som atomisk inkrementerer og sjekker. SECURITY DEFINER så funksjonen tør kjøre uavhengig av RLS-state; tabellen selv har ingen client-policies.
- `lib/admin/rateLimit.ts` — `consumeAdminInviteRateLimit({ supabase, adminId, ip })` sjekker begge bucketene parallelt. Fail-open ved DB-feil så en transient outage ikke låser den eneste admin-en ute av sin egen invite-flow. `getClientIp()` plukker første verdi i `x-forwarded-for` (Vercel-edge garanterer at den er ekte). 5 unit-tester for happy-path, hver bucket exhausted, RPC-error → fail-open, og custom limits.
- `vitest.config.ts` aliasrer `server-only` til en tom stub så server-only-guarded moduler kan unit-testes.

#### Changed
- `sendInvitation` og `resendInvitation` i `app/admin/spillere/actions.ts` kaller helperen før hver Resend-mail går ut. Ved overskridelse redirectes admin tilbake til `/admin/spillere` med ny `error=rate_limited`-banner.

</details>

### [1.1.7] - 2026-05-16

> Du kan nå bytte mellom netto og brutto på det avsluttede leaderboardet — toggle-en er tydeligere (begge modus synes samtidig, gjeldende er framhevet), og "Total"-tallet på lederkortet oppdaterer seg når du bytter.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/leaderboard/State4View.tsx` — `LeaderCard` hadde hardkodet "Total netto"-label uavhengig av `mode`. Når brukeren bytta til brutto endret dataen seg (lederen, totals, drilldown-link) men label-en sa fortsatt "Total netto" — derav inntrykket av at toggle-en ikke virket. Now: `Total {mode}` følger gjeldende modus.

#### Changed
- `ModeChip` (samme fil) er løftet fra subtil "Bytt til X"-chip til en tab-stil toggle med begge moduser synlige samtidig — speiler state #3.5 sin `ModeToggle`-pattern så brutto/netto-affordansen leses likt uansett om runden pågår eller er ferdig. Sized down (28px min-height vs. 36px) så den ikke konkurrerer med leder-kortet visuelt.

</details>

### [1.1.6] - 2026-05-16

> Du ser nå netto-tallet ditt per hull på scorekort-oversikten — også mens runden pågår, ikke bare etter at spillet er avsluttet.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — Netto-kolonnen gates nå på `!shouldHideNetto(state)` i stedet for `state === 'reveal-finished'`. Reveal-active er fortsatt den eneste tilstanden som skjuler netto (climax-bevaring); live-always og reveal-finished surfacer den begge nå.

</details>

### [1.1.5] - 2026-05-16

> Når tee-off-tiden passerer og runden starter automatisk, kommer du nå rett inn på hull-skjermen — uten å bli sendt tilbake til startskjermen først.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/page.tsx` — auto-start-fallback (server-component-path som flipper `games.status` fra `scheduled` til `active` når en spiller laster siden etter at tee-off har passert) inviderer nå `getGameWithPlayers`-cachen via `after(() => revalidateTag(\`game-\${id}\`, { expire: 0 }))`. Uten dette ville hull-page-en kunne servere pre-flip-snapshot (status='scheduled') og redirecte spilleren tilbake til game-home i opptil 15 min revalidate-vinduet. `revalidateTag` kan ikke kalles direkte under render — derav `after()` fra `next/server` som deferrer kallet til post-render. `{ expire: 0 }` forsterker til umiddelbar invalidering (vs. stale-while-revalidate som ville kostet én ekstra redirect-bounce). Admin-pathen (`startScheduledGameAction` i server-action-kontekst) var allerede dekket fra #76.

</details>

### [1.1.4] - 2026-05-16

> Du ser nå netto-tallet ditt diskret under navnet på hvert hull, så du slipper å regne i hodet — også som plus-golfer.

<details>
<summary>Teknisk</summary>

#### Changed
- `ScoreCard` helper-tekst viser nå «Netto X» (= score − extraStrokes) når score er satt, i stedet for «Bekreftet». Konsistent for plus-, scratch- og handicap-spillere.
- Helper-slot er tom i reveal-active mode (samme regel som `+N SLAG`-badgen som allerede skjules der).

#### Removed
- Unreachable «Justert · tap igjen for å bekrefte»-grenen i helper-tekst-logikken (rester fra ikke-implementert to-stegs flyt).
- «Bekreftet»-teksten — den dupliserte signalet fra gylden border + sync-pulse-linje.

</details>

### [1.1.3] - 2026-05-16

> Sideturneringen viser nå hvem som er på hvert lag, og du kan klikke på et lag for å se hvilke kategorier som ga poengene deres.

<details><summary>Teknisk</summary>

#### Changed
- `SideTournamentView` refaktorert fra én master-`<details>` (med per-kategori-linjer + hull-grid + LD/CTP-slot-seksjoner) til en liste av per-team-`<details>`-elementer. Hver lag-rad har medal + Lag N + fornavn-rad + total-poeng som summary, og lagets awards listet per kategori som expanded content
- `app/games/[id]/leaderboard/page.tsx` utvider `sideTeams.members` med `firstName` (via `lib/firstName.ts`-helperen) for kompakt visning av spillere-navn

#### Added
- `lib/leaderboard/formatHolesList.ts` — formatterer en hull-liste til kompakt Norwegian-streng (sammenhengende kjeder → range `"10–18"`, spredte → komma `"4, 7, 12"`, blandet kombineres). 8 unit-tester

#### Removed
- `HoleWinGrid`-komponenten (3×6-rutenett over hele runden — kan revurderes i senere iterasjon hvis savnet)
- `CategoryRow`, `SlotsSection`, `collectCategoryWinners` (per-kategori-seksjonen erstattet av per-team-collapse)

</details>

### [1.1.2] - 2026-05-16

> Initialene på scorekortet og hull-leaderboardet bruker nå første bokstav i fornavn og etternavn (f.eks. «Karl Hansen» → «KH»), i stedet for første bokstav i kallenavnet. Spillere med kun fornavn får fortsatt én bokstav.

<details>
<summary>Teknisk</summary>

#### Changed
- `lib/names/initials.ts` (ny) — `nameInitials(name)` returnerer første bokstav i første + siste token, eller én bokstav for one-word-navn. Unicode-safe (Å/Æ/Ø). Faller tilbake til `?` på null/tom input. 9 unit-tester.
- `app/games/[id]/holes/[holeNumber]/page.tsx` — `initial`-prop til `HoleClient` kommer nå fra `nameInitials(name)` i stedet for `firstInitial(nickname ?? name)`. Kallenavn brukes fortsatt som display-navn på kortet.
- `app/games/[id]/leaderboard/holes/page.tsx` — initial-kolonne på hull-leaderboardet bruker `nameInitials(p.name)`. Bredde utvidet fra `w-4` til `w-6` og fontstørrelse justert til 12px så to-bokstavs initialer ikke kuttes.
- `app/games/[id]/page.tsx` — flight-roster og draft-teams-oversikt bruker `nameInitials` for konsistens.
- `components/hole/ScoreCard.tsx` — avatar-fontstørrelse er nå 13px for to-bokstavs initialer, 15px for én. Holder visuell harmoni i den 36×36 sirkelen.

</details>

### [1.1.1] - 2026-05-16

> I reveal-modus ser nå alle deltakere live brutto-leaderboardet på tvers av flights — ikke bare sin egen flight. Netto-rangeringen forblir skjult til admin avslutter spillet, akkurat som før.

<details>
<summary>Teknisk</summary>

#### Fixed
- Migrasjon `0025_reveal_active_scores_visibility` — utvider `scores select gating`-policyen så deltakere i et reveal-modus-spill (`score_visibility='reveal'` + `status='active'`) kan lese alle scores i spillet, ikke bare egen-flight. Avdekket i første pilot-runde 2026-05-14 (SICKlestad) der `RevealBruttoView` viste «18 hull mangler» for andre flightenes lag for ikke-admin-spillere. Live-modus state3.5 (front-9-only) er uendret — climax-hiding der avhenger fortsatt av at back-9-scores er uleselige mid-round.

</details>

### [1.1.0] - 2026-05-14

> Du kan nå legge til en sideturnering i admin-formen. Lag samler poeng fra 6 kategorier — best netto 18, front 9, back 9, hole-wins, longest drive og closest to pin. Resultatet vises i en egen fane på leaderboarden etter at spillet er avsluttet.

<details><summary>Teknisk</summary>

#### Added
- Migrasjon `0024_side_tournament` — `games.side_tournament_enabled`, `games.side_ld_count`, `games.side_ctp_count` (alle med safe defaults) + ny tabell `game_side_winners` med RLS (select kun ved `status=finished`, mutations admin-only).
- `lib/scoring/sideTournament.ts` — `calculateSideTournament`-pure-funksjon med 13 unit-tester. Tie i netto-kategoriene gir alle full pott; hole-win krever alene-vinner. 10p best netto 18, 5p F9 + B9, 2p per hole-win, 2p per LD/CTP-vinner.
- Admin-form-seksjon i `GameForm` med master-toggle + radio-grupper for LD/CTP-antall (0/1/2). Gates på ≥2 lag.
- Ny route `app/admin/games/[id]/avslutt/` med dropdown-wizard for LD/CTP-vinnere. `EndGameButton` redirecter dit conditional på sideturnerings-config.
- Leaderboard-tabs (`LeaderboardTabs`) + `SideTournamentView` med poeng-tabell (medaljer for topp 3) + kollapsibel detalj-seksjon (hole-win-grid 3×6, LD/CTP-vinnere).

#### Changed
- `app/admin/games/[id]/page.tsx` henter nå sideturnerings-config og passerer det til `EndGameButton`.
- `app/games/[id]/leaderboard/page.tsx` henter `game_side_winners` når `status=finished AND side_tournament_enabled`, og bygger `SideTournamentInput` fra eksisterende score-data (gjenbruker `computeLeaderboard` for å unngå dobbel best-ball-beregning).

</details>

</details>

---

<details>
<summary><strong>1.0.x — Første stabile lansering (11 oppføringer) — klikk for å vise</strong></summary>

## 1.0.x — Første stabile lansering

Tørny er nå stabil. Tre funksjoner kobles til v1.0: reveal-modus for kompis-gjenger som vil ha drama under runden, scorekort-former som premium visuell touch, og navne-reveal når spillet er ferdig.

### [1.0.10] - 2026-05-14

> Hjemmesiden hilser deg nå proft uten håndvink-emoji, og kicker-overskriften i toppbar-en (SEKRETARIATET, PROFIL, …) står ekte sentrert i stedet for å lene mot venstre.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/page.tsx` — droppet 👋-emoji fra hilsenen. Tittelen er nå `Hei, {navn}.` — matcher den nøkterne tonen i admin-greetingen (`God morgen, Jørgen.`).
- `components/ui/TopBar.tsx` — kicker er nå `absolute left-1/2 -translate-x-1/2` så den sentreres i viewport uavhengig av BackLink-bredden. Den gamle 80px høyre-spaceren er fjernet — den asymmetrien (32px BackLink vs 80px spacer) gjorde at kickeren lente venstre.

</details>

### [1.0.9] - 2026-05-14

> Hull-for-hull-oversikten viser nå per-spiller vs-par-pille rett ved siden av netto-scoren. TOTALT-kortet har fått mot-par-en flyttet inn ved siden av totalsummen (56 −16) i stedet for som egen linje under.

<details>
<summary>Teknisk</summary>

#### Added
- Per-spiller vs-par-pille (`E`/`+1`/`−1`) i `HoleRow` etter netto-tallet, samme tone-mapping som lag-pillen.

#### Changed
- Totalt-baren i `holes/page.tsx` viser `total + vsPar` inline i samme baseline-flex. «Mot par: X»-linja under er fjernet.
- Legend oppdatert: `initial · brutto · netto · vs par   →   lag`.

</details>

### [1.0.8] - 2026-05-14

> Hull-for-hull-oversikten er ryddet opp: vinner-av-hullet-prikken er borte (skapte mer støy enn verdi), netto-tall står nå tett ved brutto for hver spiller, og helt til høyre står lagets score for hullet med en E/+1/−1-pille — slik at du kan følge progresjonen nedover og se nøyaktig på hvilket hull dere gikk fra E til −1.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — fjernet winner-of-hull-prikk-kolonnen + tilhørende legend-entry. Per-spiller-rad er nå `initial · brutto-shape · netto` (ingen per-spiller vs-par-pill). Helt til høyre er lagets best-ball-netto + vs-par-pill, sentrert vertikalt over begge spiller-radene. Sparet plass + gir en lesbar high-level «narrative»-kolonne.
- Legend forenklet til `B = brukt netto` + `initial · brutto · netto → lag · vs par`.

</details>

### [1.0.7] - 2026-05-14

> Hull-for-hull-oversikten har fått en helt ny layout: hver spiller har sin egen rad med initial (J, H, …) foran scoren — som på et fysisk scorekort. Bokstaven til den som «vant» netto-en for laget er uthevet. Sparer plass, ingen horisontal scroll selv på smaler iPhone.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — `HoleRow` er omskrevet fra horisontal grid med to spillere side om side til vertikalt stack: hull-nummer + par på venstre side (spenner over begge spiller-rader), så én rad per spiller med `initial · brutto-shape · netto · vs-par-pill`. Lag-totalen (`teamNet` + pill) er fjernet fra hver rad siden hver spillers netto allerede er synlig — den lavere er det laget brukte. Kontributør markeres med uthevet initial (`font-bold`) i stedet for bakgrunns-fyll. Legend oppdatert til `B = brukt netto` og `initial · brutto · netto · vs par`.
- `HoleTable` mottar nå `teamPlayers: LbPlayer[]` for å mappe `userId → initial`.

</details>

### [1.0.6] - 2026-05-14

> Scorekortet passer nå på normal iPhone — +slag-kolonnen er flyttet til fotnoten som «Slag fått: N» totalt. Du kjenner din egen handicap-fordeling per hull, og kortet trenger ikke gjenta den på hver linje.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — per-rad `+slag`-kolonne fjernet. Total ekstra-slag («Slag fått: N») surfaces i fotnoten via `showHandicapTotal`-flagget (gjelder i live-modus og reveal-finished; skjules i reveal-aktiv). Padding redusert fra `px-4` til `px-3` for å spare bredde. Footer-layout er nå wrap-vennlig flex i stedet for én lang setning.

</details>

### [1.0.5] - 2026-05-14

> Hull-for-hull-leaderboardet er overhalt: hver spiller-celle viser nå både brutto-tall (med form rundt), antall ekstra-slag og netto-tall i ett tydelig stack. «Brukt netto» har fått fargefylt bakgrunn så det er lett å se hvem som vant hullet. Form-strekene er tynnere så trippel- og kvadruppel-former tar mindre plass.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — hver `pc`-celle er nå et vertikalt stack: ScoreShape med brutto på toppen, og «+slag · netto»-linje under. Kontributør markeres med `bg-accent/12` + `font-bold` (erstatter den lite synlige `font-semibold`-aleinemarkøren). Legend oppdatert til «brutto / +slag · netto».
- `components/scoring/ScoreShape.tsx` — strek-tykkelsen redusert: sm 1.25 → 1.0, md 1.5 → 1.25, lg 2 → 1.5. Gap mellom nestede former redusert: `max(3, stroke+1)` → `max(2, stroke+0.5)`. Trippel- og kvadruppel-former tar nå merkbart mindre plass.

</details>

### [1.0.4] - 2026-05-14

> Leaderboardet oppdaterer seg automatisk når admin trykker «Avslutt spillet» — du slipper å refreshe selv for å se reveal-en.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon 0022 — `public.games` lagt til i `supabase_realtime`-publikasjonen
- `PreRoundLeaderboardRealtime` lytter nå på `games` UPDATEs i tillegg til `scores` INSERTs. Når admin avslutter spillet (status flippes til `finished`), trigges `router.refresh()` automatisk og leaderboardet veksler til `State4View` med formatRevealName + confetti.

</details>

### [1.0.3] - 2026-05-14

> Spill-hjem-siden har nå en «Leaderboard»-knapp så du kan se brutto-stillingen mens du venter på at admin avslutter spillet — ikke bare via hull-skjermen.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/page.tsx` — `Leaderboard`-SmartLink-card under «Mitt scorekort» når spillet er `active`. Lukker discoverability-gapet etter scorekort-levering: før denne fixen var leaderboardet kun nåbart via hull-skjerm-ikonet, og hull-skjermen redirecter etter levering.

</details>

### [1.0.2] - 2026-05-14

> Live brutto-leaderboardet viser nå hvor langt under/over par hvert lag og hver spiller er — du ser `+3` ved siden av brutto-totalen istedenfor bare det rå tallet.

<details>
<summary>Teknisk</summary>

#### Added
- `RevealBruttoView` viser `E` / `+N` / `−N` delta-mot-par på både lag-total og hver spiller-rad. Par-tellet er kumulativt over spilte hull (teamet: hull der minst én spiller har scoret; spilleren: hull der spilleren selv har scoret).

</details>

### [1.0.1] - 2026-05-14

> Par-scorene står nå på samme kolonne som birdies og bogeys på hull-skjermen — de skjøvet seg litt til venstre fordi de manglet form rundt seg.

<details>
<summary>Teknisk</summary>

#### Fixed
- `components/scoring/ScoreShape.tsx` — `shape='none'`-branchen reserverer nå samme `width`/`height` som de andre formene (`px × px`) og bruker `lineHeight: ${px}px` + `textAlign: center` for vertikal/horisontal sentrering. Par-tall okkuperer dermed samme kolonne-bredde som birdie/bogey-tall side om side.

</details>

### [1.0.0] - 2026-05-14

> Første stabile lansering. Tørny går fra alpha til 1.0 med tre nye funksjoner: reveal-modus skjuler netto-tall under runden og avslører på slutten (perfekt for kompis-gjenger der laget med høyere handicap kan slå brutto-lederen — virkelig spennings-moment når du trykker avslutt), scorekort-former gir birdies en sirkel og bogeys en firkant slik som på papir-scorekort, og når et spill er ferdig vises navnene som «Karl "Knølkis" Jensen» med kallenavnet midt i fullt navn.

<details>
<summary>Teknisk</summary>

Sammenslått leveranse av v0.10.23–v0.10.27 + ingen ytterligere endringer i denne commiten. Se de individuelle oppføringene under for hva hver bump brakte.

Hovedgrep:

#### Added
- Migrasjon 0021 — `games.score_visibility` enum (`live` / `reveal`) med CHECK-constraint og lås ved status=active
- `lib/games/visibility.ts` — `revealState(visibility, status)` + `shouldHideNetto(state)` helpers
- `lib/scoring/scoreShape.ts` — mapper score til form-kategori (sirkel/dobbel/trippel for under-par; firkant/dobbel/trippel/quadruple for over-par)
- `lib/names/formatRevealName.ts` — `Karl "Knølkis" Jensen`-format for finished games
- `components/scoring/ScoreShape.tsx` — SVG-pakker rundt score-tall, brukt på 5 skjermer
- `app/games/[id]/leaderboard/RevealBruttoView.tsx` — live brutto-leaderboard for reveal-mode aktiv (lag-totaler basert på brutto best-ball, ingen handicap-info)
- Admin-UI «Synlighet under runden» i `/admin/games/new` og `/admin/games/[id]/edit` med lås ved status=active
- Hull-skjerm-leaderboard-ikon (pokal) i headeren med `?return=hole&n=N` for retur til riktig hull
- SpecificValueSheet X-knapp som fjerner score helt (skriver null via writeScore)

#### Changed
- Hull-skjerm `ScoreCard` — delta-pillen droppet, erstattet av ScoreShape rundt stortallet. Numeriske størrelser skaleres ned ved nestede former. `+N SLAG`-badge skjult i reveal-aktiv.
- Scorekort-oversikt + lever + approve — Slag-tallene pakket i ScoreShape (size sm), `+slag`-kolonne skjult i reveal-aktiv, ny Netto-kolonne i reveal-finished. HULL-kolonne-header omdøpt til # for å spare plass.
- Hull-leaderboard (`/leaderboard/holes`) — per-hull-tallene i ScoreShape. Reveal-aktiv tvinger brutto-modus uten netto-fargekoding. formatRevealName ved status=finished.
- Hovedleaderboard (`/leaderboard`) — utvidet view-state-machine med `reveal-active` og `reveal-finished` branches. Alle finished-states bruker formatRevealName for spiller-navn.
- SpecificValueSheet — fra 8 til 4 knapper (eagle / birdie / par / X).

#### Removed
- Opprinnelig planlagt per-bruker `display_pref`-toggle ble strøket (erstattet av navne-reveal-mekanikken som er enklere og mer dramatisk).

</details>

</details>

---

<details>
<summary><strong>0.10.x — Resultat-mail og closing-the-loop (28 oppføringer) — klikk for å vise</strong></summary>

## 0.10.x — Resultat-mail og closing-the-loop

Mail begge veier rundt godkjennings-flyten: admin får mail når en spiller leverer, spillere får mail når admin avslutter. Ingen polling av appen for å vite om det er noe nytt å gjøre. Pilot-polish underveis: ærligere feilmeldinger i admin når noe går galt med å lese spillerlisten, og første pass på personvern-siden.

### [0.10.27] - 2026-05-14

> Live brutto-leaderboard for reveal-spill: du ser hvordan lagene ligger an på brutto, men vinneren er fortsatt skjult. Nytt: når et spill er ferdig vises navnene som «Karl "Knølkis" Jensen», med kallenavnet midt i fullt navn som en del av reveal-en. Og du kan nå hoppe direkte til leaderboardet fra hull-skjermen via en liten knapp i toppen.

<details>
<summary>Teknisk</summary>

#### Added
- `RevealBruttoView` for `state === 'reveal-active'` på leaderboard-siden — lag-totaler basert på brutto best-ball med ingen handicap-info
- Hull-skjerm-leaderboard-ikon (pokal) i headeren med `?return=hole&n=N` for return-to-hole
- Leaderboard-side respekterer `?return=hole&n=N`-param for back-knapp i alle view-states

#### Changed
- Leaderboard 'full'-view (State4View) bruker `formatRevealName(name, nickname)` for både leder-kortet og rad-listen, både i live-mode-finished og reveal-mode-finished
- Hull-leaderboard (`/leaderboard/holes`) bruker `formatRevealName` for spillerlinjen når spillet er ferdig (mid-round beholder den kompakte first-name + HCP-formen)

</details>

---

### [0.10.26] - 2026-05-14

> Reveal-modus er nå klar: admin kan velge om netto-tallene skjules under runden og avsløres på slutten. Funker overalt — hull-skjerm, scorekort, leaderboard, godkjenning.

<details>
<summary>Teknisk</summary>

#### Added
- `/admin/games/new` og `/admin/games/[id]/edit` — fieldset «Synlighet under runden» med radio-valg `live` / `reveal`
- Server-action validering på `score_visibility` med lås mot `active`/`finished` status

#### Changed
- Hull-skjerm (`ScoreCard`) — `+N SLAG`-badge skjult når `score_visibility = reveal` og spillet er aktivt
- Scorekort-oversikt — `+slag`-kolonne skjult i reveal-aktiv; ny `Netto`-kolonne i reveal-finished med ScoreShape og netto-totalt-fotnote
- Lever-skjerm + approve-skjerm — samme oppførsel som scorekort-oversikt
- Hull-leaderboard (`/leaderboard/holes`) — tvinger brutto-modus i reveal-aktiv, ingen netto-fargekoding

</details>

---

### [0.10.25] - 2026-05-14

> Scorekort-formene følger nå med over alt der tallene står — scorekort-oversikt, lever-skjerm, godkjenning og hull-leaderboard. Samtidig krymper «HULL»-kolonnen til kun «#» for å frigjøre plass på smale skjermer.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — slag-kolonnen pakker tallene i `ScoreShape` (size `sm`), kolonneoverskrift `HULL` → `#`
- `app/games/[id]/submit/page.tsx` — samme behandling som scorekort-oversikten
- `app/games/[id]/approve/page.tsx` — samme behandling i det utvidbare 18-hulls-kortet
- `app/games/[id]/leaderboard/holes/page.tsx` — per-spiller-grossen i hull-griden pakkes i `ScoreShape` (size `sm`)

#### Notes
- `app/games/[id]/leaderboard/page.tsx` (state #3.5/#4) og `app/profile/historikk/page.tsx` rendrer ikke per-hull-tall, så `ScoreShape` ble bevisst hoppet over der

</details>

---

### [0.10.24] - 2026-05-14

> Tre justeringer på hull-skjermen etter første pilot-test: trippel-sirkel for albatross, dobbeltfirkant utvides til kvadruppel-firkant for blow-up-hull, og spesifikk-score-arket forenkles til kun eagle/birdie/par + X for å fjerne en score helt.

<details>
<summary>Teknisk</summary>

#### Changed
- `lib/scoring/scoreShape.ts` — utvidet shape-mapping: `triple-circle` for albatross (≤−3), `triple-square` for triple bogey, `quadruple-square` for quad bogey eller verre
- `components/scoring/ScoreShape.tsx` — rendrer 3 og 4 nestede former; sentrering fikset (lineHeight matcher shape-høyde, ikke flex)
- `components/hole/ScoreCard.tsx` — `numberFontSize` skalerer ned dynamisk basert på form-kompleksitet og siffer-antall så tallene aldri klipper innerste form
- `components/hole/SpecificValueSheet.tsx` — fra 8 til 4 knapper: eagle/birdie/par + X (fjerner score)

#### Added
- `onClear` callback i `SpecificValueSheet` som skriver `null` til scores via `writeScore`

</details>

---

### [0.10.23] - 2026-05-14

> Score-tallene på hull-skjermen får scorekort-former rundt seg — sirkel for birdies, firkant for bogeys, dobbel for eagle og double bogey.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/games/visibility.ts` — `revealState` og `shouldHideNetto` helpers (foundation for kommende reveal-mode)
- `lib/scoring/scoreShape.ts` — mapper score til shape-kategori
- `lib/names/formatRevealName.ts` — full-format navn for grand-reveal moment
- `components/scoring/ScoreShape.tsx` — SVG-pakker rundt score-tall (sirkel/firkant/dobbel)
- Migrasjon 0021 — `games.score_visibility` enum-kolonne med CHECK-constraint

#### Changed
- `components/hole/ScoreCard.tsx` — delta-pillen ved siden av stortallet er fjernet og erstattet av en SVG-form rundt selve tallet (sirkel for birdie, firkant for bogey, dobbel for eagle/double-bogey)

</details>

---

### [0.10.22] - 2026-05-14

> Tilbake-knappen på personvern-siden returnerer deg nå til siden du kom fra, ikke alltid til hjem-siden.

<details>
<summary>Teknisk</summary>

#### Added

- **`components/ui/HistoryBackLink.tsx`** — client component som bruker `router.back()` når `document.referrer` er same-origin, og faller tilbake til en statisk `fallbackHref` (typisk `/`) når referrer mangler (deep link, bokmerke, eller direkte URL-tasting). Visuelt identisk med `BackLink`.
- **`TopBar` får ny `back?: 'link' | 'history'`-prop** (default `'link'`). `back="history"` bytter chevronen fra ren `<Link>` til `HistoryBackLink`. Egnet for sider som kan nås fra hvor som helst i appen.

#### Changed

- **`/legal/privacy`** bruker nå `back="history"` siden den linkes fra AppVersionFooter på praktisk talt hver side — brukeren skal returnere dit de kom fra, ikke alltid til `/`.

</details>

---

### [0.10.21] - 2026-05-14

> Personvern-siden er nå faktisk lesbar uten å logge inn — tidligere ble du sendt til /login fordi auth-gaten ikke gjorde unntak.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`proxy.ts`-matcheren manglet `legal/`-unntak.** Den globale auth-gate-middleware-en redirecter alle ikke-matchende ruter til `/login?next=...` hvis bruker er uautentisert. `/legal/privacy` (og fremtidige legal-sider) skal være offentlige — særlig viktig for invitéer som skal lese personvern *før* de logger inn. La til `legal/` i matcherens negative-lookahead, parallelt med `login`, `register` og `auth/callback`.

</details>

---

### [0.10.20] - 2026-05-14

> «Personvern» er nå klikkbar fra bunnen av hver side ved siden av versjons-stempelet — også på login-siden, så invitéer kan lese den før de logger inn.

<details>
<summary>Teknisk</summary>

#### Changed

- **`AppVersionFooter`** viser nå `v0.10.20 · Personvern` i stedet for bare versjonsnummer. Lenken peker til `/legal/privacy` med samme muted-styling som footer-en. Bruker plain `<a>` (ikke SmartLink) for å unngå viewport-prefetch av personvern-siden på hver side-visning — link-en klikkes sjeldent og fortjener ikke bundle-cost. Footer rendres av AppShell på de fleste sider; game-i-progress-sider (approve/submit/scorecard) bruker `showVersion={false}` og påvirkes ikke.

</details>

---

### [0.10.19] - 2026-05-14

> Personvern-siden er nå nådbar fra profilen — liten muted-tekst med lenke rett under «Mine data»-seksjonen.

<details>
<summary>Teknisk</summary>

#### Added

- **Personvern-lenke i `/profile/page.tsx`** under GdprSection: «Les hvordan vi behandler og lagrer dataene dine i [personvernerklæringen](/legal/privacy).» Discret muted-text-stil, ingen visuell konkurranse med GDPR-kortene. Siden var allerede live på `/legal/privacy` men kunne ikke nås uten å skrive URL-en direkte — nå har den en faktisk inngang.

</details>

---

### [0.10.18] - 2026-05-14

> Hver side har nå en tydelig overskrift i den sticky top-baren — som «Sekretariatet» gjør på admin-sidene. Tidligere var det bare en chevron der med en tom plass i midten.

<details>
<summary>Teknisk</summary>

#### Changed

- **Kicker lagt til på 8 player-facing sider** i TopBar — fyller den tomme midtre slot'en med en konsekvent uppercase-section-label:
  - `/profile` → «Profil»
  - `/profile/historikk` → «Historikk»
  - `/profile/slett-konto` → «Slett konto»
  - `/legal/privacy` → «Personvern»
  - `/games/[id]` (default) → «Turnering»
  - `/games/[id]/approve` → «Godkjenning»
  - `/games/[id]/scorecard` → «Scorekort»
  - `/games/[id]/submit` → «Lever scorekort»

#### Removed

- **Dupliserte page-titler** fjernet under TopBar siden kicker'en nå bærer samme info: `PageHeader title="Min profil"` på `/profile`, `PageHeader title="Min historikk"` på historikk, `PageHeader title="Godkjenn scorekort"` på approve, `PageHeader title="Mitt scorekort"` på scorecard, `PageHeader title="Gjennomgå før levering"` på submit, `PageHeader title="Personvern"` på legal, og det custom-rendrede «Faresone» + «Slett konto»-block'en på slett-konto.
- **`/games/[id]` beholder PageHeader** med spillets navn — det er ekte sideinnhold (turneringsnavnet), ikke duplikat av kicker'en «Turnering».
- **«N fullførte runder»-subtitle** på historikk-siden er bevart som en liten muted-line rett under TopBar (den bærer faktisk informasjon — telling).

</details>

---

### [0.10.17] - 2026-05-14

> Tilbake-knappen klistrer seg nå til toppen av skjermen på alle lange admin- og profil-sider — du slipper å scrolle helt opp for å komme tilbake.

<details>
<summary>Teknisk</summary>

#### Added

- **`components/ui/TopBar.tsx`** — ny gjenbrukbar komponent som rendrer en sticky-top header med `BackLink` chevron til venstre, valgfri uppercase-kicker (f.eks. «Sekretariatet», «Spill · protokoll») i midten, og en 80 px placeholder til høyre for visuell balanse. Bruker `sticky top-0 z-30 -mx-5 px-5 bg-bg/90 backdrop-blur-sm -mt-8 pt-5 pb-2 mb-4` slik at baren strekker seg ut til AppShell-kantene og scroll-innholdet glir gjennomsiktig under.

#### Changed

- **19 sider migrert** fra inline `<div className="-mt-3 ...">`-wrapper rundt BackLink til `<TopBar />`-komponenten: alle profil-sider, alle legal-sider, alle admin-undersider unntatt de to liste-sidene med `+ Ny`-action-knapp, og fire game-undersider (approve, scorecard, submit, default-state av game-detalj). Sticky header gir også backdrop-blur-effekt så scrolling-innhold ses dempet gjennom baren — iOS-aktig følelse.

#### Skipped (med begrunnelse)

- `app/admin/courses/page.tsx` + `app/admin/games/page.tsx` — list-sider med «+ Ny»-action-knapp i topbar-høyre. Migreres senere når TopBar evt. får støtte for action-slot.
- `app/games/[id]/page.tsx` (scheduled-state) + `app/games/[id]/leaderboard/page.tsx` — bruker en `<header>`-custom-layout med `<Kicker>` i senter; matcher ikke TopBar-mønsteret.
- `app/page.tsx` — hjem-siden bruker `<BrandMark />` i stedet for en tilbake-knapp; ikke aktuelt.

</details>

---

### [0.10.16] - 2026-05-14

> Innloggings-flyten føles nå raskere og mindre forvirrende: «Send kode»-knappen viser «Sender kode …» mens den jobber, og koden logger deg inn automatisk så snart den er fylt inn — du trenger ikke trykke «Logg inn» selv.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Mangler visuell tilbakemelding på «Send meg kode»-knappen.** Klikket ga ingen lokal feedback før Supabase + Resend round-trip (1–2 sek) returnerte. På mobil opplevde brukeren det som at appen ikke registrerte trykket. Skjemaet bytter nå til en sentrert «Sender kode til [email]»-state med spinner mens action'en er i flight (drevet av `useFormStatus().pending`).
- **«Koden er utløpt»-feil ved første forsøk (iOS Safari).** Når Mail.app foreslår OTP-koden over tastaturet og brukeren trykker på forslaget, fylles input'en uten visuell bekreftelse. Brukeren trykket ofte forslaget en gang til, eller trykket «Logg inn» mens iOS samtidig auto-submittet — dobbel-submission konsumerte OTP-en to ganger, og andre forsøk fikk «code expired». Skjemaet auto-submitter nå idet koden er full (8 sifre), og en `useRef`-guard pluss `useFormStatus().pending` blokkerer videre submit-forsøk fra samme komponent — selv om iOS-auto-submission fyrer parallelt.

#### Changed

- **Verify-skjemaet auto-submitter når koden er 8 sifre.** Spilleren trenger ikke trykke «Logg inn» — verken etter manuell tasting eller iOS-auto-fill fra Mail-forslag. Hvis Supabase i fremtiden konfigureres for kortere koder må `OTP_LENGTH`-konstanten i `app/(auth)/login/_components/VerifyCodeForm.tsx` oppdateres.
- **Kode-inputen strippes for ikke-sifre on-the-fly** (mail-malen formaterer koden som «1234 5678», og Safari har av og til vært observert å ta med mellomrommet ved auto-fill).
- **Kode-inputen får `autoFocus`** så virtuell tastatur åpner seg automatisk når man kommer til verify-steget.
- **Begge skjemaer ble flyttet til client components** i `app/(auth)/login/_components/` slik at vi kan bruke `useFormStatus` og `useRef` for pending-state og dobbel-submit-guard. Server-action-importer er uendret.

</details>

---

### [0.10.15] - 2026-05-14

> Du kan nå slette et spill helt uavhengig av status — også aktive spill der ikke alle har levert scorekort, og avsluttede spill. Slettesiden viser sterkere advarsel for aktive spill men blokkerer ikke handlingen.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Fjernet active-blokken fra `/admin/games/[id]/slett`.** Tidligere ble admin sittende fast: `endGame` krever at alle har levert scorekort, men hvis en spiller har droppet midt i runden er det aldri tilfellet — og slett-flyten blokkerte aktive spill med beskjeden «avslutt det først». Slettsiden lar nå handlingen gå gjennom på alle statuser. Bruk-case-en var åpenbar (test-spill, avbrutte runder, etc.).
- **Status-bevisst advarsel** erstatter blokken: `draft` (ingen advarsel), `scheduled` («spillerne får ingen melding om at det er kansellert»), `active` (rød `tone="error"` banner: «slettingen fjerner alle slag som er registrert så langt»), `finished` («leaderboard og resultater forsvinner permanent — spillere som har bokmerket lenken vil få 404»).
- **Knappetekst varierer** med status: «Slett pågående spill for alltid» når status er `active`, ellers «Slett spillet for alltid» — gjør destruktiviteten mer eksplisitt på det mest risikable case'et.
- **Server-action `deleteGame`** mistet sin parallel-blokk. Kommentar dokumenterer hvorfor.

</details>

---

### [0.10.14] - 2026-05-14

> Ny «Installer Tørny som app»-knapp på hjem-siden og i profilen. Du trenger ikke lenger lete etter «Legg til på hjem-skjerm» i Safari-menyen — Tørny tilbyr installasjonen selv.

<details>
<summary>Teknisk</summary>

#### Added

- **Plattform-bevisst install-system** under `lib/pwa/` + `components/pwa/`:
  - `lib/pwa/install-state.ts` — modul-singleton som fanger `beforeinstallprompt`-event'en (Chromium-baserte nettlesere + desktop Edge) tidlig i app-livssyklus så banner/knapp kan trigge native install-dialog senere.
  - `lib/pwa/detect.ts` — SSR-trygge plattform-helpers (`isStandalone`, `isIos`, `isIosSafari`, `isIosNonSafari`).
  - `hooks/useInstallPrompt.ts` — React-hook som returnerer `status` (`loading | standalone | native | ios-safari | ios-other | unsupported`) + `install()`-funksjon. Lytter på `appinstalled`-event for å flippe til standalone-state.
  - `components/pwa/InstallPromptCapture.tsx` — montert i root layout, fanger eventen og lagrer den i singletonen.
  - `components/pwa/InstallInstructionsModal.tsx` — modal med tre varianter: iOS Safari (3 nummerte trinn med Safari-del-ikon SVG), iOS non-Safari («bytt til Safari»), og unsupported (generisk fallback).
  - `components/pwa/InstallBanner.tsx` — banner øverst på `/` med champagne-aksent. Lukker via X (localStorage: `torny-install-banner-dismissed=1`). Skjules hvis allerede installert.
  - `components/pwa/InstallButton.tsx` — permanent kort i `/profile` (over «Mine data») så brukere kan re-summe install-flyten hvis de lukket banneret.
- **Plattform-flyt:**
  - **Android Chrome / desktop Chrome+Edge:** «Installer»-klikk trigger native install-dialog via `beforeinstallprompt.prompt()`.
  - **iOS Safari:** «Installer»-klikk åpner modal med trinn-for-trinn-instruksjoner.
  - **iOS Chrome/Firefox/Edge:** modal forklarer at brukeren må bytte til Safari for å installere.
  - **Allerede installert (standalone-mode):** banner + knapp skjules helt.

#### Removed

- **`components/IosInstallHint.tsx`** — gammelt fixed-bottom-banner som bare dekket iOS Safari med én linje instruksjon. Erstattet av det nye system'et som dekker Android + iOS + desktop og har bedre instruksjoner.

</details>

---

### [0.10.13] - 2026-05-14

> Defensiv sikkerhetsstramming: innloggede brukere kan ikke lenger SELECTe vilkårlige invitasjons-rader fra `public.invitations` — kun sine egne.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`invitations select by token using (true)`-policy droppet** (migrasjon `0020`) og erstattet med en smal policy `using (lower(email) = lower(auth.jwt() ->> 'email'))`. Den gamle policyen lot enhver innlogget bruker lese ALLE invitasjons-rader — app-laget filtrerte på token, men det var ikke RLS-enforced. Med magic-link-flyten retired (v0.4.0) har token-URL-er ikke vært relevant lenger.
- **Audit av kall-sites** før endring: alle `/admin/*`-paths går via `is_admin()`-gated «invitations admin write»-policy (FOR ALL); `app/invite/actions.ts` + `lib/invitations/quota.ts` bruker «invitations select own outgoing» (0008, filtrerer på `invited_by`); `app/profile/export/route.ts` bruker den nye «invitations select own incoming» (filtrerer på `email = auth.jwt()->>email`). Alle dekket.
- **Tester:** 180/180 grønne etter endring.

</details>

---

### [0.10.12] - 2026-05-14

> Ny «Min historikk»-side på profilen lar deg se alle dine fullførte runder med dato, brutto sum og snitt per hull.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `/profile/historikk`** — Server Component som viser brukerens fullførte runder (`games.status = 'finished'`) sortert nyeste først. Per runde: spillnavn, tee-off-dato (norsk format), brutto sum, snitt per hull, og lenke til den spesifikke leaderboarden.
- **Lenke fra `/profile`** — ny «Historikk»-seksjon med en `Card` over «Mine data» med «Se runder»-knapp som peker til `/profile/historikk`.

#### Implementation notes

- **2 round-trips totalt:** først `game_players` med `games!inner`-filter på `status='finished'` for å hente alle relevante spill, deretter ett `scores`-kall med `.in('game_id', gameIds)` + `.eq('user_id', me)` for alle scores samtidig. Aggregering skjer in-process.
- **Empty state:** «Du har ingen fullførte runder ennå. Bli med på et spill først.»
- **Date-fallback:** bruker `scheduled_tee_off_at`, faller tilbake til `ended_at` hvis NULL, dropper rad hvis begge er NULL.

</details>

---

### [0.10.11] - 2026-05-14

> Admin kan nå endre e-postadressen til en registrert spiller, og se sist innlogget + antall spill på spiller-detaljen.

<details>
<summary>Teknisk</summary>

#### Added

- **`users.last_seen_at timestamptz`** — ny kolonne (migrasjon `0019`) med index. Stamps fra `proxy.ts`-middleware på hver autentiserte request, debounced via WHERE-clause så Postgres no-op'er hvis verdien er ferskere enn 30 minutter. Best-effort, fire-and-forget via `void (async () => ...)` — feiler aldri requesten.
- **«Aktivitet»-seksjon på `/admin/spillere/[id]`** — viser «Sist innlogget: {relativeTime}» og «Antall spill: N». Null `last_seen_at` rendres som «Aldri».
- **E-post-felt i edit-formen** på samme side. Validering: må være gyldig e-post-format. Sjekker konflikt mot både `public.users` (via `email_is_registered`-RPC) og `auth.users` (via `email_is_in_auth_users`-RPC fra v0.10.6). Block: nekter å oppdatere hvis spilleren er med i et aktivt spill.

#### Changed

- **E-post-oppdatering går via service-role-klient** (`auth.admin.updateUserById`) først; bare hvis det lykkes oppdateres `public.users.email` i samme transaksjon-pakke. Sikrer at de to tabellene ikke kommer ut av synk ved feil.

</details>

---

### [0.10.10] - 2026-05-14

> Du kan nå slette et spill helt fra admin — nyttig hvis du opprettet noe ved et uhell eller vil rydde opp etter en test.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `/admin/games/[id]/slett`** — dedikert bekreftelses-side (per destruktiv-handling-mønsteret) som viser spillets navn, tee-off, status og hvor mye som blir slettet (game_players, scores, invitasjoner). Block-betingelse: hvis `game.status === 'active'` vises et rødt banner — admin må avslutte spillet først.
- **Server-action `deleteGame`** i `app/admin/games/[id]/slett/actions.ts` — re-sjekker admin + block-betingelsen, deretter `DELETE FROM games` (FK ON DELETE CASCADE rydder game_players, scores og invitasjoner automatisk). På suksess: redirect til `/admin/games?status=deleted&name=<spillet>` med bekreftelses-banner.
- **«Faresone»-seksjon** nederst på `/admin/games/[id]` med rødtonet ramme + lenke til slett-flyten, samme mønster som `/admin/spillere/[id]`.

</details>

---

### [0.10.9] - 2026-05-14

> Admin ser nå om en ventende invitasjon faktisk har bedt om innloggings-kode, så du vet om mailen ble lest eller bare ligger der.

<details>
<summary>Teknisk</summary>

#### Added

- **`invitations.opened_at timestamptz`** — ny kolonne (migrasjon `0018`) som stamps når invitéen ber om en OTP-kode på `/login`. Default NULL.
- **Hook i `sendCode`-actionen** i `app/(auth)/login/actions.ts` — etter `signInWithOtp` lykkes, oppdaterer service-role-klient `invitations.opened_at = now()` for rader med matching `email` (case-insensitive) der `accepted_at IS NULL AND opened_at IS NULL`. Service-role brukes fordi brukeren er pre-auth på dette punktet og RLS ville blokkert. Best-effort: feil logges men blokkerer aldri OTP-sendingen.
- **Admin-indikator i `PendingInvitations.tsx`** — under hver «Venter»-rad: «Har bedt om kode {timeAgo}» i forest-grønn hvis `opened_at IS NOT NULL`, eller «Mail sendt, men ikke åpnet ennå» i muted grå hvis NULL. `timeAgo`-helper gir norsk relativ tid («akkurat nå», «3 min siden», «i går», «5 dager siden»).

</details>

---

### [0.10.8] - 2026-05-14

> To nye GDPR-kontroller på profil-siden: du kan laste ned alt Tørny vet om deg som en JSON-fil, og du kan slette kontoen din selv (med mindre du er med i et pågående spill).

<details>
<summary>Teknisk</summary>

#### Added

- **`/profile/export`** — ny Route Handler (`app/profile/export/route.ts`) som returnerer JSON-fil med dataene Tørny har lagret om innlogget bruker. Krever auth (returnerer 401 ellers). Filnavn `torny-data-YYYY-MM-DD.json`. Eksporten inkluderer brukerens egen `users`-rad, alle `game_players`-rader, scores der `user_id` ELLER `entered_by` matcher (kun deres egne scores — ikke medspillere/motstandere, slik GDPR Article 20 tilsier), og invitasjoner der `email` matcher eller `invited_by` matcher. UI-trigger: «Last ned»-knapp i ny «Mine data»-seksjon nederst på `/profile`.
- **`/profile/slett-konto`** — ny dedikert bekreftelses-side (`app/profile/slett-konto/page.tsx`) per destruktiv-handling-mønsteret. Viser hva som slettes (profil, e-post, turnerings-tilknytninger) og hva som beholdes (scoring-data — tilhører turneringen). Block-betingelse: hvis brukeren har `game_players`-rader i et spill med `status IN ('active', 'scheduled')` vises et rødt banner i stedet for slett-knappen — kontoen kan ikke slettes mens man er med i et pågående eller planlagt spill. Server-action (`app/profile/slett-konto/actions.ts`) re-sjekker block-betingelsen før den kaller `auth.admin.deleteUser(userId)` via service-role-klient. `public.users` cascade-slettes via FK. Bruker redirectes til `/login?melding=konto_slettet` etter slettingen.
- **«Mine data»-seksjon** på `/profile/page.tsx` med to kort (eksport + slett) under «Invitér en venn». Slett-kortet bruker `#a04040`-akcent for å signalisere faresone.

#### Fixed

- **Privacy: eksport-endepunktet returnerer ikke lenger medspillere/motstanderes scores.** Første utkast av export-route returnerte ALLE scores for ALLE spill brukeren var med i — det ville lekket andre spilleres personlige data via GDPR-endepunktet. Strammet `.in('game_id', gameIds)` til `.or('user_id.eq...,entered_by.eq...')` så kun brukerens egne scores eksporteres.

</details>

---

### [0.10.7] - 2026-05-14

> Du kan nå legge til opptil 7 tee-bokser per bane i admin (var 5).

<details>
<summary>Teknisk</summary>

#### Changed

- **`MAX_TEE_BOXES` bumpet fra 5 til 7** i `app/admin/courses/CourseForm.tsx`. Norske baner har ofte 5 farger (hvit, gul, blå, rød, gull) pluss eventuelt championship-tees for herrer og damer — totalt 7 dekker den vanlige normen. Ingen DB-constraints blokkerer (verifisert mot `0001_initial_schema.sql` — `tee_boxes` har bare value-range CHECKs på slope og par_total).

</details>

---

### [0.10.6] - 2026-05-14

> Vennsinvitasjoner blokkeres nå korrekt hvis mottakeren allerede har startet en innlogging hos Tørny, ikke bare hvis de har fullført profilen.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Friend-invite-gate i `app/invite/actions.ts`** sjekket bare `public.users` via `email_is_registered`-RPC-en. Brukere som var igjen i `auth.users` etter den retired magic-link-flyten (uten å fullføre `/complete-profile`) slapp gjennom — invitasjons-mailen ble sendt, og det påfølgende `signInWithOtp`-kallet overskrev deres `user_metadata.inviter_name`. Lagt til ny `email_is_in_auth_users(text)`-RPC som sjekker `auth.users` direkte, og gate-en kjører nå begge RPC-ene parallelt i `Promise.all`. Hvis enten returnerer true, blokkeres invitasjonen med samme «Denne personen er allerede på Tørny»-melding.

#### Added

- **Migrasjon `0017_email_in_auth_users_rpc.sql`** — ny SECURITY DEFINER-funksjon `public.email_is_in_auth_users(email_to_check text)` som returnerer bool. Eksplisitt `search_path = public, auth, pg_catalog` for å unngå search-path-injection. GRANT EXECUTE til anon + authenticated for defensiv symmetri med `email_is_invited`. Applied til prod via Supabase MCP.

</details>

---

### [0.10.5] - 2026-05-14

> Kontakt-lenken på personvern-siden går nå til en faktisk e-postadresse (`personvern@tornygolf.no`) i stedet for en admin-bare side spilleren ikke kunne nå.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Kontakt-seksjonen på `app/legal/privacy/page.tsx`** pekte til `https://tornygolf.no/admin/spillere`, som er auth-gated til admin-brukere. En vanlig spiller som klikket for å utøve GDPR-rettighetene sine endte på en innloggingsvegg de ikke kom forbi. Erstattet med `mailto:personvern@tornygolf.no`. Domeneshop-aliaset må settes opp manuelt for at adressen skal motta mail.

</details>

---

### [0.10.4] - 2026-05-14

> Ny personvern-side på `/legal/privacy` forklarer hvilke data Tørny lagrer om deg, hvor de lagres, og hvilke rettigheter du har.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `app/legal/privacy/page.tsx`** — server-rendret Server Component, ingen auth-gate (offentlig tilgjengelig). Bruker eksisterende `AppShell` + `PageHeader` + `BackLink`-primitives. Norske bokmål-tekst, Fraunces serif for h1/h2 og Inter sans for body. Dekker: (1) hvilke data Tørny lagrer (navn, e-post, kallenavn, handicap, scorekort, invitasjoner), (2) hvor de lagres (Supabase EU/Frankfurt), (3) hvem som ser dem (medspillere ser navn/kallenavn/handicap/resultater, admin ser e-post), (4) hvor lenge (inntil sletting), (5) GDPR-rettigheter (innsyn, retting, sletting, portabilitet), (6) kontakt-info.
- **`export const metadata`** setter `<title>`-tag for siden.

</details>

---

### [0.10.3] - 2026-05-14

> Hvis admin-handlinger feiler på å lese spillerlisten fra databasen, sier banneret nå «Klarte ikke å lese» i stedet for misvisende «Klarte ikke å lagre».

<details>
<summary>Teknisk</summary>

#### Fixed

- **Splittet `db_players`-feilkoden i to.** Tidligere brukte alle databasefeil i admin/games-flyten samme `db_players`-key, så bruker så «Klarte ikke å lagre spillerne. Prøv igjen.» selv når det egentlige problemet var en SELECT-feil på roster. Innført ny `db_roster: 'Klarte ikke å lese spillerlisten fra databasen.'`-key som emit-es fra read-paths i tre server-actions: `app/admin/games/new/actions.ts` (publish-mode roster read), `app/admin/games/[id]/edit/actions.ts` (publish/update_scheduled roster read), og `app/admin/games/[id]/actions.ts` (start-game gamePlayers + roster reads). Write-paths (INSERT/UPDATE/DELETE på `game_players`) beholder `db_players`-meldingen.

#### Changed

- **Konsolidert duplisert `ERROR_MESSAGES` og `buildErrorMessage`-helper.** Tre admin/games-sider (`new/page.tsx`, `[id]/edit/page.tsx`, `[id]/page.tsx`) deklarerte hver sin egen kopi av samme error-message-objekt og helper. Trukket ut til `lib/admin/gameErrorMessages.ts` med to eksporterte map-er: `ERROR_MESSAGES_NEW_GAME` (brukt av new + edit, sier «kan publiseres») og `ERROR_MESSAGES_EXISTING_GAME` (brukt av detail-siden, sier «kan startes»). JSDoc dokumenterer denne kopi-variasjonen så fremtidig refaktor ikke uniformerer den ved et uhell.

</details>

---

### [0.10.2] - 2026-05-13

> SyncBanner viser nå norsk, lesbar forklaring («Mistet nett-tilkoblingen», «Innloggingen er utløpt») i stedet for tekniske Safari-feilmeldinger som «TypeError: Load failed».

<details>
<summary>Teknisk</summary>

#### Changed

- **`SyncBanner` — friendly error-mapping.** Raw `lastError` fra Supabase RPC mappes nå til norsk forklaring spilleren kan forstå og handle på:
  - `Load failed` / `Failed to fetch` / `NetworkError` → «Mistet nett-tilkoblingen»
  - `JWT` / `expired` / `session` / `401` / `unauthorized` → «Innloggingen er utløpt — logg inn på nytt»
  - `permission` / `forbidden` / `row-level` / `403` → «Tillatelse manglet»
  - `rate limit` / `429` / `too many` → «For mange forespørsler — vent litt»
  - Catch-all: «Lagring mislyktes»
- **Banneret går fra to-linjet (heading + raw-error subtext) til én-linjet** («Mistet nett-tilkoblingen. N slag venter.»). Renere på smale skjermer, ingen jargon.
- **Raw error bevares som `title`-attribute** på banner-elementet — admin kan long-press/hover for å se den eksakte underliggende meldingen til feilsøking, men spilleren ser ikke jargon-en før de eksplisitt graver i den.

</details>

---

### [0.10.1] - 2026-05-13

> Du får nå en mail hver gang en spiller leverer scorekortet sitt — du slipper å åpne appen for å sjekke om det er noe å godkjenne.

<details>
<summary>Teknisk</summary>

#### Added

- **`lib/mail/scorecardSubmittedNotification.ts`** — Resend-mail-helper med samme brand-stil som de andre mail-malene. Subject: `Scorekort levert: <playerName> — <gameName>`. CTA-button til `https://tornygolf.no/admin/games/<id>`.
- **`submitScorecard`-action** ([app/games/[id]/submit/actions.ts](app/games/[id]/submit/actions.ts)) fyrer mail til alle admin-brukere etter at submit-update lykkes. Henter submitter's navn + admin-emails i parallell (Promise.all) etter DB-update, filtrer ut submitter selv (slik at en player-admin ikke mailer seg selv), og sender via Promise.allSettled. Feil logges, blokkerer aldri.

#### Changed

- **Initial game-fetch i `submitScorecard`** inkluderer nå `name`-feltet (trengs som mail-subject).

</details>

---

### [0.10.0] - 2026-05-13

> Når du avslutter et spill får alle spillerne automatisk en mail med «Resultatet er klart» og lenke til leaderboard — du trenger ikke lenger sende beskjeden manuelt.

<details>
<summary>Teknisk</summary>

#### Added

- **`lib/mail/gameFinishedNotification.ts`** — ny Resend-mail-helper med brand-stilet HTML + plaintext-fallback. Subject: `Resultatet er klart — <gameName>`. Body: «Hei <fornavn>!» + kort hook + grønn CTA-button til `https://tornygolf.no/games/<id>/leaderboard`. Bruker samme palette + struktur som `inviteNotification.ts`.
- **`endGame`-action** ([app/admin/games/[id]/actions.ts](app/admin/games/[id]/actions.ts)) sender nå mail til alle spillere etter status-flippen til `finished`. Henter spillerne sammen med de eksisterende `submitted_at` / `approved_at`-validerings-queriene (én query, ikke to), filtrer på `users.email` ikke-tom, og fyrer `Promise.allSettled` over alle send-kall. Feil logges til Vercel via `console.error` og blokkerer aldri actionen — leaderboard er nådd in-app uavhengig av om mailen kom fram.

#### Changed

- **Initial game-fetch i `endGame`** inkluderer nå `name`-feltet (trengs som subject + body i mailen). Marginal data-overhead, sparer en re-fetch.

</details>

</details>

---

<details>
<summary><strong>0.9.x — Sync-feedback under runden (5 oppføringer) — klikk for å vise</strong></summary>

## 0.9.x — Sync-feedback under runden

Hvis et slag ikke kommer fram til serveren, sier appen ifra. Ny sticky banner viser hvor mange slag som mangler synk, surface'r faktiske feilmeldinger fra Supabase, og lar deg manuelt prøve igjen — i stedet for at sync-køen stille henger i bakgrunnen. Pilot-polish underveis: scorekort wiper ikke lenger settet score hvis du tilfeldigvis trykker på det igjen.

### [0.9.4] - 2026-05-13

> Game-hjem-sidens to gate-queries kjører nå parallelt, og audit av leaderboard/submit/scorecard bekrefter at de allerede gjorde det.

<details>
<summary>Teknisk</summary>

#### Changed

- **`app/games/[id]/page.tsx` — game + me i Promise.all.** Sekvensiell awaits (`game` deretter `me`) er nå én parallel-bølge. Sparer én Supabase round-trip per load. Side-en treffes på app-åpning, fra hjem-tile, fra hver «Hjem»-tap fra hull-pages, og fra leaderboard/submit-tilbakeknappen — ofte. Estimert ~200ms spart per load.
- **Pilot-instrumentering** lagt til samme sted (`game.page game=X · gate`), parallel med hole-page-instrumenteringen.

#### Audit

- **`app/games/[id]/leaderboard/page.tsx`** — allerede parallel (Promise.all på game + profile, deretter Promise.all på players + holes + scores i suspended body). Ingen endring trengs.
- **`app/games/[id]/submit/page.tsx`** — allerede parallel (Promise.all på game + me, deretter Promise.all på holes + scores i suspended body). Ingen endring trengs.
- **`app/games/[id]/scorecard/page.tsx`** — allerede parallel (Promise.all på game + me). Ingen endring trengs.

</details>

---

### [0.9.3] - 2026-05-13

> Hull-bytte er ~60% raskere — server-rundene som tidligere kjørte sekvensielt går nå parallelt, og to av dem er slått sammen til én.

<details>
<summary>Teknisk</summary>

#### Changed

- **Hull-page server-fetch-grafen refaktorert fra 7 sekvensielle awaits til 2 parallel-bølger.** Måling på production via instrumentering fra v0.9.2 viste at hver hull-bytte kostet 1.2–2.1s server-side med median fetch ~150–200ms og outliers opp i 800ms+ (Supabase round-trip-overhead, ikke query-kompleksitet). Nye struktur ([app/games/[id]/holes/[holeNumber]/page.tsx](app/games/[id]/holes/[holeNumber]/page.tsx)):
  - **Runde 1 (Promise.all):** `games`, ALL `game_players` for spillet (med users-join), `scoreCount`. Tre uavhengige queries fyres samtidig — max-tid er den tregeste enkelt-queryen i stedet for summen.
  - **In-memory:** finn `me` blant alle game_players, derive flight ved å filtrere `flight_number === me.flight_number`. Dette fjerner én helt round-trip (tidligere kjørte vi en separat `me`-query, deretter en flight-query med WHERE flight_number=X).
  - **Runde 2 (Promise.all):** `course_holes` for gjeldende hull + `scores` for flight-medlemmer på gjeldende hull. Begge avhenger av runde 1 men er uavhengige av hverandre.
- **Estimert speedup:** fra ~1.5s gjennomsnitt til ~600ms (–60%). Trade-off: allGamePlayers-queryen returnerer 8 rader i stedet for 4 fra den gamle flight-queryen — marginal data-overhead, men én round-trip spart. RLS er upåvirket: brukere ser fortsatt kun det `game_players`-policy-en allerede tillater.
- **Instrumentering oppdatert:** logger nå `round1`, `round2` og total i stedet for syv enkelt-fetches. Verifiserer at parallellisering faktisk skjer i prod.

</details>

---

### [0.9.2] - 2026-05-13

> Skjermlesere identifiserer nå ventende invitéer korrekt i opprett-spill-flyten, og lange e-postadresser dytter ikke lenger «Venter»-pillen ut av synsfeltet.

<details>
<summary>Teknisk</summary>

#### Fixed

- **A11y på `/admin/games/new` spiller-picker.** Checkboxen får nå `aria-label={`${playerLabel(p)}${p.pending ? ' — venter på å fullføre profil' : ''}`}` slik at skjermlesere annonserer status semantisk koblet til raden i stedet for å rapportere «Venter»-pillen som flytende tekst etter check-boxen. Pillen får `aria-hidden="true"` for å unngå dobbel-annonsering.
- **Truncation på `/admin/games/new` spiller-picker label-spannet.** La til `min-w-0 truncate` så patologisk lange e-postadresser (over container-bredde) klippes med ellipsis i stedet for å dytte «Venter»-pillen ut av viewportet på smale skjermer (iPhone SE 320px).

#### Changed

- **Server-side timing instrumentering på hull-siden** ([app/games/[id]/holes/[holeNumber]/page.tsx](app/games/[id]/holes/[holeNumber]/page.tsx)). `console.time/timeEnd` rundt hver av de syv server-side awaitsene (auth, game, me, hole, flight, scores, scoreCount) + en total-wrapper, med label-prefix `hole.page game=X hole=N · <step>`. Loggene fanges av Vercel og kan pulles etter pilot-runden for å bestemme om hull-bytte-latency dominans er på Supabase-runden, RSC-serialisering, eller cold-start. Ingen brukerflate-effekt — kun observasjon. Fjernes (eller gates bak dev-flag) når arkitektur-valget i TODO.md er gjort.

</details>

---

### [0.9.1] - 2026-05-13

> Et score du har justert med + eller − blir ikke lenger nullstilt til par hvis du tilfeldigvis trykker på kortet igjen — og onboarding-banneret beskriver knappene som faktisk finnes.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`ScoreCard.onCardClick` no-op'er når score allerede er satt.** Tidligere kalte tap-på-kort-body alltid `onSetScore(par)` uansett current score, så et tilfeldig touch-event etter at brukeren hadde brukt + / − wipet justeringen tilbake til par. Card-tap er nå en first-entry-snarvei kun: hvis `score == null` setter den par som baseline, ellers er kortet en no-op-flate. +/− og «…» er fortsatt full-spektrum-redigerings-overflater. Ny test (`ScoreCard.test.tsx`) verifiserer at tap når `score` er satt ikke kaller `onSetScore`.
- **Onboarding-banner-copy speiler virkeligheten.** Tidligere tekst: «Klikk det øverste kortet for å sette par. Klikk-og-dra opp eller ned for +1/−1.» — men klikk-og-dra finnes ikke i koden (kun + / − / ⋯-knapper). Ny tekst: «Trykk det øverste kortet for å sette par. Bruk + og − for å justere.»

</details>

---

### [0.9.0] - 2026-05-13

> Hvis et slag ikke kommer fram til serveren, sier appen ifra — og du kan trykke «Prøv igjen» i stedet for å lure på om scoren ble lagret.

<details>
<summary>Teknisk</summary>

#### Added

- **`SyncBanner`-komponent ([components/sync/SyncBanner.tsx](components/sync/SyncBanner.tsx))** mounted i `app/games/[id]/layout.tsx`. Sticky-top på alle game-sider (hull, leaderboard, submit, approve, scorecard, venterom). Observerer `localDb.syncQueue` via `useLiveQuery` og rendrer kun når køen har items som enten har hatt minst ett feilet forsøk (`attemptCount > 0` eller `lastError != null`) ELLER har stått i køen > 30 sekunder. Inneholder «Prøv igjen»-knapp som kaller `drainQueue()` direkte — bruker eksisterende sync-listener-disiplin, krever ingen RLS- eller migrasjonsendringer.
- **Bruker-synlig feilmelding** når Supabase RPC `upsert_score_if_newer` feiler. Banneret ekstraherer `lastError`-feltet fra første queue-item med feil og viser det som sekundær-tekst under tagline-en (eks. «Failed to fetch» ved offline, «JWT expired» ved utløpt session). Hjelper Jørgen feilsøke under pilot uten å åpne devtools.
- **«X slag venter på lagring»**-banner med 30-sekunders threshold. Internal `setInterval(1000)`-tick reaktiv-evaluerer alder på eldste queue-item slik at banneret dukker opp uten å vente på neste sync-drain.

#### Changed

- **Retry-knapp**: minimum 500ms feedback-tid via `Promise.all([drainQueue(), sleep(500)])` så «Sender…»-state ikke flasher forbi når retry blir no-op'et av `inFlight`-guarden i syncWorker. Brukeren får visuell bekreftelse på at klikket ble registrert.

</details>

</details>

---

<details>
<summary><strong>0.8.x — Sletting og «trekk tilbake»-flyt (27 oppføringer) — klikk for å vise</strong></summary>

## 0.8.x — Sletting og «trekk tilbake»-flyt

Dedikert slett-side for spillere, fulgt av tre iterasjoner på «trekk tilbake»-bekreftelsen for å få den robust på iPhone-PWA. Pilot-polish på topp: tydeligere tekst utendørs i sol.

### [0.8.5] - 2026-05-13

> Hull-nummer og sekundær-tekst er nå tydeligere å lese på telefon utendørs — viktig før pilot-runden.

<details>
<summary>Teknisk</summary>

#### Changed

- **Bumpet `--text-muted` (#5C5347 → #4A3F30)** i light mode. Token brukes av tournament-name i hull-headeren, sync-status-linja, score-kort-helpere og ~20 admin-kickers — alle får en touch mer kontrast mot linen-bg (#F8F6F0). Hierarkiet bevares (#4A3F30 er fortsatt klart sekundært mot #1A2E1F text), men perseptuell vekt øker nok til at uppercase-tight-labels og 10–12px sekundær-tekst leses bedre i direkte sollys. Dark mode-tokenet er urørt.
- **`HoleStrip` future-state nummer: font-weight 500 → 600.** Hull som ikke er spilt enda (typisk 17 av 18 ved runde-start) hadde tynne 13px serif-tall som forsvant i sol. Bumpen fra 500 → 600 sharpenser nummer-rendering uten å endre farge eller hierarki — current og completed er fortsatt visuelt distinkte.

</details>

---

### [0.8.4] - 2026-05-13

> Du kan nå trekke tilbake en invitasjon fra iPhone uten at knappene oppfører seg rart.

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-flyten fungerer nå på iPhone-PWA.** Forrige fix (v0.8.3) erstattet `<details>`-popouten med en URL-toggle inline (Bekreft + Avbryt på samme rad), men brukeren rapporterte at Bekreft-knappen ikke var trykkbar på iPhone, og at Avbryt-knappen i stedet utløste tilbaketrekkingen — antagelig på grunn av en kollisjon mellom server-action form-submit og SmartLink-prefetch på samme touch-event. Bytter nå til samme mønster som slett-bruker (`/admin/spillere/[id]/slett`): «Trekk tilbake»-lenken navigerer til en dedikert bekreftelses-side på `/admin/spillere/invitations/[id]/trekk-tilbake/` med stor Bekreft-knapp og separat Avbryt-lenke. Ingen knapper deler tap-target, ingen flyktige toggle-tilstander.

</details>

---

### [0.8.3] - 2026-05-13

> Forsøk på å fikse «trekk tilbake»-bekreftelsen for iPhone — viste seg å ikke fungere helt, og ble erstattet av løsningen i 0.8.4.

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-bekreftelsen fungerte ikke på iPhone-PWA.** Den brukte `<details>`/`<summary>` for inline-popout, men iOS Safari håndterer tap-events inni open-state-popouten upålitelig (tap kan boble til summary og lukke popouten før Bekreft-knappen registrerer klikket). I tillegg ble popouten klippet av kortets `overflow-hidden`, og kunne overlappe nabo-radens knapper slik at et klikk for «Bekreft» traff «Send på nytt» på raden under. Erstattet med en server-rendret URL-toggle: trykk på «Trekk tilbake» legger til `?confirm=<id>` i URL-en, og den raden rendres i confirm-modus inline med tydelige Bekreft + Avbryt-knapper. Ingen JS, ingen popout-quirks, fungerer likt på alle nettlesere og PWA-shells.

</details>

---

### [0.8.2] - 2026-05-13

> Ventende invitéer dukker ikke lenger opp dobbelt i admin-spillerlista, og «trekk tilbake» frigjør e-postadressen som forventet.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Spillerliste på `/admin/spillere` viser ikke lenger ventende invitéer dobbelt.** Etter at migrasjon `0014_pending_users` begynte å auto-opprette `public.users`-rader for hver `auth.users`, dukket ventende invitéer (de uten `profile_completed_at`) opp som «registrerte spillere» i tillegg til å være i ventende-invitasjoner-seksjonen. Spillerlista filtrerer nå på `profile_completed_at IS NOT NULL`, og «X registrert»-tellingen matcher.
- **«Trekk tilbake»-orphan-cleanup tilpasset trigger-baserte `public.users`-rader.** Sjekken var «hvis `public.users`-raden mangler, slett `auth.users`» — men siden trigger nå alltid oppretter raden, ble den sjekken alltid usann. Logikken bruker nå `profile_completed_at IS NULL` som signal på «invitéen fullførte aldri profil», så `auth.users` ryddes som forventet.
- **Null-safe visning av navn** på spiller-detalj og slett-bekreftelses-sider — invitéer uten utfylt navn vises med e-postadressen i stedet for en tom overskrift.

</details>

---

### [0.8.1] - 2026-05-13

> Hvis sletting av en spiller mislykkes, sier appen nå hvorfor — i stedet for å se ut som om ingenting skjedde.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Silent banner-feil ved feilet sletting.** Detalj-siden (`/admin/spillere/[id]`) viste ingen tilbakemelding når slett-flyten feilet eller ble blokkert av self-protect — den manglet meldinger for `self_delete_forbidden`, `still_has_games` og `auth_delete_failed` i sin `ERROR_MESSAGES`-tabell. Nå viser banneret en ærlig forklaring i alle tre tilfeller, inkludert hint om mulige FK-grunner («data knyttet til seg — invitasjoner sendt, baner opprettet eller scores skrevet»).
- **Ærligere kode-kommentar om FK-cascade-grensene** i `deleteUser`-action: dokumenterer at `public.users`-cascaden kun cleaner opp én rad, og at andre FK-er (`scores.entered_by`, `invitations.invited_by` osv.) er trygt dekket i dagens admin-modell men må sjekkes eksplisitt når arrangør-rollen lander.

</details>

---

### [0.8.0] - 2026-05-13

> Du kan slette en spiller fra admin — nyttig hvis du sendte invitasjon til feil e-postadresse.

<details>
<summary>Teknisk</summary>

#### Added

- **Slett-flyt for spillere på `/admin/spillere/[id]/slett`.** Dedikert bekreftelses-side viser navn, e-post og forklaring. Slett-knappen kaller `auth.admin.deleteUser` via service-role-klienten — `auth.users`-raden slettes, `public.users` cascade-slettes automatisk, og e-posten frigjøres for ny invitasjon.
- **Block-betingelser** på server-side: kan ikke slette deg selv (self-protect), kan ikke slette en spiller som har en eller flere `game_players`-rader.

</details>

---

<details>
<summary><strong>0.7.x — Bruker-detalj-redigering (1 oppføring) — klikk for å vise</strong></summary>

Klikk på en spiller i admin for å redigere navn, kallenavn og handicap. Faresone-seksjon på detalj-siden forbereder slett-flyten som lander i 0.8.0.

### [0.7.0] - 2026-05-13

> Klikk på en spiller i admin for å redigere navn, kallenavn og handicap-indeks.

#### Added

- **Bruker-detalj på `/admin/spillere/[id]`.** Klikkbar rad i spillerlista åpner form for å redigere navn, kallenavn og handicap-indeks. Lagre-knapp gir ærlig success/feil-banner.
- **Faresone-seksjon** på detalj-siden viser slett-lenken som disabled inntil neste leveranse aktiverer den. Forklarende tekst hvis spilleren har historikk eller hvis det er deg selv.

#### Changed

- **RLS:** Ny policy `users admin update` lar admin oppdatere andre bruker-rader (tidligere kun egen rad). Migrasjonen heter `0015_admin_user_management` (filnavn-kollisjon med `0014_pending_users` ble rensket opp ved merge).

</details>

---

<details>
<summary><strong>0.6.x — Samlet spilleradministrasjon (1 oppføring) — klikk for å vise</strong></summary>

Erstatter den gamle `/admin/invitations`-flata med `/admin/spillere`, som samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted og legger til «Send på nytt» og «Trekk tilbake»-actions.

### [0.6.0] - 2026-05-13

> Ny «Spillere»-side i admin samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted, og du kan re-sende eller trekke tilbake invitasjoner derfra.

#### Added

- **Ny samlet spilleradministrasjon på `/admin/spillere`.** Erstatter gamle `/admin/invitations`. Tre seksjoner i én flate: registrerte spillere (med søk på navn/kallenavn/e-post), ventende invitasjoner, og en sammenfoldet «Inviter ny spiller»-form nederst.
- **«Send på nytt»-knapp på ventende invitasjoner.** Trigger ny notifikasjons-mail via Resend til samme adresse. Ingen ny DB-rad.
- **«Trekk tilbake»-knapp på ventende invitasjoner** med inline to-trinn-bekreft. Sletter `invitations`-raden; hvis invitéen hadde bedt om kode men aldri fullført profil (`profile_completed_at IS NULL`), ryddes også `auth.users`-raden via service-role slik at e-posten er ledig igjen.

#### Changed

- **Admin-hjemmeside-tile «Invitasjoner» erstattet av «Spillere»** med kombinert telling («12 registrert · 4 venter»).
- **Lenker fra «Opprett spill» og «Rediger spill»** når man trenger flere spillere peker nå til `/admin/spillere` i stedet for `/admin/invitations`.

#### Removed

- **Rute `/admin/invitations`** — funksjonaliteten finnes nå på `/admin/spillere`.

</details>

---

<details>
<summary><strong>0.5.x — Pending-invitees-integrasjon (11 oppføringer) — klikk for å vise</strong></summary>

Ventende invitéer kan nå velges til lag og flight før de selv har logget inn. Ti patch-bumps fulgte for å rydde fallouten fra migrasjon 0014, som auto-oppretter `public.users`-rader for hver `auth.users` og som dermed brøt onboarding-gate, picker-filter, draft-validering og start-spill-guard.

### [0.5.10] - 2026-05-13

> «Akseptert»-statusen på en invitasjon stemmer nå med om spilleren faktisk har fullført profilen sin.

#### Fixed
- `Akseptert`-pille på `/admin/invitations` reflekterer nå faktisk onboarding (`profile_completed_at IS NOT NULL`), ikke bare at invitasjons-raden ble markert akseptert ved OTP-verify. Stoppet misvisende «Akseptert»-status for brukere som klikket gammel magic-link-mail uten å fullføre profil.

### [0.5.9] - 2026-05-13

> Beskytter mot at en bruker blir hengende som «Venter» selv etter at de har lagret profilen sin.

#### Fixed
- Profil-oppdateringen stamper nå `profile_completed_at` som defence-in-depth, så en bruker som havner på `/profile` uten å ha fullført onboarding (deploy-vindu-race i tidligere release) blir ikke sittende fast som «Venter» i picker-en.

### [0.5.8] - 2026-05-13

> Du kan ikke starte et planlagt spill hvis noen av deltakerne fortsatt mangler å fullføre profilen.

#### Fixed
- «Start spillet» (draft → aktiv) blokkeres nå hvis ikke alle valgte spillere har fullført profil — samme guard som scheduled-pathen.
- Invitér-en-venn-actionen sjekker `profile_completed_at` i stedet for "rad finnes ikke" som ble dødt etter migrasjon 0014.

### [0.5.7] - 2026-05-13

> Ventende invitéer uten utfylt navn vises med e-postadressen i stedet for tom plass.

#### Fixed
- Rendring av ventende invitéer (uten utfylt navn) faller tilbake til e-postadressen i stedet for å vise tom tekst — gjelder admins spill-detaljside (lag/flight-oversikt) og spillernes venterom-visning av draft-spill.

### [0.5.6] - 2026-05-13

> Nye brukere sendes igjen til onboarding-skjermen ved første innlogging.

#### Fixed
- Nye brukere ble ikke sendt til onboarding på `/` og `/profile` etter at trigger-en fra migrasjon 0014 begynte å pre-opprette `public.users`-rader. Gate-en sjekker nå `profile_completed_at` i stedet for "rad finnes ikke".

### [0.5.5] - 2026-05-13

> Førstegangs-onboarding fungerer igjen for nye brukere — var midlertidig brutt etter en bakgrunnsendring.

#### Fixed
- `complete-profile` oppdaterer nå den auto-opprettede `public.users`-raden i stedet for å forsøke å sette inn på nytt. Uten denne ville migrasjon 0014 brutt all ny brukerregistrering.

### [0.5.4] - 2026-05-13

> Feilmeldingen for ventende spillere på opprett-spill-siden viser nå e-postadressene i stedet for «{LIST}».

#### Fixed
- Feilmelding for ventende spillere viste `{LIST}`-plassholderen bokstavelig på opprett-spill-siden. Bruker nå samme `buildErrorMessage`-helper som rediger-spill og spill-detalj.

### [0.5.3] - 2026-05-13

> Ekstra sikkerhets-sjekk: et publisert spill kan ikke startes med ventende spillere selv om databasen blir manuelt redigert.

#### Fixed
- Start spill blokkeres også (defence-in-depth) hvis et publisert spill noensinne skulle få ventende spillere via direkte DB-redigering.

### [0.5.2] - 2026-05-13

> Du kan ikke endre et eksisterende spill til publisert hvis det fortsatt har ventende invitéer.

#### Fixed
- Publisering/oppdatering fra rediger-spill blokkeres med tydelig e-postliste hvis ventende invitasjoner står på rosteret.

### [0.5.1] - 2026-05-13

> Du kan ikke publisere et nytt spill hvis noen av deltakerne ikke har fullført profilen sin.

#### Fixed
- Publisering av nytt spill blokkeres nå hvis ikke alle valgte spillere har fullført profil.

### [0.5.0] - 2026-05-13

> Du kan nå velge ventende invitéer til lag og flight før de selv har logget inn.

#### Added
- Inviterte spillere som ikke har logget inn ennå dukker opp i game-picker-en med en gul `Venter`-pille. Admin kan velge dem til lag og flight og lagre utkast.

</details>

---

<details>
<summary><strong>0.4.x — OTP-kode-innlogging (4 oppføringer) — klikk for å vise</strong></summary>

Bytte fra magic-link til 6–8-sifret kode i mail, som fjernet to iOS-PWA-blokkerings-bugs samtidig. Inkluderer ærligere admin-invitasjons-banner ved Resend-feil og forberedelse for pending-invitees-sporing i 0.5.x.

### [0.4.3] - 2026-05-13

> Tørny vet nå hvilke spillere som har fullført profilen — forberedelse for å vise ventende invitéer riktig i spill-pickeren.

#### Added

- Inviterte spillere som ikke har fullført registrering blir nå sporet via `profile_completed_at`. Forberedelse for å vise dem i game-picker-en.

### [0.4.2] - 2026-05-13

> Hvis «Du er invitert»-mailen ikke kommer fram, sier admin-banneret det ærlig i stedet for å lyve «Invitasjon sendt».

#### Fixed

- **Admin-invitasjons-banneret lyver ikke lenger om mail-utsending.** Tidligere viste `/admin/invitations` alltid «✓ Invitasjon sendt»-banner etter at raden var lagret, selv om Resend-utsendingen faktisk feilet — feilen ble bare stille logget i Vercel-runtime-loggene. Hvis Resend kaster nå, vises et ærlig feil-banner: «Invitasjonen ble lagret, men «Du er invitert»-mail kom ikke ut. Sjekk Vercel-loggene for detaljer.» Raden i `invitations`-tabellen bevares fortsatt (admin kan re-sende manuelt når mail-konfigen er fikset).

### [0.4.1] - 2026-05-13

> Innloggings-kode-feltet godtar nå 8-sifrede koder, som er Supabase' faktiske standard.

#### Fixed

- **Kode-input godtar nå 6–8 sifre, ikke bare 6.** Supabase' default OTP-lengde er 8 sifre (endret i mai 2024) — vi hardkodet 6 sifre i kode-feltet, så brukere som fikk en 8-sifret kode kunne kun skrive inn de første 6 og fikk feilmelding. Pattern og maxLength er nå fleksible, hjelpe-tekst sier «kode» i stedet for «6-sifret kode».

### [0.4.0] - 2026-05-13

> Du logger inn med en 6–8-sifret kode du taster inn, i stedet for å klikke en lenke i mailen. Inviterte spillere får først en notifikasjons-mail og må be om innloggings-kode selv etterpå.

#### Changed

- **Innlogging går nå via 6-sifret kode i mail i stedet for å klikke lenke.** Du skriver inn e-post som før, men i stedet for å klikke en lenke i mailen mottar du en kode (f.eks. `482 619`) som du taster inn på samme side. Fjerner to pre-existing problemer som blokkerte PWA-innlogging på iPhone: (a) magic-link åpnet seg i Safari i stedet for PWA-en og brøt PKCE-handoff-en, (b) mail-scannere konsumerte engangs-token-en før brukeren faktisk klikket. Begge problemene forsvinner når det ikke finnes noen URL å konsumere — bare en kode som leses med øynene og tastes inn.
- **Invitasjons-mailen er ny.** Når admin inviterer en kompis sender Tørny nå en kort notifikasjons-mail («Du er invitert. Gå til tornygolf.no og logg inn med din e-post.») via Resend. Selve innloggings-koden får invitéen først når de kommer til /login og taster e-posten sin der. To mailer per invitasjon (notifikasjon + kode), men én og samme innloggings-flyt for alle.

#### Removed

- **Magic-link-URL-flyten.** `/auth/callback`-route-en redirecter alle gamle klikk til `/login?error=link_expired` i en 30-dagers overgangsperiode. Etter 2026-06-13 fjernes route-en helt (tracked in TODO.md).

</details>

---

<details>
<summary><strong>0.3.x — Logo og pre-OTP-fixes (4 oppføringer) — klikk for å vise</strong></summary>

Tørny fikk sin egen visuelle identitet (wordmark med champagne-prikk på login og app-ikoner), pluss tre fixes som ryddet opp før OTP-omleggingen: invitasjoner som sto som «VENTER» etter aksept, tee-off-tider som lå 1–2 timer feil, og «lagre utkast» som låste seg på native HTML5-validering.

### [0.3.3] - 2026-05-13

> Invitasjoner flippes nå korrekt til «Akseptert» når mottakeren logger inn første gang — før dette sto alle som «Venter» uansett.

#### Fixed

- **Invitasjoner sto som «VENTER» selv etter aksept.** Hele tabellen `public.invitations` hadde `accepted_at = NULL` på alle 8 rader — ingen kode skrev til kolonnen noensinne. Auth-callback (`app/auth/callback/route.ts`) markerer nå alle ventende invitasjoner for innlogget brukers e-post som akseptert etter vellykket `exchangeCodeForSession`. Best-effort: feil i side-effekten blokkerer aldri innloggingen. Ny RLS-policy (`migration 0012`) lar bruker UPDATEe sin egen invitasjon — kun `accepted_at`-flippen er tillatt, alle andre kolonner må forbli identiske. Backfill kjørt mot 4 stranded rader som hadde `auth.users.confirmed_at` satt.

### [0.3.2] - 2026-05-13

> Tee-off-tider viser nå riktig tid på alle skjermer — var av med 1–2 timer i et kort vindu rett etter sideinnlasting.

#### Fixed

- **Tee-off-tider rendret 1–2 timer feil under hydration.** `lib/format/teeOff.ts` brukte lokal-TZ `Date.getHours/getMinutes/getDate/getMonth` — på Vercel-serveren (UTC) ga det feil tid i HTML-en før hydration på iPhone (Europe/Oslo) tok over. Rammet hjem-skjermen, runde-siden og leaderboarden. Bytter til `Intl.DateTimeFormat` med eksplisitt `timeZone: 'Europe/Oslo'`, så server og klient nå renderer identiske strenger uavhengig av host-TZ. DST håndteres riktig (UTC → Oslo sommer +02, vinter +01). 11 nye tester verifiserer oppførselen under flere host-TZ-er.

### [0.3.1] - 2026-05-13

> Du kan lagre et halvferdig spill-utkast uten at bane- og handicap-feltene må fylles ut først.

#### Fixed

- **«Lagre utkast» låste seg på native HTML5-validering.** Knappen blokkerte sending så snart et `<select required>`-felt (bane/tee/handicap-allowance) var tomt, selv om hele poenget med utkast er å lagre delvis utfylt skjema. Lagt til `formNoValidate` på utkast-knappen — publiser-knappen validerer fortsatt normalt, og server-siden tar fortsatt vare på `name` som eneste obligatoriske felt for utkast.

### [0.3.0] - 2026-05-13

> Tørny har fått sin egen logo — wordmark med champagne-prikk på login-skjermen og som app-ikon.

#### Changed

- **Visuell identitet — Tørny-logoen.** Login-skjermen viser nå hovedlogoen (wordmark «Tørny» + champagne-prikk + tagline *«Fyr opp golfturneringen på et par minutter»*) over innloggings-kortet, sentrert på linen-bakgrunnen. Den ekstra T-flisen og den dekorative medallion-en er fjernet — de duplikerte logoen og bråket mot brand-mark.svg-spec-en.
- **BrandMark-låsen i øverste venstre hjørne** (hjem, profil, admin) er strippet til kun wordmark «Tørny» med en liten champagne-prikk. Den mørke T-flisen og «TURNERING»-undertittelen er fjernet.
- **Tagline-formuleringen** *«Fyr opp golfturneringen på et par minutter»* (med wordplay-«par») er nå canonical i `CLAUDE.md`. Tidligere kortform uten «et par» er erstattet.

#### Added

- **App-ikoner (192×192, 512×512, 180×180)** og `brand-mark-icon-only.svg` har fått en champagne-prikk til høyre for T-en, slik at hjemskjerm-ikonet på iOS/Android og favicon-en bærer samme brand-aksent som logoen i appen.

#### Removed

- «Logg inn»-overskriften på `/login`. Hero-en + «Send meg lenke»-knappen + hjelpeteksten gir nok kontekst.

</details>

</details>

---

## [0.2.0] - 2026-05-12

> Innfører versjonerings-disiplin: hver bruker-synlig endring skal bumpe versjonen og legge til CHANGELOG-oppføring i samme commit.

<details>
<summary>Teknisk</summary>

#### Added

- Versjonerings-disiplin: hver commit som endrer bruker-synlig oppførsel bumper `package.json` og legger til oppføring i denne fila. Reglene står i `CLAUDE.md`.

#### Notes

- Versjonen som vises i app-footeren (`AppVersionFooter.tsx`) er allerede koblet til `package.json` via `next.config.ts` — fra og med dette bumpet vil footeren reflektere reell release-versjon istedenfor en konstant `v0.1.0`.

</details>

---

## Pre-disiplin (`0.1.0`)

Versjonen `0.1.0` dekker all utvikling fra Phase 0 til og med Phase 12.5. Ingen detaljerte lanseringsnotater ble ført i denne perioden. Et grovt sammendrag:

- **Phase 0–4**: prosjektoppsett, datamodell, Supabase + RLS, scoring-bibliotek (`lib/scoring/`) med 40 unit-tester
- **Phase 5–8**: auth-flyt (magic link), invitasjons-system, admin-flate for baner og spill, hull-skjerm med score-input
- **Phase 9–10**: offline-sync via Dexie, realtime-oppdateringer, peer-godkjenning og admin-overstyring
- **Phase 11–12**: PWA-oppsett, premium-stil med forest-and-champagne palett, leaderboard og scorekort
- **Phase 12.5**: draft-mode på venterom med progressive disclosure, fargeharmonisering for status-bannere

Full historikk: `git log` mellom prosjektstart og commit `02cf8c0`.
