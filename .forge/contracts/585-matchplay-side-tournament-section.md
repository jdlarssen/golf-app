# Spec: Sideturnering (LD/CTP) på matchplay-duellkortet (#585)

## Problem

#576 wiret sideturnering-fanen inn i alle 11 poeng-/podium-formatene, men holdt matchplay-familien (singles, fourball, foursomes/greensome/chapman/gruesome) bevisst utenfor: de viser et **duell-kort**, ikke et podium, så `LeaderboardTabs`-mønsteret passet ikke. For å unngå et brutt løfte skjuler veiviseren i dag sideturnering-bryteren for matchplay (`sideTournamentSupported = !isMatchplayFamily(gameMode)`).

Konsekvens: en admin som kjører en matchplay-cup kan ikke kåre lengste-drive / nærmest-pinnen (LD/CTP) i det hele tatt — bryteren finnes ikke. LD/CTP er format-uavhengige hull-events som allerede kåres manuelt i avslutt-flyten, og scoringen (`calculateSideTournament`) er format-uavhengig. Det eneste som manglet i #576 var en visnings-flate på duell-kortet. Denne saken lukker det.

Eier-beslutning (2026-06-14): vis sideturneringen som en **kompakt seksjon under duell-resultatet**, ikke som en egen fane (duell-kortets minimalistiske uttrykk bevares). Innhold: **opprinnelig visning er minimal** (LD/CTP-vinnerne), men det skal være mulig å **utvide til hele poenggrunnlaget** (den fulle kategori-oppdelingen).

## Prior Decisions

- **#576 side tournament rollout**: generisk data-bygging finnes i `renderSideTournamentTabs(opts)` (page.tsx:1356) — henter `game_side_winners`, bygger `coursePars`/`courseStrokeIndices`, per-spiller netto/brutto, grupperer lag via `teamGrouping: 'solo' | 'byTeamNumber'`, kaller `calculateSideTournament`, og pakker `SideTournamentView` i `LeaderboardTabs`. **Vi gjenbruker data-kjernen, ikke tabs-wrapperen.**
- **Side tournament `position` = slot, ikke rank** (`game_side_winners.position` 1/2 = hvilket valgt LD/CTP-hull): ikke rør semantikken.
- **Matchplay håndhever `team_number ∈ {1, 2}`** (page.tsx:1625, validatoren): de to duell-sidene ER lag 1 og 2. `teamGrouping: 'byTeamNumber'` fungerer direkte — singles → to lag-av-1 (lag-aggregerte `*_team`-kategorier faller bort, som solo), fourball/foursomes → to lag-av-2 (lag-kategorier gjelder).
- **`SideTournamentView`** (SideTournamentView.tsx) er allerede en «minimal-by-default, expand for detalj»-flate: per-lag `<details>` + sammenleggbar `ScoringRulesPanel`. Den ER poenggrunnlag-visningen vi utvider til. Ikke skriv en ny.
- **Matchplay-familien har bevisst ikke podium/reveal-props** — vi legger IKKE til podium her. Kun en seksjon under det eksisterende duell-kortet.

## Research Findings

Ingen ekstern bibliotek-research nødvendig: dette er ren intern mønster-gjenbruk (React server/client-komponenter + eksisterende Tørny-helpers). `SideTournamentView` er en client-komponent (`useTranslations`); matchplay-views er client-komponenter. Server-render-funksjonen bygger seksjonen og sender den som ferdig-rendret `ReactNode` inn i view-en — samme node-passing-mønster som `LeaderboardTabs` bruker for `mainContent`/`sideContent` (page.tsx). Alle props er serialiserbar plain-data. Ingen RSC-grense-felle.

## Design

### 1. Ekstrakt data-kjernen fra `renderSideTournamentTabs`

Trekk ut en ren data-funksjon, f.eks. `computeSideTournament(opts): Promise<SideTournamentData | null>`, som eier ALT det formatuavhengige som i dag ligger inne i `renderSideTournamentTabs`:
- Henter `game_side_winners`.
- Bygger `coursePars` + stroke-indices (18-element, fallback par→4 / SI→hull-nr for sparse course).
- Bygger per-spiller netto/brutto fra `rawScoresRows` + `course_handicap` + stroke-index; filtrerer `users == null` og `withdrawn_at != null`.
- Grupperer lag fra `teamGrouping`.
- Kaller `calculateSideTournament`, bygger `SideTournamentTeam[]`.
- Returnerer `{ teams, result, sideWinners, coursePars, ldCount, ctpCount, disabledCategories }` (alt `SideTournamentView` + den minimale LD/CTP-summary-en trenger).

`renderSideTournamentTabs` blir en tynn caller: `computeSideTournament` → pakk `mainContent` + `<SideTournamentView .../>` i `LeaderboardTabs`. **Score-formatenes oppførsel er uendret** (ren refaktor).

### 2. Ny kompakt seksjon — `MatchplaySideTournamentSection`

En presentational komponent (client) som rendres under duell-resultatet:

- **Alltid synlig, minimal:** en liten overskrift («Sideturnering») + LD/CTP-vinnerne på én/to linjer, f.eks. «Lengste drive (hull 5): Ola · Nærmest pinnen (hull 12): Kari». Bruk `sideWinners` + `ldCount`/`ctpCount` + spiller-navn-oppslag (fornavn). Hvis ingen LD/CTP-slots er konfigurert / ingen vinner kåret, vis i stedet den ledende sidens navn minimalt (eller en nøytral «ingen kåret ennå»-linje).
- **Utvidbar:** en `<details>` (collapsed by default) med summary «Vis poenggrunnlaget» (humanizer-godkjent copy) som folder ut hele `SideTournamentView` (per-side-standings + award-breakdown + rules-panel). Dette er «utvide til poenggrunnlaget».

Tap-target ≥44px på disclosure. `tabular-nums` på poeng. Forest-and-champagne-paletten, font-serif på tall/hierarki.

### 3. Wire de tre matchplay-render-funksjonene

I `renderMatchplay` (page.tsx:1596), `renderFourballMatchplay` (1700), `renderFoursomesMatchplay` (1818):

```
const showSide = game.status === 'finished' && game.side_tournament_enabled;
const sideSection = showSide
  ? <MatchplaySideTournamentSection {...(await computeSideTournament({ ..., teamGrouping: 'byTeamNumber' }))} />
  : null;
// send sideSection som ny prop inn i <MatchplayMatchView/> / <FourballMatchplayView/> / <FoursomesMatchplayView/>
```

`computeSideTournament` kan returnere `null` (ingen kvalifiserte lag e.l.) → seksjonen rendres ikke. Live/scheduled-grenene er uendret (kun `finished`).

### 4. Matchplay-views får en seksjons-slot

`MatchplayMatchView`, `FourballMatchplayView`, `FoursomesMatchplayView` får en ny valgfri prop `sideTournamentSection?: ReactNode` (default `undefined`). Rendres **rett under duell-resultat-kortet** (etter `MatchplayDuelCard`, før hull-grid-seksjonen — eller nederst hvis det leser bedre; builder velger den plasseringen som er minst påtrengende). Når proppen er `undefined` er view-en byte-identisk med i dag.

### 5. Re-aktiver bryteren i veiviseren

Reverser #576-eksklusjonen i `useGameFormState`: `sideTournamentSupported` skal være `true` også for matchplay (dropp `isMatchplayFamily`-gatingen for dette flagget; behold helperen hvis den brukes andre steder, ellers fjern den rene gating-bruken). Konsekvens: `BasicsSection` + `AdvancedSettingsSection` viser sideturnering-fieldset-et igjen for matchplay (de gater allerede på `sideTournamentSupported`), og payload-vakten `sideEnabled && sideTournamentSupported` slutter å tvinge false. Matchplay behandles nå som ethvert annet format i veiviseren (full LD/CTP-antall + kategori-config, siden expand viser hele poenggrunnlaget).

## Edge Cases & Guardrails

- **Singles matchplay (2 spillere, to lag-av-1):** lag-aggregerte `*_team`-kategorier faller bort (korrekt, som solo). Individ + LD/CTP + netto-kategorier per side vises. Ikke en bug.
- **Ingen LD/CTP kåret men flagg på:** minimal-summary må degradere pent (vis ledende side eller nøytral linje, ikke «?» eller tom).
- **Trukne spillere (#386):** `withdrawn_at != null` filtreres bort i data-kjernen (allerede håndtert).
- **Sparse course-data:** behold fallback-disiplinen (par→4, SI→hull-nr) så pars ikke forskyves.
- **`side_disabled_categories`:** videreføres uendret til `SideTournamentView` + `calculateSideTournament`.
- **Eksisterende prod-matchplay-spill med flagget på fra før #576:** vil nå vise seksjonen. Akseptabelt/ønskelig (surfacer data som ble kårede uansett). Ingen backfill nødvendig.
- **Live/reveal:** irrelevant — vi gater på `status === 'finished'`.
- **Ingen ny `GameMode`-medlem** legges til → ingen nye exhaustive switch/Record-treff (unngår Vercel-build-fellen).
- **Cup-koblede side-labels:** fourball/foursomes henter `team_1_name`/`team_2_name` fra `tournaments`. Lag-labels i `SideTournamentTeam` bør speile «Lag 1/2» eller cup-navnene konsistent med duell-kortet (builder gjenbruker eksisterende label-logikk der det er enkelt; ikke et hardt krav).

## Key Decisions

- **Kompakt seksjon under duellen, IKKE egen fane.** (Eier 2026-06-14) — duell-kortet beholder sitt minimalistiske uttrykk; ingen chromeless/tabs-wrapping av matchplay-views.
- **Hybrid innhold: minimal LD/CTP synlig, full poenggrunnlag bak expand.** (Eier 2026-06-14) — gjenbruk `SideTournamentView` på expand.
- **Gjenbruk data-kjernen, ikke kopier.** Ekstrakt `computeSideTournament` fra `renderSideTournamentTabs`; begge stier (tabs for score-formater, seksjon for matchplay) deler beregningen.
- **Re-aktiver full sideturnering-config for matchplay** i veiviseren (siden expand viser hele poenggrunnlaget) — ikke en LD/CTP-bare-undermengde.

**Claude's Discretion:**
- Eksakt navn/plassering på data-helperen (`computeSideTournament` el.l.) og seksjons-komponenten.
- Nøyaktig vertikal plassering av seksjonen i de tre views (under duell-kortet vs. nederst) — velg minst påtrengende.
- Om `isMatchplayFamily`-helperen beholdes (hvis brukt andre steder) eller fjernes (hvis kun gating-bruk).
- Eksakt minimal-summary-copy og fallback-tekst (kjør humanizer på alt norsk).
- Om seksjonen sendes som `ReactNode`-slot (anbefalt, speiler `LeaderboardTabs`) eller som data-props.

## Success Criteria

- [ ] Veiviseren viser sideturnering-bryteren + config for matchplay-formater igjen. **Verifiser:** `sideTournamentSupported` er `true` for alle 6 matchplay-modi i `useGameFormState`; #576-hook-testen (som i dag asserter `false` for matchplay) er oppdatert til å assert `true`. `npx vitest run useGameFormState` grønn.
- [ ] `computeSideTournament` (data-kjerne) er ekstraktert fra `renderSideTournamentTabs`; score-formatenes tabs-oppførsel er uendret. **Verifiser:** `renderSideTournamentTabs` kaller `computeSideTournament`; leaderboard-tester for score-formater grønne (ingen regresjon).
- [ ] De tre matchplay-render-funksjonene bygger og sender en sideturnering-seksjon når `status === 'finished' && side_tournament_enabled`, og `null` ellers. **Verifiser:** kode-ref i page.tsx (renderMatchplay/renderFourballMatchplay/renderFoursomesMatchplay) + `tsc` grønn.
- [ ] `MatchplaySideTournamentSection` viser LD/CTP-vinnerne minimalt by default og hele `SideTournamentView`-poenggrunnlaget bak en `<details>`-disclosure. **Verifiser:** én fokusert render-test (Type C) — minimal-summary inneholder en LD/CTP-vinner; disclosure-elementet finnes; ekspandert innhold rendrer `SideTournamentView`-strukturen. (assert på role/testid/struktur, ikke norsk copy).
- [ ] Matchplay-views er byte-identiske når `sideTournamentSection`-proppen er `undefined`. **Verifiser:** eksisterende co-lokaliserte matchplay-view-tester grønne uten endring av deres assertions.
- [ ] Versjon bumpet (minor — ny bruker-synlig flate) + CHANGELOG-oppføring per `docs/changelog-conventions.md`.

## Gates

- [ ] `npx tsc --noEmit` passerer (hele appen — matchplay-views + page.tsx + wizard rører delte typer).
- [ ] `npx vitest run` scoped til `leaderboard`, `admin/games/new`, `lib/scoring` grønn.
- [ ] Co-lokaliserte matchplay-view-tester + ny `MatchplaySideTournamentSection`-test + oppdatert `useGameFormState`-test grønne.
- [ ] Frontend-flate: kode-struktur verifiseres av evaluator. **Live prod-sjekk (matchplay-spill med sideturnering på, sjekk seksjon + expand på tornygolf.no) overlates til eier** — fresh worktree mangler `.env.local`, så `npm run build`/Playwright kjører ikke meningsfullt; tsc + vitest + Vercel PR-preview dekker resten (mirror #576).

## Files Likely Touched

- `app/[locale]/games/[id]/leaderboard/page.tsx` — ekstrakt `computeSideTournament`; refaktorer `renderSideTournamentTabs` til caller; wire tre matchplay-render-funksjoner.
- `app/[locale]/games/[id]/leaderboard/MatchplaySideTournamentSection.tsx` — ny kompakt seksjon (minimal LD/CTP + expand til `SideTournamentView`).
- `app/[locale]/games/[id]/leaderboard/{MatchplayMatchView,FourballMatchplayView,FoursomesMatchplayView}.tsx` — ny `sideTournamentSection?: ReactNode`-slot under duell-resultatet.
- `app/[locale]/admin/games/new/useGameFormState.ts` — `sideTournamentSupported = true` for matchplay (reverser #576-eksklusjon + payload-vakt).
- `app/[locale]/admin/games/new/useGameFormState.test.ts` — oppdater #576-testen (matchplay → `true`).
- Ny `MatchplaySideTournamentSection.test.tsx`.
- `package.json` + `CHANGELOG.md` — minor bump + oppføring.

## Out of Scope

- **Egen fane / chromeless-wrapping av matchplay-views** (eier valgte seksjon-under).
- **Endring av `calculateSideTournament`-logikken** eller `game_side_winners`-semantikken.
- **Live/scheduled visning** av sideturnering (forblir post-finished).
- **Backfill / migrasjon** av eksisterende matchplay-spill.
- **Nye sidekategorier** eller redesign av `SideTournamentView`-layoutet.
- **Sideturnering på selve hull-for-hull-flatene** for matchplay (kun avsluttet-leaderboard her).
