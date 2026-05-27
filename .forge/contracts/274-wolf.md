# Spec: Wolf — 4-spiller rotating partner-format

**Issue:** [#274](https://github.com/jdlarssen/golf-app/issues/274)
**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270)
**Batch:** Kompis-runde format #1 av 7

## Problem

Tørny støtter i dag 6 game_modes (best_ball, stableford, singles_matchplay, solo_strokeplay, texas_scramble, fourball_matchplay). Alle er enten solo eller statisk lag-tildelt for hele runden. **Wolf** introduserer noe fundamentalt nytt: lag-tildelingen er **dynamisk per hull** — Wolf-spilleren velger partner (eller går alene mot 3) hver gang det er deres tur, og rotasjonen styres av spillet selv.

Wolf er den sosiale point-game-arketypen for kompis-runden. Hvis Tørny kan håndtere Wolf clean, faller resten av kompis-batchen (Skins, Nassau, BBB, Nines, Acey Deucey, Round Robin) lettere på plass — flere av dem deler infrastruktur (per-hull-valg, point-akkumulering, ingen statiske lag).

## Prior Decisions

Fra epic #270 (godkjent 2026-05-27):
- Wolf er primary under `kompis`-intent
- Format-row + intent-mapping seedes via egen migrasjon (F1-pattern), ikke retroaktiv backfill
- `formats.is_cup_eligible = false` for Wolf (kun for kompis-runder)
- Eksisterende games er upåvirket — Wolf legges til som ny game_mode, ingen breaking endringer

Fra denne diskusjonsrunden (2026-05-27):
- **Full Wolf-katalog i v1**: Partner / Lone Wolf / Blind Wolf + carry-over på tied holes. Ingen senere oppfølgings-issue for "more variants" — vi får hele pakken nå.
- **Admin-toggle gross vs netto** i wizard step 2 (`mode_config.wolf_scoring: 'gross' | 'net'`). Tørny's HCP-system honoreres som default, gross som opt-in.
- **Modal på Wolf-spillerens device** når hullet åpnes. Wolf-valget syncer via realtime til de tre andre. De andre ser et badge ("Wolf: [navn] — partner: [navn]").
- **Rotasjon: random første 16 hull, trailing-wolf siste 2**. Random permutasjon settes i wizard ved opprett, lagres som `team_number` (1-4) på game_players. Hull 17-18 = spilleren med lavest poeng-total etter forrige hull. Ties brytes deterministisk på `team_number ASC`.

Fra `lib/scoring/`-arkitektur ([modes/types.ts](../../lib/scoring/modes/types.ts), [modes/singlesMatchplay.ts](../../lib/scoring/modes/singlesMatchplay.ts)):
- Hver modus eksporterer `compute(ctx: ScoringContext): ModeResult`
- `ModeResult` er discriminated union på `kind`
- Pure logic, ingen side-effects, full Type A test-disiplin per [`lib/scoring/AGENTS.md`](../../lib/scoring/AGENTS.md)
- Validatoren i `gamePayload.ts` håndhever player-count + team-fordeling før insert

Fra [F1-kontrakt](271-f1-data-model.md):
- `is_active = false` skjuler fra wizard, men game_mode-slug-en fortsetter å funke i historiske games
- Ingen FK mellom `games.game_mode` og `formats.slug`

## Design

### 1. Datamodell — ny tabell `wolf_hole_choices`

Migrasjon `supabase/migrations/0048_wolf.sql`:

```sql
-- Wolf-valg per hull. Wolf-spilleren velger Partner-X / Lone Wolf /
-- Blind Wolf før (Blind) eller etter (Partner/Lone) tee shots. Honor-
-- system på timing — UI nudger men håndhever ikke.
create table public.wolf_hole_choices (
  game_id          uuid not null references public.games(id) on delete cascade,
  hole_number      int  not null check (hole_number between 1 and 18),
  -- Wolf for hullet (= spilleren med riktig team_number, eller trailing
  -- player for hull 17/18). Lagret eksplisitt så scoring ikke trenger å
  -- rekompute rotasjonen.
  wolf_user_id     uuid not null references public.users(id) on delete cascade,
  choice           text not null check (choice in ('partner', 'lone', 'blind')),
  -- Required når choice='partner', null ellers.
  partner_user_id  uuid references public.users(id) on delete cascade,
  -- Bevarer 'hvem som faktisk valgte' for audit; entered_by skjelner Wolf
  -- selv fra en flight-medlem som har enter-på-vegne-av-rights.
  entered_by       uuid not null references public.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (game_id, hole_number),
  constraint partner_only_when_partner_choice
    check ((choice = 'partner' and partner_user_id is not null)
        or (choice <> 'partner' and partner_user_id is null))
);

create trigger wolf_hole_choices_set_updated_at
  before update on public.wolf_hole_choices
  for each row execute function public.set_updated_at();

alter table public.wolf_hole_choices enable row level security;

-- Spillere i samme game leser hverandres valg (samme RLS-pattern som scores).
create policy wolf_choices_read
  on public.wolf_hole_choices for select
  using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = wolf_hole_choices.game_id
        and gp.user_id = auth.uid()
    )
  );

-- Bare Wolf-spilleren selv (eller admin) kan endre. Honor-system på timing.
create policy wolf_choices_write
  on public.wolf_hole_choices for all
  using (wolf_user_id = auth.uid() or public.is_admin())
  with check (wolf_user_id = auth.uid() or public.is_admin());

-- Seed format-row + intent-mapping
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)
  values ('wolf', 'Wolf', 'wolf', '4 spillere, rotereende Wolf. Velg partner eller gå alene.', '@/lib/scoring/modes/wolf', true, false);

insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order)
  values ('wolf', 'kompis', true, true, 50);
```

### 2. Scoring-modul — `lib/scoring/modes/wolf.ts`

**Discriminator:** `game_mode: 'wolf'`, `mode_config.kind: 'wolf'`.

**Inn-shape (utvider `ScoringContext`):**
- `players[]`: 4 spillere, hver med `team_number` 1-4 (rotation slot, satt random i wizard)
- `scores[]`: per-spiller gross per hull (eksisterende shape)
- **Ny:** `wolfChoices: { holeNumber, wolfUserId, choice: 'partner'|'lone'|'blind', partnerUserId|null }[]`

Modulen tar `wolfChoices` som ekstra prop på `ScoringContext` (eller via `ctx.game.wolf_choices`). Velg det som matcher eksisterende mønster best — `getGameWithPlayers` cachet helper må også returnere choices.

**Hovedalgoritme (`compute(ctx): WolfResult`):**

```
for hole in [1..18]:
  wolfUser = determineWolf(hole, players, runningTotals)
    // Hull 1-16: players.find(p => p.team_number === ((hole-1) % 4) + 1)
    // Hull 17-18: lowest runningTotal[p.user_id], tiebreak by team_number ASC

  choice = wolfChoices.find(c => c.hole_number === hole)
    // Hvis undefined: hull "venter på valg" — outcome='pending', stake bevart
    // for senere beregning når valget kommer inn.

  computeHoleOutcome(hole, wolfUser, choice, players, scores):
    // 'partner': team A = [wolf, partner], team B = [other 2]. Best score per side.
    // 'lone': team A = [wolf], team B = [other 3]. Best score per side.
    // 'blind': samme som 'lone' men 3x multiplier.

  pointsAwarded = computePoints(outcome, choice, stake):
    // Stake starter på 1, øker med 1 hvert tied hull, reset til 1 etter avgjort.
    //   choice=partner + wolf-side wins → +2 stake til hver av wolf+partner
    //   choice=partner + opp wins        → +1 stake til hver av 2 motstandere
    //   choice=lone + wolf wins          → +4 stake til wolf alene
    //   choice=lone + opp wins           → +1 stake til hver av 3 motstandere
    //   choice=blind + wolf wins         → +6 stake til wolf alene (3x lone)
    //   choice=blind + opp wins          → +2 stake til hver av 3 motstandere
    //   tied                              → 0 til alle, stake carrier
    //   pending/unplayed                  → 0 til alle, stake bevart

  runningTotals = runningTotals + pointsAwarded
```

**Net vs gross:** Når `mode_config.wolf_scoring === 'net'`, hver spillers per-hull-score = `gross − strokesForHole(courseHandicap, strokeIndex)`. Når `'gross'`, score = gross direkte. Allowance-pct fra game-feltet honoreres ikke (Wolf bruker enten full HCP eller ingen).

**Output (ny type i `types.ts`):**

```ts
export type WolfChoice = 'partner' | 'lone' | 'blind';
export type WolfHoleOutcome = 'wolf_side_wins' | 'opp_side_wins' | 'tied' | 'pending';

export interface WolfHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  wolfUserId: string;
  choice: WolfChoice | null;        // null = ikke valgt ennå
  partnerUserId: string | null;
  stake: number;                     // 1 base, +1 per tied carry
  outcome: WolfHoleOutcome;
  perPlayerScores: Array<{           // hver av de 4 spillere
    userId: string;
    gross: number | null;
    effectiveScore: number | null;   // gross hvis 'gross', netto hvis 'net'
    side: 'wolf' | 'opp' | null;     // null hvis hullet pending
    isContributor: boolean;          // hadde best score på sin side
  }>;
  pointsByPlayer: Record<string, number>;  // points awarded på dette hullet
}

export interface WolfPlayerLine {
  userId: string;
  teamNumber: number;                // rotation slot 1-4
  totalPoints: number;
  wolfHolesPlayed: number;           // hvor mange hull spilleren var Wolf
  blindWolfWins: number;             // bragging-rights stat
  rank: number;
  tiedWith: string[];
}

export interface WolfResult {
  kind: 'wolf';
  scoring: 'gross' | 'net';
  rotation: 'random_with_trailing'; // for fremtidige varianter
  holes: WolfHoleRow[];
  players: WolfPlayerLine[];
}
```

Ranking: `totalPoints` descending. 5-tier tiebreak ikke nødvendig for v1 — bruk simpler tiebreak (poeng på siste Wolf-hull, så `team_number` ASC). Dokumenter i kode at full cascade kan legges til senere.

### 3. Validator — `lib/games/gamePayload.ts`

Ny `validateWolf(formData, mode)`:
- Krever EKSAKT 4 spillere ved publish
- `team_number` 1-4, alle distinct (random permutasjon satt av wizard)
- `flight_number` = `team_number` (DB-CHECK-konsistens)
- Tom liste/duplicate/feil count → relevante errorCodes
- `mode_config` output: `{ kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'gross' | 'net' }`

Nye eller gjenbrukte error codes: `wrong_player_count_for_mode` (eller gjenbruk `too_many_players_for_mode` / `min_players_for_mode`). Valider også `wolf_scoring` field (gross|net, default 'net').

Wire opp i `parseGameMode` (legg til `raw === 'wolf'`) og `modeValidators`-mappen.

Type-ene `GameMode` og `GameModeConfig` i `lib/scoring/modes/types.ts` utvides med wolf-varianter.

### 4. Wizard step 2 — wolf-spesifikk seksjon

`app/admin/games/new/sections/WolfSetup.tsx` (NY):
- **Scoring-toggle:** radio `wolf_scoring`: "Med handicap (netto)" / "Brutto" (default: netto)
- **Rotasjon:** vis 4 spiller-slots i randomized rekkefølge med "Shuffle"-knapp. Default randomiseres ved første mount.
- Når admin endrer spillere i step 3, randomiser team_number-tilordning automatisk (lock etter publish)

Vis Wolf-spesifikt step 3 hjelpetekst: "Rekkefølgen avgjør hvem som er Wolf hull for hull. Du kan shuffle helt til du publiserer."

### 5. Scorecard UI — Wolf-valg-modal

`app/games/[id]/holes/[holeNumber]/WolfChoiceModal.tsx` (NY):
- Vises kun for Wolf-spilleren (current `myUserId === wolfUserId` for current hole)
- Triggers automatisk når hullet åpnes hvis ingen `wolf_hole_choices`-rad finnes for current `(game_id, hole_number)`
- 5 valg som store knapper:
  - **Partner: [spillernavn]** × 3 (en for hver av de andre)
  - **Lone Wolf** (2x stake — vinner får 4)
  - **Blind Wolf** (3x stake — vinner får 6; "Velg før noen slår tee shot")
- Velger → server-action `setWolfChoice({gameId, holeNumber, choice, partnerUserId?})` → revalidate
- Realtime: alle 4 spillere får `wolf-${game_id}`-broadcast og UI re-renderer med valgt partner-badge

`HoleClient.tsx` integration:
- Når `gameMode === 'wolf'`: render `<WolfBadge>` over score-card med tekst:
  - For Wolf-spilleren før valg: trigger modal (eller render "Du er Wolf — velg" CTA)
  - For andre etter valg: "Du spiller med: [Wolf-navn] og [partner-navn]" eller "Wolf gikk alene"
- Stake-banner: "Innsats: 2x" når carry-over er aktiv

### 6. Leaderboard — `components/WolfView.tsx` + `WolfPodium.tsx`

**WolfView:** Per-hull-tabell med kolonner: hull, par, Wolf, valg, stake, outcome, +poeng per spiller. Spiller-totals i footer. Bruk eksisterende `SoloStablefordView.tsx`-struktur som mal — den har lignende per-spiller-poeng-modell.

**WolfPodium:** 1./2./3. plass med totalpoeng. Achievement-strip om noen har "Blind Wolf grand slam" (vant alle blind-wolfs) eller "Lone Wolf streak" (vant 3+ lone-wolfs i rad). Defer achievement-logikk til oppfølgings-issue hvis tid blir knapp.

`LeaderboardTabs.tsx`: legg til wolf-case som routes til `<WolfView>`. Reveal-modus respekteres (skjul totals til `status === 'finished'` hvis `score_visibility === 'reveal'`).

### 7. Server-helpers + Realtime

- `lib/wolf/getWolfChoices.ts` — fetch alle wolf-rader for game (cachet, samme tag-pattern som `getGameWithPlayers`)
- `lib/wolf/setWolfChoice.ts` — server-action med RLS-validering (wolf_user_id === auth.uid())
- `lib/sync/realtimeChannel.ts` extension: subscribe `wolf-${game_id}` på wolf_hole_choices-table (postgres_changes)
- `getGameWithPlayers` returnerer også choices (eller separate cached helper) slik at scoring-modulen får alt den trenger

## Edge Cases & Guardrails

- **Wolf har ikke valgt ennå**: hullet `outcome='pending'`, ingen poeng deles ut, stake bevart for senere. UI viser "Venter på Wolf-valg".
- **Wolf forsvinner (ikke pålogget)**: andre 3 kan ikke fortsette poeng-utdeling. Admin har RLS-override på `wolf_hole_choices` — admin kan registrere valget i admin-flate ("Lock as Lone Wolf"). Defer admin-UI til oppfølgings-issue, men RLS støtter det.
- **Spiller forsvinner mid-round**: ikke støttet i v1. Wolf-rotasjon antar 4 spillere hele veien. Dokumenter i issue-comment.
- **Tied hull etter Blind Wolf**: stake carrier som vanlig (1 + 3 = 4 inn i neste hull, hvor Blind-multiplier ikke nødvendigvis gjelder). Stake ER multiplier-uavhengig — selve valget på neste hull bestemmer x-faktoren.
- **Lik gross/netto på wolf-siden med 'partner'**: begge contributors. UI markerer begge med isContributor-badge.
- **Hcp_allowance_pct på games-tabellen**: ignoreres for wolf (uavhengig av wolf_scoring). Dokumenter med comment i validator.
- **Re-opening en finished game**: locking — `wolf_hole_choices` ikke endrebart etter `games.status === 'finished'`. Håndheves i server-action, ikke DB.
- **18 hull, men spilleren har spilt færre enn 18**: per-hull pending teller ikke. Final ranking baserer seg på hva som faktisk er spilt + valgt.
- **Trailing-wolf på hull 17 når flere har lik lavest total**: bryt med `team_number ASC` (deterministisk).
- **Carry-stake når forrige hull var pending (ikke tied)**: stake bevart med samme verdi — pending hull verken øker eller resetter carry.

## Key Decisions

- **Full Wolf-katalog i v1** (per gray-area-runden): Partner/Lone/Blind + carry-over. Ingen senere "v2 features"-issue — vi har én sjanse til å gjøre dette riktig.
- **Random permutasjon ved opprett, lagret som team_number** (ikke embed userIds i mode_config). Konsistent med Tørny's pattern hvor team_number representerer rolle/slot.
- **Trailing-wolf for hull 17-18** med tiebreak på team_number ASC. Deterministisk og forklarbart.
- **`wolf_hole_choices` som egen tabell** (ikke JSONB på games). Gir clean RLS, enkel realtime-sub, og lar oss legge til audit-felter (entered_by) uten skjema-bytting.
- **Honor-system på Blind Wolf-timing** — UI nudger ("Velg før tee shot") men håndhever ikke server-side. Tørny-brukere er kompiser, ikke profesjonelle dommere.
- **Standard point-tabell** hardkodet i scoring-modul: 2/1, 4/1, 6/2 (partner-win/lose, lone-win/lose, blind-win/lose). Justerbar via senere mode_config-utvidelse hvis bruker etterspør.

**Claude's Discretion:**
- Eksakt UI-layout for Wolf-modal (5 store knapper vs liste; ikon vs tekst)
- Om WolfBadge sitter over score-card (`HoleClient.tsx`) eller som banner i `HoleHero`
- Hvor `wolf_choices` lever i `ScoringContext` — egen prop `wolfChoices: WolfChoice[]` eller en del av `ctx.game`. Velg det som best matcher eksisterende mønster.
- Achievement-logikk i WolfPodium (Lone Wolf streak, Blind Wolf grand slam) — implementer hvis lett, defer til oppfølgings-issue hvis kompliserer
- Reveal-modus oppførsel for Wolf: skjuler ALL poeng-utdeling til finished, eller bare totals? Velg det som matcher SoloStableford-mønsteret.
- Test-organisering: én `wolf.test.ts` med alt, eller split i `wolfScoring.test.ts` + `wolfRotation.test.ts`. Velg det som er mest lesbart.
- Norsk strings — "Lone Wolf" er kjent term, men "Blind Wolf" kunne hete "Pig Wolf" på norsk (Grise-Wolf?). Velg det som er mest naturlig norsk og legg evt. begge i kopi-glossary.

## Success Criteria

- [ ] Migrasjon `0048_wolf.sql` kjører grønt, seeder format-row + intent-mapping, oppretter `wolf_hole_choices`-tabell med RLS
- [ ] `lib/scoring/modes/wolf.ts` finnes og eksporterer `compute(ctx): WolfResult`
- [ ] `lib/scoring/modes/wolf.test.ts` har Type A unit-tester (≥20 cases via `it.each`): partner-win/lose, lone-win/lose, blind-win/lose, tied + carry-over, pending hull, gross vs net, rotation hull 1-16, trailing hull 17-18
- [ ] `lib/scoring/index.ts` router har wolf-case
- [ ] `lib/scoring/modes/types.ts` har `WolfResult`, `WolfHoleRow`, `WolfPlayerLine`, `WolfChoice`, `WolfHoleOutcome` typer + utvidet `GameMode`/`GameModeConfig`
- [ ] `lib/games/gamePayload.ts` har `validateWolf` med player-count + team-permutation-validering
- [ ] Wizard step 2 viser Wolf-spesifikk seksjon med scoring-toggle + shuffle-knapp (Type C render-test)
- [ ] `WolfChoiceModal.tsx` rendres for Wolf-spilleren når hullet åpnes uten registrert valg; lagrer via server-action og syncer via realtime
- [ ] `WolfView.tsx` viser per-hull-tabell + spiller-totals (Type C render-test fra fixture)
- [ ] `WolfPodium.tsx` viser 1/2/3-plass med totalpoeng
- [ ] E2E golden-path: 4 spillere, 9 hull, blandet partner/lone/blind/tied, alle valg lagres og leaderboard-totalene stemmer overens med scoring-modulens output
- [ ] Norsk copy gjennomgått med `humanizer:humanizer`-skill
- [ ] CHANGELOG-oppføring + minor-bump til `1.42.0`
- [ ] Manuell verifikasjon i iPhone Safari: Wolf-modal er touch-friendly, tap-targets ≥44px, modal blokkerer ikke score-input når valget er registrert

## Gates

Etter hver chunk:
- [ ] `npx tsc --noEmit` — 0 nye errors
- [ ] `npx vitest run lib/scoring/modes/wolf` — alle Type A tester grønne
- [ ] `npx vitest run` — full suite grønn (regresjonsbeskyttelse)
- [ ] `npm run lint` — 0 errors
- [ ] Mobile Playwright-spec for ny hull-flate (hvis lagt til) grønn

## Files Likely Touched

**Nye:**
- `supabase/migrations/0048_wolf.sql`
- `lib/scoring/modes/wolf.ts`
- `lib/scoring/modes/wolf.test.ts`
- `lib/wolf/getWolfChoices.ts`
- `lib/wolf/getWolfChoices.test.ts`
- `lib/wolf/setWolfChoice.ts`
- `lib/wolf/setWolfChoice.test.ts`
- `app/admin/games/new/sections/WolfSetup.tsx`
- `app/admin/games/new/sections/WolfSetup.test.tsx`
- `app/games/[id]/holes/[holeNumber]/WolfChoiceModal.tsx`
- `app/games/[id]/holes/[holeNumber]/WolfChoiceModal.test.tsx`
- `components/WolfView.tsx`
- `components/WolfView.test.tsx`
- `components/WolfPodium.tsx`
- `e2e/wolf-golden-path.spec.ts`

**Endrede:**
- `lib/scoring/modes/types.ts` — utvid `GameMode`, `GameModeConfig`, `ModeResult`; nye Wolf-typer
- `lib/scoring/index.ts` — wolf-case i router
- `lib/games/gamePayload.ts` — `validateWolf`, utvid `parseGameMode`, registrer i `modeValidators`
- `lib/games/getGameWithPlayers.ts` — returner også wolf_choices (cachet via samme `game-${id}`-tag)
- `lib/games/scorecardLayout.ts` — wolf-spesifikk layout-variant (per-hull stake-kolonne)
- `lib/sync/realtimeChannel.ts` — subscribe `wolf_hole_choices` på `wolf-${gameId}`-topic
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` — render `<WolfBadge>` + integrer `<WolfChoiceModal>` når `gameMode === 'wolf'`
- `app/games/[id]/holes/[holeNumber]/page.tsx` — pass wolf-choices + current hole's wolfUserId ned til client
- `components/LeaderboardTabs.tsx` — wolf-case som routes til `<WolfView>`
- `app/admin/games/new/GameWizard.tsx` — render `<WolfSetup>` når `game_mode === 'wolf'`
- `CHANGELOG.md` + `package.json` — minor-bump til 1.42.0

## Out of Scope

- **Admin manual override av Wolf-valg** etter publish — RLS støtter det, men ingen UI lages i v1. Defer til hvis brukeren rapporterer behov.
- **Achievements** beyond bragging-stats (Lone Wolf streak, Blind Wolf grand slam) — implementer hvis trivielt, ellers eget oppfølgings-issue.
- **Konfigurable point-tabell i admin-UI** — hardkodet 2/1/4/1/6/2 i v1. Følg-opp issue hvis brukeren etterspør.
- **3-spiller Wolf-variant** — eksakt 4 spillere kreves. Defer.
- **Mid-round player-swap** — ikke støttet for noen modus i Tørny i dag, og særlig brutalt for Wolf.
- **Side-tournaments på wolf-games** — fungerer ut av boksen via eksisterende `sideTournament.ts` (Wolf har gross-scores per hull). Ingen ekstra arbeid.
- **Wolf-spesifikke notifikasjoner** ("Du er Wolf på hull 5!") — defer til oppfølgings-issue om push-notifikasjoner generelt.
- **9-hulls Wolf-varianter** — Tørny antar 18-hulls runder i dag. Defer.

## Deferred Ideas

- **Wolf-statistikk-side** ("Mest Lone Wolf-seire", "Mest Blind Wolf-pots") — eget issue.
- **Wolf-trening: solo-modus mot 3 bot-spillere** — eget issue.
- **Wolf med konfigurerbart point-tabell per game** — eget issue.
- **Pig-Wolf-variant** (annet navn for Blind Wolf med 4x multiplier istedenfor 3x) — utsatt; hvis bruker etterspør kan vi legge til alternativ multiplier-config i mode_config.
