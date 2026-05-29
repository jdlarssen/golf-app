# Spec: Bingo Bango Bongo — tre poeng per hull

**Issue:** [#277](https://github.com/jdlarssen/golf-app/issues/277)
**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270)
**Batch:** Kompis-runde format (sekundær under `kompis`-intent)

## Problem

Tørny støtter i dag 11 game_modes, alle stroke-baserte: poeng/resultat utledes fra slag per hull. **Bingo Bango Bongo** introduserer en ny scoring-akse: tre prestasjons-poeng per hull som *ikke* utledes fra slag.

Per hull deles tre poeng ut:
- **Bingo** — første ball på green
- **Bango** — nærmest hullet når alle baller er på green
- **Bongo** — første ball i hull

Formatet jevner mellom dyktige og mindre dyktige spillere fordi rekkefølge-etiketten (lengst fra hull spiller først) gir alle en sjanse på hvert poeng. Det er en sosial kompis-runde-arketype for 2–4 spillere.

## Prior Decisions

Fra epic #270 + F1-kontrakt ([271](271-f1-data-model.md)):
- Nytt format introduseres via egen migrasjon som seeder `formats`-row + `format_intent_mapping`. Ingen FK mellom `games.game_mode` og `formats.slug`.
- `is_active = false` skjuler fra wizard; slug fortsetter å funke i historiske games.
- Server-action-validering (ikke DB CHECK) håndhever game_mode.

Fra Wolf-kontrakt ([274](274-wolf.md)) — **arkitektonisk mal for kategorisk per-hull-input**:
- Kategorisk per-hull-data lever i **egen tabell** (`wolf_hole_choices`), ikke i `scores` eller `mode_config`.
- Data sendes inn til scoring via valgfritt felt på `ScoringContext` (`wolfChoices?`).
- Persistering via dedikert **server-action** (`setWolfChoice`) med tag-cache-invalidering (`revalidateTag(\`game-${id}\`)`), ikke Dexie.
- Realtime-sync via `subscribe…`-helper på `postgres_changes` for tabellen.
- Hver modus eksporterer `compute(ctx): ModeResult` (discriminated union på `kind`). Pure logic, full Type A test-disiplin per [`lib/scoring/AGENTS.md`](../../lib/scoring/AGENTS.md).
- Leaderboard: `renderXxx()` i `app/games/[id]/leaderboard/page.tsx` → `<XxxView>` (aktiv) / `<XxxPodium>` (finished), routet via `LeaderboardTabs`.

## Key Architectural Decision: slag BEHOLDES, BBB-poeng kommer fra de tre prestasjonene

BBB er Tørnys første format der scoring-poengene ikke utledes fra slag. To veier ble vurdert:

1. **Slag-løst scorekort** (kun de tre selectorene). Ville vært Tørnys første mode uten `scores`-rader — krever mode-aware refactor av 6–8 subsystemer: hull-entry-UI, Dexie offline-sync (`writeScore`), progress-telling (`myCompletedHoles`), lever-scorekort-review, gameFinished-mail, og leaderboard-fetch. Høy regresjonsrisiko mot den sikkerhets-kritiske offline-sync- og lever-flyten.
2. **Slag + tre selectorer (VALGT).** Spillerne taster slag via det eksisterende scorekortet (uendret maskineri), og de tre Bingo/Bango/Bongo-selectorene legges på som et ekstra per-hull-lag — nøyaktig Wolf-mønstret. BBB-*poengene* beregnes utelukkende fra de tre prestasjonene (regelriktig). Slagene registreres, men teller ikke for BBB-poeng.

**Valg 2** fordi: (a) regelriktig — BBB-poeng er rene prestasjons-poeng uansett; (b) matcher issue-ordlyden «tre flere data points per hull enn dagens scoring» (slag PLUSS tre); (c) minimal blast-radius — gjenbruker hele det utprøvde scorekort/sync/lever-maskineriet; (d) CTP/LD-sideturnering fungerer ut av boksen siden slag finnes.

## Design

### 1. Datamodell — ny tabell `bingo_bango_bongo_holes`

Migrasjon `supabase/migrations/0053_bingo_bango_bongo.sql`:

```sql
-- Bingo Bango Bongo: tre prestasjons-poeng per hull. Hvem fikk bingo
-- (først på green), bango (nærmest når alle er på green), bongo (først i
-- hull). Egen tabell (speiler wolf_hole_choices) — slag bor fortsatt i
-- scores. Alle tre user-id-er er nullable: en kategori kan stå udelt på et
-- hull (f.eks. bango når ikke alle nådde green, eller hull droppet).
create table public.bingo_bango_bongo_holes (
  game_id        uuid not null references public.games(id) on delete cascade,
  hole_number    int  not null check (hole_number between 1 and 18),
  bingo_user_id  uuid references public.users(id) on delete set null,
  bango_user_id  uuid references public.users(id) on delete set null,
  bongo_user_id  uuid references public.users(id) on delete set null,
  -- Hvem som faktisk registrerte (audit). Delt registrering: hvilken som
  -- helst flight-spiller kan sette/endre raden.
  entered_by     uuid not null references public.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (game_id, hole_number)
);

create trigger bingo_bango_bongo_holes_set_updated_at
  before update on public.bingo_bango_bongo_holes
  for each row execute function public.set_updated_at();

alter table public.bingo_bango_bongo_holes enable row level security;

-- Delt registrering: enhver spiller i samme game leser OG skriver. Speiler
-- "shared scorecard"-modellen (én scorer taster for flighten).
create policy bbb_holes_read
  on public.bingo_bango_bongo_holes for select
  using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = bingo_bango_bongo_holes.game_id
        and gp.user_id = auth.uid()
    )
  );

create policy bbb_holes_write
  on public.bingo_bango_bongo_holes for all
  using (
    public.is_admin() or exists (
      select 1 from public.game_players gp
      where gp.game_id = bingo_bango_bongo_holes.game_id
        and gp.user_id = auth.uid()
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from public.game_players gp
      where gp.game_id = bingo_bango_bongo_holes.game_id
        and gp.user_id = auth.uid()
    )
  );

-- Seed format-row + intent-mapping (sekundær under kompis)
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)
  values ('bingo_bango_bongo', 'Bingo Bango Bongo', 'bingo_bango_bongo',
          '2–4 spillere. Tre poeng per hull: først på green, nærmest, først i hull.',
          '@/lib/scoring/modes/bingoBangoBongo', true, false);

insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order)
  values ('bingo_bango_bongo', 'kompis', true, false, 70);
```

(Bekreft neste ledige `sort_order` mot eksisterende kompis-rader; 70 antatt etter wolf=50/skins/nassau. Juster hvis kollisjon.)

### 2. Scoring-modul — `lib/scoring/modes/bingoBangoBongo.ts`

**Discriminator:** `game_mode: 'bingo_bango_bongo'`, `mode_config.kind: 'bingo_bango_bongo'`.

**Inn-shape:** utvid `ScoringContext` med valgfritt felt:
```ts
bingoBangoBongoHoles?: BingoBangoBongoHoleInput[];
```
(speiler `wolfChoices?`-mønstret; `getGameWithPlayers` eller egen cachet helper fyller det).

**Algoritme (`compute(ctx): BingoBangoBongoResult`):**
```
for each hole 1..18:
  row = bingoBangoBongoHoles.find(h => h.holeNumber === hole)  // kan mangle → ingen poeng
  for cat in [bingo, bango, bongo]:
    userId = row?.[catUserId]
    if userId: pointsByPlayer[userId] += 1  (og inkrementer per-kategori-teller)
aggreger per spiller: { bingos, bangos, bongos, totalPoints }
rank på totalPoints desc
```
- Samme spiller kan vinne alle tre på ett hull (3 poeng) — helt lovlig.
- Slag (`ctx.scores`) brukes IKKE for BBB-poeng. (Behold tilgang for evt. fremtidig sekundær slag-visning, men ikke i v1.)

**Output (nye typer i `types.ts`):**
```ts
export interface BingoBangoBongoHoleInput {
  holeNumber: number;
  bingoUserId: string | null;
  bangoUserId: string | null;
  bongoUserId: string | null;
}

export interface BingoBangoBongoHoleRow {
  holeNumber: number;
  bingoUserId: string | null;
  bangoUserId: string | null;
  bongoUserId: string | null;
  pointsByPlayer: Record<string, number>;  // 0–3 per spiller dette hullet
}

export interface BingoBangoBongoPlayerLine {
  userId: string;
  bingos: number;
  bangos: number;
  bongos: number;
  totalPoints: number;     // bingos + bangos + bongos
  rank: number;
  tiedWith: string[];
}

export interface BingoBangoBongoResult {
  kind: 'bingo_bango_bongo';
  holes: BingoBangoBongoHoleRow[];
  players: BingoBangoBongoPlayerLine[];
}
```

**Tiebreak:** `totalPoints` desc. Ved lik total: flest bingos, så flest bongos, deretter delt rank (`tiedWith`-array satt). Dokumentér i kode at full 5-tier-cascade ikke gjelder (BBB er ikke slag-basert).

### 3. Mode-registrering + config

- `lib/scoring/index.ts`: importer `* as bingoBangoBongo`, legg til `case 'bingo_bango_bongo': return bingoBangoBongo.compute(ctx);`, re-eksporter BBB-typene.
- `lib/scoring/modes/types.ts`:
  - `GameMode`-union: `| 'bingo_bango_bongo'`
  - `MODE_LABELS`: `bingo_bango_bongo: 'Bingo Bango Bongo'` (+ evt. andre Record-maps som er exhaustive — søk opp alle `Record<GameMode, …>` så Vercel-build ikke feiler, jf. minne om tsc-gate).
  - `GameModeConfig`-union: `| { kind: 'bingo_bango_bongo'; team_size: 1 }` (individuell, ingen lag — speiler `solo_strokeplay`).
  - Utvid `ModeResult`-union med `BingoBangoBongoResult`.
  - `ScoringContext`: legg til `bingoBangoBongoHoles?: BingoBangoBongoHoleInput[]`.

### 4. Validator — `lib/games/gamePayload.ts`

Ny `validateBingoBangoBongo(formData, mode)`:
- 2–4 spillere (min 2, maks 4) ved publish. Individuell (`team_size: 1`, ingen lag-tildeling).
- Gjenbruk eksisterende error-codes (`min_players_for_mode` / `too_many_players_for_mode`) — sjekk eksisterende koder først.
- `mode_config`-output: `{ kind: 'bingo_bango_bongo', team_size: 1 }`.
- Wire i `parseGameMode` (`raw === 'bingo_bango_bongo'`) + `modeValidators`-mappen.

### 5. Server-helpers + Realtime (mappe `lib/bbb/`)

- `lib/bbb/getBingoBangoBongoHoles.ts` — `unstable_cache`-fetch, tag `game-${gameId}`, returnerer `BingoBangoBongoHoleInput[]` (speiler `getWolfChoices.ts`).
- `lib/bbb/setBingoBangoBongoHole.ts` — `'use server'`-action: upsert `(game_id, hole_number)` med de tre user-id-ene + `entered_by = auth.uid()`. Validér flight-medlemskap (RLS håndhever, men sjekk auth). **Lås når `games.status === 'finished'`** (server-side, som Wolf). På suksess: `revalidateTag(\`game-${gameId}\`, 'max')`.
- `lib/bbb/subscribeBingoBangoBongo.ts` — realtime-sub på `bingo_bango_bongo_holes` filtrert `game_id=eq.${gameId}`, re-fetcher og kaller `onUpdate` (speiler `subscribeWolfChoices.ts`).
- `getGameWithPlayers` eller leaderboard/hull-page fyller `bingoBangoBongoHoles` inn i `ScoringContext`.

### 6. Scorekort-UI — `BingoBangoBongoEntry` (per-hull-seksjon)

`app/games/[id]/holes/[holeNumber]/BingoBangoBongoEntry.tsx` (NY):
- Vises i `HoleClient.tsx` **under** den vanlige slag-padden når `gameMode === 'bingo_bango_bongo'` (additivt lag, ikke erstatning — Wolf-badge-mønstret).
- Tre rader: **Bingo**, **Bango**, **Bongo**. Hver rad = chip-rad med de 2–4 spillerne + en «Ingen»/tøm-knapp (kategori kan stå udelt).
- Delt registrering: hvilken som helst flight-spiller kan tappe. Endring → `setBingoBangoBongoHole(...)` → optimistisk lokal state-oppdatering → `revalidate`.
- Realtime: alle flight-spillere får oppdatering via `subscribeBingoBangoBongo`; UI re-renderer valgte spillere.
- Tap-targets ≥44px, `tabular-nums` der tall vises.
- `HoleClient.tsx` + `page.tsx`: pass `bingoBangoBongoHoles` + spiller-liste ned; integrer seksjonen.

### 7. Leaderboard — `BingoBangoBongoView` + `BingoBangoBongoPodium`

- `app/games/[id]/leaderboard/page.tsx`: ny `renderBingoBangoBongo(...)` — fetch BBB-holes (egen tabell), bygg `ScoringContext`, `computeLeaderboard` → narrow på `kind`. Routes finished → `<BingoBangoBongoPodium>`, aktiv → `<BingoBangoBongoView>`. (Slag-fetchen kan stå; BBB-compute ignorerer den.)
- `BingoBangoBongoView.tsx` (NY): per-spiller-tabell med kolonner **Bingo / Bango / Bongo / Sum**, sortert på sum desc, `tabular-nums`. Evt. per-hull-detalj under (hvem fikk hva). Bruk `SoloStablefordView`-struktur som mal.
- `BingoBangoBongoPodium.tsx` (NY): 1./2./3.-plass med totalpoeng (champagne-gull kun på vinner).
- `LeaderboardTabs.tsx`: legg til `bingo_bango_bongo`-case → `<BingoBangoBongoView>`. Respekter reveal-modus (skjul totals til `finished` hvis `score_visibility === 'reveal'`, som øvrige views).

## Edge Cases & Guardrails

- **Hull uten registrert rad:** ingen poeng deles ut for hullet. UI viser tomme selectorer. Ikke en feil.
- **Kategori udelt (null):** lovlig. Bango spesielt — krever at alle er på green; står ofte tom. Compute hopper over null-kategorier.
- **Samme spiller alle tre på ett hull:** 3 poeng til den spilleren. Lovlig, må dekkes av Type A-test.
- **2-spiller-game:** lovlig (min 2). Selectorene viser 2 spillere.
- **Spiller forsvinner mid-runde:** ikke støttet (som øvrige modes). Rotasjon/rekkefølge er honor-system, ikke app-håndhevet.
- **`games.status === 'finished'`:** `setBingoBangoBongoHole` avviser endring (locking server-side, som Wolf). UI skjuler/disabler selectorer.
- **`on delete set null` på user-FK-ene:** hvis en bruker slettes, nulles prestasjonen ut men hull-raden består (slag-historikk uberørt).
- **Slag teller ikke for BBB-poeng:** bekreft i Type A-test at varierende slag ikke endrer BBB-totaler.
- **Lever-scorekort / progress:** uendret maskineri — spillerne taster slag som vanlig, `myCompletedHoles` teller slag-rader. BBB-selectorene påvirker ikke lever-gating. (Bevisst: holder blast-radius minimal.)
- **Side-turnering (CTP/LD):** fungerer uendret siden slag finnes.

## Key Decisions

- **Slag beholdes via eksisterende scorekort; BBB-poeng fra de tre prestasjonene** — regelriktig + minimal blast-radius + matcher issue-ordlyd. Se «Key Architectural Decision» over.
- **Egen tabell `bingo_bango_bongo_holes`** (ikke JSONB/scores) — Wolf-mønstret: clean RLS, enkel realtime, audit (`entered_by`).
- **Delt registrering (any flight-medlem skriver)** — speiler shared-scorecard-modellen; ingen «det er din tur»-logikk (BBB-prestasjoner er observerte fakta, ikke valg).
- **Alle tre kategorier nullable** — bango krever ofte at alle er på green; tving ikke fullføring.
- **Individuell, 2–4 spillere, `team_size: 1`** — ingen lag (speiler `solo_strokeplay`-config).
- **Sekundær under kompis-intent** (`is_primary: false`) — per issue.
- **Filnavn `bingoBangoBongo.ts` (camelCase)** — repo-konvensjon (`bestBall.ts`, `soloStrokeplay.ts`), ikke issue-ets `bingo_bango_bongo.ts`. Slug i DB forblir `bingo_bango_bongo`.

**Claude's Discretion:**
- Eksakt mappenavn `lib/bbb/` vs `lib/bingoBangoBongo/` — velg det som er mest lesbart/konsist.
- Om per-hull-detalj-rad vises i `BingoBangoBongoView` eller bare per-spiller-totaler — start med totaler, legg til detalj hvis det er rent.
- Ikon for `icon_key: 'bingo_bango_bongo'` i `lib/formats/icons.tsx` — velg/lag passende; fall tilbake til en generisk hvis tiden er knapp.
- `sort_order`-tall (bekreft mot eksisterende kompis-rader).
- Norsk vs engelsk for «Bingo/Bango/Bongo» — behold som er (bevisste sportstermer, som Turkey/Snowman). Chip-labels og hjelpetekst på norsk.
- Test-organisering: én `bingoBangoBongo.test.ts` eller split — velg lesbart.

## Success Criteria

- [ ] Migrasjon `0053_bingo_bango_bongo.sql` kjører grønt: oppretter `bingo_bango_bongo_holes` med RLS + trigger, seeder format-row + intent-mapping. Verifiser: `select count(*) from formats where slug='bingo_bango_bongo'` = 1, `select count(*) from format_intent_mapping where format_slug='bingo_bango_bongo'` = 1.
- [ ] `lib/scoring/modes/bingoBangoBongo.ts` eksporterer `compute(ctx): BingoBangoBongoResult`.
- [ ] `lib/scoring/modes/bingoBangoBongo.test.ts` — Type A unit-tester (`it.each`): samme spiller alle 3 (3 poeng), vanlig fordeling, hull uten rad, kategori-null, 2/3/4 spillere, ranking + tiebreak, slag-uavhengighet.
- [ ] `lib/scoring/index.ts` har `bingo_bango_bongo`-case + type-re-eksport; `npx tsc --noEmit` grønn (alle exhaustive `Record<GameMode,…>` dekket).
- [ ] `lib/scoring/modes/types.ts` har BBB-typene + utvidet `GameMode`/`GameModeConfig`/`ModeResult`/`ScoringContext`/`MODE_LABELS`.
- [ ] `lib/games/gamePayload.ts` har `validateBingoBangoBongo` (2–4 spillere) wired i `parseGameMode` + `modeValidators`.
- [ ] `lib/bbb/` har `getBingoBangoBongoHoles`, `setBingoBangoBongoHole` (lås ved finished), `subscribeBingoBangoBongo` + tester der det gir mening (mock getAdminClient).
- [ ] `BingoBangoBongoEntry.tsx` rendres i hull-page når `gameMode === 'bingo_bango_bongo'`, lagrer via server-action, syncer via realtime (Type C render-test).
- [ ] `BingoBangoBongoView.tsx` viser Bingo/Bango/Bongo/Sum per spiller fra fixture (Type C render-test); `BingoBangoBongoPodium.tsx` viser 1/2/3.
- [ ] `LeaderboardTabs.tsx` + `renderBingoBangoBongo` routes BBB-games korrekt.
- [ ] Norsk copy gjennomgått med `humanizer:humanizer`-skill.
- [ ] CHANGELOG-oppføring + minor-bump `1.48.0 → 1.49.0`.

## Gates

Etter hver chunk:
- [ ] `npx tsc --noEmit` — 0 nye errors
- [ ] `npx vitest run lib/scoring/modes/bingoBangoBongo` — Type A grønn
- [ ] `npx vitest run` — full suite grønn (regresjonsbeskyttelse)
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build` — grønn (fanger exhaustive-switch/Record-gaps som tsc alene kan glippe)
- [ ] Playwright/manuell iPhone-Safari-sjekk for hull-entry-seksjonen hvis frontend rørt

## Files Likely Touched

**Nye:**
- `supabase/migrations/0053_bingo_bango_bongo.sql`
- `lib/scoring/modes/bingoBangoBongo.ts` + `.test.ts`
- `lib/bbb/getBingoBangoBongoHoles.ts` (+ test)
- `lib/bbb/setBingoBangoBongoHole.ts` (+ test)
- `lib/bbb/subscribeBingoBangoBongo.ts`
- `app/games/[id]/holes/[holeNumber]/BingoBangoBongoEntry.tsx` (+ test)
- `app/games/[id]/leaderboard/BingoBangoBongoView.tsx` (+ test)
- `app/games/[id]/leaderboard/BingoBangoBongoPodium.tsx`
- `e2e/bingo-bango-bongo-golden-path.spec.ts` (golden path, valgfri men anbefalt)

**Endrede:**
- `lib/scoring/modes/types.ts` — BBB-typer + union-utvidelser + `MODE_LABELS`
- `lib/scoring/index.ts` — case + re-eksport
- `lib/games/gamePayload.ts` — `validateBingoBangoBongo` + `parseGameMode` + `modeValidators`
- `lib/games/getGameWithPlayers.ts` — fyll `bingoBangoBongoHoles` (eller egen cachet helper)
- `lib/sync/realtimeChannel.ts` — evt. BBB-topic (hvis mønstret krever)
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` + `page.tsx` — integrer `<BingoBangoBongoEntry>`
- `app/games/[id]/leaderboard/page.tsx` — `renderBingoBangoBongo`
- `components/LeaderboardTabs.tsx` — bbb-case
- `lib/formats/icons.tsx` — `bingo_bango_bongo`-ikon
- `CHANGELOG.md` + `package.json` — minor-bump 1.49.0

## Out of Scope

- **Slag-løst scorekort** — bevisst forkastet (se Key Architectural Decision). Slag tastes som vanlig.
- **Sekundær slag-/netto-leaderboard for BBB-games** — slag registreres men vises ikke som egen standing i v1. Eget oppfølgings-issue hvis ønsket.
- **Rekkefølge-/honnør-håndheving** (lengst-fra-hull spiller først) — honor-system, ikke app-logikk.
- **Achievements/bragging-stats** (f.eks. «flest bingos») utover kategori-tellerne i leaderboard.
- **Wizard-spesifikk seksjon** — BBB trenger kun standard 2–4-spiller-utvalg; ingen scoring-toggle (poeng er ikke slag-deriverte).
- **Mid-round player-swap, 9-hulls-variant, push-notifikasjoner** — som øvrige modes, defer.

## Deferred Ideas

- Sekundær slag-leaderboard-fane for BBB-games (gross/netto ved siden av prestasjons-poeng).
- «Mest bingos hele sesongen»-statistikk på tvers av games.
