# Forge-kontrakt: Nassau format-bevisst «Hull for hull» + head-to-head (epic #496, PR 7)

**Issue:** [#496](https://github.com/jdlarssen/golf-app/issues/496) — Format-bevisst «Hull for hull» + head-to-head-resultat for solo-format
**Branch:** `claude/dreamy-faraday-e4d745`
**Status:** self-eval complete — all 8 criteria checked with evidence; gates green (build + 40 tests)
**Bump:** MINOR `1.100.0 → 1.101.0` (ny bruker-synlig flate)

## Kontekst

«Hull for hull» (`/games/[id]/leaderboard/holes`) kjørte historisk best-ball `computeLeaderboard` for ALLE format og tegnet et lag-scorekort — feil for solo-format. Epic #496 gir hvert solo-format sin egen per-hull-flate, ett format per PR. **Seks er levert:** Skins, Wolf, Nines, Round Robin, Acey-Deucey, BBB. **Denne PR-en = Nassau (PR 7).**

Eier-beslutninger (denne runden):
- **Scope:** kun Nassau denne kjøringen.
- **Strøm B (H2H):** JA — Nassau kan være nøyaktig 2 spillere (`fitsPlayerCount`: `nassau` = 2–16; egen scoring-test «2 spillere minimum»). Ved 2 → head-to-head-kort i stedet for podium, som Skins/BBB. (En tidligere memory-note sa feilaktig «none 2p» — korrigeres.)
- **Strøm A-framing:** mitt valg — seksjons-tro drill-down (kombinasjon, se under).

## Mønsteret (speil de seks foregående)

- `NassauHolesView.tsx` (server-comp) under `app/games/[id]/leaderboard/holes/` — MÅ være rikere enn `NassauView`s seksjons-sammendrag (vis per-hull netto per spiller, ikke bare seksjons-totaler).
- `buildNassauContext.ts` i `lib/scoring/context/` — trekk den inline `ScoringContext`-map-en ut av `renderNassau` (leaderboard/page.tsx) så `renderNassau` OG `NassauHolesBody` deler én kilde. Speiler `buildSkinsContext` (solo, `teamNumber: null`).
- Branch i `holes/page.tsx` på `game.game_mode === 'nassau'` → `<Suspense><NassauHolesBody/></Suspense>`. Solo-format, ingen ekstra fetch utover scores (speiler `SkinsHolesBody`/`AceyDeuceyHolesBody`).
- Strøm B: speil `renderSkins`-H2H-blokken (leaderboard/page.tsx:2465–2528) i `renderNassau`.

## Scoring-utvidelse (Type A, TDD FØRST — jf. CLAUDE.md «Scoring-logikk»)

`NassauResult` eksponerer i dag kun seksjons-totaler. Den interne `perHoleEffectiveForRanking` finnes men er padded med `UNPLAYED_PADDING = 999` og ueksponert. Utvid resultat-typen additivt:

```ts
export interface NassauHolePlayerCell {
  userId: string;
  gross: number | null;          // null = ikke spilt
  effective: number | null;      // gross − slag (net) ELLER gross (gross-modus); null = ikke spilt (IKKE 999-padding)
}

export interface NassauHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  section: 'front9' | 'back9';    // front = 1–9, back = 10–18 (total er unionen, ikke en egen hull-seksjon)
  perPlayer: NassauHolePlayerCell[];
  bestUserIds: string[];          // lavest effective blant spilte; [] hvis ingen spilte; length > 1 = delt
}

// NassauResult får et nytt felt:
//   holes: NassauHoleRow[];      // alle 18 hull, sortert på holeNumber
```

- Bygg `holes`-arrayet i `compute()` (har allerede `grossByKey`, `ctx.holes`, `ctx.players`, `scoringMode`; gjenbruk `effectiveFor`). Ren additiv endring — ingen endring i `sections`/`players`/eksisterende felt eller atferd.
- `bestUserIds` = userIds med lavest `effective` blant de som spilte hullet (driver per-hull-highlight OG H2H-strip). Tom hvis ingen spilte; lengde > 1 ved delt.

**Designvalg jeg tar selv (ikke til eier):** top-level `holes`-array (ikke per-seksjon) for å unngå triplikat-data; view-en slicer Front/Bak; Total leses fra eksisterende `sections.total18`.

## Strøm A — NassauHolesView (framing: seksjons-tro kombinasjon)

Nassau er fundamentalt TRE kamper i én runde (Front 9 / Back 9 / Total 18). Visningen skal bevare den strukturen — ikke gjemme den i ett flatt scorekort.

1. **Units-sammendrag øverst** — per spiller: units (0–3) + tre seksjons-badges (F9 / B9 / T18) som fylles når `unitBreakdown` er true. Leder i champagne. Kompakt (gjenbruk Podium-badge-idéen, ikke selve Podium).
2. **Blokk «For 9 · hull 1–9»** — per-hull-rader: netto per spiller (fra `holes[].perPlayer.effective`), løpende front-sum per spiller, seksjons-leder uthevet i champagne. Seksjons-header viser vinner (fra `sections.front9.winnerUserIds`) eller «Venter» ved pending/push.
3. **Blokk «Bak 9 · hull 10–18»** — som For 9, hull 10–18.
4. **Blokk «Totalt 18»** — kompakt sammendrag: total netto per spiller + total18-vinner (fra `sections.total18`). INGEN per-hull-repetisjon (det er summen av blokk 2+3).
5. **Reveal-modus:** når `scoreVisibility === 'reveal'` && `gameStatus === 'active'` → skjul netto/ordering akkurat som de andre HolesView-ene. Ferdig spill → full visning.

Designkrav (alle HolesView): `tabular-nums`, forest-and-champagne, vinner-highlight kun i `accent`, gjenbruk `Card`/`Kicker`/`AppShell`/`LeaderboardBackdrop`/`formatRevealName`, mobil-først, tap-targets ≥44px, dark-mode, ingen lag-språk.

## Strøm B — HeadToHeadResult ved nøyaktig 2 spillere (i `renderNassau`)

Når `game.status === 'finished'` && `result.players.length === 2` → `HeadToHeadResult` i stedet for `NassauPodium`. 3+ spillere → `NassauPodium` som før. Behold `NassauView` chromeless under (som Skins).

- `score` = `units` (0–3); `unitLabel = 'seksjoner'`; `formatLabel = \`Nassau · ${scoring === 'net' ? 'Netto' : 'Brutto'}\``.
- `strip` fra `result.holes`: per hull — `bestUserIds.length === 1` → `'a'`/`'b'` (hvilken spiller), `> 1` → `'halved'`, `=== 0` (ikke spilt) → `'unplayed'`.
- `winnerUserId` = rank-1-spilleren (tie iff begge deler rank — `NassauUnitLine.rank`). Skallets verdict antar høyest-vinner; units passer (høyest units vinner).
- `sideA`/`sideB` ordnet stabilt etter `gwp.players`-rekkefølge (ikke rank), så farger følger identitet.
- `subLabel` = seksjons-breakdown, f.eks. «Vant For 9 + Total» (norsk, fra `unitBreakdown`).
- `hangingNote` (valgfri) = push-note hvis en seksjon endte delt, f.eks. «Bak 9 endte delt.»
- Kjør `humanizer:humanizer` på all ny norsk copy før commit.

## Integrasjon

- `buildNassauContext.ts` (ny) — `renderNassau` + `NassauHolesBody` bruker den. Ingen duplisert map.
- `holes/page.tsx` — ny `if (game.game_mode === 'nassau')`-branch + `NassauHolesBody` (speil `SkinsHolesBody`).
- `e2e/games/nassau.spec.ts` — legg til tredje test: `/leaderboard/holes`-ruta redirecter til login (speil wolf.spec.ts).

## Gates

1. **`npm run build`** — grønt (tsc + Next-build; nye typer treffer eksaustive switch/Record-maps over `ModeResult`).
2. **`npx vitest run lib/scoring/modes/nassau.test.ts "app/games/[id]/leaderboard/holes/NassauHolesView.test.tsx" "app/games/[id]/leaderboard/HeadToHeadResult.test.tsx"`** — grønt.
3. **`humanizer:humanizer`** på ny norsk copy før commit.
4. **Version-bump MINOR** (1.100.0 → 1.101.0) + CHANGELOG-oppføring i SAMME commit som feature (commit-msg-hook håndhever).

## Success-kriterier

- [x] **A1 — Scoring:** `NassauResult.holes` eksponerer per-hull per-spiller `effective` (null på uspilt, ikke 999) + `gross` + `section` + `bestUserIds`. TDD rød → grønn. *Evidens: `NassauHoleRow`/`NassauHolePlayerCell` i types.ts:1462–1488; `computeHoleRows` i nassau.ts:165–207; 5 nye Type A cases (`per-hull holes-eksponering #496`) — `npx vitest run nassau.test.ts` = 31 passed (26 eksisterende uendret grønne). Commit 322e0a5.*
- [x] **A2 — Branch:** `/games/[id]/leaderboard/holes` på et Nassau-spill rendrer `NassauHolesView` (units-sammendrag + For 9 + Bak 9 per-hull-blokker + Totalt-sammendrag) — IKKE best-ball-lag-scorekortet. *Evidens: `if (game.game_mode === 'nassau')` i holes/page.tsx:176–182 → `NassauHolesBody` (holes/page.tsx, mirrors SkinsHolesBody); NassauHolesView.test.tsx asserterer tre bolker + per-hull-kort = 1 passed. Commit 953febf.*
- [x] **B1 — H2H:** Ferdig 2-spiller Nassau viser `HeadToHeadResult` (versus + tug-of-war på units + per-hull momentum-strip + dom) i stedet for `NassauPodium`. 3+ beholder `NassauPodium`. *Evidens: `if (result.players.length === 2)` i renderNassau (page.tsx) → HeadToHeadResult (unitLabel «seksjoner», strip fra bestUserIds, push-note); else-grenen beholder NassauPodium. Commit 953febf.*
- [x] **C1 — Delt kontekst:** `buildNassauContext` deles av `renderNassau` + `NassauHolesBody`; ingen duplisert map. *Evidens: lib/scoring/context/buildNassauContext.ts (ny); kalt i renderNassau (page.tsx) + NassauHolesBody (holes/page.tsx). Commits b50e7b4 + 953febf.*
- [x] **C2 — Designkrav:** `isRevealHidden` (scoreVisibility='reveal' && !finished) i NassauHolesView; `tabular-nums` på alle tall; header-lenke `h-11 w-11` (44px); kun theme-tokens (dark mode); H2H momentum-strip bruker `reveal-up` som globals.css undertrykker under prefers-reduced-motion. Hull-kortene har ingen egen animasjon. *Evidens: NassauHolesView.tsx.*
- [x] **C3 — Tester:** én Type C render-test for `NassauHolesView` (asserterer differensiatoren: seksjons-struktur + per-hull-netto + champagne-vinner + Totalt-uten-kort; re-asserter ikke Type A-tall). `HeadToHeadResult` har egen render-test (Nassau mater den bare). e2e auth-gate for `/leaderboard/holes` lagt til. *Evidens: NassauHolesView.test.tsx (1 passed), nassau.spec.ts (3 tester). Commits f245158 + b2ab9d7.*
- [x] **C4 — Ingen regresjon:** kun en ny branch lagt til; `DrilldownBody` urørt; `npm run build` grønt (alle eksaustive switch/Record over ModeResult OK med nytt `holes`-felt — additivt). *Evidens: build-output + diff. Commit 953febf.*
- [x] **D1 — Versjon:** bump MINOR 1.100.0 → 1.101.0 (package.json + lock); CHANGELOG `## 1.101.y — Nassau · hull for hull` åpen, 1.100-serien wrappet i `<details>`. Epic-sjekkliste oppdateres på issue. *Evidens: package.json:version, CHANGELOG.md. Commit 953febf.*

## Utenfor scope

- solo-strokeplay + solo/modified-stableford (PR 8–9) — egne kjøringer.
- Podium for 3+ spillere uendret.
- Nye scoring-tiebreak-cascades.
