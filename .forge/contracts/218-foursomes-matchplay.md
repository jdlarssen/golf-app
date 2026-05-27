# Spec: Foursomes matchplay — 2v2 alternate shot (Cup-eligible)

**Issue:** [#218](https://github.com/jdlarssen/golf-app/issues/218)
**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270) (Format-katalog) + [#47](https://github.com/jdlarssen/golf-app/issues/47) (Ryder Cup)
**Type:** MINOR (ny bruker-synlig feature)
**Anker-doc:** [.forge/contracts/47-phase-3-foursomes-anchor.md](47-phase-3-foursomes-anchor.md)
**Precedent:** [.forge/contracts/217-fourball-matchplay.md](217-fourball-matchplay.md) (most similar shape — gjenbruk så mye som mulig)

## Problem

Tørny har Ryder Cup-grunnmuren ([fase 1](47-ryder-cup-phase-1-foundation.md)) og fourball matchplay ([fase 2](217-fourball-matchplay.md)). Cup-en mangler fortsatt alternate-shot-familien — den tradisjonelle Ryder Cup-formen som spilles morgen-økten. **Foursomes matchplay** er 2v2 alternate-shot: én ball per lag, partnerne alternerer slag. Lag-score per hull, sammenlikn som matchplay (3&2, 2up, AS).

Foursomes er arkitektonisk det mest krevende format-tillegget hittil: `scores`-tabellen antar én score per bruker per hull, men foursomes har én score per LAG per hull. Vi må bestemme storage-pattern her én gang, fordi mønstret gjenbrukes for [#289 Greensome](https://github.com/jdlarssen/golf-app/issues/289), [#290 Chapman/Pinehurst](https://github.com/jdlarssen/golf-app/issues/290), og [#291 Gruesome](https://github.com/jdlarssen/golf-app/issues/291) — alle 2v2 alternate-shot-varianter.

Heldigvis har Tørny allerede ett format med samme storage-shape: **Texas scramble** (én ball per lag, 4 spillere). Foursomes adopterer Texas' captain-pattern uten skjema-endring og legger til matchplay-overlay fra singles/fourball. Den eneste reelle nye logikken er foursomes-allowance (WHS-diff-formelen) og en mini-feature for tee-starter-valg som flighten setter selv før hull 1.

## Research Findings

Verifisert via scout mot da-eksisterende main-branch (etter F2 #272 merged):

- **Texas captain-pattern er stabilt etablert** ([lib/games/teamCaptain.ts:14](lib/games/teamCaptain.ts:14)): `pickTeamCaptain(userIds)` returnerer lex-min userId. Brukt av Texas-scoring ([lib/scoring/modes/texasScramble.ts](lib/scoring/modes/texasScramble.ts:21)) og scorekort-layout ([lib/games/scorecardLayout.ts:114](lib/games/scorecardLayout.ts:114)). Foursomes gjenbruker uendret.
- **Layout B med 4 kolonner finnes allerede for fourball** ([lib/games/scorecardLayout.ts:155-175](lib/games/scorecardLayout.ts:155)): me + partner + 2 motstandere, kolonne-rekkefølge "team 1 → team 2". Vi adapter med 2 kolonner i stedet (én per side, render-er kaptein-userId som score-input-target).
- **Singles matchplay-helpers er allerede genericized**: `classifyMatchplayHole(side1Net, side2Net)` ([lib/scoring/modes/singlesMatchplay.ts:125-133](lib/scoring/modes/singlesMatchplay.ts:125)) og `computeMatchResult(holesUp, holesPlayed, holesRemaining)` ([lib/scoring/modes/singlesMatchplay.ts:69-112](lib/scoring/modes/singlesMatchplay.ts:69)) tar ren matchplay-data. Foursomes mater dem med team-net per hull.
- **`isValidActiveGameMode` er wired** ([app/admin/games/new/actions.ts:46](app/admin/games/new/actions.ts:46)): server-action sjekker `formats`-tabellen før insert. Når vi seeder foursomes_matchplay-raden, blir game_mode automatisk gyldig — ingen wizard-side-effekter.
- **`getCupEligibleFormats` driver cup-create-form** ([lib/formats/getFormatsForIntent.ts](lib/formats/getFormatsForIntent.ts)): returnerer alle aktive formats med `is_cup_eligible=true`. Foursomes med `is_cup_eligible=true` dukker dermed opp automatisk i cup-create's allowed-formats multi-select.
- **`tournaments.fourball_allowance_pct`-mønstret** ([supabase/migrations/0045_fourball_matchplay.sql:32](supabase/migrations/0045_fourball_matchplay.sql:32)): cup-level allowance-default. Per-match wizarden pre-fyller fra cup. Foursomes følger samme pattern, men default 50 i stedet for 85 (WHS-standard for foursomes).
- **`AllowanceField` er generalisert** ([components/admin/AllowanceField.tsx:38-78](components/admin/AllowanceField.tsx)): netto/brutto-toggle med konfigurerbart `fieldName`. Gjenbrukes for foursomes med eget felt-navn.
- **Mode_config-shape eksisterer som diskriminert union** ([lib/scoring/modes/types.ts:42-74](lib/scoring/modes/types.ts:42)): ny variant `{ kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: number }` følger samme mønster.
- **Cup-snapshot generaliseres allerede over 1- og 2-spiller-sider** ([lib/cup/getCupSnapshot.ts:213](lib/cup/getCupSnapshot.ts:213)): `side1Players = gPlayers.filter(p => p.team_number === 1)` er allerede en array, ikke `.find()`. Foursomes-grenen legger til en ny case med samme 2-spiller-shape som fourball.
- **`games_mode_check` ble droppet i F1** ([supabase/migrations/0047_formats_and_intent_mapping.sql:90](supabase/migrations/0047_formats_and_intent_mapping.sql:90)). Foursomes-migrasjonen trenger IKKE ALTER på games-tabellen for game_mode-verdi-utvidelse.

## Prior Decisions

- **Storage pattern A (Texas-style captain-eier-scores)** — fra anker-doc-en og epic #218. Ingen skjema-endring på `scores`-tabellen. Gjelder hele alternate-shot-familien (#289, #290, #291). Foursomes implementerer mønstret én gang, resten gjenbruker.
- **Cup-eligible-mønster** — fra fourball-kontrakten ([.forge/contracts/217-fourball-matchplay.md](217-fourball-matchplay.md)): nye matchplay-formats er primært cup-features, ikke generelle wizard-formats. Foursomes seedes med `is_cup_eligible=true` og INGEN `format_intent_mapping`-rader (samme som fourball).
- **Mode-key-konvensjon** — fra heads-up i issue #218: bruk `foursomes_matchplay` (ingen `_netto`-suffix selv om netto er default). Konsistent med #266-opprydningen.
- **Allowance-storage** — fra fourball-kontrakten: cup-level default på `tournaments`-tabellen, pre-fyller wizard, lagres per-match i `mode_config.allowance_pct`. Foursomes følger identisk pattern (egen kolonne).
- **Layout B-mønster** — fra F2-wizarden og fourball-scorekortet: head-to-head matchplay-scorekort er etablert UX. Foursomes adopterer dette.

Fra **denne diskusjonsrunden**:

- **Scorekort = Layout B head-to-head (to kolonner, én per side)** — bekreftet av brukeren. Gir match-følelse på scorekortet selv om hver side bare har én ball.
- **Tee-starter velges av flighten rett før hull 1** — bekreftet av brukeren. Ikke admin-pre-set, ikke deterministisk. Hver side velger sin egen tee-starter via banner på hull 1; valget persisterer for resten av runden og driver et hint per hull («Per slår ut»).

## Design

### 1. Datamodell

Ny migrasjon `supabase/migrations/0048_foursomes_matchplay.sql`:

```sql
-- 0048_foursomes_matchplay.sql
-- Foursomes matchplay (#218) — 2v2 alternate shot, første i alternate-shot-
-- familien (#289 Greensome, #290 Chapman, #291 Gruesome adopterer mønstret).
--
-- Storage: Texas-pattern (kaptein-userId eier scores-radene), så ingen
-- skjema-endring på scores-tabellen. Cup-level allowance default 50 (WHS).
-- Per-side tee-starter-felt på games for flightens runtime-valg på hull 1.

-- 1. Seed foursomes_matchplay i formats-tabellen (cup-eligible, ingen intent-mapping
--    siden formatet kun er tilgjengelig via cup-create-flow, samme som fourball)
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible) values
  ('foursomes_matchplay', 'Foursomes matchplay', 'foursomes_matchplay',
   '2v2 alternate shot. Én ball per lag, spillerne alternerer slag.',
   '@/lib/scoring/modes/foursomesMatchplay', true, true);

-- 2. Cup-level allowance default for foursomes-matches i en cup
alter table public.tournaments
  add column foursomes_allowance_pct smallint not null default 50
    check (foursomes_allowance_pct between 0 and 100);

comment on column public.tournaments.foursomes_allowance_pct is
  'Handicap-allowance for foursomes-matches i cupen. 0 = brutto (gross-only), '
  '1..100 = netto (WHS-standard 50 % av differansen mellom lagenes summerte HCP). '
  'Pre-fyller wizard ved foursomes-match-create; admin kan overstyre per match.';

-- 3. Per-side tee-starter — settes av flighten via scorekort-banner på hull 1.
--    NULL = ikke valgt ennå (banner vises). Satt = hint per hull («X slår ut»).
--    Bare meningsfull for game_mode='foursomes_matchplay' og resten av
--    alternate-shot-familien som lander senere — andre modi ignorerer feltene.
alter table public.games
  add column foursomes_side1_tee_starter_user_id uuid
    references public.users(id) on delete set null,
  add column foursomes_side2_tee_starter_user_id uuid
    references public.users(id) on delete set null;

comment on column public.games.foursomes_side1_tee_starter_user_id is
  'For game_mode=foursomes_matchplay: hvem på side 1 teer ut på odd-hull. '
  'Settes av flighten via scorekort-banner på hull 1. NULL = ikke valgt ennå.';

comment on column public.games.foursomes_side2_tee_starter_user_id is
  'For game_mode=foursomes_matchplay: hvem på side 2 teer ut på odd-hull. '
  'NULL = ikke valgt ennå. Driver kun et UI-hint, ingen validering av faktiske slag.';
```

**Begrunnelse:**

- **Egen `tournaments.foursomes_allowance_pct`-kolonne, default 50:** WHS-standard for foursomes matchplay er 50 % av lagenes HCP-differanse. Fourball bruker 85 % per-spiller — fundamentalt ulik formel. Holder kolonnene separate.
- **Tee-starter på `games`, ikke `game_players`:** to nullable uuid-kolonner er enklere enn ny boolean på game_players + RLS-bekymringer. Settes via dedikert server-action (kort kode-path), leses av scorekort-rendrer.
- **`ON DELETE SET NULL`:** hvis en spiller fjernes fra DB (sjelden i prod), nuller vi feltet i stedet for å blokkere sletting.
- **Ingen ALTER på games_mode_check:** F1 (#271, migrasjon 0047) droppet constraint-en. `isValidActiveGameMode` ([lib/formats/validateGameMode.ts:11](lib/formats/validateGameMode.ts:11)) er allerede wired i create-actions ([app/admin/games/new/actions.ts:46](app/admin/games/new/actions.ts:46)).

### 2. Scoring-modul

Ny `lib/scoring/modes/foursomesMatchplay.ts`. Algoritme:

```ts
// Pseudo-code skissert — full implementasjon i build-fasen.
export function compute(ctx: ScoringContext): FoursomesMatchplayResult {
  // 1. Filtrer spillere per side. Krev 2-2-fordeling, ellers empty-shell.
  const side1Players = ctx.players.filter(p => p.teamNumber === 1);
  const side2Players = ctx.players.filter(p => p.teamNumber === 2);
  if (side1Players.length !== 2 || side2Players.length !== 2) return emptyShell();

  // 2. Velg kaptein per side (lex-min userId — gjenbruk pickTeamCaptain).
  const side1CaptainId = pickTeamCaptain(side1Players.map(p => p.userId));
  const side2CaptainId = pickTeamCaptain(side2Players.map(p => p.userId));

  // 3. Beregn lag-HCP per side (sum av partnerne).
  const side1CombinedCH = sum(side1Players.map(p => p.courseHandicap));
  const side2CombinedCH = sum(side2Players.map(p => p.courseHandicap));

  // 4. WHS-formel: high team får (diff × allowance_pct/100) som lag-strokes.
  //    Low team får 0 strokes. Allokering via SI på det effektive diff-HCP-et.
  const allowancePct = readAllowancePct(ctx);  // 50 default
  const teamDiff = Math.abs(side1CombinedCH - side2CombinedCH);
  const highSideExtraHCP = Math.round((teamDiff * allowancePct) / 100);
  const highSideNumber: 1 | 2 = side1CombinedCH > side2CombinedCH ? 1 : 2;

  // 5. Per hull: hent kaptein-eide team-gross, beregn extra-strokes for high
  //    side via strokesForHole(highSideExtraHCP, SI), netto = gross - extra.
  for (const hole of holesSorted) {
    const side1Gross = grossByKey.get(`${side1CaptainId}#${hole.number}`);
    const side2Gross = grossByKey.get(`${side2CaptainId}#${hole.number}`);
    const side1Extra = highSideNumber === 1 ? strokesForHole(highSideExtraHCP, hole.strokeIndex) : 0;
    const side2Extra = highSideNumber === 2 ? strokesForHole(highSideExtraHCP, hole.strokeIndex) : 0;
    const side1Net = side1Gross === null ? null : side1Gross - side1Extra;
    const side2Net = side2Gross === null ? null : side2Gross - side2Extra;
    const result = classifyMatchplayHole(side1Net, side2Net);  // gjenbrukt
    // ...akkumulér holesUp, holesPlayed
  }

  // 6. Match-resultat via gjenbrukt computeMatchResult.
  const matchResult = computeMatchResult(holesUp, holesPlayed, holesRemaining);

  return { kind: 'foursomes_matchplay', sides, holes, holesUp, holesPlayed, holesRemaining, result: matchResult };
}
```

**Algoritme-detaljer:**

- **WHS-diff-formel:** USGA Allowance-tabell for foursomes matchplay sier «full diff av side-HCP'er». Tørny generaliserer med allowance_pct (default 50): `highSideExtraHCP = round(|side1CH_sum - side2CH_sum| × pct / 100)`. Lavlaget får 0 strokes; høylaget får `highSideExtraHCP` strokes allokert via SI (hardeste hull først, ordinær `strokesForHole`-logikk).
  - **Hvorfor diff-basert og ikke per-lag:** USGA-standard. Strokene gis på de hardeste hullene (lavest SI), ikke fordelt likt mellom lagene. Per-lag-allowance gir feil hull-fordeling i edge-cases (verifisert: side1CH=10, side2CH=20, SI 1-18 — diff-pattern gir +1 på SI 1-5 til high team, per-lag gir +1 på SI 6-10 til high team. Diff-pattern matcher USGA).
- **Captain-pattern for storage:** scores-tabellen leses som om kaptein-userId hadde personlig score. `grossByKey` er allerede `${userId}#${holeNumber}`-keyed via eksisterende `ScoringHoleScore`-shape. Ingen ny lookup-form.
- **Empty-shell-fallback:** 0/1/3-spiller-kontekst → `holesUp:0, holesPlayed:0, result:null`. Validatoren ved publish stopper produksjons-cases.
- **Tee-starter-felt brukes IKKE i scoring-laget:** rent UI-hint, ingen påvirkning på score-beregning.

### 3. Type-utvidelser i `lib/scoring/modes/types.ts`

```ts
// GameMode-union
export type GameMode = ... | 'foursomes_matchplay';

// MODE_LABELS
export const MODE_LABELS: Record<GameMode, string> = {
  ...,
  foursomes_matchplay: 'Foursomes',
};

// GameModeConfig-variant
| { kind: 'foursomes_matchplay'; team_size: 2; teams_count: 2; allowance_pct: number; }

// Result-shapes (speiler fourball nært)
export interface FoursomesSidePlayer {
  userId: string;
  courseHandicap: number;
  teeGender?: ScoringGender;
}

export interface FoursomesSide {
  sideNumber: 1 | 2;
  players: [FoursomesSidePlayer, FoursomesSidePlayer];
  captainUserId: string;       // lex-min userId — eier scores-radene
  combinedCourseHandicap: number;
  /**
   * Effektiv lag-HCP for matchplay-strokeallokering. Kun satt på siden som
   * får strokes (high side); 0 på low side. round(|diff| × allowance_pct/100).
   */
  effectiveExtraHandicap: number;
}

export interface FoursomesHoleRow {
  holeNumber: number;
  par: number;                  // bevart backward-compat (lik side1Par)
  side1Par: number;             // parFor(hole, side1 captain.teeGender)
  side2Par: number;
  strokeIndex: number;
  side1Gross: number | null;
  side2Gross: number | null;
  side1Extra: number;
  side2Extra: number;
  side1Net: number | null;
  side2Net: number | null;
  result: MatchplayHoleResult;  // gjenbrukt singles-helper
}

export interface FoursomesMatchplayResult {
  kind: 'foursomes_matchplay';
  sides: [FoursomesSide, FoursomesSide];
  holes: FoursomesHoleRow[];
  holesUp: number;
  holesPlayed: number;
  holesRemaining: number;
  result: MatchplayMatchResult | null;   // gjenbrukt singles-typen
}

// ModeResult-union utvides med FoursomesMatchplayResult
```

### 4. Validator i `lib/games/gamePayload.ts`

Ny `validateFoursomesMatchplay` (speiler `validateFourballMatchplay` nært — kopier strukturen):

- Krev publish: **eksakt 4 spillere fordelt 2-2 på sider 1 og 2**.
- `team_number ∈ {1, 2}`. Avvik → `bad_team`.
- `flight_number = team_number` (DB-CHECK `game_players_team_flight_consistency`).
- Duplikat-spiller → `duplicate_player`.
- Allowance leses fra form-feltet `foursomes_allowance_pct` (0..100). Tom i draft → defensiv default 100. Tom i publish → wizarden pre-fyller alltid fra cup eller default-50, så tom = bug → `bad_allowance`.
- Mode_config-output: `{ kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct }`.

Feilkoder:
- 0..3 spillere → `min_players_for_mode`
- 5+ spillere → `too_many_players_for_mode`
- 4 spillere men ikke 2-2 → `team_balance`

`parseGameMode` utvides med `'foursomes_matchplay'`. `modeValidators[foursomes_matchplay] = validateFoursomesMatchplay`.

### 5. Scorekort-layout — Layout B med 2 kolonner

`lib/games/scorecardLayout.ts` får ny gren for `mode === 'foursomes_matchplay'`:

- **Variant:** `'b'` (Layout B).
- **Kolonner:** 2 — én per side. Kolonne 1 = me's side (kaptein-userId som score-eier), kolonne 2 = motstander-siden (kaptein-userId som score-eier).
- **`scoreUserIds`:** `[side1CaptainId, side2CaptainId]` — vi henter bare kaptein-radene fra DB.
- **`primaryUserId`:** me's side-kaptein (for skribene som ruter writeScore).
- **`primaryHandicap`:** me's side `effectiveExtraHandicap` (0 om me er på low side, diff om high side).
- **`isMatchplay`:** `true`.
- **`isFourball`:** `false` (ny `isFoursomes: true` for å skille i UI-rendering).

Ny flag på ScorecardLayout:
```ts
isFoursomes: boolean;  // true → render Layout B, men with team-shared score (kaptein-routet)
```

**Kolonne-rendering:** kolonne-headeren viser **lag-navn** (fra cup-rad) eller initialer-par («Per/Knut») hvis ingen lag-navn. Hver kolonne har én input-felt per hull. Input ruter til kaptein-userId via eksisterende `writeScore` — non-captain-partneren skriver til samme rad automatisk fordi UI bruker kaptein som write-target. Footer viser match-status («Du+Per: 2 up etter 5», «AS etter 7»).

### 6. Scorekort-UI — tee-starter-banner og hint

Scorekort-flaten (på `app/spill/[id]/hull/[nummer]/` eller tilsvarende) får en ny komponent som vises i to former:

**Banner på hull 1** (vises kun når me's side mangler tee-starter):

```
[Banner]  Hvem teer ut på hull 1 for dere?
          [ Per ]  [ Knut ]
```

Klikk på en navn-knapp kaller server-action `setFoursomesTeeStarter(gameId, sideNumber, userId)` → mutere `games.foursomes_sideN_tee_starter_user_id` → `revalidateTag('game-${id}', 'max')` → banner forsvinner, hint vises.

**Hint per hull** (vises på hull 1+, når tee-starter er satt):

```
[Subtilt chip]  Per slår ut
```

Logikk: hvis hole.number er odd → tee-starter-userId. Hvis even → den ANDRE partneren. (Foursomes-tradisjon: tee-rotasjon alternerer per hull.)

Tee-starter kan endres senere via samme banner (vises som lenke "Bytt" hvis allerede satt og man trykker på hint-chip-en). For å holde build-en fokusert: build-fasen bestemmer presis edit-UX (klikk-på-chip vs eksplisitt knapp). Hovedfunksjonen er "sett en gang før hull 1, dukker opp som hint".

Server-action `setFoursomesTeeStarter`:

```ts
// app/spill/[id]/actions.ts (eller dedikert /foursomes-actions.ts)
'use server';

export async function setFoursomesTeeStarter(
  gameId: string,
  sideNumber: 1 | 2,
  userId: string,
) {
  const supabase = await getServerClient();
  // Authz: bruker må være medlem av side N (game_players.team_number === sideNumber)
  // RLS bør håndheve dette i tillegg — verifiseres i build.
  const column = sideNumber === 1
    ? 'foursomes_side1_tee_starter_user_id'
    : 'foursomes_side2_tee_starter_user_id';
  await supabase.from('games').update({ [column]: userId }).eq('id', gameId);
  revalidateTag(`game-${gameId}`, 'max');
}
```

Validering server-side:
- `gameId` finnes
- `userId` ER faktisk medlem av side `sideNumber` i `game_players`
- Game er fortsatt aktivt (ikke `finished`)

### 7. Cup-create-form (`CupSetup.tsx`)

Legg til en ny `AllowanceField` for foursomes etter dagens fourball-feltet:

```tsx
<AllowanceField
  fieldName="foursomes_allowance_pct"
  defaultPct={50}
  legend="Scoring for foursomes-matches"
  description="Styrer handicap for foursomes-matches. Netto deler 50 % av differansen i lagenes HCP til høyeste lag (WHS-standard); brutto teller bare slag uten allowance."
  nettoHelperText="Andel av differansen i lagenes summerte handicap. WHS-standard for foursomes matchplay er 50."
  bruttoHelperText="Ingen handicap — lagets gross-score per hull avgjør, ingen extra strokes."
/>
```

**Conditional rendering:** felt rendres bare når foursomes_matchplay er valgt i allowed-formats-multi-select. Når ALLE cup-eligible formats er valgt by default, felt vises alltid (vanlig case). Hvis admin un-checker foursomes, felt skjules men sender ingen verdi (server-action bruker DB-default 50).

**Server-action `createTournamentDraft`** ([lib/cup/actions.ts](lib/cup/actions.ts)) leser feltet, validerer range 0..100, persisterer til `tournaments.foursomes_allowance_pct`.

### 8. Wizard (`GameWizard.tsx`) — match-create for cup

Følg samme pattern som fourball:

- `?game_mode=foursomes_matchplay` + `?tournament_id={id}` → pre-fyll i wizarden.
- Hent `tournament.foursomes_allowance_pct` fra DB, pre-fyll netto/brutto-toggle.
- Validator (`useGameFormState.ts`) krever 2-2-fordeling før publish-knappen aktiveres.
- Submit-action sender `foursomes_allowance_pct` (form-felt). Server-action persisterer til `games.mode_config.allowance_pct`.

**Cup-detalj-side** ([app/admin/cup/[id]/page.tsx](app/admin/cup/[id]/page.tsx)) har allerede knapper for ulike match-modi (linje 208 for fourball). Legg til:

```tsx
<Link href={`/admin/games/new?intent=cup&tournament_id=${id}&game_mode=foursomes_matchplay`}>
  + Foursomes match
</Link>
```

### 9. Cup-snapshot

`lib/cup/getCupSnapshot.ts` får en ny gren etter fourball:

```ts
if (
  game.game_mode === 'foursomes_matchplay' &&
  side1Players.length === 2 &&
  side2Players.length === 2
) {
  const allowancePct = readAllowancePctFromModeConfig(game.mode_config, 50);
  const ctx: ScoringContext = { /* tilsvarende fourball */ };
  const r = computeFoursomesMatchplay(ctx);
  if (r.result) {
    const winnerSide: 1 | 2 | 'tied' =
      r.result.winner === 'side1' ? 1 : r.result.winner === 'side2' ? 2 : 'tied';
    result = { winnerSide, formatted: r.result.formatted };
  }
}
```

Match-label på cup-leaderboard: `«3&2 til {team_1_name}»` (samme pattern som fourball — lag-fokusert, ikke per-spiller).

`team1PlayerName` / `team2PlayerName`: join med «/», f.eks. «Per/Knut». Identisk med fourball.

### 10. Mode-router

`lib/scoring/index.ts`:

```ts
case 'foursomes_matchplay':
  return foursomesMatchplay.compute(ctx);
```

`ModeResult`-union utvides med `FoursomesMatchplayResult`.

### 11. CHANGELOG-oppføring

MINOR bump (foreksempel `1.42.0` → `1.43.0`, avhenger av main-state ved merge).

Tagline-skisse (humanizer-pass før commit):

```
> Foursomes matchplay er klar for cupen. Velg én ball per lag, partnerne
> alternerer slag, og scorekortet viser dere mot dem hele veien.
```

## Edge Cases & Guardrails

- **0/1/3-spiller-context ved scoring-kall (draft):** empty-shell. Validator stopper publish.
- **Begge sider mangler gross på et hull:** `unplayed`, bidrar ikke til match-status.
- **Én side har gross, den andre mangler:** matchplay-hullet er `unplayed` (matchplay krever begge for å avgjøres). Samme regel som singles og fourball.
- **Tie i lag-HCP (begge sider har samme combined CH):** `effectiveExtraHandicap = 0` på begge — gross-only matchplay. `highSideNumber` velges deterministisk som side 1 (ikke at det betyr noe når extra=0).
- **Allowance 0 % (brutto):** ingen strokes til noen, gross matchplay.
- **Allowance 100 % (full diff):** USGA-non-standard, men legalt. Full HCP-differanse til high side.
- **Mat-em før 18:** `|holesUp| > holesRemaining` → format `${marginUp}&${remainingAtDecision}`.
- **AS etter 18:** `winnerSide: 'tied'`, `formatted: 'AS'`.
- **Blandet-kjønn-par på samme lag:** kaptein-userId's teeGender brukes for lag-par-display (samme forenkling som Texas). Mixed-tee-foursomes på Ryder Cup-nivå er sjelden problematisk fordi tee-valget speiles av kapteinen i UI'en uansett.
- **Spiller fjernet fra match mid-game:** game_players-relasjonen vinner. ON DELETE SET NULL på tee-starter-FK håndterer hvis brukeren slettes; banner dukker opp igjen, side må re-velge.
- **Tee-starter kommer fra side-2-spiller men sendes til side-1 server-action:** server-action validerer `userId ∈ game_players(team_number=sideNumber)`. Avvik → 403.
- **Cup uten foursomes_allowance_pct (gammel data):** DB-default 50 dekker det.
- **Wizard åpnes med `?game_mode=foursomes_matchplay` men uten `?tournament_id`:** legalt — admin kan opprette en foursomes-match utenfor en cup. Allowance defaulter til 50 (WHS) siden ingen cup å hente fra.
- **Realtime: hvor synkroniseres tee-starter-valget?** Dexie/sync-laget driver scores. Tee-starter er en `games`-kolonne. revalidateTag i server-action + Next.js's `unstable_cache` + side-rerender håndterer dette uten nye sync-paths.
- **Texas vs foursomes på samme cup:** ikke et reelt problem siden cup-en bare har ett `foursomes_allowance_pct`-felt. Texas-runder har sin egen `team_handicap_pct` i `mode_config`. Felt skjer ikke å rote sammen.
- **Brukeren bytter tee-starter mid-runde:** tillates (banner-edit). UI-hint endres for kommende hull. Sett-en-gang-er-vanligst, men edit er trygg fordi det er rent informativt.

## Key Decisions

- **Storage pattern A (kaptein-eier-scores, ingen skjema-endring på `scores`):** gjenbruker Texas-mønsteret 1:1. Bevart for hele alternate-shot-familien (#289, #290, #291).
- **WHS-diff-formel for allowance (round(|combinedCH_diff| × pct/100) → strokes til high side via SI):** matcher USGA Allowance-tabell for foursomes matchplay. Standardprosent 50 (WHS).
- **`tournaments.foursomes_allowance_pct`-kolonne (egen, default 50):** ulik default og formel fra fourball — holdes separat.
- **Tee-starter på `games` med to nullable uuid-kolonner, ikke per-spiller på `game_players`:** lavere skjema-kompleksitet, server-action er kort. Settes runtime via scorekort-banner på hull 1.
- **Layout B head-to-head med 2 kolonner (én per side):** bekreftet av bruker. Match-følelse på scorekortet selv om hver side bare har én ball.
- **Cup-only (is_cup_eligible=true, ingen intent-mapping):** samme pattern som fourball. Foursomes vises ikke i Kompis/Klubb/Solo-flyten.
- **Match-label-konvensjon:** «Foursomes 1», «Foursomes 2», ... — auto-suggested basert på antall eksisterende foursomes-matches i cupen. Redigerbar.
- **`isFoursomes` flag på ScorecardLayout:** nytt boolean for å skille rendering fra fourball/singles uten ekstra mode-stringly-checks i UI-en.
- **Versjons-bump:** MINOR (ny user-synlig feature).

**Claude's Discretion:**

- Eksakt copy på cup-create-form helper-tekster (nettoHelperText, bruttoHelperText). Humanizer-pass.
- Eksakt UX for tee-starter-banner: hvor i scorekort-flaten den vises, om den er sticky til hull 1 eller dukker opp på alle hull til den er satt. Foreslår: vises kun på hull 1 til den er satt, deretter persisterer hint per hull.
- Tee-starter edit-UX: «Bytt»-link på chip-en, eller egen knapp. Velg det som ser ryddigst ut i build.
- Auto-suggested match-label-format. «Foursomes N» foreslått.
- Scorekort match-status-chip-stil (gjenbruk fra fourball/singles).
- `data-testid`-konvensjon for foursomes-spesifikke UI-elementer hvis E2E skrives.
- CHANGELOG-tagline (skrives sist, humanizer-pass).
- Om mode-router-cases skal sorteres alfabetisk vs. shipped-rekkefølge (følg eksisterende).

## Success Criteria

- [ ] **Migrasjon `0048_foursomes_matchplay.sql` lagt til + `lib/database.types.ts` regenerert.** Verifikasjon: `grep "foursomes_matchplay" lib/database.types.ts` returnerer treff i formats-relaterte typer; `grep "foursomes_allowance_pct" lib/database.types.ts` returnerer treff i tournaments-typene; `grep "foursomes_side1_tee_starter" lib/database.types.ts` returnerer treff i games-typene.
- [ ] **Foursomes_matchplay-rad seedet i `formats`-tabellen.** Verifikasjon: `select slug, is_active, is_cup_eligible from public.formats where slug = 'foursomes_matchplay'` returnerer én rad med `is_active=true, is_cup_eligible=true`.
- [ ] **Scoring-modul `lib/scoring/modes/foursomesMatchplay.ts` implementert med full TDD-dekning.** Verifikasjon: `npx vitest run lib/scoring/modes/foursomesMatchplay.test.ts` ≥ 14 grønne tester som dekker (a) basic 2v2 med kjent gross/SI/HCP og høy side får diff-strokes, (b) lav side får 0 strokes, (c) tie i lag-HCP (begge får 0 strokes), (d) mat-em før 18 («3&2»), (e) AS etter 18, (f) ferdig 18 hull («2up»), (g) one-side-unplayed-hole («unplayed»), (h) allowance 0 % (gross-only), (i) allowance 100 % (full diff), (j) blandet-kjønn-tees med parByGender, (k) empty-shell ved 0/3-spiller-context, (l) kaptein-userId valgt riktig (lex-min) per side, (m) duplikat-spiller på lag-roster avvises av validator (i validator-testen), (n) `holesPlayed` teller kun hull med begge siders gross.
- [ ] **`foursomes_matchplay` ligger i `GameMode`-union, `MODE_LABELS`, `GameModeConfig`, `ModeResult`, og mode-router-en.** Verifikasjon: `npx tsc --noEmit` passerer; `grep "foursomes_matchplay" lib/scoring/` returnerer treff i types.ts, index.ts og modes/foursomesMatchplay.ts.
- [ ] **`validateFoursomesMatchplay` håndhever 4 spillere fordelt 2-2 ved publish.** Verifikasjon: `npx vitest run lib/games/gamePayload.test.ts` har nye cases for foursomes — `min_players_for_mode` (≤3), `too_many_players_for_mode` (≥5), `team_balance` (4 spillere men ikke 2-2), happy-path (4 spillere 2-2 → ok), `bad_allowance` (allowance utenfor 0..100).
- [ ] **`tournaments.foursomes_allowance_pct` lagres via cup-create-form og brukes som default i wizard.** Verifikasjon: opprett cup via wizard med netto+50 → DB-rad har `foursomes_allowance_pct = 50`; opprett foursomes-match fra cup → wizard viser netto-toggle valgt + allowance pre-fylt med 50.
- [ ] **Netto/brutto-toggle i cup-create-form og foursomes-wizard fungerer.** Verifikasjon: (a) cup-create med brutto valgt → DB-rad har `foursomes_allowance_pct = 0`; (b) wizard for foursomes-match fra en brutto-cup → toggle pre-valgt på brutto, allowance-input skjult; (c) admin bytter til netto i wizarden → allowance-input vises, default 50.
- [ ] **Cup-detalj-side viser «+ Foursomes match»-knapp.** Verifikasjon: `/admin/cup/[id]` har lenke til `/admin/games/new?intent=cup&tournament_id={id}&game_mode=foursomes_matchplay`.
- [ ] **`getCupSnapshot.ts` håndterer foursomes-matches korrekt.** Verifikasjon: cup med én foursomes-match (4 spillere, noen scores) returnerer `team1PlayerName: 'Per/Knut'`, `team2PlayerName: 'Lise/Eva'`, og korrekt `result.winnerSide` + `formatted` når matchen er ferdig.
- [ ] **Cup-leaderboard rendrer lag-fokusert result-tekst for foursomes-matches.** Verifikasjon: manuell preview-test eller snapshot — ferdig foursomes-match med side 1-vinner viser «3&2 til {team_1_name}», ikke «3&2 til Per/Knut».
- [ ] **Wizard kan opprette en foursomes-match som havner med riktig `game_mode` + `tournament_id` + `mode_config.allowance_pct` i DB.** Verifikasjon: opprett foursomes-match via wizard → DB-rad har `game_mode = 'foursomes_matchplay'`, `tournament_id = X`, `mode_config = { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 }`.
- [ ] **Scorekort viser Layout B med 2 kolonner (én per side) og match-status-footer.** Verifikasjon: manuell røyk-test i preview — åpne foursomes-match-scorekort som spiller på side 1, se to kolonner (din side + motstander), se «X up etter N hull»-status under inputen.
- [ ] **Tee-starter-banner vises på hull 1 når ikke valgt, og forsvinner etter valg. Hint per hull vises etter valg.** Verifikasjon: manuell røyk-test — åpne hull 1 før noen har valgt → banner med 2 navn-knapper; klikk Per → banner forsvinner, chip «Per slår ut» vises; gå til hull 2 → chip «Knut slår ut»; gå tilbake til hull 1 → chip «Per slår ut».
- [ ] **`setFoursomesTeeStarter` server-action validerer at brukeren faktisk er medlem av siden.** Verifikasjon: `npx vitest run` har test som forsøker å sette side 1's tee-starter til en side-2-spiller → 403/feil.
- [ ] **Eksisterende game-leaderboard for andre modi rendres identisk med før migrasjon.** Verifikasjon: åpne en eksisterende stableford/best-ball/texas-rute i preview, sammenlikn med før-state. Ingen regresjon.
- [ ] **CHANGELOG-oppføring + MINOR-bump i `package.json`.** Verifikasjon: pre-commit-hook `commit-msg` passerer på `feat(cup): foursomes matchplay …`-commit med pakke-bump + CHANGELOG.

## Gates

Etter hver chunk:

- [ ] `npx tsc --noEmit` passerer
- [ ] `npx vitest run lib/scoring/modes/foursomesMatchplay lib/games/gamePayload lib/cup/getCupSnapshot lib/cup/computeCupLeaderboard lib/games/scorecardLayout` passerer (eksisterende tester må ikke breke)
- [ ] `npm run lint` passerer
- [ ] `.githooks/pre-commit` ingen humanizer-advarsler på nye norske strenger
- [ ] `.githooks/commit-msg` passerer på `feat(cup): foursomes matchplay …` med pakke-bump + CHANGELOG
- [ ] Manuell røyk-test på Vercel-preview: opprett cup med allowance 50 → foursomes-match → spill 5-7 hull → tee-starter-banner → cup-leaderboard speiler riktig

E2E: Type D edge-case scoping ved build-tid hvis Playwright-suite får ny coverage. Default: én happy-path-E2E som dekker create → enter tee-starter → spill noen hull → mat-em-flow.

## Files Likely Touched

- `supabase/migrations/0048_foursomes_matchplay.sql` — **NY** migrasjon (formats-seed + tournaments-allowance-kolonne + games-tee-starter-felter)
- `lib/database.types.ts` — regenerert
- `lib/scoring/modes/foursomesMatchplay.ts` — **NY** scoring-modul
- `lib/scoring/modes/foursomesMatchplay.test.ts` — **NY** unit-tester (Type A)
- `lib/scoring/modes/types.ts` — `GameMode`-union, `MODE_LABELS`, `GameModeConfig`, `ModeResult`, nye Foursomes-interfaces
- `lib/scoring/index.ts` — switch-case for ny mode + re-export
- `lib/games/gamePayload.ts` — `parseGameMode`, `validateFoursomesMatchplay`, `parseFoursomesAllowancePct`, `modeValidators`
- `lib/games/gamePayload.test.ts` — nye validator-tester
- `lib/games/scorecardLayout.ts` — ny `mode === 'foursomes_matchplay'`-gren + `isFoursomes` flag
- `lib/cup/getCupSnapshot.ts` — foursomes-handling (4 spillere per side, ny mode-route)
- `lib/cup/actions.ts` — cup-create-form lese `foursomes_allowance_pct`
- `app/admin/games/new/CupSetup.tsx` — nytt `AllowanceField` for foursomes
- `app/admin/games/new/CupSetup.test.tsx` — utvidet test
- `app/admin/games/new/GameWizard.tsx` — allowance-pre-fill fra cup, foursomes-formfelt
- `app/admin/games/new/GameForm.tsx` — foursomes-allowance-field rendering (hvis fallback-flyten brukes)
- `app/admin/games/new/useGameFormState.ts` — `foursomesAllowancePct` state-felt
- `app/admin/games/new/actions.ts` — verifisere mode-routing inkl. mode_config-build
- `app/admin/games/new/actions.test.ts` — nye actions-tester
- `app/admin/games/new/TeamSizeSelector.tsx` — `foursomes_matchplay: new Set<TeamSize>([2])`
- `app/admin/cup/[id]/page.tsx` — ny `+ Foursomes match`-knapp
- `app/cup/[id]/page.tsx` — vise foursomes-matches i leaderboard (gjenbruker fourball-rendering)
- `app/spill/[id]/...` (foursomes-spesifikk scorekort-rendering) — tee-starter-banner + hint, kolonne-layout
- `app/spill/[id]/foursomesActions.ts` — **NY** server-action `setFoursomesTeeStarter`
- `components/scorecard/` (eller hvor scorekort lever) — Layout B-utvidelse for foursomes
- `package.json` + `CHANGELOG.md` — MINOR bump, ny oppføring

## Out of Scope

- **Greensome ([#289](https://github.com/jdlarssen/golf-app/issues/289)), Chapman/Pinehurst ([#290](https://github.com/jdlarssen/golf-app/issues/290)), Gruesome ([#291](https://github.com/jdlarssen/golf-app/issues/291))** — alle adopterer storage-pattern og Layout B fra denne kontrakten. Egne kontrakter per format.
- **Match-templating / format-presets** — fase 4 av Ryder Cup ([#219](https://github.com/jdlarssen/golf-app/issues/219)).
- **Foursomes stableford / foursomes solo strokeplay** — kun matchplay-varianten i v1 av foursomes.
- **Brukerdefinerte preset for «Ryder Cup mini»-format** — fase 4.
- **Auto-generere match-schedule fra cup-format** — fase 4.
- **Validering av faktisk alternate-shot-mønster** (om partneren faktisk alternerer slag i ekte spill) — ren tillit. Tørny lagrer bare lag-scoren.
- **Mer enn 2 lag i cup** — Solheim Cup-stil. Krever skjema-endring i fase 1.
- **Concessions (give-the-hole-knapp)** — egen UX-utvidelse, ikke kritisk for foursomes MVP.
- **Live-streaming-WebSocket for foursomes-scorekort** — eksisterende sync + revalidateTag dekker behovet.
- **Mixed foursomes-spesifikk UX** (par av ulike kjønn) — håndteres automatisk via eksisterende per-spiller-tee-mekanisme (#240). Ingen ekstra arbeid.
- **Allowed-formats-filter på cup-detalj-siden** (skjul «+ Foursomes match»-knapp hvis admin un-checket foursomes i cup-create) — defer til samme follow-up som fourball's filter (per F2-kontrakten: «Wave-2»). Per i dag vises alle cup-eligible match-create-knapper uavhengig av cup-config.
- **Edit foursomes-match etter publish** — eksisterende game-edit-flyt forventes å håndtere foursomes via mode-routing. Edge-cases (bytte spillere på et lag) verifiseres i build.
- **Statistikk på tvers av foursomes-matches** — krever egen feature.
- **Endring av `computeCupLeaderboard`-aggregator** — den er allerede åpen for nye result-shapes.

## Deferred Ideas

- **Edit tee-starter mid-runde**: Build velger om edit kommer via klikk-på-chip eller dedikert "Bytt"-link. Kontrakten krever bare at edit er teknisk mulig.
- **Auto-bytte side ved manglende spiller**: hvis en av 4 spillere ikke dukker opp på matchdagen, kan resten substituere? Defer til konkret behov — Ryder Cup-praksis er at hele matchen utgår.
