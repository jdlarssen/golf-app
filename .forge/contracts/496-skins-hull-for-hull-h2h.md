# Spec: Skins — format-bevisst «Hull for hull» + head-to-head-resultat (PR 1 av epic #496)

**Issue:** [#496](https://github.com/jdlarssen/golf-app/issues/496)
**Scope:** Kun Skins. De andre 8 solo-formatene er egne PR-er i samme epic.
**Bump:** MINOR (ny bruker-synlig flate + nytt resultat-kort).

## Problem

«Hull for hull» på et ferdig spill ([app/games/[id]/page.tsx:734](../../app/games/%5Bid%5D/page.tsx)) lenker til [holes/page.tsx](../../app/games/%5Bid%5D/leaderboard/holes/page.tsx), som **aldri forgrener på `game_mode`** — den kjører `computeLeaderboard` (best-ball) og tegner et lag-scorekort for alle format. For Skins (spilt 1-mot-1) viser den brutto/netto i et lag-grid, men aldri hvem som vant hullet eller om skinen ble dratt videre. Det er leftover fra best-ball-tiden.

I tillegg vises et ferdig 1-mot-1 Skins-spill som et podium med gull/sølv-trinn ([SkinsPodium.tsx](../../app/games/%5Bid%5D/leaderboard/SkinsPodium.tsx)). Et podium er bygget for en folkemengde — en duell fortjener et scoreboard.

`SkinsResult.holes` (`SkinsHoleRow[]`) inneholder allerede all per-hull-data vi trenger; ingen scoring-endring for Skins.

## Research Findings

Internt arbeid — ingen ny ekstern lib. Mønstre verifisert mot faktisk kode (autoritativ for prosjekt-konvensjoner over training data):

- **Feltnavn:** Live `SkinsResult` bruker `carriedPot` (hengende pott), **ikke** `unwonSkins` (det gamle 275-kontrakt-navnet ble renamet). Bruk `carriedPot`. Per-hull: `SkinsHoleRow.perPlayer[] = { userId, gross, effectiveScore, isWinner }`, pluss `outcome ('won'|'carryover'|'pending')`, `winnerUserId`, `atStake`, `carriedIn`, `skinsAwarded`. ([lib/scoring/modes/types.ts](../../lib/scoring/modes/types.ts), `SkinsHoleRow`/`SkinsPlayerLine`/`SkinsResult`).
- **Server vs client split (Next.js 16):** [SkinsView.tsx](../../app/games/%5Bid%5D/leaderboard/SkinsView.tsx) er et server-component (ren render); [SkinsPodium.tsx](../../app/games/%5Bid%5D/leaderboard/SkinsPodium.tsx) er `'use client'` (confetti + sessionStorage). Følg samme split: `SkinsHolesView` = server-component; `HeadToHeadResult` = `'use client'`.
- **Strip-referanse:** [components/hole/HoleStrip.tsx](../../components/hole/HoleStrip.tsx) er en 18-celles navigasjons-strip (tabular-nums, ≥44px hit-areas) — strukturell referanse for momentum-stripen, men momentum-stripen er ikke-interaktiv og farges per spiller.
- **Reduced-motion:** [app/globals.css:523](../../app/globals.css) suppress-er `.reveal-up` under `prefers-reduced-motion`. Gjenbruk `.reveal-up` for strip-cellenes entry → arver suppresjon gratis. Ingen nye keyframes nødvendig.
- **Confetti:** [ConfettiBurst.tsx](../../app/games/%5Bid%5D/leaderboard/ConfettiBurst.tsx) + sessionStorage-nøkkel-mønster (`torny-skins-podium-confetti-seen-${gameId}`) gjenbrukes i H2H-kortet.

## Prior Decisions

Fra [275-skins.md](275-skins.md) + Wolf/Nassau-mønsteret (bæres videre):
- Skins er solo (`teamNumber`/`flightNumber` = null oppover; DB lander 0, mappes til null i `renderSkins`). 2–4 spillere tillatt; 2 fungerer.
- `mode_config.skins_scoring: 'gross' | 'net'` (default net). `result.scoring` styrer om `effectiveScore` er brutto eller netto.
- Reveal-modus skjuler totals/ordering til `status === 'finished'` når `score_visibility === 'reveal'` — H2H-kortet + SkinsHolesView rendres uansett kun for `finished`, så ingen reveal-konflikt, men holes-siden må fortsatt respektere `revealState`/`shouldHideNetto` for aktive spill (samme som i dag).
- Leaderboard-dispatch per `result.kind` i `leaderboard/page.tsx`; egen `<XView>`/`<XPodium>` per modus.

## Design

### Stream A — `SkinsHolesView` bak format-bevisst «Hull for hull»

**Branch:** I `LeaderboardHolesPage` ([holes/page.tsx:82–113](../../app/games/%5Bid%5D/leaderboard/holes/page.tsx)), etter at `game` er hentet fra `getGameWithPlayers(id)`, legg til:

```
if (game.game_mode === 'skins') {
  return <Suspense fallback={<DrilldownSkeleton />}><SkinsHolesBody gameId={id} .../></Suspense>;
}
// ellers: dagens DrilldownBody (uendret) — kun Skins forgrenes i PR 1.
```

`SkinsHolesBody` (async server-component): laster `course_holes` + `scores` (speil hvordan `DrilldownBody` / `renderSkins` henter rå data), bygger `ScoringContext` via en **delt helper** (se refaktor under), kjører `computeModeResult(ctx)`, narrow-er `result.kind === 'skins'`, rendrer `<SkinsHolesView>`.

**`SkinsHolesView`** — én rad per hull (fra `result.holes`), rikere enn SkinsView sin kompakte PER HULL:
- Header per hull: `Hull N · Par P · SI X` + pott-status (`atStake`/`carriedIn`: «1 skin på spill» / «3 skins på spill · 2 dratt med»).
- **Per-spiller-rad** (det SkinsView mangler): hver spillers navn (`formatRevealName`) + score. Når `result.scoring === 'net'`: vis `effectiveScore` prominent, brutto diskret ved siden av. Vinneren (`perPlayer[].isWinner` / `winnerUserId`) uthevet.
- Utfall-badge: «Vant N skins» (champagne) / «Delt → dratt videre» / «Venter på score».
- Hengende pott i bunn når `carriedPot > 0` (samme regel/tekst som SkinsView).
- Respekter reveal-modus + dark mode; `tabular-nums`; gjenbruk `Card`/`Kicker`/`AppShell`/`LeaderboardBackdrop`.

**Delt context-refaktor:** Trekk ut `ScoringContext`-byggingen som i dag ligger inline i `renderSkins` ([leaderboard/page.tsx:2454–2490](../../app/games/%5Bid%5D/leaderboard/page.tsx)) til en ren helper (f.eks. `lib/scoring/context/buildSkinsContext.ts`) som tar `{ players, holes, scores, modeConfig }` → `ScoringContext`. Både `renderSkins` og `SkinsHolesBody` kaller den. Skins-spesifikk i PR 1; generaliseres når andre format lander.

### Stream B — `HeadToHeadResult` (A + B kombinert)

**Trigger:** I `renderSkins` ([leaderboard/page.tsx:2512](../../app/games/%5Bid%5D/leaderboard/page.tsx)), når `status === 'finished'` **og `result.players.length === 2`**, render `<HeadToHeadResult>` i stedet for `<SkinsPodium>`. `SkinsView` (chromeless) blir stående under, uendret. 3+ spillere → dagens `SkinsPodium` (urørt).

`HeadToHeadResult` (`'use client'`, gjenbrukbart skall — Skins er første konsument):

1. **Versus-header** — de to spillerne side om side (`formatRevealName`); vinneren får et diskret merke (crown/⭐) + champagne-highlight. Confetti via `ConfettiBurst` + sessionStorage (gjenbruk mønster).
2. **Tug-of-war-score** — én horisontal bar delt etter forholdet mellom de to tallene (5 mot 3 → 62,5 % / 37,5 %). Hver side i sin spiller-farge (se under). Tallene store, `score-num`, `tabular-nums`.
3. **Momentum-strip** — 18 celler (alltid 18; uspilte hull = svakt tonet), farget per spiller fra `result.holes[].winnerUserId`: **spiller-A-farge** / **spiller-B-farge** / **grå** (carryover/pending/uspilt). Entry via `.reveal-up` (reduced-motion-safe).
4. **Verdict-linje** — naturlig norsk: «{vinner} vant duellen {a}–{b}.» + hengende-pott-linje når `carriedPot > 0`. Uavgjort (lik `totalSkins` og lik `holesWon`): «Uavgjort {n}–{n}», bar 50/50, ingen crown. Kjør `humanizer:humanizer` på copy.

**To nye spiller-farger (brukerens beslutning):** Introduser to nye CSS-tokens (light + dark) — én per spiller. **Forest brukes ikke av noen av spillerne**, og champagne forblir reservert for vinner-highlight, så begge er nye hues. Kandidater (Claude's discretion på endelige verdier): spiller A = petrol/skiferblå, spiller B = terrakotta/leire — kald vs varm, maksimalt distinkte, harmonerer med linen-bg. Definer i `app/globals.css` med dark-mode-varianter. Grå = delt/dratt/uspilt.

## Edge Cases & Guardrails

- **2-spiller uavgjort** (lik `totalSkins` + lik `holesWon` → begge `rank=1`, `tiedWith` satt): «Uavgjort», bar 50/50, ingen crown/champagne, ingen confetti? → behold confetti (det var en runde), men ingen vinner-merke.
- **Alle skins hang** (0–0, alt delt): bar 50/50, verdict «Uavgjort 0–0 — alle hull ble delt», hele potten i hengende-linja.
- **Runde avsluttet tidlig** (< 18 spilte): strip viser spilte hull i farge, resten tonet grått. `carriedPot` fra siste delte/spilte hull vist som hengende.
- **Pending hull** (mangler score): grå i strip; SkinsHolesView viser «Venter på score». (Relevant kun hvis et ferdig-markert spill har hull-gap — sjelden, men håndtér.)
- **null/ukjent spillernavn:** `formatRevealName` faller til «(ukjent spiller)» (eksisterende mønster).
- **Reveal-modus:** holes-siden for aktivt spill følger `forceBrutto`/`shouldHideNetto` som i dag; H2H + SkinsHolesView for finished viser full data.
- **Dark mode + reduced-motion + ≥44px** på alle nye flater.
- **Andre solo-format:** PR 1 forgrener KUN `'skins'` i holes-siden; Wolf/Nassau/… treffer fortsatt dagens lag-grid (uendret) til sine egne PR-er.

## Key Decisions

- **A + B kombinert** for H2H (versus + tug-of-war-bar + momentum-strip + verdict) — brukerens valg.
- **To nye spiller-farger, ikke forest for noen** — brukerens eksplisitte valg. Champagne forblir vinner-only.
- **Behold begge per-hull-flater** — leaderboardets kompakte PER HULL beholdes; den nye siden er den rike. Brukeren revurderer fjerning fra leaderboardet etter levering (ikke i PR 1).
- **`SkinsHolesView` = server-component, `HeadToHeadResult` = client** — speiler SkinsView/SkinsPodium-splitten.
- **`carriedPot` er feltet** (ikke `unwonSkins`).
- **Kun Skins forgrenes** i holes-siden i PR 1.

**Claude's Discretion:**
- Endelige hex-verdier + dark-varianter for de to spiller-fargene (kandidater over).
- Eksakt celle-størrelse/spacing i momentum-stripen (speil HoleStrip-proporsjoner).
- Om brutto vises i parentes ved netto-modus i SkinsHolesView.
- Confetti beholdt ved uavgjort (lener mot ja).
- Eksakt verdict-/pott-copy (kjør humanizer).
- Om en liten ren helper (`deriveHeadToHead(result)` → {a,b,winner,strip[]}) trekkes ut for testbarhet.

## Success Criteria

- [ ] «Hull for hull» på et ferdig Skins-spill viser per-hull hvem som vant, **per-spiller-scorer**, pott/carryover-kjede og hengende pott — ikke lag-scorekortet. (Naviger `/games/<id>/leaderboard/holes` for et Skins-spill.)
- [ ] Et ferdig **2-spiller** Skins-spill viser `HeadToHeadResult` (versus + tug-of-war-bar + 18-celles momentum-strip + verdict) i stedet for `SkinsPodium`; **3+ spillere** viser fortsatt `SkinsPodium`. (Verifiser begge i `renderSkins`.)
- [ ] Momentum-stripen farger hull per spiller med to nye farge-tokens (ikke forest), grå for delt/dratt/uspilt; tonet for uspilte hull.
- [ ] Lag-/best-ball-format viser uendret «Hull for hull» (kun `'skins'` forgrenet).
- [ ] Nye flater respekterer dark mode, `tabular-nums`, ≥44px og `prefers-reduced-motion` (strip animerer ikke under reduced-motion).
- [ ] Norsk copy gjennomgått med `humanizer:humanizer`.
- [ ] CHANGELOG-oppføring + MINOR-bump i samme commit som feature.

## Gates

Etter hver chunk:
- [ ] `npx tsc --noEmit` — 0 nye errors
- [ ] `npx vitest run app/games/\[id\]/leaderboard` — nye Type C render-tester grønne
- [ ] `npx vitest run` — full suite grønn (regresjon)
- [ ] `npm run lint` — 0 errors
- [ ] Playwright: utvid/legg til golden-path-assert for Skins «Hull for hull» + H2H (speil `e2e/games/skins.spec.ts`; assert på `data-testid`, ikke norsk copy).

## Test-disiplin

- Ingen scoring-endring for Skins → **ingen nye Type A** med mindre en ren helper (`deriveHeadToHead`/`buildSkinsContext`) trekkes ut; da én fokusert unit-test for den.
- `SkinsHolesView`: **maks én** Type C render-test fra fixture (per-hull-rader + vinner-highlight + carryover). Ikke re-assert tall som skins.test.ts allerede dekker.
- `HeadToHeadResult`: én Type C render-test (versus + bar + strip + verdict), evt. parametrisert (vinn / uavgjort).

## Files Likely Touched

**Nye:**
- `app/games/[id]/leaderboard/holes/SkinsHolesView.tsx` (+ `.test.tsx`)
- `app/games/[id]/leaderboard/HeadToHeadResult.tsx` (+ `.test.tsx`)
- `lib/scoring/context/buildSkinsContext.ts` (+ evt. `.test.ts`)

**Endrede:**
- `app/games/[id]/leaderboard/holes/page.tsx` — branch på `game.game_mode === 'skins'` + `SkinsHolesBody`
- `app/games/[id]/leaderboard/page.tsx` — `renderSkins` bruker delt context-helper + H2H-trigger ved 2 spillere
- `app/globals.css` — to nye spiller-farge-tokens (light + dark)
- `e2e/games/skins.spec.ts` — golden-path for Hull-for-hull + H2H
- `CHANGELOG.md` + `package.json` — MINOR-bump

## Out of Scope

- **De andre 8 solo-formatene** (Wolf/Nassau/Nines/Acey-Deucey/BBB/Round Robin/Solo strokeplay/Solo stableford) — egne PR-er i epic #496.
- **Fjerning av leaderboardets PER HULL** — vurderes etter levering, ikke nå.
- **Podium-redesign for 3+ spillere** — urørt.
- **H2H for andre format** — skallet bygges gjenbrukbart, men kun Skins wires i PR 1.
- **Scoring-/tiebreak-endringer** — Skins-scoring er uendret.
