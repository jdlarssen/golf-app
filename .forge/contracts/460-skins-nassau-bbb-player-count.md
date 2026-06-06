# Spec: Skins, Nassau & Bingo Bango Bongo — støtt opptil 16 spillere

> Issue: [#460](https://github.com/jdlarssen/golf-app/issues/460)
> Branch: `claude/jolly-lederberg-837695`

## Problem

I opprett-veiviseren (Kompis-intent) forsvinner **Skins**, **Nassau** og **Bingo Bango Bongo** så snart antall spillere settes over 4. Alle tre er modellert som **individuelle solo-format** (segment-/poeng-/carryover-konkurranse, ikke 1v1-match), så 4-grensen er kunstig — ikke en regel-nødvendighet. Spesielt Skins spilles ofte med 6–16 stykker.

Issue #460 foreslo å heve til **8** (antok at >8 krevde ny slot-infrastruktur). Etter kode-scout 2026-06-07 viser det seg at antagelsen var feil: slot-emisjonen er allerede dynamisk, og kun de tre formatenes valideringsløkker gater >8. Eier valgte derfor **16** (sesjon 2026-06-07) — samme endringssett, bare med `16` i stedet for `8` pluss en triviell løkke-bump.

## Prior Decisions

- **#275 (Skins), #276 (Nassau), #277 (BBB):** alle tre er solo-format, `team_size: 1`, `flight_number: null`. Speiler hverandre tett i validator + view + scoring. (`.forge/contracts/275-skins.md`, `276-nassau.md`, `277-bingo-bango-bongo.md`)
- **#460-relatert (memory `project_exact_count_formats_rationale`):** Skins/Nassau/BBB-caps var de eneste *kunstige* count-grensene. Matchplay-familien/Nines/RoundRobin/AceyDeucey er ekte golf-regler — **rør dem ikke**.
- **Wizard-filter er to-lags (memory `project_wizard_format_filtering`):** synlig = `format_intent_mapping`-katalog ∩ `fitsPlayerCount`. Count-filteret er kun Kompis. Cap-en bor i TS, **ikke** i DB — ingen migrasjon.
- **#457 (memory `project_solo_format_wizard_wiring`):** solo non-stableford-format trenger eksplisitte touch-points i `useGameFormState` + payload ellers brytes «Neste»/publish. Denne endringen rører ikke wiringen, kun grensene.

## Design

Hev count-grensen **fra maks 4 til maks 16** for `skins`, `nassau`, `bingo_bango_bongo` — utelukkende ved å justere de fire lagene som håndhever grensen. Ingen ny komponent, ingen migrasjon, ingen endring i wiring/datamodell.

**Hvorfor 16 er trygt (verifisert):**
- **Slot-emisjon** er dynamisk: `GameWizard.tsx:1028` mapper `orderedPayload` over *alle* valgte spillere (solo-grenen i `useGameFormState` inkluderer hver `selectedPlayerId`). Ingen GameForm-endring.
- **`togglePlayer`** har ingen cap (kommentar `useGameFormState.ts:723`). Count-stepperen tillater allerede 1–16 (`PLAYER_COUNT_MAX=16`).
- **Scoring** (`lib/scoring/modes/{skins,nassau,bingoBangoBongo}.ts`) itererer `ctx.players` — antalls-agnostisk.
- **Podier** (`SkinsPodium`/`NassauPodium`/`BingoBangoBongoPodium`) rendrer topp-3 som trinn + `players.slice(3)` som rest-liste — generaliserer til vilkårlig antall.
- **BBB-entry** (`BingoBangoBongoEntry.tsx`) bruker `flexWrap` chips — tåler vilkårlig antall visuelt.

**Det eneste som faktisk gater >4** er per-format i de tre validatorene i `gamePayload.ts`: hver har BÅDE en lese-løkke `for (i < 8)` OG en cap `if (players.length > 4)`. For 16 endres begge — men kun for disse tre. Andre formaters `i < 8`-løkker står (de capper uansett under 8).

## Edge Cases & Guardrails

- **Rør IKKE eksakt-antall-format.** `acey_deucey` (gamePayload ~1701/1712/1715), `wolf`, `round_robin`, matchplay-familien, `nines` har egne `=== 4`/`=== 2`/`=== 3`-regler og `slice(0,4)`-rotasjoner. Endre bare de tre solo-formatenes løkker/caps. Vær spesielt nøye: Acey Deucey-validatoren ligger *rett etter* Skins i fila og deler `> 4`-mønster — den skal forbli eksakt-4.
- **BBB ved høyt antall er én pott:** ett bingo/bango/bongo per hull for *hele* spillet (ikke per playing-group). Dette gjelder allerede ved ≤8 og er en bevisst forenkling — konsistent, ikke en ny regresjon. Ikke prøv å innføre per-gruppe-BBB her.
- **16-spiller solo kjører med `flight_number: null`** akkurat som 2–4 i dag — ingen RLS-/leaderboard-endring, bare flere rader.
- **`PlayerShortageBanner` (`page.tsx:275`, «Best ball trenger 8») røres ikke** — det er en «du har for få registrerte brukere»-nudge (skjules ved ≥8 *registrerte*), ikke en per-spill-cap. Å heve til 16 ville naget unødig i normaltilfellet.
- **Ingen regresjon for 2–4:** nedre grense `>= 2` er uendret; kun øvre grense flyttes 4 → 16.
- **17+ spillere skal fortsatt avvises** ved publish (`too_many_players_for_mode`) og skjules i wizard-grid.

## Key Decisions

- **Maks 16, ikke 8** — eier valgte 16 da scout viste at >8 er trivielt (issue #460s 8-estimat baserte seg på en feilaktig antagelse om slot-infrastruktur). Rationale: Skins med 8–16 spillere er et ekte bruksmønster; kostnaden er identisk med 8.
- **Alle tre format samtidig** — de deler nøyaktig samme touch-points; å splitte ville duplisert arbeidet.
- **Ingen DB-migrasjon** — cap-en er ren TS; `game_players` har ingen antalls-constraint.

**Claude's Discretion (eier sa «du bestemmer» på testdybde):**
- **Scoring-tester:** ett scenario per format med antall >4 (bruker 6 spillere — tractabelt å håndregne, klart over gammel cap) som beviser at resultatet inkluderer alle spillere og regner korrekt. 16-spiller håndregnede fixtures er upraktisk og gir ikke mer bevis enn 6 for antalls-agnostisk scoring.
- **Validator-tester (`gamePayload.test.ts`):** boundary — 16 spillere publiserer OK, 17 gir `too_many_players_for_mode`, for hvert av de tre formatene.
- **Kommentar-opprydding:** oppdater «2–4 spillere»-kommentarer der det er billig (validator-JSDoc, fitsPlayerCount, setup/podium/entry-kommentarer) til å reflektere 2–16. Ikke en egen commit-seremoni; ta det i samme commit som det respektive laget.

## Success Criteria

- [ ] I opprett-veiviser (Kompis) vises Skins/Nassau/BBB for 5–16 spillere, og skjules for 17+. *(Verifiser: `fitsPlayerCount('skins', n)` → true for 2..16, false for 17; unit-test eller node-eval.)*
- [ ] Et spill med 16 spillere kan publiseres i hvert av de tre formatene uten valideringsfeil; 17 avvises med `too_many_players_for_mode`. *(Verifiser: `gamePayload.test.ts`-cases.)*
- [ ] Scoring inkluderer og rangerer korrekt alle spillere ved antall >4 i hvert format. *(Verifiser: nye scenarier i `skins.test.ts`/`nassau.test.ts`/`bingoBangoBongo.test.ts`.)*
- [ ] Ingen regresjon for 2–4 spillere (eksisterende tester grønne). *(Verifiser: full vitest på berørte filer.)*
- [ ] Ingen eksakt-4-format (wolf/acey_deucey/round_robin/matchplay/nines) er påvirket. *(Verifiser: grep at deres caps/løkker er uendret; tester grønne.)*
- [ ] `npx tsc --noEmit` + `npm run build` grønt; `package.json` minor-bumpet + CHANGELOG-oppføring. *(Verifiser: kommando-output.)*

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npm run build` passerer (per memory `feedback_tsc_gate_preexisting_trap`: ikke filtrer tsc-feil som «pre-existing»; nye/endrede exhaustive switch-er må bygge)
- [ ] `npx vitest run lib/scoring/modes/skins.test.ts lib/scoring/modes/nassau.test.ts lib/scoring/modes/bingoBangoBongo.test.ts lib/games/gamePayload.test.ts lib/wizard/fitsPlayerCount.test.ts` grønt
- [ ] Co-located tester for hver berørt fil kjørt (per memory `feedback_run_colocated_tests_for_changed_files`)
- [ ] Humanizer-sjekk på nye/endrede norske strenger («krever 2-16») før commit

## Files Likely Touched

- `lib/wizard/fitsPlayerCount.ts` — case `nassau`/`skins`/`bingo_bango_bongo` (~L66–69): `n <= 4` → `n <= 16` + seksjonskommentar
- `lib/wizard/fitsPlayerCount.test.ts` — utvid boundary-cases (16 true, 17 false) hvis fila har per-format cases
- `app/admin/games/new/useGameFormState.ts` — tre `*PlayersValid`-flagg (`<= 4` → `<= 16`, L1154/1159/1166); tre brukerstrenger «krever 2-4» → «krever 2-16» (L1426/1438/1450); kommentarer (L623–629, L1151–1166)
- `lib/games/gamePayload.ts` — `validateNassau`/`validateSkins`/`validateBingoBangoBongo`: lese-løkke `i < 8` → `i < 16` (L1572/1633/1755) **og** cap `> 4` → `> 16` (L1586/1647/1769); JSDoc «2-4 spillere»/«5+ spillere» (L1549/1557/1615/1744) → 2-16/17+
- `lib/games/gamePayload.test.ts` — 16-ok / 17-reject per format
- `lib/scoring/modes/skins.test.ts` + `nassau.test.ts` + `bingoBangoBongo.test.ts` — ett >4-spiller-scenario hver (TDD: test først)
- Kommentar-justering (billig, samme commit): `app/admin/games/new/sections/SkinsSetup.tsx:18`, `app/admin/games/new/TeamSizeSelector.tsx:82–93`, `lib/scoring/modes/types.ts:414/1482`, `app/games/[id]/holes/[holeNumber]/BingoBangoBongoEntry.tsx:15`, `app/games/[id]/leaderboard/SkinsPodium.tsx:44` (+ Nassau/BBB-podium-kommentarer hvis de sier 2–4)
- `package.json` + `CHANGELOG.md` — minor-bump (ny brukersynlig kapasitet)

## Out of Scope

- **Mer enn 16 spillere** (krever da reelt ny slot-vurdering; ikke nå)
- **Per-gruppe-BBB** (eget, større format-arbeid — BBB forblir én pott)
- **Klubb-intent** (disse tre er ikke i klubb-katalogen — ingen endring der)
- **`PlayerShortageBanner`-copy** og **Kompis-intent-taglinen** («2–4 venner», `intent.ts:34`, allerede upresis pga best ball=8) — separate copy-spørsmål
- **`format_intent_mapping` / DB-migrasjon** — cap er TS-only
- **#465 (Wolf 3–5)** og andre format-cluster-issues — separate
