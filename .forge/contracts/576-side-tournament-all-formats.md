# Spec: Sideturnering på leaderboarden for alle poeng-/podium-formater (#576)

## Problem

«Byneset North 12. juni» (Bingo Bango Bongo, avsluttet) har `side_tournament_enabled = true`, men «Se leaderboard» viser kun BBB-leaderboardet — ingen sideturnerings-fane. Et stableford-spill dagen før viste den som forventet.

Rotårsak: `leaderboard/page.tsx` rendrer `SideTournamentView` kun i to stier — best-ball/generisk-grenen og stableford-familien (`renderStablefordWithSideTournament`). Alle andre format-grener returnerer sin egen view FØR side-turnerings-gatingen og har ingen side-fane: **BBB, wolf, skins, nassau, nines, round robin, acey-deucey, solo strokeplay, texas/scramble-familien, shamble, patsome** (+ matchplay-familien, som håndteres separat — se Out of Scope).

Samtidig er hullet asymmetrisk og forvirrende for brukeren:
- Veiviseren (`AdvancedSettingsSection` + `BasicsSection`) tilbyr sideturnering-bryteren for ALLE formater — gatet kun på `lockSideTournament`, ikke `game_mode`.
- Avslutt-flyten (`avslutt/page.tsx:71`) lar admin kåre LD/CTP-vinnere når `side_tournament_enabled && ld+ctp > 0` — uavhengig av format. Vinnere kåres altså, men vises aldri.
- README lover «a side tournament you can bolt onto any game».

Eier-beslutning (2026-06-13): **Retning A** — vis sideturneringen på poeng-/podium-formatene, gjenbruk eksisterende helper + `LeaderboardTabs` (samme UX som best ball/stableford). Matchplay-familien tas i egen sak.

## Prior Decisions

- **#169 side tournament**: `calculateSideTournament(sideInput)` er ren funksjon; lag-aggregerte kategorier (`*_team`) filtreres bort for lag med `userIds.length < 2`. LD/CTP er manuelt kårede hull-events (format-uavhengige).
- **Side tournament `position` = slot, ikke rank** (`game_side_winners.position` 1/2 = hvilket valgt LD/CTP-hull): ikke rør semantikken.
- **Stableford-side-pattern** (`renderStablefordWithSideTournament`, page.tsx:1344): bygger per-spiller netto fra rå-scores + `course_handicap` + stroke-index (mode-uavhengig), grupperer spillere i lag (team-variant ved `team_size===2`, ellers team-of-1), og pakker `mainContent` + `SideTournamentView` i `AppShell > TopBar > LeaderboardTabs`. **Dette er malen — generaliser den, ikke skriv ny.**
- **Matchplay-familien har bevisst ikke podium** (duell-baseline, ingen reveal-props) — derfor egen sak, ikke tabs-wrapping her.
- **#496 H2H-at-2**: flere formater viser et HeadToHeadResult-duell-kort ved nøyaktig 2 spillere i stedet for podium. Stableford-presedensen (page.tsx:1238): når sideturnering er på, behold podiet (skip H2H) så det passer i tabs.

## Design

### 1. Generaliser side-tournament-wrapperen

Ekstrakt en generisk `renderSideTournamentTabs(opts)` fra `renderStablefordWithSideTournament`. Den eier ALT det formatuavhengige:
- Henter `game_side_winners`.
- Bygger `coursePars` + `courseStrokeIndices` (18-element, hull-nummer-oppslag, fallback til 4 / hull-nr for sparse course).
- Bygger per-spiller `perHoleGross` + `perHoleNetto` fra `rawScoresRows` + `course_handicap` + `strokesForHole(ch, si)`. Filtrerer ut `users == null` og `withdrawn_at != null`.
- Bygger lag-grupper fra en `teamGrouping`-param:
  - `'solo'` → hver kvalifiserte spiller blir et team-of-1: `{ teamId: idx+1, label: firstName(name) ?? name, userIds: [uid] }`.
  - `'byTeamNumber'` → grupper på `team_number` (hopp over 0/null): `{ teamId: t, label: tc('teamLabel',{number:t}), userIds: [...] }`.
- Bygger `nettoBestBallPerHole` = MIN av lagets spilleres netto per hull (team-of-1 → bare spillerens egen netto).
- Kaller `calculateSideTournament`, mapper `sideTeams`, og returnerer `AppShell > TopBar > LeaderboardTabs(mainContent, sideContent=SideTournamentView)`.

`renderStablefordWithSideTournament` blir en tynn caller: regner ut om det er team-variant og delegerer med riktig `teamGrouping`. Ingen duplisert input-bygging.

Signatur (skisse — builder justerer):
```ts
async function renderSideTournamentTabs(opts: {
  gameId: string; game: GameForHole; gwp: {...};
  rawHolesRows: CourseHoleRow[]; rawScoresRows: ScoreRow[];
  backHref: string;
  mainContent: React.ReactNode;
  teamGrouping: 'solo' | 'byTeamNumber';
}): Promise<React.ReactElement>
```

### 2. Wire side-grenen inn i de 11 poeng-/podium-render-funksjonene

For hver: `renderSoloStrokeplay`, `renderTexasScramble` (dekker hele scramble-familien), `renderWolf`, `renderNassau`, `renderSkins`, `renderBingoBangoBongo`, `renderNines`, `renderRoundRobin`, `renderAceyDeucey`, `renderShamble`, `renderPatsome`:

```
const showSide = game.status === 'finished' && game.side_tournament_enabled;
// finished-grenen:
//   - mainContent = <>{Podium chromeless}{View chromeless}</>
//   - ved 2p: når showSide → behold podium (skip H2H-duell-kortet); ellers H2H som før
//   - if (showSide) return renderSideTournamentTabs({ ..., mainContent, teamGrouping })
//   - else return <>{Podium}{View chromeless}</>  (uendret nåværende oppførsel)
```

`teamGrouping` per format:
- **`'solo'`**: solo_strokeplay, wolf, nassau, skins, bingo_bango_bongo, nines, round_robin, acey_deucey
- **`'byTeamNumber'`**: texas/scramble-familien, shamble, patsome

Live/scheduled-grenene er uendret (sideturnering vises kun ved `finished`).

### 3. Chromeless-støtte på podiene som mangler det

Disse podiene rendrer egen `AppShell` og må få en `chromeless?: boolean`-prop (default false) som dropper egen `AppShell`/Header når true — eksakt mønster som `SoloStablefordPodium` (`<Shell chromeless>` + `{!chromeless && <Header/>}`):
`SoloStrokeplayPodium`, `TexasScramblePodium`, `WolfPodium`, `NassauPodium`, `SkinsPodium`, `BingoBangoBongoPodium`, `NinesPodium`, `RoundRobinPodium`, `AceyDeuceyPodium`, `ShamblePodium`.
(`PatsomePodium` har allerede `chromeless`. Alle Views har allerede `chromeless`.)

### 4. Skjul bryteren for matchplay-familien (ikke bryt løftet)

Legg til `isMatchplayFamily(mode: GameMode): boolean` i `lib/scoring` = `singles_matchplay || fourball_matchplay || isAlternateShotMatchplay(mode)`. Gjenbruk den begge steder:
- **Veiviser**: gate sideturnering-fieldset-et i `AdvancedSettingsSection` + `BasicsSection` på `!isMatchplayFamily(state.gameMode)` — fieldset rendres ikke for matchplay.
- **Payload-vakt**: når formatet er matchplay, send aldri `side_tournament_enabled=true` videre (sett false defensivt i state/payload), så et tidligere påslått flagg ikke henger igjen ved format-bytte.

### 5. Egen sak for matchplay-visning

Fil en GitHub-issue (milestone `Backlog — uplanlagt / scale-triggered`, labels `type`/`area:leaderboard`) for å vurdere en LD/CTP-fane på matchplay-duell-kortet senere. Referer #576.

## Edge Cases & Guardrails

- **2 spillere + sideturnering**: behold podium/leaderboard-formen (ikke H2H-duell-kort) så det passer i tabs — mirror page.tsx:1238.
- **Trukne spillere (WD, #386)**: ekskluder `withdrawn_at != null` fra side-input (helperen filtrerer allerede).
- **Sparse course-data**: behold fallback-disiplinen (par→4, SI→hull-nr) så pars aldri forskyves.
- **`side_disabled_categories`**: videreføres uendret til `SideTournamentView` + `calculateSideTournament`.
- **Solo-formater**: team-aggregerte kategorier (`*_team`) faller bort som forventet (team-of-1). Kun individ + LD/CTP vises. Dette er korrekt, ikke en bug.
- **Reveal-modus**: irrelevant her — vi gater på `status==='finished'` der reveal/live konvergerer.
- **Ingen ny GameMode-medlem** legges til → ingen nye exhaustive switch/Record-treff (unngår Vercel-build-fellen).
- **Eksisterende matchplay-spill i prod med flagget på**: fortsatt stille (dekkes av oppfølgings-sak) — utenfor scope.

## Key Decisions

- **Retning A, ikke B** — vis sideturneringen; behold README-løftet. (Eier 2026-06-13)
- **Matchplay = egen sak** — skjul bryteren nå, fil issue for duell-kort-fane. (Eier 2026-06-13)
- **Tabs, ikke seksjon-under** — gjenbruk `LeaderboardTabs` for UX-konsistens med best ball/stableford.
- **Generisk helper-ekstrakt, ikke per-format-kopi** — én `renderSideTournamentTabs`, `teamGrouping`-param skiller solo vs lag.

**Claude's Discretion:**
- Eksakt navn/plassering på den generiske helperen og `isMatchplayFamily`.
- Om payload-vakten ligger i `useGameFormState` (derived) eller i actions — velg det som holder begge create+edit-stiene konsistente.
- Om README-«any game»-formuleringen trenger en liten presisering re matchplay (lav prioritet).

## Success Criteria

- [x] Alle 11 poeng-/podium-render-funksjonene wrapper finished-view i `renderSideTournamentTabs` når `game.status==='finished' && game.side_tournament_enabled`. **Evidens:** `rg -c 'renderSideTournamentTabs' page.tsx` = 14 (1 def + 13 kall = 11 formater + 2 stableford-callere); 13 `teamGrouping`-param på call-sites (solo: solo_strokeplay/Wolf/Nassau/Skins/BBB/Nines/RoundRobin/AceyDeucey; byTeamNumber: Texas/Shamble/Patsome + stableford team).
- [x] `renderStablefordWithSideTournament` → generisk `renderSideTournamentTabs`; stableford-callerne delegerer uten duplisert input-bygging. **Evidens:** `calculateSideTournament` kalles kun på page.tsx:883 (eksisterende best-ball-inline-gren) + page.tsx:1537 (helperen); stableford-callerne på 1205/1300 delegerer med `teamGrouping`.
- [x] De 10 manglende podiene har `chromeless?: boolean` og rendrer uten egen `AppShell` når true. **Evidens:** alle 10 (`SoloStrokeplay/TexasScramble/Wolf/Nassau/Skins/BingoBangoBongo/Nines/RoundRobin/AceyDeucey/Shamble`Podium) treffer `chromeless` + `npx tsc --noEmit` grønn; WolfPodium-diff bekrefter `Shell`-gren + gated Header (speiler `SoloStablefordPodium`).
- [x] `isMatchplayFamily` finnes i `lib/scoring`, og sideturnering-fieldset-et rendres IKKE i veiviseren når `gameMode` er matchplay. **Evidens:** `lib/scoring/modes/types.ts:125` + re-eksport i `index.ts:99`; begge seksjoner gater fieldset-et på `sideTournamentSupported`. Verifisert via hook-test (`sideTournamentSupported=false` for alle 6 matchplay-modi) — guarden testes ved kilden (det `sideTournamentSupported` begge seksjonene + payload deriverer fra), mer robust enn skjult-DOM-assertion i to seksjoner. Leaderboard trenger ingen eksplisitt skip (matchplay-grenene returnerer før side-grenen).
- [x] Payload setter aldri `side_tournament_enabled=true` for matchplay-formater. **Evidens:** effektiv `sideEnabled = sideEnabled && sideTournamentSupported` i `useGameFormState`-return → både wizard-FormDataInputs (`passthrough.side_tournament_enabled = state.sideEnabled`) og GameForm-checkbox (skjult fieldset → ikke i DOM → FormData utelater den) får false; hook-test asserterer effektiv false for matchplay + bevart rå-valg ved retur.
- [x] Oppfølgings-issue opprettet (med milestone). **Evidens:** [#585](https://github.com/jdlarssen/golf-app/issues/585) — «Sideturnering (LD/CTP) på matchplay-duellkortet», labels `enhancement,area:leaderboard`, milestone `Backlog — uplanlagt / scale-triggered`.
- [x] Versjon bumpet + CHANGELOG. **Evidens:** 1.120.0 → 1.121.0 (minor, feature) → 1.121.1 (patch, matchplay-hide nestet under 1.121.y-temaet); `npx tsc --noEmit` grønn; full vitest 3413 passed (269 filer).

## Gates

- [x] `npx tsc --noEmit` passerer (hele appen). **Evidens:** exit 0, ingen output.
- [x] `npx vitest run …leaderboard …games/new lib/scoring` grønn. **Evidens:** leaderboard+scoring 1033 passed; wizard-state+form+scoring 728 passed.
- [x] Co-lokaliserte podium-tester grønne. **Evidens:** Nassau/RoundRobin/Wolf/SoloStrokeplay`Podium.test.tsx` i den grønne subsetten (subagent-verifisert 22 passed; full suite 3413 passed).
- [x] Ny test for matchplay-toggle-skjuling grønn (én fokusert hook-test, ikke duplisert per seksjon). **Evidens:** `useGameFormState.test.ts` describe «sideturnering-gating for matchplay (#576)» — 6 `it.each` + 1 sammensatt = 7 cases grønne.
- [~] Frontend-flate: evaluator verifiserer at side-fanen wires (kode-struktur). **Live prod-sjekk overlates til eier** — fresh worktree mangler `.env.local`, så `npm run build`/Playwright kan ikke kjøre meningsfullt her; tsc + 3413 tester + Vercel PR-preview dekker det.

## Files Likely Touched

- `app/[locale]/games/[id]/leaderboard/page.tsx` — ekstrakt `renderSideTournamentTabs`; wire 11 render-funksjoner; refaktorer stableford-caller.
- `app/[locale]/games/[id]/leaderboard/{SoloStrokeplay,TexasScramble,Wolf,Nassau,Skins,BingoBangoBongo,Nines,RoundRobin,AceyDeucey,Shamble}Podium.tsx` — legg til `chromeless`-prop.
- `lib/scoring/index.ts` (+ evt. ny fil) — `isMatchplayFamily`-helper.
- `app/[locale]/admin/games/new/sections/AdvancedSettingsSection.tsx` + `BasicsSection.tsx` — skjul side-fieldset for matchplay.
- `app/[locale]/admin/games/new/useGameFormState.ts` og/eller `actions.ts` — payload-vakt for matchplay.
- `package.json` + `CHANGELOG.md` — minor bump + oppføring.
- Evt. én ny `*.test.tsx` for matchplay-toggle-skjuling.

## Out of Scope

- **Matchplay-familien** (singles/fourball/foursomes/greensome/chapman/gruesome): ingen side-fane nå — bryteren skjules, og [#585](https://github.com/jdlarssen/golf-app/issues/585) dekker LD/CTP-fane på duell-kortet.
- **Endring av `calculateSideTournament`-logikken** eller `game_side_winners`-semantikken.
- **Live/scheduled visning av sideturnering** (forblir post-finished-reveal).
- **Backfill av eksisterende matchplay-spill** som allerede har flagget på.
- **Nye sidekategorier** eller endring av `SideTournamentView`-layoutet.
