# Spec: Bingo Bango Bongo — format-bevisst «Hull for hull» + duell ved 2 (PR 6 av epic #496)

**Issue:** [#496](https://github.com/jdlarssen/golf-app/issues/496)
**Scope:** Bingo Bango Bongo (BBB). **Begge strømmer** — Stream A (format-bevisst «Hull for hull») + Stream B (head-to-head «duell»-kort ved nøyaktig 2 spillere). Eierens valg 2026-06-08.
**Bump:** MINOR (ny bruker-synlig flate) → 1.100.0.

## Problem

«Hull for hull» forgrener på `game_mode` etter PR 1–5 (Skins, Wolf, Nines, Round Robin, Acey-Deucey), men BBB treffer fortsatt det generiske best-ball lag-scorekortet ([holes/page.tsx](../../app/games/%5Bid%5D/leaderboard/holes/page.tsx) `DrilldownBody`). For BBB er det dobbelt feil: (1) spillerne spilte individuelt, ikke som lag, og (2) **BBB teller ikke slag i det hele tatt** — poeng deles ut for tre prestasjoner per hull (Bingo = først på green, Bango = nærmest når alle er på green, Bongo = først i hull). Et netto-scorekort er meningsløst her. PR 6 gir BBB sin egen per-hull-flate som viser de tre prestasjonene og hvem som tok dem.

I tillegg: BBB kan spilles med **nøyaktig 2 spillere** (2–16 etter [#460](https://github.com/jdlarssen/golf-app/issues/460)). De andre formatene i epic 496 kunne aldri være 2 (Wolf 3–5, Nines/3, RR & Acey-Deucey/4), så de fikk ikke duell-kortet — men Skins fikk det. BBB er det **siste** formatet som kan være 2p, så denne PR-en lukker H2H-strømmen ved å gi 2-spiller-BBB duell-kortet i stedet for podiet.

## Prior Decisions (fra PR 1–5 + epic #496)

- **Arkitektur:** branch i `LeaderboardHolesPage` på `game.game_mode`, egen `<Format>HolesBody` (async server-comp, Suspense-wrappet), bygg `ScoringContext` via delt `buildXContext`-helper, kjør `computeModeResult`, narrow på `result.kind`, rendr `<Format>HolesView` (server-comp).
- **Server-comp** for visningen; gjenbruk `AppShell`/`Card`/`Kicker`/`PullQuote`/`LeaderboardBackdrop`/`formatRevealName`. Back-lenke → `/games/${gameId}`.
- **Reveal-modus:** skjul når `scoreVisibility==='reveal'` && ikke ferdig (samme `isRevealHidden`-mønster fra Wolf/BingoBangoBongoView).
- **Ingen front-9-clip:** vis alle hull (uspilte hull = «Venter»).
- **Delt context-helper** brukt av både `renderX` og `XHolesBody`.
- **Format-bevisst, grunnet i formatet** (eierens direktiv): per-hull-flaten tar utgangspunkt i mekanikken. For BBB = de tre prestasjonene.
- **Injeksjon som Wolf:** BBB sin per-hull-data ligger i `bingo_bango_bongo_holes`-tabellen (ikke utledet fra slag), hentet via tag-cachet `getBingoBangoBongoHoles(gameId)` og injectet i ConteksScoringContext via `bingoBangoBongoHoles`-feltet — speiler `wolfChoices`-mønstret.
- **H2H-kortet er et gjenbrukbart skall** ([HeadToHeadResult.tsx](../../app/games/%5Bid%5D/leaderboard/HeadToHeadResult.tsx)): `score` (høyest vinner), `unitLabel`, `formatLabel`, `winnerUserId` (eksplisitt for tiebreak), `strip: StripCell[]`, `hangingNote`. Skins er første konsument; BBB mater inn poeng.
- **Ingen nye farge-tokens** uten diskusjon.

## Eierens valg (denne PR-en, 2026-06-08)

1. **Duell ved 2:** JA — inkluder duell-kortet (Stream B) for 2-spiller-BBB. Poeng som metrikk, momentum-strip per hull, vinner-krone. Lukker H2H-strømmen.
2. **Hull-kort:** **Prestasjon-først** — tre linjer per hull (Bingo / Bango / Bongo), hver med vinnerens navn (eller «ikke satt»). Mekanikken i front. Sweep leses naturlig (samme navn på alle tre). Skalerer rent 2→16. **Ingen golf-score.**

## Research / kode-funn

- `BingoBangoBongoResult.holes` (`BingoBangoBongoHoleRow[]`, [types.ts:1557](../../lib/scoring/modes/types.ts)): `holeNumber`, `bingoUserId` (null = ikke satt), `bangoUserId`, `bongoUserId`, `pointsByPlayer` (0–3 poeng per spiller på hullet). **INGEN `par`/`strokeIndex`** — BBB bryr seg ikke om par. Hull-kortet viser derfor bare «Hull N» (ingen scoring-utvidelse nødvendig).
- `BingoBangoBongoResult.players` (`BingoBangoBongoPlayerLine[]`): `userId`, `bingos`, `bangos`, `bongos`, `totalPoints`, `rank`, `tiedWith`.
- `bingoBangoBongo.compute()` ([bingoBangoBongo.ts:49](../../lib/scoring/modes/bingoBangoBongo.ts)) leser `ctx.bingoBangoBongoHoles ?? []` og **ignorerer `ctx.scores`**. Samme spiller kan vinne alle tre på ett hull (3 poeng) — lovlig. Hull uten input-rad = ingen poeng (lovlig, pending).
- `BingoBangoBongoView` ([BingoBangoBongoView.tsx](../../app/games/%5Bid%5D/leaderboard/BingoBangoBongoView.tsx)) viser **kun** en per-spiller leaderboard-tabell (Bingo/Bango/Bongo/Sum aggregert). **Ingen per-hull-seksjon i det hele tatt** — så «Hull for hull»-flaten er rent additiv (som Round Robin), ikke en «rikere PER HULL». Eksporterer `BingoBangoBongoPlayerInfo`. Reveal-skjul via `data-testid="bbb-reveal-hidden"`.
- `getBingoBangoBongoHoles(gameId)` ([getBingoBangoBongoHoles.ts](../../lib/bbb/getBingoBangoBongoHoles.ts)) er tag-cachet på `game-${id}` (samme tag som `getGameWithPlayers`), returnerer `BingoBangoBongoHoleInput[]` sortert på hole_number. Identisk rolle til Wolf sin `getWolfChoices`.
- `renderBingoBangoBongo` ([leaderboard/page.tsx:2579](../../app/games/%5Bid%5D/leaderboard/page.tsx)) bygger `ScoringContext` **inline** med `teamNumber: null` (solo) + `bingoBangoBongoHoles` (injeksjon), narrow `kind`, og velger view per `game.status` (finished → Podium + chromeless View; ellers View alene). **Henter selv** `getBingoBangoBongoHoles` (linje 2600).
- H2H Skins-presedens ([leaderboard/page.tsx:2464–2510](../../app/games/%5Bid%5D/leaderboard/page.tsx)): `if (result.players.length === 2)` inne i `finished`-grenen; stabil rekkefølge via `gwp.players.map(p => p.user_id)`; `winnerUserId = a.rank === b.rank ? null : (a.rank < b.rank ? a.userId : b.userId)`; `strip` per hull.

## Design

### 1. Delt context — `lib/scoring/context/buildBingoBangoBongoContext.ts`
Hybrid av `buildAceyDeuceyContext` (solo: `teamNumber: null`) + `buildWolfContext` (injeksjon). Interface `BingoBangoBongoContextPlayerRow = { user_id, course_handicap, tee_gender, users }`. Build-funksjonen tar i tillegg `bingoBangoBongoHoles: BingoBangoBongoHoleInput[]` og setter `game_mode: 'bingo_bango_bongo'`, `teamNumber: null`, `scores` gjennom (shape-konsistens; compute ignorerer dem), `bingoBangoBongoHoles` injectet. **Refaktorer `renderBingoBangoBongo`** til å bruke den (erstatt inline ctx-map; behold `await getBingoBangoBongoHoles(gameId)` på call-site og send inn). Brukes også av `BingoBangoBongoHolesBody`.

### 2. `BingoBangoBongoHolesView` (server-comp) — `app/games/[id]/leaderboard/holes/BingoBangoBongoHolesView.tsx`
Props speiler `WolfHolesView` (`gameId`, `gameName`, `result: BingoBangoBongoResult`, `playersById: Map<string, BingoBangoBongoPlayerInfo>`, `scoreVisibility`, `gameStatus: 'active'|'finished'`).

- **Reveal-skjul:** `scoreVisibility==='reveal' && gameStatus !== 'finished'` → venterom-melding (mirror Wolf, eget `data-testid="bbb-holes-reveal-hidden"`).
- Header «Hull for hull» + undertittel «Bingo Bango Bongo» (ingen Netto/Brutto — prestasjons-basert).
- Per hull-kort (fra `result.holes`, alle 18, sortert på holeNumber):
  - **Hode:** «Hull N» venstre. **Ingen par/SI** (BBB har dem ikke). Sweep-indikator (se under) til høyre når relevant.
  - **Tre prestasjons-linjer** (prestasjon-først, eierens valg), i fast rekkefølge Bingo → Bango → Bongo:
    - Etikett (f.eks. «Bingo» med diskret forklaring «først på green» via `title`/liten tekst) + vinnerens navn (`formatRevealName(info.name, info.nickname)`).
    - `null`-kategori → dempet «ikke satt» (muted), ingen navn.
  - **Sweep:** når én spiller tar ≥2 av de tre på hullet (`pointsByPlayer[userId] >= 2`), uthev spillerens navn i accent på de linjene. Alle tre (= 3 poeng) → en diskret «Feiet!»-chip i accent i hodet. (Eksakt treatment = Claude's discretion innen eksisterende tokens.)
  - **Pending hull** (alle tre `null` — ingen registrert rad): ett dempet «Venter»/«Ikke registrert ennå» i stedet for tre «ikke satt»-linjer. Delvis registrert hull (noen satt, noen null) viser de satte med navn + de manglende som «ikke satt».
- Reveal-skjul + dark mode + `tabular-nums` + ≥44px back-lenke (`h-11 w-11`).

Den nye flaten er **eneste** sted per-hull-prestasjonsdata vises (BingoBangoBongoView har ingen PER HULL) — rent additiv, som Round Robin.

### 3. Branch — `holes/page.tsx`
Etter Acey-Deucey-branchen: `if (game.game_mode === 'bingo_bango_bongo') return <Suspense fallback={<DrilldownSkeleton/>}><BingoBangoBongoHolesBody gameId={id} courseId={game.course_id} /></Suspense>`. `BingoBangoBongoHolesBody` speiler **`WolfHolesBody`** (Promise.all inkluderer `getBingoBangoBongoHoles(gameId)`-fetch), bygg via `buildBingoBangoBongoContext`, narrow `kind==='bingo_bango_bongo'`, `playersById` (`BingoBangoBongoPlayerInfo`), normaliser `scoreVisibility`/`gameStatus`, rendr `BingoBangoBongoHolesView`.

### 4. Stream B — duell ved 2 spillere — `renderBingoBangoBongo` (leaderboard/page.tsx)
I `finished`-grenen, FØR Podium-grenen: `if (result.players.length === 2)` → rendr `HeadToHeadResult` i stedet for `BingoBangoBongoPodium`. Speil Skins-presedensen:
- Stabil rekkefølge: `order = gwp.players.map(p => p.user_id)`, sorter `result.players` på `order.indexOf`.
- `sideFor(pl)`: `score: pl.totalPoints`, `subLabel`: kompakt prestasjons-fordeling (f.eks. «{bingos} bingo · {bangos} bango · {bongos} bongo» — eksakt ordlyd = discretion).
- `formatLabel: 'Bingo Bango Bongo'`, `unitLabel: 'poeng'`.
- `winnerUserId = a.rank === b.rank ? null : (a.rank < b.rank ? a.userId : b.userId)` (tiedWith ⇒ delt ⇒ lik rank ⇒ tie).
- `strip` per hull (fra `result.holes`): `aPts = h.pointsByPlayer[a.userId] ?? 0`, `bPts = h.pointsByPlayer[b.userId] ?? 0`. `aPts > bPts → 'a'`; `bPts > aPts → 'b'`; begge `0` (uregistrert/pending) → `'unplayed'`; ellers (likt og > 0) → `'halved'`.
- `hangingNote`: null (BBB har ingen carryover). Claude's discretion om en liten note for uregistrerte hull.
- 3+ spillere → `BingoBangoBongoPodium` som før. Active/scheduled → `BingoBangoBongoView` alene (uendret).

### 5. E2E auth-gate — `e2e/games/bingo-bango-bongo.spec.ts`
Speil `e2e/games/acey-deucey.spec.ts` (auth-gate på holes-ruta). Aldri assert på norsk copy; bruk redirect-til-`/login`-mønstret.

## Edge Cases & Guardrails
- **Pending/uregistrert hull** (ingen rad → alle tre null, alle `pointsByPlayer` tomme): «Venter», ingen sweep, ikke talt i H2H-strip (`'unplayed'`).
- **Delvis hull** (f.eks. bingo satt, bango/bongo null): vis satt kategori med navn, null-kategorier som «ikke satt». Lovlig mid-runde.
- **Sweep** (samme spiller alle tre = 3 poeng): «Feiet!»-uthevning. Korrekt fra `pointsByPlayer[userId] === 3`.
- **2-spiller-H2H:** kun mulig her (BBB 2–16). Vinnerne på hvert hull er alltid blant de to (eller null). Lik `totalPoints` OG cascade (`tiedWith` ikke-tom) ⇒ lik rank ⇒ tie.
- **Reveal-modus** midt-runde → venterom-melding (begge flater).
- **Blandet kjønn:** irrelevant for BBB (ingen slag/par i poeng).
- Andre solo-format urørt (kun `'bingo_bango_bongo'` legges til branchen). Skins/Wolf/Nines/Round Robin/Acey-Deucey uendret.

## Key Decisions
- **Ingen scoring-utvidelse:** `BingoBangoBongoHoleRow` eksponerer allerede alt (tre vinner-id-er + `pointsByPlayer`). Ren visning + injeksjon.
- **Injeksjon som Wolf:** `getBingoBangoBongoHoles` fetchet i Body + matet via `buildBingoBangoBongoContext`.
- **Prestasjon-først hull-kort** (eierens valg): tre linjer Bingo/Bango/Bongo → navn. Ingen golf-score.
- **Duell ved 2** (eierens valg, Stream B): `HeadToHeadResult` ved nøyaktig 2; poeng som metrikk; strip fra poeng-sammenligning per hull.
- **Ingen nye farge-tokens.** Sweep + ace-aktig uthevning bruker eksisterende accent/muted.
- **`buildBingoBangoBongoContext`** = solo (`buildAceyDeuceyContext`) + injeksjon (`buildWolfContext`); `BingoBangoBongoHolesBody` speiler `WolfHolesBody`.

**Claude's Discretion:**
- Eksakt prestasjons-linje-layout (etikett-stil, forklaring inline vs `title`, ikon/farge per kategori innen eksisterende tokens).
- Sweep-treatment (chip-tekst, om «Feiet!» kun ved 3 eller også ved 2).
- H2H `subLabel`-ordlyd + om en uregistrert-hull-note vises.
- Celle-tetthet, undertittel-detalj.

## Success Criteria
- [x] `buildBingoBangoBongoContext` bygger BBB-`ScoringContext` (solo `teamNumber: null` + `bingoBangoBongoHoles`-injeksjon) og brukes av **både** `renderBingoBangoBongo` og `BingoBangoBongoHolesBody` — ingen duplisert ctx-map (inline-map slettet fra `renderBingoBangoBongo`). → `lib/scoring/context/buildBingoBangoBongoContext.ts`; inline-map erstattet i renderBingoBangoBongo (commit a6b8de6); BingoBangoBongoHolesBody bruker den (commit 61494bc).
- [x] «Hull for hull» på et BBB-spill viser per hull de **tre prestasjonene** (Bingo / Bango / Bongo) med vinnerens navn (eller «ikke satt»), ikke lag-scorekortet. Ingen golf-score/par. → `holes/page.tsx` bingo_bango_bongo-branch + `BingoBangoBongoHolesBody` + `BingoBangoBongoHolesView` (CATEGORIES-rader, ingen par/score).
- [x] BingoBangoBongoHolesView er rent additiv (BingoBangoBongoView har ingen PER HULL) og håndterer pending hull («Venter») + sweep-uthevning. → BingoBangoBongoView har kun aggregert per-spiller-tabell; view-en har `isPending`→«Venter» + sweep→«★ Feiet!».
- [x] Stream B: ferdig BBB-spill med **nøyaktig 2 spillere** rendrer `HeadToHeadResult` (poeng som metrikk + momentum-strip per hull + vinner-krone) i stedet for podiet; 3+ spillere beholder `BingoBangoBongoPodium`. → `renderBingoBangoBongo` finished-gren: `result.players.length === 2` → HeadToHeadResult (unitLabel «poeng», strip fra pointsByPlayer-sammenligning); ellers Podium.
- [x] Andre format uendret «Hull for hull». Reveal/dark/`tabular-nums`/≥44px respektert. → Kun `'bingo_bango_bongo'`-gren lagt til; reveal-blokk (`bbb-holes-reveal-hidden`) + `tabular-nums` + `h-11 w-11` back-lenke.
- [x] Type C render-test for BingoBangoBongoHolesView (1 normalt hull med tre vinnere + 1 sweep + 1 pending) — asserter prestasjons-navn + pending + sweep. → `BingoBangoBongoHolesView.test.tsx` (1 test, grønn; normal/sweep/delvis/pending). Strammet per test-disiplin (commit 12e6b3d).
- [x] CHANGELOG + MINOR-bump (1.100.0) i feature-commit. Norsk copy via `humanizer`. → `package.json` 1.100.0 + CHANGELOG 1.100.y-tema (1.99.y foldet) i commit 61494bc; humanizer-pass på tagline + UI-strenger.
- [x] E2E auth-gate for holes-ruta på BBB (ny `e2e/games/bingo-bango-bongo.spec.ts`). → opprettet (3 auth-gate-tester), commit 1f587a1.

## Gates
- [x] `npx tsc --noEmit` — 0 nye errors → clean (exit 0)
- [x] `npx vitest run "app/games/[id]/leaderboard"` — nye + eksisterende (BingoBangoBongoView, HeadToHeadResult) grønne → 174/174 (30 filer)
- [x] `npx vitest run lib/scoring/modes/bingoBangoBongo lib/scoring/context` — context + scoring uendret/grønne → 21/21
- [x] `npm run lint` — 0 errors (nye filer rene) → 0 errors, 24 pre-eksisterende warnings (ingen i nye filer)
- [x] `npm run build` → exit 0 → success (full route-tabell printet)
- [x] Full-suite `npx vitest run` — én ren kjøring → 2948/2948 grønn (245 filer), exit 0, ingen flaking denne kjøringen.

## Files Likely Touched
**Nye:** `app/games/[id]/leaderboard/holes/BingoBangoBongoHolesView.tsx` (+ `.test.tsx`), `lib/scoring/context/buildBingoBangoBongoContext.ts`, `e2e/games/bingo-bango-bongo.spec.ts`
**Endrede:** `app/games/[id]/leaderboard/holes/page.tsx` (bingo_bango_bongo-branch + body), `app/games/[id]/leaderboard/page.tsx` (`renderBingoBangoBongo` bruker buildBingoBangoBongoContext + Stream B H2H-gren), `CHANGELOG.md` + `package.json`

## Out of Scope
- Gjenværende format (Nassau / solo-strokeplay / solo-stableford = result-utvidelse) — egne PR-er.
- Endring av BBB poeng/ranking eller scoring (ren visning + injeksjon).
- Ny PER HULL på BingoBangoBongoView-leaderboardet.
- Registrering av prestasjoner (`setBingoBangoBongoHole`) — uendret.
