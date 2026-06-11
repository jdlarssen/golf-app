# Spec: Matchplay-familien — duellkort i leaderboarden som skins netto

**Issue:** [#546](https://github.com/jdlarssen/golf-app/issues/546)
**Branch:** `claude/infallible-lovelace-ecae08`
**Bump:** MINOR (synlig redesign av tre leaderboard-flater + ny stilling-kolonne).

## Problem

Skins netto med 2 spillere viser et duellkort i leaderboarden ([HeadToHeadResult.tsx](../../app/%5Blocale%5D/games/%5Bid%5D/leaderboard/HeadToHeadResult.tsx)): versus-header i spillerfarger, dragkamp-bar, momentum-strip (én rute per hull), tegnforklaring og dom. Matchplay-familien — som per definisjon alltid er 2 sider — viser i stedet et nøkternt status-banner + to side-kort + per-hull-tabell + meta-rad. Eier vil ha duell-utseendet for hele matchplay-familien: «Det er jo 1up, 2up, 3up, 2up, 1up, AS osv. som er det man er interessert i å se.» Design avklart med eier 2026-06-11 (se issue-body).

## Research Findings

Internt arbeid — ingen ny ekstern lib-flate. Mønstre verifisert mot faktisk kode:

- **Visuelt språk å gjenbruke** (fra HeadToHeadResult): `--player-a` (petrol) / `--player-b` (terracotta) CSS-vars med dark-mode-varianter ([globals.css:59–60, 159–160](../../app/globals.css)); strip-celler `h-2.5 w-2.5 rounded-[3px]` med `.reveal-up`-entry (arver `prefers-reduced-motion`-suppresjon gratis); dragkamp-bar `h-3 rounded-full` med prosent-bredder; `score-num text-[40px]`-tall; LegendDot-tegnforklaring; dom i `font-serif text-[15px]`.
- **Alle tre views har identisk struktur** (StatusBanner → SideRow ×2 → HoleGrid → MetaCell-rad): [MatchplayMatchView.tsx](../../app/%5Blocale%5D/games/%5Bid%5D/leaderboard/MatchplayMatchView.tsx), [FourballMatchplayView.tsx](../../app/%5Blocale%5D/games/%5Bid%5D/leaderboard/FourballMatchplayView.tsx), [FoursomesMatchplayView.tsx](../../app/%5Blocale%5D/games/%5Bid%5D/leaderboard/FoursomesMatchplayView.tsx). Alle er `'use client'` med ConfettiBurst + distinkte sessionStorage-prefikser (`torny-matchplay-result-confetti-seen-`, `torny-fourball-...`, `torny-foursomes-...`).
- **Resultat-typene er like nok til ett delt kort:** `SinglesMatchplayResult`/`FourballMatchplayResult`/`FoursomesMatchplayResult` deler `holes[].result: 'side1_wins'|'side2_wins'|'tied'|'unplayed'`, `holesUp`, `holesPlayed`, `holesRemaining`, `result: MatchplayMatchResult | null` (med `formatted`: '3&2'/'2up'/'AS', `decidedAtHole`) ([types.ts:818–932, 1197–1330](../../lib/scoring/modes/types.ts)).
- **Greensome/chapman/gruesome** returnerer `FoursomesMatchplayResult` og rendres av `FoursomesMatchplayView` — arver redesignet uten egne endringer.
- **Kun leaderboard/page.tsx konsumerer viewene** (verifisert med grep) — ingen cup-flater å hensynta.
- **Matchplay-familien har ingen reveal-modus** (bevisst, jf. minne/`205`-kontrakten) — duellkortet kan vises live uten reveal-gate.

## Prior Decisions

- Fra `496-skins-hull-for-hull-h2h.md`: duell-utseendet (versus + bar + strip + dom) er etablert formspråk for 2-siders oppgjør; `HeadToHeadResult` er skins/solo-formatenes konsument-flate. **Bæres videre som visuelt språk, men matchplay får sitt eget kort** — `HeadToHeadResult` røres ikke (dommen der er score-basert «5–3», kun finished; matchplay trenger «3&2» + live).
- Matchplay-familien baseliner hverandre, ikke stroke-formatene (etablert minne) — derfor endres alle tre views i samme PR.

## Design

### 1. Nytt delt duellkort: `MatchplayDuelCard` (`'use client'`)

Erstatter seksjon 1 (status-banner) + seksjon 2 (side-kort) i alle tre views. Viewene beholder eget ytre chrome (Header med game-name-kicker, h1 «Matchplay»/«Fourball»/«Foursomes» + undertittel, PER HULL-seksjon, PullQuote).

Kortets anatomi (samme rekkefølge som HeadToHeadResult):

- **Versus-header:** to paneler. Navn per side (singles: `formatRevealName`-navn; fourball/foursomes: `side1Label`/`side2Label` med spillernavn + HCP som sub-linjer). Store tall (`score-num text-[40px]`) = **hull vunnet** per side, farget `--player-a`/`--player-b`. Unit-label «HULL VUNNET». ★ ved vinnersiden når avgjort.
- **Dragkamp-bar:** andel av vunne hull (50/50 ved 0–0). Samme formel som H2H med lo=0.
- **Momentum-strip:** én rute per hull i `result.holes`-rekkefølge: side 1 vant → `--player-a`, side 2 vant → `--player-b`, delt → grå, uspilt → tom med border. `.reveal-up`-stagger som i H2H.
- **Tegnforklaring:** side-navn/labels + «delt».
- **Dom (matchplay-terminologi, gjenbruk eksisterende copy):**
  - Avgjort vinner: «{navn/lag} vant {formatted}» + sub-linje «Avgjort på hull {decidedAtHole}» (+ «Side {1|2}» for singles). Champagne-aksent på kortet + Medallion + konfetti (én gang per sesjon, per-view storage-nøkler beholdes).
  - Uavgjort etter 18: «Matchen endte AS» + «All square etter 18 hull».
  - Live, 0 hull: «Matchen er ikke startet ennå» + «Tabellen våkner når første hull er spilt.»
  - Live, AS: «Alt likt etter {holesPlayed} hull».
  - Live, leder: «{navn/lag} leder {N} up etter {holesPlayed} hull».

Props-skisse: `{ gameId, storagePrefix, sideA: { label, sublines?: string[] }, sideB, holes: { result }[], holesUp, holesPlayed, matchResult: MatchplayMatchResult | null, decidedSideLine?: string }`. Kortet regner selv hull-vunnet-tall og strip fra `holes`.

### 2. Per-hull-tabellen: ny kolonne «Stilling»

Beholdes i alle tre views (slag/netto-drilldown), men får løpende match-status etter hvert spilte hull: «1up» farget mot lederens side-farge (`--player-a`/`--player-b`), «AS» muted, «—» for uspilte hull. Kolonnen legges etter «Vinner».

Ren helper (TDD, Type A-tester): gitt `MatchplayHoleResult[]` i hull-rekkefølge → løpende `holesUp`-verdi etter hvert hull (`null` for uspilt hull — uspilte hull endrer ikke stillingen, også når de ligger midt i sekvensen). Plasseres i `lib/scoring/modes/` (lib/scoring-disiplin: test først).

### 3. Meta-raden fjernes

«Spilt / Igjen / Status» dekkes nå av duellkortet (dom + hull-vunnet-tall) og Stilling-kolonnen. MetaCell-subkomponentene slettes fra viewene.

### Testid-strategi (minimer test-churn)

Behold eksisterende `data-testid`-er der semantikken overlever: `matchplay-status-banner`/`fourball-status-banner`/`foursomes-status-banner` på duellkort-wrapperen, `*-banner-decided`/`*-banner-live`/`*-banner-tied` på dom-regionen i kortet. `*-side-1`/`*-side-2` flyttes til versus-panelene. Eksisterende view-tester oppdateres kun der struktur faktisk endres (side-kort, meta-rad); banner-tekst-assertions skal stort sett overleve.

## Edge Cases & Guardrails

- **9-hulls baner:** strip = `holes.length` ruter (eksisterende tester dekker 9-hulls grid).
- **Hull spilt i ulik rekkefølge:** uspilte hull midt i sekvensen viser «—» i Stilling og tom strip-rute; løpende status hopper over dem (matcher scoring-lagets `holesUp` som kun teller spilte hull).
- **0–0 og tom match:** dragkamp-bar 50/50; «Matchen kan ikke vises»-fallbacken for `holes.length === 0` beholdes uendret.
- **Ukjent spillerinfo:** «(ukjent spiller)»-fallback beholdes; kortet må tåle manglende `playerInfo`-oppslag.
- **Lange lagnavn:** truncate/break-words i versus-paneler (samme som H2H `break-words`).
- **Dark mode:** kun CSS-vars brukes — ingen hardkodede hex.
- **Reduced motion:** all entry-animasjon via `.reveal-up` (suppresjon arves).
- **Konfetti-regresjon:** fyrer kun ved avgjort vinner (ikke AS, ikke live), én gang per sesjon — eksisterende tester for dette skal bestå uendret.
- **Ingen scoring-endring:** `lib/scoring/modes/{singles,fourball,foursomes}Matchplay.ts` røres ikke; ny helper er additiv med egne tester.
- **page.tsx røres ikke** — endringen er innkapslet i viewene.

## Key Decisions

- Eget matchplay-kort fremfor gjenbruk av `HeadToHeadResult`: dommen må lese «3&2», kortet må vises live, og lagnavn passer ikke HeadToHeadSide-modellen (userId/nickname). Forkastet alternativ dokumentert i issue.
- Store tall = hull vunnet (eneste ærlige per-side-tall i matchplay; den kanoniske dommen «3&2» vises i dom-feltet).
- Kortet vises både live og ferdig (skins-duellen er kun finished) — match-status ER live-historien.
- Stilling-kolonnen kommer i tillegg til Vinner-kolonnen (begge er smale; 6 kolonner holder på 380px med text-[12.5px]).

**Claude's Discretion:**
- Filnavn/plassering for helper + eksakt props-API for kortet.
- Kompaktering av tabellkolonner hvis mobil-bredde-sjekk viser wrapping (f.eks. slå sammen Vinner+Stilling).
- Undertittel-justering i viewenes h1-blokk (f.eks. droppe «Hull-for-hull» hvis det dobler med kortet).
- Om `statusLabel`-duplikatet ×3 konsolideres i samme helper-modul.

## Success Criteria

- [x] Alle tre matchplay-views rendrer duellkort (versus-header med hull-vunnet-tall i side-farger, dragkamp-bar, momentum-strip, tegnforklaring, dom) i stedet for status-banner + side-kort. **Evidens:** `MatchplayDuelCard.tsx` (ny), konsumert i alle tre views (commit 65f5768 + 31991cf); 67 testfiler/991 tester grønne i leaderboard+scoring-scope; `*-duel-bar`/`*-duel-strip`/`*-side-1/2`-testids rendres (view-tester består).
- [x] Dommen bruker matchplay-terminologi i alle fem tilstander. **Evidens:** eksisterende banner-tester består uendret — «3&2» (mat-em), «2up» (18 hull), «Matchen endte AS», «leder 2 up etter», «Matchen er ikke startet ennå» (MatchplayMatchView.test.tsx 22/22, FourballMatchplayView.test.tsx, FoursomesMatchplayView.test.tsx).
- [x] Per-hull-tabellen har Stilling-kolonne; uspilte hull viser «—». **Evidens:** `matchplayRunningStatus.test.ts` 9/9 (inkl. eierens 1up→2up→3up→2up→1up→AS-sekvens + unplayed-midt-i); render-assertions i singles + fourball test-filer.
- [x] Meta-raden fjernet fra alle tre views. **Evidens:** `grep MetaCell|matchplay-meta|fourball-meta|foursomes-meta` → 0 treff i viewene; `queryByTestId(...-meta)`-assertions i tester.
- [x] Konfetti-oppførsel uendret. **Evidens:** alle fire konfetti-tester i MatchplayMatchView.test.tsx består uendret (fyrer ved vinner, ikke live, ikke AS, distinkt nøkkel, hopper over ved sett).
- [x] Greensome/chapman/gruesome får samme visning automatisk. **Evidens:** grep viser at kun `leaderboard/page.tsx` konsumerer FoursomesMatchplayView; alle fire foursomes-kinds returnerer `FoursomesMatchplayResult` (types.ts:400/433); ingen scoring/page-endring i diff.
- [ ] Dark mode + 380px mobilbredde uten horisontal overflow — **delvis:** kun CSS-vars med dark-varianter brukt; strip/bar/versus-header er klone av prod-verifisert HeadToHeadResult. Fysisk browser-sjekk er blokkert lokalt (ingen `.env.local`/service-key i worktree) → tas på Vercel-preview før merge.

## Gates

- [x] `npx tsc --noEmit` passes (etter `npm install` i worktree — next-intl manglet)
- [x] `npx vitest run app/\[locale\]/games/\[id\]/leaderboard lib/scoring` — 67 filer / 991 tester grønne
- [x] `npx vitest run` (full suite) — 255 filer / 3097 tester grønne
- [x] `npm run build` — grønn, PPR-rutetabell intakt
- [x] Humanizer-skill kjørt: UI-strenger OK; 3 CHANGELOG-fikser (særskriving «Lagmatchene»/«duellvisning», «snakker matchplay»-kalk, em-dash-hale) i commit eb3479b
- [x] MINOR-bump 1.110.0 + PATCH 1.110.1, CHANGELOG-serie åpnet + 1.109 lukket per konvensjon — i samme commits som endringene

## Files Likely Touched

- `app/[locale]/games/[id]/leaderboard/MatchplayDuelCard.tsx` — NY: delt duellkort
- `lib/scoring/modes/matchplayRunningStatus.ts` (+ `.test.ts`) — NY: løpende stilling-helper (TDD)
- `app/[locale]/games/[id]/leaderboard/MatchplayMatchView.tsx` (+ test) — duellkort inn, banner/sider/meta ut, Stilling-kolonne
- `app/[locale]/games/[id]/leaderboard/FourballMatchplayView.tsx` (+ test) — samme
- `app/[locale]/games/[id]/leaderboard/FoursomesMatchplayView.tsx` (+ test) — samme
- `package.json` / `package-lock.json` / `CHANGELOG.md` — MINOR-bump

## Out of Scope

- `HeadToHeadResult.tsx` og alle skins/solo-format-flater — røres ikke.
- «Hull for hull»-undersiden (`leaderboard/holes/`) for matchplay — leaderboarden ER hull-for-hull her.
- Reveal-modus for matchplay — finnes ikke i dag, innføres ikke.
- Cup-leaderboard-flater — konsumerer ikke disse viewene.
- Scoring-endringer (`singlesMatchplay.ts` m.fl.) — ingen.
