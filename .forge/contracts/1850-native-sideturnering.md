# Spec: Native — sideturnering (LD/CTP + poengjakt) på resultatskjermen i appen

## Problem

Sideturnering er på i 10 av 30 prod-spill og står som **Must** i MoSCoW-lista i epic
#1816 — men appens resultatskjerm (N4, #1828) vet ikke at den finnes. Spillere som
avslutter en runde med sideturnering ser i dag hovedresultatet i appen og må til
nettsiden for poengjakten og LD/CTP-vinnerne. Denne slicen leverer visningen i appen.
Del-issue: #1850.

## Research Findings (verifisert 2026-08-31 mot main i denne økta)

- **Sideturneringen er et post-game-element på web — ALLE formater.** Verifisert i
  `formats/stableford.tsx:118-121` («post-game-reveal-element», gate
  `status === 'finished' && side_tournament_enabled`), `formats/skins.tsx:102-103`,
  `formats/wolf.tsx` (side-tabs kun i finished-grenen),
  `renderMatchplaySideSection` (`sideTournament.tsx:~260`: `return undefined` når ikke
  finished) og best_ball-fallthrough i `leaderboardContent.tsx:516-529` (view `'full'`
  nås kun ved finished; aktive spill returnerer state3/state3.5 tidligere). Aktiv
  runde viser ALDRI sideturnering — appen speiler det.
- **Matchplay HAR sideturnering på web.** #585 la til `MatchplaySideTournamentSection`
  (kompakt seksjon under duellkortet, ikke fane) — den gamle «matchplay ekskludert by
  design»-noteringen fra #576 er utdatert. Singles/greensome er 2 av de 8
  Must-formatene, så matchplay-varianten er i scope.
- **Delt motor er import-ren og komplett:** `lib/scoring/sideTournament.ts`
  (`calculateSideTournament`, `SideTournamentInput/Result`, `SideCategoryAward` med
  strukturerte detalj-felt: `holeNumber`, `streakStartHole/EndHole/Length`, `score`,
  `delta`, `winnerUserId`, `coordBonus`), `lib/scoring/sideTournamentInput.ts`
  (`buildCourseArrays`, `mapSideWinners` — importerer kun TYPEN `SideWinnerRow` fra
  app-treet, erases) og `lib/scoring/sideTournamentConfig.ts` (vekter +
  `SideCategoryId`). Alt rent TS uten server-only — Metro watchFolders dekker.
- **Webbens orkestrering kan IKKE importeres:** `computeSideTournament` i
  `app/[locale]/games/[id]/leaderboard/sideTournament.tsx:32-210` er en
  server-komponent-modul (next-intl). Selve oppskriften er liten og speilbar:
  eligible = spillere med `users != null && withdrawn_at == null`; per-hull
  brutto/netto per spiller (`netto = brutto − strokesForHole(ch, si)`, si-fallback
  `?? 18`); lag-grupper (`byTeamNumber`: hopp over `team_number == null || === 0`,
  sortér stigende; `solo`: én team-of-1 per spiller med løpende teamId, label =
  fornavn); `nettoBestBallPerHole` = MIN av lagets nettoer per hull (null når alle
  mangler); input-literal + `calculateSideTournament`. Alle POENG-beslutninger bor i
  den delte motoren — speilingen er ren datamontering.
- **`game_side_winners`-lesing trenger ingen DB-endring.** SELECT-policyen
  (0024, perf-omskrevet 0092:419-427) slipper deltakere gjennom når
  `status='finished'` — nøyaktig når appen trenger radene (de SKRIVES først i
  avslutt-flyten: `endGameWithSideWinners` → `endGameCore.ts:203-218`-upsert FØR
  status-flippen, cookie-/RLS-klient under creator-policyen fra 0071). Under aktiv
  runde finnes ingen rader og ingenting skal vises. Skriving er N6 (avslutt-flyt i
  app) — RLS-veien ligger klar for den også (creator all). **Ingen DB-del i denne
  kontrakten.** `position` = **hull-slot 1/2**, IKKE medaljerang — samme spiller kan
  stå på begge slots (SICKlestad-piloten).
- **Appens bundle mangler side-kolonnene:** `GAME_SELECT` i
  `native/app/src/data/gameBundle.ts:155` har ikke `side_tournament_enabled`,
  `side_ld_count`, `side_ctp_count`, `side_disabled_categories`.
  `BUNDLE_PAYLOAD_VERSION = 2` (`:29`) finnes nettopp for dette — bump til 3 kaster
  gamle cache-payloads (etablert mønster, jf. dok-kommentaren `:22`).
  `PLAYER_SELECT` (`:148`) har allerede alt seksjonen trenger (team_number,
  course_handicap, withdrawn_at, users name/nickname).
- **Kategorinavnene bor i `messages/no.json`** under `leaderboard.sideTournament`:
  48 `awards`-nøkler, 6 `groups`, + strukturerte detalj-mønstre (`streakRange`,
  `scoreOnHole(Brutto)`, `snowmanDetail*`, `comebackDetail`, `tie*`, `noPoints`,
  `teamFallback`). Fila er 344 KB — å bundle den i appen for ~60 strenger er feil;
  se Key Decisions.
- **Navne-helpers er delbare:** `lib/firstName.ts` og `lib/names/formatRevealName.ts`
  er rene (ingen server-only) — appen kan importere dem direkte i stedet for å speile.
- Ingen eksterne biblioteker berøres (RN-kjernekomponenter + delt repo-kode); ingen
  nye native moduler → ingen pod-rebuild. DeepWiki-oppslag N/A for denne slicen.

## Prior Decisions (videreført fra 1818/1823/1825/1828/1830/1832-kontraktene)

- **Direkte RLS-les fra appen** (choices.ts-mønsteret, #1832) — ingen ny RPC, ingen
  service-role i appen (RLS 0121-notatet fra N4 gjelder fortsatt: deltakere trenger
  aldri service-role for resultatdata).
- **Beslutningslogikk bor i delt kilde, kun montering speiles** (N2/N4-disiplinen) —
  her: motoren + `buildCourseArrays`/`mapSideWinners`/`strokesForHole` deles,
  monteringen speiles fra `computeSideTournament`.
- **Ærlig-note-guardrailen** (#1832): en fetch som aldri har lyktes gir en rolig
  «fikk ikke hentet»-note — ALDRI en tabell som ser autoritativ ut med feil tall.
- **Design-fundamentet (#1830):** nye komponenter i den eksisterende
  Leaderboard-skjermen styler seg som søsknene (statiske `ui`/`COLORS`-tokens,
  `FONTS`-tokens, aldri `fontWeight` oppå custom fontFamily). Sjekk om #1833
  (skjermkonvertering) har tatt Leaderboard.tsx innen bygging — i så fall
  `useTheme()` som de nye søsknene.
- **Native commits bruker `[no-changelog]`** (etablert i N1–#1832 — appen er ikke
  shippet til brukere ennå; ingen `.changes/`-notat).
- **Web-fredning:** web-diff = 0 kodefiler (kun `docs/native/app-spike.md`).

## Design

**Datafetch (nytt: `native/app/src/data/sideWinners.ts` el. utvidelse av
eksisterende datamodul — discretion):**
- `fetchSideWinners(gameId)`: RLS-les av `game_side_winners`
  (`category, position, winner_user_id`, order category+position — speiler webbens
  `fetchSideWinners` i `leaderboardContext.ts:73-86`). Kalles kun når bundelen sier
  `status === 'finished' && side_tournament_enabled` og formatet ikke er gatet.
  Hent ved mount/fokus; radene er statiske etter avslutning, så ingen polling — men
  re-forsøk ved fokus/nett-tilbake er discretion. Aldri i sync-køen (read-only).
- Skill «aldri lyktes» fra «tom liste» (samme semantikk som choices.ts): tom liste
  etter vellykket fetch er gyldig (f.eks. gammelt spill avsluttet via
  «avslutt likevel»-varianten uten kåring).

**Beregningsmodul (ny: `native/app/src/lib/sideTournament.ts`):**
- Speiler `computeSideTournament`-monteringen (se Research) over appens
  bundle + lokale SQLite-scores (samme kilde som `computeGameLeaderboard`), og
  returnerer `{ teams, result, ldCount, ctpCount, sideWinners }` — samme fasong som
  webbens view-props. Importerer `calculateSideTournament`, `buildCourseArrays`,
  `mapSideWinners`, `strokesForHole`, `firstName`, `formatRevealName` fra delt kilde.
- `teamGrouping` per format speiler webbens per-renderer-valg — fasit-tabell:
  `byTeamNumber`: best_ball, par-/lag-stableford (webbens stableford.tsx:247-gren),
  singles_/greensome_matchplay (duellsidene er lag 1/2). `solo`: solo-stableford,
  modified_stableford, wolf, bingo_bango_bongo, skins. Byggeren verifiserer
  modified_stableford-rutingen mot webbens renderer før implementasjon (I1).

**Visning (ny: `native/app/src/components/leaderboard/SideTournamentSection.tsx`):**
- ÉN seksjonskomponent for alle formater, rendret ETTER hovedresultatet i
  `LeaderboardBody`-treet når `status === 'finished' && side_tournament_enabled &&
  gateReason(game) === null`:
  1. Heading «Sideturnering» (samme seksjons-idiom som søsknene).
  2. **LD/CTP-linjene** øverst (webbens matchplay-headline-mønster,
     `MatchplaySideTournamentSection.tsx:46-75`): én linje per KÅRET slot
     («Lengste drive #1: Karl»), slots uten vinner hoppes stille over; slot-nummer
     vises alltid når count > 1 (position = hull-slot, aldri «1. plass»).
  3. **Poengjakten**: rader sortert på totalpoeng (dense rank, medalje 🥇🥈🥉 som
     web), label = lagnavn/fornavn per grouping, totalsum i `tabular-nums`-stil.
     Hver rad ekspanderbar (Pressable-state) med award-linjene gruppert i webbens
     seks grupper (`groups`-nøklene); tomme grupper hoppes over. Detalj-rendring
     bruker de STRUKTURERTE feltene på `SideCategoryAward` (holeNumber, streak*,
     score, delta, winnerUserId) med webbens detalj-mønstre — aldri parsing av
     `detail`-fritekst.
- Matchplay bruker samme komponent — web-paritet i plassering (under duellkortet)
  følger gratis av at seksjonen alltid ligger under hovedresultatet.

**Copy (ny: `native/app/src/lib/sideTournamentCopy.ts`):**
- Lokal label-modul med det subsettet av `leaderboard.sideTournament`-nøklene appen
  rendrer (awards + groups + detalj-mønstre + LD/CTP-linjene), enkel
  `{placeholder}`-interpolasjon. **Jest-paritetstest** importerer `messages/no.json`
  (node-side, bundles ikke) og asserter at hver streng er identisk med webbens —
  drift-vern uten 344 KB i app-bundelen.

**Bundle (`native/app/src/data/gameBundle.ts`):**
- `GAME_SELECT` + `GameBundle`-typen + mapping utvides med de fire side-kolonnene;
  `BUNDLE_PAYLOAD_VERSION` 2 → 3.

## Edge Cases & Guardrails

- **Aktivt/scheduled spill:** ingenting side-relatert rendres, uansett config —
  web-paritet (post-game-element). Ingen fetch fyres.
- **Fetch aldri lyktes** (kaldstart offline på et finished side-spill med
  `ldCount + ctpCount > 0`): ærlig note i seksjonen i stedet for poengjakten — LD/CTP
  gir 2p per slot, og en tabell uten dem ville vist feil totaler autoritativt.
  Ved `ldCount + ctpCount === 0` finnes ingen rader å hente; poengjakten kan rendres
  uten fetch (discretion om fetchen da skippes helt).
- **`winner_user_id = null`** («Ingen kvalifiserte» valgt i avslutt-veiviseren):
  slot-linjen hoppes over i headline (web-paritet); motoren deler ikke ut poengene.
- **Samme spiller på begge slots:** to linjer, 2p × 2 — legitim data, aldri
  dedupliseres (position-semantikk-minnet).
- **WD-spillere:** filtreres ut (`withdrawn_at == null`) FØR grouping — uavhengig av
  #1846-restansen i adapteren (denne modulen eier sitt eget filter, web-fasit).
- **`team_number` null/0 i byTeamNumber-grouping:** raden hoppes over (web-fasit).
- **Gatet format (patsome, segment-spill):** ingen seksjon (gateReason-porten).
- **Gamle spill med `side_disabled_categories`:** sendes inn i input som på web —
  deaktiverte kategorier gir ingen awards; grupperendringen håndterer tomt.
- **Manglende scores** (hull uten tall): motoren håndterer null-hull selv — ingen
  app-side utfylling, aldri gjettet 0.
- **Ingen nye npm-deps, ingen native moduler, ingen DB-/RLS-endring, ingen ny
  realtime-kanal, null web-kodediff.**

## Key Decisions

- **Stacked seksjon under hovedresultatet for ALLE formater — ikke faner** — RN-appen
  har ingen tabs-primitiv; #1830-mandatet er native-følelse, ikke pikselparitet.
  Matchplay får dermed eksakt web-plassering, øvrige formater en RN-tilpasning av
  webbens fane. ASSUMPTION (autonom økt): dette er innenfor eierens
  «native-følelse»-føring og løftes ikke som produktvalg; bygge-PR-en beskriver
  valget i Fordeler/ulemper-blokken (standard for feat-PR-er) så eieren har veto.
- **Regelpanelet («Slik gis poengene») utgår i v1** — resultatlinjene bærer navn og
  poeng selv; panelet er web-tilleggslesning. Bokføres i Out of Scope.
- **Lokal copy-modul + jest-paritetstest mot `messages/no.json`** — identiske
  strenger uten å bundle 344 KB JSON; drift fanges i CI.
- **Ingen polling for `game_side_winners`** — radene skrives én gang i
  avslutt-flyten og er statiske; mount/fokus-fetch holder.
- **Skriving (kåring av vinnere) og veiviser-config hører til N6** —
  arrangør-livssyklusen. RLS-veien (creator all, 0071/0092) er verifisert klar.

**Claude's Discretion:** egen datamodul vs. utvidelse av eksisterende; hook-form for
fetch-state; ekspander-interaksjonen (per-rad vs. hele seksjonen); eksakt
nøkkel-subsett i copy-modulen; om fetch skippes ved 0+0-slots; testfil-inndeling;
om `SideWinnerRow`-typen re-brukes via type-import eller defineres lokalt.

## Success Criteria

- [x] 1. **Jest-låst logikk:** beregningsmodulen gir motor-paritet på fixtures —
  inkl. slot-fixturen (samme spiller på begge LD-slots → to headline-linjer, 4p),
  WD-filter, team_number null/0-hopp, solo- vs. byTeamNumber-grouping, netto-regning
  via delt `strokesForHole` (si-fallback 18); bundle-v3-mapping; copy-paritetstesten
  mot `messages/no.json` grønn. `npx jest` grønn i `native/app/`.
- [x] 2. **Ende-til-ende på staging (score-format):** service-role-rigget FERDIG
  stableford-/solo-spill med side på, scores, og `game_side_winners`-rader (minst én
  spiller på to slots) — appen viser seksjonen med LD/CTP-linjer og poengjakt, og
  totalene stemmer med webbens leaderboard for SAMME spill (kryssjekk web mot
  staging). Evidens: skjermbilder app + web.
- [x] 3. **Matchplay på staging:** ferdig singles- eller greensome-spill med side på
  → kompakt seksjon under duellresultatet; et AKTIVT side-spill viser ingenting
  side-relatert (skjermbilde begge).
- [x] 4. **Guardrail:** aldri-lykkes-fetch på finished side-spill (ld/ctp > 0) gir
  ærlig note, ikke poengtabell (jest).
- [x] 5. **Web uendret:** `npx vitest run` (rot) grønn med identisk antall som
  baseline; web-diff utenfor native/docs/forge = 0 filer.
- [x] 6. **Porter + runbook:** alle Gates grønne; `docs/native/app-spike.md` får
  sideturnering-seksjon (finished-gaten, slot-semantikken, copy-paritetsmønsteret,
  seed-oppskrift for ferdig side-spill). Eier-tapptest på fysisk iPhone hvis eier
  tilgjengelig, ellers `VERIFICATION GAP` + restanse (#1832-mønsteret).

## Gates

(Fersk worktree: `npm install` i BÅDE repo-rot og `native/app/` — eget lockfile.
Node 22.)

- [x] `npx jest` i `native/app/` grønt
- [x] `npx tsc --noEmit` i `native/app/` grønt
- [x] `npx expo export --platform ios` grønt (slett `dist/` etterpå)
- [x] `npm run typecheck` (rot) grønt
- [x] `npx vitest run` (rot) grønt — identisk antall som baseline
- [x] `npx eslint native/app` grønt
- [x] `npm run build` (rot) grønt m/ pipefail

## Files Likely Touched

- `native/app/src/data/gameBundle.ts` (+test) — side-kolonnene, payload v3
- `native/app/src/data/sideWinners.ts` (ny, +test) — RLS-fetch + aldri-lykkes-skille
- `native/app/src/lib/sideTournament.ts` (ny, +test) — speilet montering + delt motor
- `native/app/src/lib/sideTournamentCopy.ts` (ny, +paritetstest) — labels
- `native/app/src/components/leaderboard/SideTournamentSection.tsx` (ny, maks 1
  render-test) — seksjonen
- `native/app/src/screens/Leaderboard.tsx` — fetch-treing + seksjon under body
- `docs/native/app-spike.md` — ny seksjon

## Out of Scope

- Kåring av LD/CTP-vinnere i appen (webbens `SideWinnersForm` — N6 avslutt-flyt);
  veiviser-config for sideturnering (N6 opprett-veiviser); regelpanelet
  «Slik gis poengene» (mulig oppfølger ved pull); cup-nivåets
  `tournament_side_awards`/GIR (#1489 — cup er Should); realtime for
  `game_side_winners`; offline-first-lagring av vinner-radene (mount-fetch holder
  for statiske data); endringer i motor, RLS eller DB-skjema; #1846
  (WD-filter-restansen i adapteren — eget issue, egen fasit).

---

## Drift-verifisering mot HEAD (bygge-økt 2026-08-31, base `38cd745d`)

Kontrakten ble skrevet i en egen spec-økt. Alle påstander er kontrollert mot
byggebranchens HEAD før første kodelinje. **Ingen påstand var feil**; tre presiseringer
og én oppdatert forutsetning står under.

### Bekreftet uendret

| Påstand | Bevis |
|---|---|
| `calculateSideTournament` + `SideTournamentInput/Result` + `SideCategoryAward` | `lib/scoring/sideTournament.ts:404`, `:71`, `:152`, `:94` |
| `buildCourseArrays` / `mapSideWinners` / `buildSideTournamentInput` | `lib/scoring/sideTournamentInput.ts:27`, `:54`, `:84` |
| Vekter + `SideCategoryId` + `ALL_CATEGORY_IDS` | `lib/scoring/sideTournamentConfig.ts:7`, `:76`, `:125` |
| Post-game-gaten på alle formater | `formats/stableford.tsx:115-121`, `formats/skins.tsx:102`, `sideTournament.tsx:265` (`return undefined`), `leaderboardContent.tsx:516-529` |
| `computeSideTournament`-oppskriften (eligible → per-hull netto → grouping → best-ball → input) | `app/[locale]/games/[id]/leaderboard/sideTournament.tsx:31-210` |
| `fetchSideWinners` (category, position, winner_user_id; order category+position) | `leaderboardContext.ts:73-86` |
| `GAME_SELECT` mangler de fire side-kolonnene | `native/app/src/data/gameBundle.ts:154` (kontrakten skrev `:155`, ±1 linje) |
| `BUNDLE_PAYLOAD_VERSION = 2` | `gameBundle.ts:29` |
| `PLAYER_SELECT` har alt seksjonen trenger | `gameBundle.ts:148` (team_number, course_handicap, withdrawn_at, users(name, nickname)) |
| `messages/no.json` → 48 `awards`, 6 `groups`, alle detalj-mønstre | målt med node; fila er 341 KB (kontrakten skrev 344 KB) |
| RLS: SELECT = `is_admin() OR (deltaker ∧ status='finished')` | `supabase/migrations/0092_rls_policy_perf.sql:411-427` |
| Creator-policyen for skriving står | `0071_games_creator_rls.sql:76` |
| `games`-kolonnene finnes i skjemaet | `lib/database.types.ts:732-735` |
| `firstName` / `formatRevealName` er rene | `lib/firstName.ts:1`, `lib/names/formatRevealName.ts:1` |
| `position` = hull-slot, ikke rang | `leaderboardTypes.ts:7-11` + `MatchplaySideTournamentSection.tsx:52-75` (løkke `pos = 1..ldCount`) |

### Presiseringer (kontrakten var ikke feil, men ufullstendig)

1. **`#1833` har IKKE landet.** `native/app/src/screens/Leaderboard.tsx:35` importerer
   fortsatt statiske `COLORS, ui` fra `../theme`. Kontraktens betingede gren løses
   dermed til **statiske tokens**, ikke `useTheme()`.
2. **Appen viser langt flere enn «de 8 Must-formatene».** `formatGate.ts` gater i dag
   KUN `patsome` (+ segment-spill og deriverte). Sideturneringen må derfor ha en
   grouping-regel som dekker HELE det åpne format-settet, ikke 8 navngitte.
   Fasit hentes fra webbens per-renderer-valg:
   - `byTeamNumber`: best_ball (`leaderboardContent.tsx:625-643` via `buildSideTournamentInput`),
     stableford-familien når motoren svarer `variant === 'team'` (`stableford.tsx:208,247`),
     hele matchplay-familien (`sideTournament.tsx:266`), scramble-familien
     (`texasScramble.tsx:206`), `shamble` (`shamble.tsx:162`), `patsome` (`patsome.tsx:136`, gatet).
   - `solo`: stableford-familien når `variant === 'solo'` (`stableford.tsx:357`),
     `solo_strokeplay:264`, `skins:206`, `wolf:160`, `bingo_bango_bongo:213`,
     `nassau:222`, `round_robin:131`, `nines:145`, `acey_deucey:144`.
   - **`modified_stableford` har ingen egen regel** — den rutes gjennom
     `renderStableford` (`isStablefordFamily`, `leaderboardContent.tsx:255`) og arver
     lag/solo-grenen der. Kontraktens I1-krav om å verifisere den er dermed innfridd:
     grouping skal utledes fra motorens `variant`, ikke fra en håndskrevet modus-liste.
3. **Delt kode importeres med RELATIVE stier i appen** (`'../../../../lib/...'`), ikke
   `@/`-aliaset — se `scoringContext.ts:27`, `teamPlay.ts:23-26`. Nye native-filer følger
   husets stil.

### Konsekvens for byggingen

Ingen kontrakt-endring nødvendig. Grouping-regelen implementeres som «spør motoren»
(`ModeResult.variant` + de delte `isStablefordFamily`/`isScrambleFamily`/`isMatchplayFamily`-
predikatene) i stedet for en hardkodet modus-tabell — samme disiplin som `scoringContext.ts`
bruker mot `build*Context`-hjelperne.

---

## Evidens (bygge-økt 2026-08-31)

### Porter — alle kjørt i denne økta, alle exit 0

| Port | Resultat |
|---|---|
| `npx jest` (native/app) | **27 suiter, 346 tester**, exit 0 |
| `npx tsc --noEmit` (native/app) | exit 0, ingen utskrift |
| `npx expo export --platform ios` | exit 0 (`dist/` slettet etterpå) |
| `npm run typecheck` (rot) | exit 0 |
| `npx vitest run` (rot) | **522 filer / 7028 tester** — identisk med baseline målt før første kodelinje |
| `npx eslint native/app` | exit 0, ingen utskrift |
| `npm run build` (rot, m/ pipefail) | exit 0 |

### Staging-rigg

Tre spill seedet med service-role på `torny-staging`
(`snwmueecmfqqdurxedxv`), bane Stiklestad Golfbane (par 71), e2e-spilleren
deltar i alle tre:

| Spill | id | Fasong |
|---|---|---|
| A | `06ad104f-0bf1-43c5-8231-bf6eb358c959` | solo stableford, finished, 2 LD + 1 CTP, **samme spiller på begge LD-slots** |
| B | `75e9372b-7b12-4016-bf33-0af31b5c7de9` | singles matchplay, finished, 1 LD + 1 CTP |
| C | `2d9047e7-a60f-4b5e-b4bc-4025418639dd` | solo stableford, **aktiv**, side på (skal vise ingenting) |

⚠️ To feller traff under seedingen, begge bokført i runbooken:
`scores.entered_by` er NOT NULL, og `mode_config` MÅ ha `kind` — appens
`asModeConfig` avviser `{}`, mens webben ruter på `game_mode` og ikke merker det.
Alle TEST-/E2E-seedede stableford-spill i staging står med `{}`; ekte
veiviser-spill har `{"kind":"stableford","team_size":1,"points_table":"standard"}`.

### Kriterium 2 — kryssjekk app mot web, samme spill

Webben kjørt i **prod-modus** (`next build` med `.env.staging.local` + `next start`),
ikke dev. Fanen «Sideturnering» på spill A mot appens seksjon:

| | Web | App |
|---|---|---|
| 🥇 Anders Berg | 66p | **66p** |
| 🥈 Test Spiller | 34p | **34p** |
| 🥉 Christian Eide | 10p | **10p** |
| · Bjørn Dahl | 4p | **4p** |

Hovedtabellen stemmer også (46/41/37/28 begge steder). Test Spillers ekspanderte
kort er **tegn for tegn identisk** på tvers av alle seks grupper, inkludert:

```
Longest drive #1 (Test): 2p
Longest drive #2 (Test): 2p     ← samme spiller, begge slots, 4p
Snowman (+5 på hull 5): -2p     ← solo-formen, ikke «hele laget»
Hole-wins: 10p på 5 hull (hull 4, 10, 14, 16–17)
```

### Kriterium 3 — matchplay + aktiv runde

- **Spill B (finished singles matchplay):** duellkortet («Test Spiller mot Anders
  Berg — AS») + hull-for-hull-stripa, og under dem den kompakte
  sideturnerings-seksjonen: «Lengste drive #1: Anders», «Nærmest pinnen #1: Test»,
  🥇 Anders Berg 66p / 🥈 Test Spiller 32p. Identisk med webbens
  `MatchplaySideTournamentSection` for samme spill. Merk at radene viser
  SPILLERNAVN, ikke «Lag 1»/«Lag 2» — grupperingen er `byTeamNumber`, men et lag
  med ett medlem viser medlemmets navn (web-regelen fra `SideTournamentView:247-256`).
- **Spill C (aktiv, side på):** hovedtabellen vises (16/10/10, identisk med web) og
  **ingenting** side-relatert — ingen overskrift, ingen LD/CTP-linjer, ingen
  poengjakt. Hentingen fyres heller ikke.

### Kriterium 6 — FULLT BEVIST (eier-tapptest på fysisk iPhone)

Runbook-seksjonen er skrevet og committet.

Release-bygget ble installert på eierens egen iPhone (`jlars's iPhone`, iOS 26.5) med
`npx expo run:ios --device 00008110-000A1D3E3C10401E --configuration Release` — det
klassiske UDID-et fra `xcrun xctrace list devices`, ikke `devicectl`-ID-en. Bygget er
fra etter F1-fiksen (`a1cd90c4`). Bekreftet installert:

```
Torny Dev   no.tornygolf.dev   1.0.0   1
```

**Eierens observasjon på telefonen** (spill A, 2026-08-31):

> «lengste drive #1 er Test og lengste drive #2 er test og nærmest pinnen #1 er Anders.
> Test spiller fikk det opp på sitt kort og anders fikk sitt opp på sitt kort.»

Det er nøyaktig web-fasiten: begge LD-slotene til samme spiller (slot-semantikken holder
på ekte enhet), CTP til Anders, og ekspander-interaksjonen virker på begge lag-radene.

⚠️ **Felle for neste økt:** `expo run:ios --device` installerer og starter appen, og blir
DERETTER liggende og strømme logger. Prosessen lever altså videre lenge etter at
installasjonen er ferdig, og en `| tail`-pipe gir ingen output før prosessen dør — «tom
logg + levende prosess» betyr IKKE at bygget henger. `devicectl device info apps` kjørt
MENS installasjonen pågår får heller ikke opp tunnelen og svarer tomt; kjør den på nytt
etterpå før du konkluderer med at appen mangler.

### Avvik fra kontrakten (bokført, ikke skjult)

1. **Navne-filteret droppet.** Kontrakten sa eligible = `users != null &&
   withdrawn_at == null`. Bundelen kollapser «ingen users-rad» og «users-rad uten
   navn» til `name: null`, så et navne-filter ville kastet ut ferske
   selvregistrerte spillere (`handle_new_auth_user` setter bare id/e-post/hcp) og
   ikke fanget en eneste slettet (`anonymize_user` skriver «Slettet bruker»).
   Nettoen deres ville forsvunnet fra lagets best-ball og gjort sidepoengene
   stille feil. Kun WD-filteret står — samme avveining `scoringContext.ts` gjorde
   for hovedtabellen, og de to deler skjerm.
2. **Grouping utledes, ikke tabelleres.** Kontrakten ba om en fasit-tabell per
   format. Den delte `isSoloFormat`-predikatet viste seg å matche webbens
   per-renderer-valg 22/22, så regelen spør den delte kilden i stedet. En
   `it.each`-tabell låser alle 22 modi mot web-fasiten.
3. **Copy-oppslaget er nøklet på `SideCategory`, ikke `SideCategoryId`** som
   kontrakten antok — de to unionene avviker på to navn (#1851).

### Funn filet som egne issues

- **#1851** — `SideCategory` vs `SideCategoryId`: to 45-medlems-unioner for samme
  domene, ulike på `best_netto_front9/back9` mot `best_netto_f9/b9`.
- **#1852** — «18 hull hull 1–18»: `longestBogeyFreeDetail` legger på «hull» som
  `streakRange` allerede har. Gjelder web i dag; appen speiler den for paritet.
