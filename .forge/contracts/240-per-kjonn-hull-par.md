# Spec: Per-kjønn-overstyring av hull-par

**Issue:** [#240](https://github.com/jdlarssen/golf-app/issues/240) — utsatt fra Fase 2 av [#223](https://github.com/jdlarssen/golf-app/issues/223)
**Branch:** `claude/pensive-northcutt-1d1f0d`
**Berører:** `course_holes` (DB-skjema), `lib/scoring/modes/*` (4 modi + types), `app/admin/courses/CourseForm.tsx` (form-UI), `lib/games/*` (mapper-lag), `app/games/[id]/leaderboard/page.tsx` (avvik-indikator), pluss minst 5 andre call-sites som leser `course_holes.par`.
**Bump:** MINOR — `1.30.x` → `1.31.0`

## Problem

Per d.d. har `public.course_holes` ett `par`-felt per hull (felles for alle kjønn). Antagelsen holder for ~99 % av norske baner. Unntakene: baner hvor dame-tee er plassert kortere før et vannhinder slik at hullet får annerledes par-karakter — typisk dame-par-5 hvor herrer har par-4. I dag tvinges admin til å bruke samme par for alle kjønn, og dame-spillerens stableford-poeng (og dermed stroke-allokering, leaderboard og matchplay-hull-utfall) blir feil for de få hullene som faktisk skiller.

Issue-en ble eksplisitt utsatt fra Fase 2 av #223 ([223-courses-phase2-vedlikehold-og-filter.md](.forge/contracts/223-courses-phase2-vedlikehold-og-filter.md), «Prior Decisions»-seksjonen) fordi den krever endring i alle 4 scoring-modi pluss ny test-disiplin. Bundling med vedlikeholds-arbeid ville økt risiko for scoring-regresjon. Nå tas den som egen kontrakt, med scoring-tester først.

## Research Findings

Ingen eksterne biblioteker. Funn fra kode-scouting:

- **Tee-boks-skjema speiles allerede per kjønn.** [0028_tee_box_gender.sql](supabase/migrations/0028_tee_box_gender.sql) + [0029_tee_box_multi_rating.sql](supabase/migrations/0029_tee_box_multi_rating.sql) la til `slope_<gender>`, `course_rating_<gender>`, `par_total_<gender>`-kolonner på `tee_boxes` med suffiks-mønster (`mens` / `ladies` / `juniors`). Vi følger samme mønster på `course_holes` for konsistens.
- **Kjønn på spiller-nivå finnes allerede.** `users.gender` (`mens` / `ladies`) og `game_players.tee_gender` (`mens` / `ladies` / `juniors`) — sistnevnte er sannhetskilde for hvilken tee-variant en spiller faktisk spiller fra. Tee-gender lagres på `game_players` ved game-create slik at endring av `users.gender` ikke endrer historiske spill.
- **Scoring-laget leser én felles `par` per hull i dag.** `ScoringHole`-interfacet ([lib/scoring/modes/types.ts:70](lib/scoring/modes/types.ts:70)) bærer `{ number, par, strokeIndex }`. Alle 4 modi ([bestBallNetto.ts:138](lib/scoring/modes/bestBallNetto.ts:138), [texasScramble.ts:103](lib/scoring/modes/texasScramble.ts:103), [singlesMatchplay.ts:292](lib/scoring/modes/singlesMatchplay.ts:292), [stableford.ts:76/200/232](lib/scoring/modes/stableford.ts:76)) leser `hole.par` direkte. Stableford bruker par for `computeStablefordPoints({ par, netStrokes })`; matchplay bruker par i hull-rad-output; bestBall/scramble bruker par til hull-rad-output (par påvirker ikke ranking direkte i strokeplay, men er kritisk for stableford-poeng og UI-rendering).
- **Mapper-laget fetcher `course_holes` rå.** [leaderboard/page.tsx:267-272](app/games/[id]/leaderboard/page.tsx:267) leser `course_holes`-radene og mapper til `ScoringHole[]` før kall til `computeLeaderboard()`. Samme mønster i submit, scorecard, hull-page, game-home. Per-kjønn-resolusjon skjer naturlig i denne mapper-grensen.
- **CourseForm har allerede expand-mønster.** [CourseForm.tsx:113-121](app/admin/courses/CourseForm.tsx:113) bruker `expandedLadies`/`expandedJuniors`-parallell-arrayer for å åpne/lukke rating-blokker per tee. Samme mønster utvides til en separat «Avvikende par for damer/junior»-seksjon under hull-listen.
- **`sumHolePars` er kilde-til-sannhet for par-total.** [CourseForm.tsx:82](app/admin/courses/CourseForm.tsx:82) summerer hull-par for visning. Server-actions ([app/admin/courses/new/actions.ts](app/admin/courses/new/actions.ts), [app/admin/courses/[id]/edit/actions.ts](app/admin/courses/[id]/edit/actions.ts)) regner `par_total_<gender>` fra summen istedenfor å lese inputfelt — auto-sync er allerede etablert. Vi utvider dette til per-kjønn-summer.
- **Migrasjons-nummer:** siste migrasjon i tre-en er `0038_courses_backfill_updated_by.sql`. Ny migrasjon: `0039_course_holes_per_gender_par.sql`.

## Prior Decisions

- **Fra Fase 2 av #223:** Per-kjønn-hull-par flyttet til egen fase (denne kontrakten) for å unngå scoring-regresjon i samme PR som vedlikeholds-endringer. Bekreftet av bruker.
- **Fra brukerens diskusjon (2026-05-26 chat):**
  - **Form-mønster:** Ekspandert seksjon under rating. Felles par per hull øverst, deretter «Avvikende par»-toggle som åpner egen 18-hulls-rad per kjønn. Lavprofil, oppdages ved behov.
  - **Spiller-visning:** Spillerens egen par + indikator (asterisk/info-ikon) ved hull der medspillere har annerledes par. Tooltip eller fotnote forklarer.
  - **Validering:** Auto-sync `tee_boxes.par_total_<gender>` fra summen av per-kjønn-par. Ingen mismatch mulig.
- **Fra CLAUDE.md:** `lib/scoring/` er låst bak ny-test-først-regel. Nye tester per modul skrives og verifiseres FØR scoring-logikken endres.
- **Fra CLAUDE.md (memory `closes-n-on-epics`):** PR-en bruker `Closes #240` (issue er ikke epic, kan lukkes direkte).
- **Fra CLAUDE.md (memory `worktree-hooks-path`):** Bekreftet at `core.hooksPath` peker på `.githooks` i denne worktreen.

## Design

### 1. Datamodell

**Migration `0039_course_holes_per_gender_par.sql`:**

```sql
-- Per-kjønn-overstyring av hull-par (#240).
-- Speiler tee_boxes-mønsteret med _mens/_ladies/_juniors-suffiks.

alter table public.course_holes
  add column par_mens int check (par_mens between 3 and 6),
  add column par_ladies int check (par_ladies between 3 and 6),
  add column par_juniors int check (par_juniors between 3 and 6);

-- Backfill: eksisterende rader får samme par-verdi for alle tre kjønn.
update public.course_holes
   set par_mens = par,
       par_ladies = par,
       par_juniors = par
 where par_mens is null;

-- Etter backfill: kolonnene er NOT NULL.
alter table public.course_holes
  alter column par_mens set not null,
  alter column par_ladies set not null,
  alter column par_juniors set not null;

-- Drop gammel par-kolonne (forced cutover). Ingen produksjons-kode skal
-- lese course_holes.par etter denne migrasjonen. Type-regen + alle 6
-- call-sites oppdateres i samme PR.
alter table public.course_holes drop column par;

comment on column public.course_holes.par_mens is
  'Par for hullet sett fra herre-tee. NOT NULL. #240.';
comment on column public.course_holes.par_ladies is
  'Par for hullet sett fra dame-tee. NOT NULL — sett lik par_mens for ' ||
  'hull der dame-par er identisk. #240.';
comment on column public.course_holes.par_juniors is
  'Par for hullet sett fra junior-tee. NOT NULL — sett lik par_mens som ' ||
  'default. #240.';
```

Migrasjonen er forced cutover — ingen midlertidig dual-write-fase. Begrunnelse: én admin (Jørgen), ingen produksjons-baner har avvikende par i dag, alle koden-konsumenter må uansett oppdateres for å bruke tee_gender-oppslag. Dual-write ville bare gi mer kompleksitet uten gevinst.

**Type-regen via Supabase MCP:** `mcp__36be25a6-2d72-41c3-a675-2352133ed510__generate_typescript_types` etter migrasjon — oppdaterer `lib/database.types.ts` til å speile ny skjema.

### 2. Scoring-laget — design

**Endringer i `lib/scoring/modes/types.ts`:**

```ts
export type Gender = 'mens' | 'ladies' | 'juniors';

export interface ScoringHole {
  number: number;
  /**
   * Felles par-verdi. Brukes som default når `parByGender` ikke er satt
   * (eksisterende tester, gamle test-fixtures). Når `parByGender` er satt
   * resolveres par per spiller via `parFor(hole, gender)`.
   */
  par: number;
  /**
   * Valgfri per-kjønn-overstyring. Når NULL: alle kjønn bruker `par`.
   * Når satt: scoring-laget velger `parByGender[player.teeGender]`.
   */
  parByGender?: { mens: number; ladies: number; juniors: number };
  strokeIndex: number;
}

export interface ScoringPlayer {
  userId: string;
  teamNumber: number | null;
  flightNumber: number | null;
  courseHandicap: number;
  /**
   * Spillerens tee-gender (fra game_players.tee_gender). Brukes til å
   * velge riktig par fra hole.parByGender. Default 'mens' for backward
   * compat med eksisterende tester som ikke fyller ut feltet.
   */
  teeGender?: Gender;
}
```

**Ny helper i `lib/scoring/modes/parResolver.ts`:**

```ts
export function parFor(hole: ScoringHole, gender: Gender | undefined): number {
  if (!hole.parByGender) return hole.par;
  return hole.parByGender[gender ?? 'mens'];
}
```

**Endringer i hver scoring-modul:** Erstatte alle `hole.par` med `parFor(hole, player.teeGender)`. For singles_matchplay regnes par per side; samme helper. For Texas scramble (lag spiller felles ball): laget bruker kapteinens (lexicographically minste userId) `teeGender`. Begrunnelse: alle medlemmer på et Texas-lag spiller normalt fra samme tee; blandet-gender Texas-lag er sjeldnere enn 1 % av allerede sjeldne 0,5 %-tilfellet, og kan håndteres som senere refinement hvis det dukker opp.

**Backward compat:** Eksisterende tester som setter `par: 4` direkte uten `parByGender` fortsetter å fungere uendret. Helper returnerer `hole.par` som fallback. Nye tester legger til `parByGender` for å verifisere per-kjønn-oppførsel.

### 3. Mapper-laget

Hver call-site som mapper `course_holes` → `ScoringHole[]` oppdateres til å fylle ut `parByGender`. Eksempel fra leaderboard-siden:

```ts
const rawHolesRes = await supabase
  .from('course_holes')
  .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
  .eq('course_id', game.course_id)
  .order('hole_number', { ascending: true });

const holes: ScoringHole[] = rawHolesRes.data!.map((row) => ({
  number: row.hole_number,
  par: row.par_mens, // default for backward compat
  parByGender: {
    mens: row.par_mens,
    ladies: row.par_ladies,
    juniors: row.par_juniors,
  },
  strokeIndex: row.stroke_index,
}));
```

Spillerens `teeGender` mappes fra `game_players.tee_gender` i samme transform der `ScoringPlayer`-arrayen bygges.

**Call-sites å oppdatere** (alle som SELECT-er `course_holes.par`):

1. [app/games/[id]/leaderboard/page.tsx](app/games/[id]/leaderboard/page.tsx)
2. [app/games/[id]/leaderboard/holes/page.tsx](app/games/[id]/leaderboard/holes/page.tsx)
3. [app/games/[id]/page.tsx](app/games/[id]/page.tsx) (game-home auto-start)
4. [app/games/[id]/hull/[hole]/page.tsx](app/games/[id]/hull/[hole]/page.tsx)
5. [app/games/[id]/scorecard/page.tsx](app/games/[id]/scorecard/page.tsx)
6. [app/games/[id]/submit/page.tsx](app/games/[id]/submit/page.tsx)
7. [lib/games/getGameWithPlayers.ts](lib/games/getGameWithPlayers.ts) — hvis den joiner course_holes; sjekk

Sweep via `grep -rn "course_holes" --include="*.ts" --include="*.tsx" app/ lib/` + `grep -rn "\.par" lib/games/`.

### 4. CourseForm — UI

**Ny state:**

```ts
const [expandedLadiesPar, setExpandedLadiesPar] = useState<boolean>(
  initialData?.holes.some((h) => h.par_ladies !== h.par_mens) ?? false,
);
const [expandedJuniorsPar, setExpandedJuniorsPar] = useState<boolean>(
  initialData?.holes.some((h) => h.par_juniors !== h.par_mens) ?? false,
);
```

Initialiseres åpen på edit-flyten kun hvis kursen faktisk har avvikende par-verdier. På new-flyten alltid lukket.

**HoleData utvides:**

```ts
export type HoleData = {
  hole_number: number;
  par_mens: string;     // erstatter dagens 'par'
  par_ladies: string;   // ny
  par_juniors: string;  // ny
  stroke_index: string;
};
```

**Form-layout:** Under hovedhull-listen (som forblir én tap-rad per hull = `par_mens`), legges en ny seksjon:

```
[Hull 1–18 — herre-par + SI som i dag]

  + Legg til avvikende par for damer  ← bare hvis ikke utvidet
  + Legg til avvikende par for junior  ← bare hvis ikke utvidet

  Når utvidet (Damer):
    Avvikende par for damer        [Fjern dame-overstyring]
    [Hull 1: 4] [Hull 2: 4] [Hull 3: 5] ...   ← tap-rad per hull
    Par-total damer: 73 (auto-syncet til tee-boksene)
```

**Auto-sync av par_total:** I server-actions (`createCourse` + `updateCourse`) regnes `par_total_mens`, `par_total_ladies`, `par_total_juniors` fra `sumHolePars(holes, gender)` og settes på alle tee_boxes for tilsvarende kjønn. Helper `sumHolePars` generaliseres:

```ts
export function sumHolePars(holes: HoleData[], gender: Gender = 'mens'): number {
  const key = `par_${gender}` as const;
  return holes.reduce((sum, h) => {
    const n = Number(h[key]);
    return Number.isInteger(n) ? sum + n : sum;
  }, 0);
}
```

**Fjern-knapp:** Når admin trykker «Fjern dame-overstyring» tilbakestilles `par_ladies = par_mens` for alle 18 hull. Toggle-en kollapser. Ved neste form-submit er per-kjønn-kolonnene fortsatt fylt (NOT NULL i DB), men identiske med `par_mens` — så `parByGender` produserer samme verdi for alle kjønn.

### 5. Spiller-visning — avvik-indikator

På scorekort og hull-rad i leaderboard, der par vises som «P4» eller «Par 4»: når et hull har avvikende par mellom kjønn (`par_mens !== par_ladies` eller `par_mens !== par_juniors`), vises spillerens egen par med en liten infö-asterisk:

```
Hull 7    Par 4 *    SI 3    Slag: ___
```

Tooltip/aria-label: «Dette hullet har annerledes par for andre kjønn. Damer: 5, junior: 4.»

**Implementasjon:** Ny helper `lib/games/parDisplay.ts` med `hasParDifference(hole)` + `formatParAside(hole, playerGender)`. Brukes konsistent over:

- Scorekort (`app/games/[id]/scorecard/page.tsx`)
- Hull-page (`app/games/[id]/hull/[hole]/page.tsx`)
- Leaderboard-hull-tab (`app/games/[id]/leaderboard/holes/page.tsx`)

**Visuell:** Asterisk er `text-muted text-[10px]` superskript. Klikkbar (åpner tooltip på desktop, native popover på iOS).

### 6. Test-strategi

**Test-først-disiplin:** Før koden i scoring-modulene endres, skrives nye tester for hver modul som:

1. Konstruerer `ScoringHole[]` med `parByGender` der `mens !== ladies`
2. Konstruerer `ScoringPlayer[]` med forskjellig `teeGender`
3. Verifiserer at scoring-output reflekterer per-spiller par-resolusjon

**Per modul:**

- **stableford.test.ts:** Hull der dame-par = 5, herre-par = 4. Begge spillere skyter 5 strokes netto. Herre får 2 poeng (1 over par), dame får 3 poeng (par). Verifiserer at `computeStablefordPoints` kalles med riktig par per spiller.
- **bestBallNetto.test.ts:** Sjekker at `BestBallHoleRow.par` (per-hull-display-par) settes til lagets dominante par eller per-spiller (TBD i implementasjon; sjekkes mot spec her). Verifiser at `extraStrokes`-fordelingen er uendret (SI er ikke per-kjønn).
- **singlesMatchplay.test.ts:** Side 1 (herre) og side 2 (dame) med samme gross og samme extra strokes. Hvis par_mens=4, par_ladies=5: ingen direkte påvirkning på hull-utfall (matchplay sammenligner netto, par er bare display). Verifiserer at `MatchplayHoleRow.par` returnerer side 1 sin par (eller per-side, TBD).
- **texasScramble.test.ts:** Lag med blandet kjønn. Verifiserer at lag-par settes fra kapteinens `teeGender`.

**Eksisterende tester (~40 stk) skal fortsatt passere uendret.** Tester som ikke setter `parByGender` eller `teeGender` faller tilbake til `hole.par`-default. Det er bevisst — eksisterende tester verifiserer at default-oppførsel ikke regresserer.

### 7. Versjon + CHANGELOG

`package.json`: `1.30.0` → `1.31.0` (MINOR — ny user-synlig funksjon: per-kjønn-par + indikator).

CHANGELOG-tagline (norsk, stakeholder-rettet):

> Baner med dame-tee plassert kortere før et vannhinder får nå riktig stableford-poeng for damer. Du kan registrere avvikende par per kjønn i bane-redigeringen — appen viser en liten stjerne ved siden av par på hull der medspillere har annerledes par.

**Teknisk-seksjon:** Migration 0039, scoring-modul-refactor med per-kjønn-oppslag, CourseForm-utvidelse, indikator-helper.

## Out of Scope

- **Stroke index per kjønn.** Issue-en scoper kun par; SI-fordeling per kjønn er separat (sjelden i Norge, og dame-tee bruker normalt samme SI som herre-tee selv om hull-rekkefølgen oppleves annerledes).
- **Blandet-kjønn Texas-scramble-lag med tee-gender-mix.** Bruker kapteinens `teeGender` per default. Hvis dette dukker opp som reelt scenario, refines i senere fase.
- **UI for å vise alle tre par-verdier samtidig på scorekort.** Vi viser spillerens egen par + asterisk. Tooltip viser andre kjønn, men ingen alltid-på side-by-side-visning.
- **Soft-archive av per-kjønn-par-historie.** Hvis admin endrer par_ladies fra 5 til 4 på en bane: historiske spill bruker `course_holes` direkte (ikke frozen ved game-start). Konsekvens: en endring av par_ladies kan endre stableford-poeng for ferdige spill. Pre-eksisterende svakhet i datamodellen (gjelder også `par`, `stroke_index`); ikke i scope for #240.

## Success Criteria

- [ ] **DB-migrasjon kjørt:** `course_holes` har `par_mens`, `par_ladies`, `par_juniors` (NOT NULL, CHECK 3-6). Gammel `par`-kolonne droppet. Backfill verifiserbart: alle eksisterende rader har `par_mens = par_ladies = par_juniors` lik gammel `par`. Evidence: SQL `SELECT par_mens, par_ladies, par_juniors FROM course_holes LIMIT 5` via Supabase MCP + `list_migrations`-bekreftelse.
- [ ] **Types regenerert:** `lib/database.types.ts` har de tre nye kolonnene på `course_holes.Row`. Gamle `par`-feltet fjernet. Evidence: `grep -n "par_mens\|par_ladies\|par_juniors" lib/database.types.ts`.
- [ ] **ScoringHole + ScoringPlayer utvidet:** Nye typer + `parFor`-helper i `lib/scoring/modes/`. Evidence: file:line på `parByGender`, `teeGender`, `parFor`.
- [ ] **Nye scoring-tester skrevet og grønne:** Minst én ny test per modul (stableford, bestBallNetto, singlesMatchplay, texasScramble) som verifiserer per-spiller-par-oppførsel. Evidence: `npm test -- lib/scoring/modes/stableford.test.ts` etc.
- [ ] **Alle 4 scoring-modi oppdatert:** `grep -n "hole\.par\b" lib/scoring/modes/` skal returnere kun fallback-stier i `parFor`-helperen (eller ingen direkte lesinger). Evidence: grep-output.
- [ ] **Mapper-laget oppdatert (alle call-sites):** Alle 6+ filer som SELECT-er `course_holes` returnerer `par_mens, par_ladies, par_juniors` og fyller `parByGender` ved mapping. Evidence: `grep -rn "course_holes" --include="*.tsx" --include="*.ts" app/ lib/` + verifisering at hver returnerer per-kjønn-felter.
- [ ] **CourseForm utvidet:** Ekspandert seksjon for dame/junior-par. Default-kollapset på new-flyt, åpen på edit-flyt hvis bane har avvik. Fjern-knapp tilbakestiller per-kjønn-verdier til `par_mens`. Evidence: screenshot eller Playwright-flow.
- [ ] **Server-actions auto-syncer par_total_<gender>:** `createCourse` + `updateCourse` regner `par_total_<gender>` fra `sumHolePars(holes, gender)` og setter på alle tee_boxes. Evidence: kode-referanse i actions.ts + SQL-snapshot etter test.
- [ ] **Avvik-indikator vises på scorekort + hull-page + leaderboard:** Asterisk vises ved hull med par-avvik. Tooltip/aria-label forklarer. Evidence: rendered HTML eller screenshot.
- [ ] **Eksisterende ~40 scoring-tester grønne:** Ingen regresjon. Evidence: full `npm test` output.
- [ ] **`npm run typecheck` grønn.**
- [ ] **`npm run lint` grønn.**
- [ ] **CHANGELOG + versjon bumpet:** `package.json` 1.31.0, `CHANGELOG.md` ny oppføring med Jørgen-tagline og Teknisk-seksjon.

## Gates

Etter hver chunk:

```
npm run typecheck
npm test           # eller scope: npm test -- lib/scoring/
npm run lint
```

Headline-gate før formal evaluator: alle tre må være grønn.

Migration-spesifikk: `mcp__36be25a6-2d72-41c3-a675-2352133ed510__list_migrations` skal vise 0039 som siste; `execute_sql` skal verifisere kolonne-eksistens.

## Implementation Chunks

1. **Migration + types.** Apply 0039 via Supabase MCP, regen types, commit `feat(courses): add per-gender par columns to course_holes`.
2. **Test-først per scoring-modul.** Skriv nye tester i alle 4 *.test.ts før implementasjon. Skal feile (eller skippes hvis interfacet ikke finnes ennå). Commit `test(scoring): add per-gender par cases for 4 modes`.
3. **ScoringHole + parFor + ScoringPlayer.** Utvid typer, lag parResolver-helper. Commit `feat(scoring): add per-gender par resolution helpers`.
4. **Per scoring-modul: bytte hole.par → parFor.** Én commit per modul. Nye tester skal nå være grønne.
5. **Mapper-laget oppdatert.** Alle 6+ call-sites fyller `parByGender` + `teeGender`. Commit per logisk gruppe (leaderboard-stack, scorecard-stack, submit-flyt).
6. **CourseForm + server-actions.** Ekspandert seksjon, auto-sync av par_total_<gender>. Commit `feat(admin/courses): add per-gender par override UI`.
7. **Avvik-indikator (parDisplay-helper + 3 surfaces).** Commit `feat(games): show par difference indicator on hole displays`.
8. **CHANGELOG + version bump.** Commit som inkluderer feature-merket endring (kan kombineres med siste feat-commit hvis version-bump-hook tillater).

## Notes

- **TDD-disiplin er ufravikelig for `lib/scoring/`.** Chunk 2 (skriv tester) MÅ komme før chunk 4 (endre implementasjon). Hvis tester ikke kan skrives før parFor-helperen eksisterer: aksepter at chunk 3 (helper) kommer før chunk 2 (tester), men tester må skrives før chunk 4.
- **Forced cutover på migrasjon = ingen rollback uten ny migrasjon.** Hvis Supabase-migrasjonen feiler på `drop column par` (f.eks. uventet view-dependency), del migrasjonen i 0039 (add + backfill + NOT NULL) og 0040 (drop par) — slik at 0039 kan stå hvis 0040 må revertes. Sjekk via `list_extensions` + `execute_sql` om noen views refererer `course_holes.par` før migrasjon kjøres.
- **Per-kjønn-par-resolusjon for Texas-scramble blandet-lag** er bevisst pragmatisk (kapteinens teeGender). Hvis brukeren reagerer, kan refineres i fase 2 av denne feature-en.
- **Indikator-tooltip på iOS:** native popover (`<details>` med inline summary) eller liten panel som åpnes på tap. Ingen JavaScript-tooltip — må fungere uten interaktion.
