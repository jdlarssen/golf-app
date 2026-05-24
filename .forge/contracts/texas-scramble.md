# Spec: Texas scramble som ny game_mode

Issue: [#44](https://github.com/jdlarssen/golf-app/issues/44)
Epic-arv: [#41](https://github.com/jdlarssen/golf-app/issues/41) (multi-mode-arkitekturen)

## Problem

Tørny støtter i dag best ball netto, stableford (solo + par/4BBB), singles matchplay og solo strokeplay netto over en felles mode-router-arkitektur. Tørny mangler et lett-sosial format der ett lag spiller ÉN ball — typisk firma-cup, klubb-events, low-stakes lag-konkurranse. Texas scramble (lagene velger beste slag, alle slår derfra) er den klassiske formen.

Den fundamentale forskjellen fra de fire eksisterende modi-ene: **én score per lag per hull, ikke per spiller**. Tørnys `scores`-tabell er keyed `(game_id, user_id, hole_number)` med UNIQUE-constraint — hver spiller har sin egen rad i dag. Texas må passe inn i dette uten ny tabell, ellers sprenger vi sync/realtime-arkitekturen.

## Research findings

Kilder: USGA Appendix C, NGF (Norges Golfforbund), Sande GK, Golf Monthly, Heppy's Golf Society. Søk gjennomført mai 2026.

- **Texas scramble vs. plain scramble**: «Texas» definert i hovedstrøm-litteraturen ved drive-distribusjons-regel (minimum N drives per spiller). Plain scramble har ingen slik regel. Vi velger format-konvensjonen Texas, **uten** å håndheve drive-regelen i v1 (honor-system per brief).
- **NGF-konvensjon for lag-HCP** (aggregat-prosent av sum av medlemmers spillehandicap):
  - 2-mannslag: 25 %
  - 4-mannslag: 10 %
  - 3-mannslag: 15 % (NGF-konvensjon; ikke i v1-scope)
  - Kilde: [Sande Golfklubb — spilleformer](https://sandegk.no/meny-sande-tirsdagsgolf/spilleformer-i-golf)
- **WHS / USGA-tiered** er det internasjonale alternativet (2-mannslag 35/15 etc.). Mer «matematisk korrekt» men ikke det norske spillere kjenner igjen — kan komme som `mode_config.handicap_formula: 'whs_tiered'` i v2.
- **NGF Texas-scramble teller IKKE til WHS-index** — scramble er ikke handicaptellende. Dette betyr at vi ikke skal rapportere resultatene som handicap-tellende; det er en ren konkurranse-modus.
  - Kilde: [NGF — godkjente handicaptellende spilleformer](https://www.golfforbundet.no/spiller/regler/world-handicap-system/godkjente-handicaptellende-spilleformer)
- **Stroke index allokeres per hull også for net Texas** (lag-HCP fordeles på de hardeste hullene først via vanlig SI-allokering). Tørny har allerede `strokesForHole(handicap, strokeIndex)` som tar et hvilket som helst HCP-tall — fungerer for lag-HCP rett ut av boksen.
- **Tiebreaker-konvensjon**: standard countback-cascade (back 9 → back 6 → back 3 → hull 18). Tørny har dette via `rankTeams` i `lib/scoring/tiebreaker.ts` — gjenbrukes 1:1.

## Prior decisions

Disse stammer fra epic #41 (multi-mode-arkitekturen) og påfølgende mode-implementeringer. Carry forward:

- **Mode-router-pattern** (`lib/scoring/index.ts:24-35`): `computeLeaderboard(ctx)` switcher på `ctx.game.game_mode` og delegerer til en `compute()`-funksjon i `lib/scoring/modes/<mode>.ts`. Hver mode returnerer en grein av `ModeResult`-discriminert union.
- **Mode-spesifikk config i JSONB**: `games.mode_config` (jsonb) med discriminerings-felt `kind`. Validators i `lib/games/gamePayload.ts:517-525` bygger riktig shape per modus.
- **Player-row-validator-pattern**: `modeValidators` Record-mapping fra `GameMode` til validator-funksjon. Hver validator returnerer `ok | errorCode`. Best ball: 8 spillere strict 2-2-2-2. Par-stableford: 2-per-team, fri antall team. Matchplay: nøyaktig 1 per side. Solo: ingen team-tilordning.
- **Team/flight konsistens**: `game_players` har CHECK-constraint `game_players_team_flight_consistency` som krever at `team_number` og `flight_number` enten er begge satt eller begge null. Alle team-baserte validators må sette `flight_number = team_number` (eller separat flight-allokering for best-ball).
- **MODE_LABELS pattern** (`lib/scoring/modes/types.ts:17-22`): Norsk-label per mode, single source of truth. Brukes av `ModeChip` og admin-detail-page.
- **TeamSizeSelector ENABLED_COMBOS** (`app/admin/games/new/TeamSizeSelector.tsx:50-55`): per-mode-set av tillatte team_size-verdier. Texas legger til en ny linje.
- **`hcp_allowance_pct` på games-row**: brukes av best ball som per-spiller-allowance før summering. Konseptuelt forskjellig fra Texas-lag-HCP — Texas legger sitt prosenttall i `mode_config` for å unngå dobbelt semantikk på samme kolonne.
- **Hull-page UI er én komponent** (`HoleClient.tsx`): all per-mode-rendering skjer via boolean-flagg på `gameMode`. Texas vil legge til et tilsvarende flagg.

## Design

### 1. DB-migrasjon: widen game_mode-CHECK

Migrasjon `supabase/migrations/0033_texas_scramble.sql` (eller neste ledige nummer):

```sql
-- 0033_texas_scramble.sql
-- Widen games_mode_check fra 2 til 5 verdier:
--   * eksisterende: best_ball_netto, stableford
--   * latent ufullført (epic #45, #46): singles_matchplay, solo_strokeplay_netto
--   * ny: texas_scramble (issue #44)

alter table public.games
  drop constraint games_mode_check;

alter table public.games
  add constraint games_mode_check
    check (game_mode in (
      'best_ball_netto',
      'stableford',
      'singles_matchplay',
      'solo_strokeplay_netto',
      'texas_scramble'
    ));
```

Ingen backfill — `mode_config` for eksisterende rader er allerede satt riktig.

### 2. TypeScript-typer (`lib/scoring/modes/types.ts`)

- Utvid `GameMode`-union med `'texas_scramble'`.
- Utvid `MODE_LABELS` med `texas_scramble: 'Texas scramble'`.
- Utvid `GameModeConfig`-union med ny variant:

```ts
| {
    kind: 'texas_scramble';
    team_size: 2 | 4;
    teams_count: number;
    /** Prosent av sum av medlemmers spillehandicap = lag-HCP. Default 25 for team_size=2, 10 for team_size=4 (NGF-konvensjon). 0-100. */
    team_handicap_pct: number;
  }
```

- Ny result-grein for `ModeResult`:

```ts
export interface TexasScramblePlayerCell {
  userId: string;
  /** Brukerens individuelle CH som inngår i sum-utregningen — vises i UI som dokumentasjon på hvordan lag-HCP ble beregnet. */
  courseHandicap: number;
  /** True for lag-kaptein (den hvis user_id eier scores-radene). UI viser ikke skille — kun for debugging/admin-innsikt. */
  isCaptain: boolean;
}

export interface TexasScrambleHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** Lag-gross = scoren slått som ett lag på dette hullet. */
  teamGross: number | null;
  /** Lag-extra-strokes på dette hullet (fra lag-HCP-allokering). */
  teamExtraStrokes: number;
  /** Lag-netto = teamGross − teamExtraStrokes. Null hvis teamGross null. */
  teamNet: number | null;
}

export interface TexasScrambleTeamLine {
  teamNumber: number;
  /** Alle medlemmer (inkl. kaptein), sortert deterministisk for stabil rendering. */
  members: TexasScramblePlayerCell[];
  /** Sum av medlemmers courseHandicap (før prosent-reduksjon). */
  combinedCourseHandicap: number;
  /** Den effektive lag-HCP = round(combinedCH × team_handicap_pct / 100). */
  teamHandicap: number;
  holes: TexasScrambleHoleRow[];
  /** Sum av per-hull teamNet for spilte hull. */
  totalNet: number;
  /** Sum av per-hull teamGross for spilte hull. */
  totalGross: number;
  missingHoles: number[];
  rank: number;
  tiedWith: number[];
}

export interface TexasScrambleResult {
  kind: 'texas_scramble';
  teams: TexasScrambleTeamLine[];
}
```

Legg til i `ModeResult`-unionen.

### 3. Scoring-motor (`lib/scoring/modes/texasScramble.ts`)

Følg samme struktur som `bestBallNetto.ts`:

```ts
export function compute(ctx: ScoringContext): TexasScrambleResult {
  // 1. Group players by team_number
  // 2. For each team:
  //    a. captain = team-member with smallest game_players.id
  //       (deterministisk og stable — input via ScoringPlayer-shape utvides
  //        med en stabil sort-key, eller vi sorterer på userId hvis ingen id
  //        er tilgjengelig)
  //    b. combinedCourseHandicap = sum of members' courseHandicap
  //    c. teamHandicap = round(combinedCourseHandicap × team_handicap_pct / 100)
  //    d. For hvert hull:
  //       - teamGross = ctx.scores[captainUserId][hole].gross (én rad per lag)
  //       - teamExtraStrokes = strokesForHole(teamHandicap, hole.strokeIndex)
  //       - teamNet = teamGross === null ? null : teamGross − teamExtraStrokes
  //    e. totalNet = sum teamNet for non-null hull
  //    f. missingHoles = hull med teamGross === null
  // 3. Bygg lag-net-arrays til rankTeams (lavest vinner, ingen invertering)
  // 4. Pad til 18 hull (samme padding-strategi som bestBallNetto)
  // 5. Returner discriminated result
}
```

**Captain-utvelging — viktig design-beslutning**: Tørnys eksisterende `ScoringPlayer`-type har ikke `id` eller `created_at` — bare `userId, teamNumber, flightNumber, courseHandicap`. To alternativer:

- **(a)** Utvid `ScoringPlayer` med en stabil sort-key (eg `addedOrder: number` eller `gamePlayerId: string`) og bruk den. Krever endring i call-sites som bygger `ScoringContext`.
- **(b)** Bruk `min(userId)` lexicographically per team. UUID-er er stabile, men "alphabetic min" har null brukerverdi.

**Anbefaling**: (a). Call-sites er konsentrert (`getGameWithPlayers.ts`, `lib/leaderboard.ts`, et par til). Stabil rekkefølge i UI er en eksisterende kvalitet vi bør beholde — sorter spillerne i `members`-array etter den samme sort-keyen så kaptein alltid står først. Builder skal verifisere call-sites via `git grep "ScoringContext"`.

### 4. Validator (`lib/games/gamePayload.ts`)

Ny `validateTexasScramble` etter mønster fra `validateBestBallNetto` + `validateStablefordTeam`:

- Form-felt: `player_${i}_team` (positivt heltall, ingen øvre grense — som par-stableford).
- `flight_number = team_number` for hver spiller (samme pattern som par-stableford + matchplay; oppfyller CHECK-constraint).
- Form-felt: `texas_team_size` (2 eller 4 — andre verdier → `unsupported_mode_size_combo`).
- Form-felt: `texas_team_handicap_pct` (0-100 heltall — utenfor range → `bad_allowance` (gjenbruker eksisterende error-kode siden semantikken er identisk: prosenttall, 0-100)).
- Validering ved publish:
  - Minst 1 lag (`players.length === 0` → `min_players_for_mode`).
  - Hvert lag må ha **eksakt** `team_size` spillere (`team_balance` ved feil).
  - Hvert team_number må være ≥1 (`bad_team`).
- Draft tolererer partial state (samme som andre modi).
- `mode_config` output:
  ```ts
  { kind: 'texas_scramble', team_size, teams_count: lagAntall, team_handicap_pct }
  ```
- Default i admin-form: `team_handicap_pct` = 25 hvis team_size=2, 10 hvis team_size=4.

Legg til i `modeValidators`-Record på linje ~525.

`parseGameMode` (linje 168-179): legg til `raw === 'texas_scramble'` i discriminator-listen.

### 5. Admin-form (`app/admin/games/new/GameForm.tsx` + `ModeSelector.tsx` + `TeamSizeSelector.tsx`)

- **ModeSelector**: legg til ny tile etter `solo_strokeplay_netto`:
  ```
  mode: 'texas_scramble'
  title: 'Texas scramble'
  description: 'Lagene spiller én ball. Alle slår fra beste slag. Lavest lag-total vinner.'
  ```
- **TeamSizeSelector ENABLED_COMBOS**: ny linje `texas_scramble: new Set<TeamSize>([2, 4])`. Skipper 3-mannslag i v1.
- **GameForm**: legg til narrowing-flagg:
  ```ts
  const isTexas = gameMode === 'texas_scramble';
  ```
  - Reuse `requiresTeams = teamSize >= 2` (allerede true når Texas valgt med team_size=2 eller 4).
  - Reuse lag-grid-UI som best ball / par-stableford (lag-cards med spiller-slots, fri antall lag, ingen upper limit).
  - Ny seksjon: «Lag-handicap» med slider/input for `texas_team_handicap_pct`. Default settes når team_size endres (25 eller 10). Vises kun når `isTexas`.
  - Payload-serialisering: legg til Texas-grein i `orderedPayload`-bygging som forcer `flight_number = team_number` (samme pattern som par-stableford).
- **Skjul hcp_allowance_pct-felt** når `isTexas` (det gjelder ikke; Texas-laget bruker `team_handicap_pct` i `mode_config`). Persistert verdi for `games.hcp_allowance_pct` settes til 100 (no-op) av validatoren.

### 6. Hull-page UI (`app/games/[id]/holes/[holeNumber]/page.tsx` + `HoleClient.tsx`)

Texas er den første modusen som rendrer **én rad per lag** istedenfor per spiller. To valg:

- **(a)** Beholde dagens per-spiller-loop i `HoleClient`, men for Texas-lag-medlemmer vise samme card med samme `playerId = captainUserId`. Resulterer i N identiske cards for et N-spiller-lag — clutter.
- **(b)** Per-mode hull-page-rendering: når `gameMode === 'texas_scramble'`, render én ScoreCard per lag (`playerId = captainUserId`, label = lag-navn + medlems-initialer). Andre medlemmer ser samme card, kan tappe, alle tap skriver til captain-raden.

**Anbefaling**: (b). Render ett kort per lag for Texas. Card-labelen viser «Lag 1 — AN BJ KA» (initialer) istedenfor enkeltspiller-navn. Stepper-event ruter til `writeScore(captainUserId, ...)` uavhengig av hvilken bruker som tapper. `entered_by = myUserId` bevarer audit-trail.

Server-page (`app/games/[id]/holes/[holeNumber]/page.tsx`):
- For Texas: bygg `players`-array med ett oppslag per lag (ikke per spiller). Hver oppføring har `userId = captainUserId`, et nytt felt `teamMemberInitials: string[]` for UI-visning.
- For andre modi: uendret.

Client (`HoleClient.tsx`):
- Nytt narrowing-flagg: `const isTexas = gameMode === 'texas_scramble';`.
- Når `isTexas`, vis card-label som lag-stil («Lag 1 — AN BJ KA»). Når ikke, vis spillernavn som i dag.
- Stepper-event uendret — `onSetScore(playerId, value)` skriver til den `playerId`-en serverpage-en sendte (som for Texas = captainUserId).

Dexie/sync er uendret: `writeScore({gameId, userId: captainUserId, holeNumber, strokes, enteredBy: myUserId})` kjører gjennom eksisterende RPC `upsert_score_if_newer`.

### 7. Leaderboard (`app/games/[id]/leaderboard/page.tsx`)

- Ny `renderTexasScramble()`-funksjon, route i mode-switch (linje ~285):
  ```ts
  if (game.game_mode === 'texas_scramble') return renderTexasScramble({...});
  ```
- Ny view-komponent `TexasScrambleView.tsx` (live/active): lag-rader med totalNet, missingHoles-warning hvis applikabelt, expandable per-hull-detalj.
- Ny `TexasScramblePodium.tsx` (finished): topp-3-lag med confetti-pattern fra eksisterende `SoloStablefordPodium`. **Husk `prefers-reduced-motion`-håndtering** (gjeldende mønster i `globals.css`).
- Narrow på `result.kind === 'texas_scramble'` → `result.teams: TexasScrambleTeamLine[]`.
- For "team rank/medal" UI: bruk samme `rank` + `tiedWith`-logikk som best ball.

### 8. Mail (`lib/mail/gameFinishedNotification.ts`)

- Utvid `GameFinishedNotificationMode` med:
  ```ts
  | {
      kind: 'texas_scramble';
      teamRank: number;
      teamTotalNet: number;
      teamTotalGross: number;
      teamPartnerNames: string[];
      totalTeams: number;
    }
  ```
- Ny `formatTexasScrambleBodyLine` (HTML + text) etter mønster fra `formatStablefordTeamBodyLine`:
  > «Laget endte på **{rank}. plass av {totalTeams} lag** med **{totalNet} slag netto ({totalGross} brutto)**. Du spilte med **{partnerNames join('; ')}**.»
  + celebrationFor(rank) for topp-3.
- Legg til grein i dispatcher (linje ~147-166).
- Tilsvarende: utvid `lib/mail/gameFinishedRecipients.ts` med `buildTexasScrambleRecipients` som bygger per-spiller-recipient-objekter med rank/total/partnernavn.

### 9. Game-home page (`app/games/[id]/page.tsx`)

- `isTexas`-flagget følger mønsteret — vises som «Format: Texas scramble» via `MODE_LABELS`.
- Lag-grid: bruk samme rendering som best ball (lag-cards med medlemsnavn). Ingen Texas-spesifikk omtegning.
- For `requireTeams`-gating: `isTexas` ⇒ true (samme som best ball / par-stableford).

### 10. Norsk copy — humanizer-pass

Følgende strenger må gjennom `humanizer:humanizer`-skillet før commit:

- ModeSelector tile-tekst: «Texas scramble» / «Lagene spiller én ball. Alle slår fra beste slag. Lavest lag-total vinner.»
- Lag-handicap-feltlabel: «Lag-handicap (% av summert HCP)» / «Standard: 25 % for 2-mannslag, 10 % for 4-mannslag.»
- Hull-page card-label-format: «Lag {n} — {INI INI INI}»
- TeamSizeSelector descriptions for 2 og 4 (om de skal skille seg fra eksisterende)
- Mail-body: «Laget endte på X. plass av N lag med Y slag netto…»
- Eventuelle helper-tekster i admin-form

## Edge cases & guardrails

- **Solo spiller i et lag (team med 1 medlem)**: validator avviser via `team_balance` (alle lag må ha eksakt team_size). Draft tolererer.
- **Team_handicap_pct = 0**: gyldig — gir brutto-scramble (ingen extra strokes). Default 25/10, men admin kan sette 0.
- **Team_handicap_pct = 100**: gyldig — gir 100 % av summen som lag-HCP (kombinert HCP rett gjennom). Sjelden meningsfullt, men ingen validation-blokk.
- **Lag uten kaptein** (defensivt — bør ikke kunne skje hvis validator gjør jobben sin): scoring-motoren returnerer tomt resultat for det laget istedenfor å kaste. Speiler matchplay's `emptyShell`-pattern.
- **Et lag hopper over et hull** (alle medlemmer offline, ingen tapper): `teamGross = null`, `missingHoles` inkluderer hullet, leaderboard viser warning på samme måte som best ball.
- **Captain-bruker forlater spillet midtveis** (admin fjerner): kaptein-utvelging er deterministisk per `min(addedOrder)`, så ny kaptein velges automatisk av neste scoring-pass. Eksisterende scores-rader på den gamle kapteinens user_id må migreres til den nye — **dette er ikke i v1-scope**; admin må manuelt re-skrive scoren etter spiller-fjerning. (Issue-spawn-kandidat hvis det blir et problem.)
- **Lag-størrelse endres etter publish**: blokkert av eksisterende `mode_locked_after_publish`-mønster — `game_mode` og `mode_config` er låst etter første publish.
- **Texas + side-tournament**: out of scope per brief; side-tournament-system fortsetter å fungere uavhengig (per-spiller-baserte side-konkurranser), men noen kategorier (longest drive, closest to pin) trenger Texas-spesifikk semantikk — egen issue.
- **realtime**: postgres_changes-sub lytter per game, ikke per user, så alle lag-medlemmer får realtime-oppdatering når kaptein-raden endres. Verifiseres i integration-test.
- **Score visibility 'reveal'**: fungerer som for andre modi — gating er på game-status, ikke per-mode.
- **Peer approval**: hvis `require_peer_approval`, kreves det at en peer (annen spiller på laget) bekrefter scorekortet før status flippes til submitted. For Texas må peeren være på **samme lag** (ikke bare samme flight) — flight-konseptet er løsere for Texas. Builder må verifisere mot eksisterende approval-flow og dokumentere oppførsel.

## Key decisions

- **Netto via NGF aggregat-formel** med admin-konfigurerbar prosent (default 25 % for 2-mannslag, 10 % for 4-mannslag). Stored i `mode_config.team_handicap_pct`, ikke på `games.hcp_allowance_pct` (annerledes semantikk). — *Brukeren foretrekker NGF-konvensjon, men vil kunne justere prosenten som i best ball.*
- **Delt lag-rad i scores-tabellen**: en deterministisk «kaptein» (først-i-rekkefølge per lag) eier scores-radene. Alle lag-medlemmer kan taste; alle tap skriver til kaptein-raden. — *Sosialt, gjenbruker eksisterende score-tabell og sync-arkitektur uten DB-endring.*
- **Lag-størrelse 2 eller 4 i v1**; 3-mannslag bevisst utsatt. — *NGF-prosentene er kun definert for 2 og 4 i Tørnys bruks-kontekst; 3 kommer hvis brukerne ber om det.*
- **Drive-distribusjon ikke håndhevet** (honor-system). — *Per brief; tracking ville krevd ny kolonne på scores og ny per-hull-UI — significant scope for marginal verdi i firma-cup-scenarioet.*
- **DB-migrasjon widener til alle 5 modi** (best_ball_netto, stableford, singles_matchplay, solo_strokeplay_netto, texas_scramble) — fikser den latente bugen for matchplay og solo strokeplay samtidig. — *Verifisert via Supabase MCP at prod-CHECK fortsatt er 2-verdier; matchplay og solo strokeplay har aldri vært brukt så bugen har ikke smelt enda.*

**Claude's Discretion:**
- Captain-utvelging mekanikk: enten utvide `ScoringPlayer` med stabil sort-key, eller bruke `min(userId)` lexicographically. Foretrekk first option for bruker-vennlig UI-ordering; sjekk hvor `ScoringContext` bygges.
- Card-label-tekst på hull-page: «Lag 1 — AN BJ KA» foreslått; alternativ format hvis det kollider med eksisterende layout-bredde.
- TexasScramblePodium-design: gjenbruk pattern fra TeamStablefordPodium med justeringer for visning av lag-medlems-navn.
- Mail-tagline-variasjoner per rank: utnytt `celebrationFor`-pattern fra stableford-mailer.
- Hvorvidt admin-form viser en separat «Forhåndsvis lag-handicap»-utregning når slider endres (nice-to-have).
- Hvorvidt initialene i hull-page-card vises i en fast farge-rekkefølge (per spiller-identitet) eller kun monokromt.

## Success criteria

- [ ] Migrasjon 0033 widener `games_mode_check` til 5 verdier; verifisert via `mcp__supabase__execute_sql` mot prod-DB at constraint-definisjonen inkluderer alle 5.
- [ ] Admin kan opprette et Texas scramble-spill med team_size=2 (2 lag × 2 spillere = 4 spillere total) via admin-UI. Verifisert ved å lage spillet og se det i `/admin/games`-listen med riktig mode-label «Texas scramble».
- [ ] Admin kan opprette et Texas scramble-spill med team_size=4 (2 lag × 4 spillere = 8 spillere total). Verifisert samme vei.
- [ ] Lag-HCP-utregningen følger NGF-formelen: for et 4-mannslag med CH 10+15+20+25 = 70, og default 10 %, blir teamHandicap = 7. Verifisert i `lib/scoring/modes/texasScramble.test.ts`.
- [ ] Når en spiller på et lag tapper steppern, skrives det én rad til `scores`-tabellen med `user_id = captainUserId` og `entered_by = tappende-userId`. Verifisert ved å taste fra to forskjellige team-medlemmer og inspisere DB-radene.
- [ ] Leaderboard rangerer lag etter lavest totalNet, med 5-tier tie-break-cascade. Verifisert med integration-test som setter opp en tie og bekrefter back-9-avgjørelse.
- [ ] Mail-template sender riktig «Laget endte på X. plass…»-tekst når spillet avsluttes. Verifisert via snapshot-test på `formatTexasScrambleBodyLine`.
- [ ] Versjons-bump i `package.json` og oppføring i `CHANGELOG.md` for hver bruker-synlig commit i implementasjonen (håndheves av `.githooks/commit-msg`).

## Gates

Etter hver chunk:
- [ ] `npm run typecheck` passes
- [ ] `npm test -- lib/scoring/modes/texasScramble` passes (når engine er bygget)
- [ ] `npm test -- lib/games/gamePayload` passes (når validator er bygget)
- [ ] `npm test -- lib/mail/gameFinishedNotification` passes (når mail-utvidelse er bygget)
- [ ] `npm test` passes (full unit-test-suite) før PR-merge
- [ ] Playwright smoke-test for å lage Texas-spill via admin-UI og taste et par hull (når UI-laget er bygget)
- [ ] `humanizer:humanizer`-skill kjørt på alle nye norske strenger
- [ ] `.githooks/commit-msg` aksepterer alle commits (versjons-bump + CHANGELOG der bruker-synlig)

## Files likely touched

- `supabase/migrations/0033_texas_scramble.sql` (ny) — widen game_mode-CHECK
- `lib/scoring/modes/types.ts` — utvid `GameMode`, `MODE_LABELS`, `GameModeConfig`, `ModeResult`
- `lib/scoring/index.ts` — legg til case i mode-router-switch
- `lib/scoring/modes/texasScramble.ts` (ny) — `compute(ctx): TexasScrambleResult`
- `lib/scoring/modes/texasScramble.test.ts` (ny) — TDD-tester (lag-HCP-utregning, scoring, tie-break, edge-cases)
- `lib/games/gamePayload.ts` — `validateTexasScramble` + `modeValidators`-mapping + `parseGameMode`-discriminator
- `lib/games/gamePayload.texas_scramble.test.ts` (ny) — validator-tester
- `lib/mail/gameFinishedNotification.ts` — ny mode-variant + body-formatter + dispatcher-grein
- `lib/mail/gameFinishedNotification.test.ts` — ny snapshot-test
- `lib/mail/gameFinishedRecipients.ts` — `buildTexasScrambleRecipients`
- `app/admin/games/new/ModeSelector.tsx` — ny tile
- `app/admin/games/new/TeamSizeSelector.tsx` — `ENABLED_COMBOS` utvidelse
- `app/admin/games/new/GameForm.tsx` — `isTexas` narrowing, lag-handicap-felt, payload-grein
- `app/games/[id]/holes/[holeNumber]/page.tsx` — Texas-shaped `players`-array (én per lag)
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` — `isTexas` narrowing, lag-card-label
- `app/games/[id]/leaderboard/page.tsx` — `renderTexasScramble` + route i mode-switch
- `app/games/[id]/leaderboard/TexasScrambleView.tsx` (ny) — live/active leaderboard-view
- `app/games/[id]/leaderboard/TexasScramblePodium.tsx` (ny) — finished podium med confetti
- `package.json` + `CHANGELOG.md` — versjons-bump + oppføring per bruker-synlig commit

Mulig berørt avhengig av captain-utvelging-valget:
- `lib/games/getGameWithPlayers.ts` — utvide `ScoringContext`-bygging med sort-key
- `lib/leaderboard.ts` — samme

## Out of scope

- **3-mannslag** — utsatt til v1.1 hvis brukerne ber om det. NGF har 15 % for 3-mannslag, men det er én ekstra validator-case og lite testdekning.
- **Drive-distribusjon-håndhevelse** (tracking, rapportering, validering) — honor-system i v1. Egen issue hvis brukerne ber om det.
- **WHS-tiered handicap-formel** (35/15 for 2, 25/20/15/10 for 4) — kommer eventuelt som `mode_config.handicap_formula: 'whs_tiered' | 'ngf_aggregate'` i v2.
- **Side-tournaments koblet til scramble** (longest drive, closest to pin på Texas-runder) — egen diskusjon per brief; eksisterende side-tournament-kategorier fungerer fortsatt for per-spiller-konkurranser, men team-baserte kategorier (`*_team`) trenger Texas-spesifikk semantikk som ikke er løst.
- **Multi-runde-turneringer** (runde 1 best ball, runde 2 Texas) — egen issue, fundamental arkitektur-endring.
- **Andre nye formater** (shamble, alternate shot, foursomes, ambrose) — egne issues per brief.
- **Captain-overføring ved spiller-fjerning** — manuelt i v1; admin må re-skrive scoren etter spiller-fjerning på Texas-lag. Mulig oppgradering: ny RPC `migrate_team_captain_scores(...)` hvis det blir et problem.
- **Texas-spillere som teller til WHS-index** — NGF ekskluderer scramble fra index-beregning, så Tørny gjør det heller ikke.
- **Migrering av eksisterende rader** ved DB-CHECK-widening — ikke nødvendig; eksisterende `mode_config` for de 2 brukte modi-ene er allerede gyldig.
