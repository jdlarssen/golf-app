# Sideturnering — utvidet poengsystem (implementation plan)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Levere v1.2.0 — sideturneringen får 12 nye vinner-tar-alt-kategorier + 3 stackbare achievements (Turkey/Solid/Snowman), tier-vektet med best netto 18 som 10p-grunnpilar, og per-kategori-toggle ved spill-opprett med tre presets.

**Architecture:** Ren funksjonell scoring-utvidelse av `lib/scoring/sideTournament.ts` med poeng-vekter i ny `sideTournamentConfig.ts`. Én migrasjon (`0026`) for å persistere disabled-categories-listen. Team-size-aware regler skrevet med tester for N=1/2/4. Ingen nye UI-flyter — bare utvidet `SideTournamentView` (grupperte sub-headers per tier) og ny `SideCategoriesPicker` i admin/games/new + edit.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest + Testing Library, Supabase (Postgres + RLS), Tailwind v4. TDD-strikt for `lib/scoring/` per Tørny-konvensjon.

**Companion design:** [docs/plans/2026-05-16-side-tournament-expanded-points-design.md](2026-05-16-side-tournament-expanded-points-design.md) — godkjent 2026-05-16. Sjekk når du trenger detaljer om regler, tie-håndtering eller UI-layout.

---

## Subagent-modell

Alle implementer- og reviewer-subagenter kjøres med **Opus** per memory `feedback_subagent_model_routing`.

## Felles disiplin

- **TDD-strikt for `lib/scoring/`:** test først → kjør og se den feile → implementer minimumskoden → kjør og se den passere → commit. Ingen unntak.
- **Atomic commits:** ett logisk fokus per commit. En kategori = én commit. UI-endring = egen commit.
- **Conventional commit-prefix:** `feat(scoring)`, `feat(side-tournament)`, `test(scoring)`, etc. Hooken (`.githooks/commit-msg`) krever `package.json`-bump + CHANGELOG-entry på `feat/fix/perf`. Bump-en og CHANGELOG-en gjøres i siste-commit (Phase 9).
- **Sjekk eksisterende tester** kjører grønt etter hver endring: `npm test -- lib/scoring/sideTournament.test.ts`.
- **Aldri** hardcode `userIds.length === 2` — bruk `N = team.userIds.length` overalt.

---

## Phase 1 — Foundation

### Task 1.1: Migrasjon 0026 — `side_disabled_categories`-kolonne

**Files:**
- Create: `supabase/migrations/0026_side_tournament_categories.sql`

**Steps:**

1. Skriv migrasjon (eksakt SQL fra design-dokument §Datamodell). Inkluder CHECK-constraint som validerer at array-en kun inneholder kjente kategori-IDer. Bruk `text[] not null default '{}'`.

2. Apply via Supabase MCP (per memory `reference_supabase_mcp`: project id `glofubopddkjhymcbaph`):
   ```
   mcp__36be25a6-...__apply_migration name="side_tournament_categories" query="<sql>"
   ```

3. Verifiser via `list_tables`-MCP at kolonnen finnes på `public.games` og at constraint er aktiv.

4. Commit:
   ```bash
   git add supabase/migrations/0026_side_tournament_categories.sql
   git commit -m "feat(db): add side_disabled_categories column to games"
   ```

   Hook vil kreve `package.json`-bump + CHANGELOG. **Endring:** bruk `chore(db):` istedet, siden migrasjonen alene ikke er bruker-synlig (kommer i bruk først når UI-en er på plass i Phase 7). Migrasjon er semantisk «infrastruktur», ikke ny feature.

   ```bash
   git commit -m "chore(db): add side_disabled_categories column to games"
   ```

---

### Task 1.2: Sentralisert poeng-config

**Files:**
- Create: `lib/scoring/sideTournamentConfig.ts`

**Steps:**

1. Skriv ren konstantfil:

   ```ts
   // lib/scoring/sideTournamentConfig.ts
   // Sentralisert poeng-vekter for sideturneringen. Justering av vekter
   // gjøres ved å endre tall her — ingen logikk-endring nødvendig.

   export const SIDE_TOURNAMENT_POINTS = {
     // Tier 1 — Hovedkonkurranser (eksisterende, uendret)
     bestNetto18: 10,
     bestNettoF9: 5,
     bestNettoB9: 5,

     // Tier 2 — Skill og rarity
     bestBrutto18Team: 4,
     bestBrutto18Individual: 2,
     kingPar3Team: 4,
     kingPar3Individual: 2,
     kingPar5Team: 4,
     kingPar5Individual: 2,
     mostEaglesTeam: 4,
     mostEaglesIndividual: 2,
     longestBogeyFreeStreak: 4,

     // Tier 3 — Moderate
     bestBruttoF9Team: 2,
     bestBruttoF9Individual: 1,
     bestBruttoB9Team: 2,
     bestBruttoB9Individual: 1,
     mostBirdiesTeam: 2,
     mostBirdiesIndividual: 1,
     mostParsTeam: 2,
     mostParsIndividual: 1,
     lowestSingleHoleBrutto: 2,

     // Hull-konkurranser (eksisterende)
     holeWin: 2,
     longestDrive: 2,
     closestToPin: 2,

     // Achievements
     turkeyPerPlayer: 4,
     turkeyCoordPerMember: 4,
     solidPerPlayer: 2,
     solidCoordPerMember: 2,
     snowman: -2,
   } as const;

   export type SideCategoryId =
     | 'best_netto_18' | 'best_netto_f9' | 'best_netto_b9'
     | 'best_brutto_18_team' | 'best_brutto_18_individual'
     | 'best_brutto_f9_team' | 'best_brutto_f9_individual'
     | 'best_brutto_b9_team' | 'best_brutto_b9_individual'
     | 'most_birdies_team' | 'most_birdies_individual'
     | 'most_eagles_team' | 'most_eagles_individual'
     | 'most_pars_team' | 'most_pars_individual'
     | 'king_par3_team' | 'king_par3_individual'
     | 'king_par5_team' | 'king_par5_individual'
     | 'longest_bogey_free_streak'
     | 'lowest_single_hole_brutto'
     | 'hole_win'
     | 'longest_drive' | 'closest_to_pin'
     | 'turkey' | 'solid' | 'snowman';

   export const ALL_CATEGORY_IDS: readonly SideCategoryId[] = [...] as const; // fyll inn alle 26

   export const CLASSIC_ENABLED_CATEGORIES: readonly SideCategoryId[] = [
     'best_netto_18', 'best_netto_f9', 'best_netto_b9',
     'hole_win', 'longest_drive', 'closest_to_pin',
   ] as const;

   /** For "Klassisk"-preset: alle ID-er som IKKE er i CLASSIC_ENABLED_CATEGORIES */
   export const CLASSIC_DISABLED_CATEGORIES: readonly SideCategoryId[] = ALL_CATEGORY_IDS
     .filter((id) => !CLASSIC_ENABLED_CATEGORIES.includes(id));
   ```

2. Commit:
   ```bash
   git add lib/scoring/sideTournamentConfig.ts
   git commit -m "chore(scoring): add central side-tournament points config"
   ```

---

## Phase 2 — Extended scoring inputs

### Task 2.1: Utvid `SideTournamentInput`

**Files:**
- Modify: `lib/scoring/sideTournament.ts`

**Steps:**

1. Skriv test som verifiserer at type-utvidelsen ikke bryter eksisterende kall:

   ```ts
   // lib/scoring/sideTournament.test.ts — legg til i eksisterende suite
   describe('extended input shape (v1.2.0)', () => {
     it('accepts coursePars, playerScoresPerHole, and disabledCategories', () => {
       const input: SideTournamentInput = {
         config: { enabled: true, ldCount: 0, ctpCount: 0, disabledCategories: [] },
         teams: [{ teamId: 1, userIds: ['u1'] }],
         coursePars: Array(18).fill(4),
         playerScoresPerHole: [{
           userId: 'u1',
           perHoleGross: Array(18).fill(4),
           perHoleNetto: Array(18).fill(4),
         }],
         nettoBestBallPerHole: [{ teamId: 1, perHoleNetto: Array(18).fill(4) }],
         sideWinners: [],
       };
       expect(() => calculateSideTournament(input)).not.toThrow();
     });
   });
   ```

2. Kjør: `npm test -- lib/scoring/sideTournament.test.ts` — forventer compile-feil.

3. Utvid `SideTournamentConfig`:
   ```ts
   export interface SideTournamentConfig {
     enabled: boolean;
     ldCount: 0 | 1 | 2;
     ctpCount: 0 | 1 | 2;
     disabledCategories: readonly SideCategoryId[]; // NY
   }
   ```

4. Utvid `SideTournamentInput`:
   ```ts
   export interface SideTournamentInput {
     config: SideTournamentConfig;
     teams: Array<{ teamId: TeamId; userIds: UserId[] }>;
     coursePars: number[]; // NY — 18 elementer
     playerScoresPerHole: Array<{ // NY
       userId: UserId;
       perHoleGross: Array<number | null>;
       perHoleNetto: Array<number | null>;
     }>;
     nettoBestBallPerHole: Array<{ teamId: TeamId; perHoleNetto: Array<number | null> }>;
     sideWinners: SideWinner[];
   }
   ```

5. Eksisterende 13 tester: oppdater hver input-fixture med tomme nye felter (`coursePars: Array(18).fill(4)`, `playerScoresPerHole: []`, `disabledCategories: []`). De skal fortsatt passere uten endring i logikk.

6. Kjør: `npm test -- lib/scoring/sideTournament.test.ts` — forventer alle grønne.

7. Commit:
   ```bash
   git add lib/scoring/sideTournament.ts lib/scoring/sideTournament.test.ts
   git commit -m "refactor(scoring): extend SideTournamentInput with pars + per-player scores"
   ```

---

### Task 2.2: Disabled-categories-filtering

**Files:**
- Modify: `lib/scoring/sideTournament.ts`

**Steps:**

1. Test først:
   ```ts
   it('skips best_netto_18 when in disabledCategories', () => {
     const input = makeInput({
       disabledCategories: ['best_netto_18'],
       /* ... lag som ville vunnet ... */
     });
     const result = calculateSideTournament(input);
     expect(result.teamStandings[0].awards.filter((a) => a.category === 'best_netto_18')).toHaveLength(0);
   });
   ```

2. Kjør: fail (eksisterende kode ignorerer flagget).

3. Implementer en helper `isDisabled(category: SideCategoryId, config): boolean` og legg sjekk i toppen av hver kategori-blokk i `calculateSideTournament`. Eksisterende 6 kategorier får sjekk for tilsvarende ID-er.

4. Kjør: pass.

5. Commit:
   ```bash
   git add lib/scoring/sideTournament.ts lib/scoring/sideTournament.test.ts
   git commit -m "feat(scoring): honor disabledCategories in side-tournament calc"
   ```

   **NB:** dette er en `feat` — kan vente med bump til Phase 9, eller bytt prefix til `chore(scoring):` for å holde hooken happy. Anbefales **`chore`-prefix på alle Phase 2-6-commits** og samle bump+CHANGELOG i Phase 9 når brukerflate-en (UI) faktisk lander. Begrunnelse: scoring-utvidelser uten UI er ikke bruker-synlig før Phase 7-9 lyser dem opp.

---

## Phase 3 — Nye vinner-tar-alt-kategorier

**Pattern per kategori:** TDD. Hver kategori = én commit. Format:

```
git commit -m "feat(scoring): add <category-id> to side tournament"
```

(Husk: `chore(scoring):`-prefix istedet hvis hook plager — eller batch til Phase 9.)

For hver av de 10 task-ene under følges samme mønster:

1. **Test for single winner** — ett lag/spiller vinner alene, sjekk awards-listen
2. **Test for tie** — to lag/spillere er likt, begge får full pott
3. **Test for N=1 team-edge** — 1-spillerlag, individ-versjon kjører, lag-versjon hoppes
4. **Implementer** kategori-blokk i `calculateSideTournament`
5. **Verifiser** ingen eksisterende tester ble brutt
6. **Commit**

### Task 3.1: Flest birdier (team + individ)

**Files:**
- Modify: `lib/scoring/sideTournament.ts`
- Modify: `lib/scoring/sideTournament.test.ts`

**Regler:**
- **Birdie** = `gross < par` per hull (per spiller). Bruk `playerScoresPerHole[i].perHoleGross[h] < coursePars[h]`. (NB: birdie er brutto-konsept, ikke netto.)

Vent — design-dokumentet sier «Flest birdier (netto)» i Tier 3-tabellen. La meg verifisere: per Tørny er spillet best-ball-netto. En «netto-birdie» = `netto < par`. Det er det vanlige i appen. **Bruk netto.** Da blir det `perHoleNetto[h] < coursePars[h]`.

- **Team-aggregat:** sum av netto-birdier på tvers av lag-spillere
- **Individ-best:** enkeltspiller med flest netto-birdier
- **Tie:** alle som er likt får full pott

**Test-eksempler:**

```ts
describe('most_birdies', () => {
  it('awards team aggregate to team with highest total birdies', () => { /* ... */ });
  it('splits no points on tie — all tied teams get full pot', () => { /* ... */ });
  it('awards individual to single player with most birdies', () => { /* ... */ });
  it('skips team category for N=1 teams (1v1)', () => { /* ... */ });
  it('honors disabledCategories for most_birdies_team', () => { /* ... */ });
});
```

**Categories-konstanter:**
- `most_birdies_team` (2p)
- `most_birdies_individual` (1p)

**Implementasjon-skisse:**

```ts
// I calculateSideTournament:
if (!isDisabled('most_birdies_team', config) && hasMultiPlayerTeams(input.teams)) {
  const teamTotals = input.teams.map((t) => ({
    teamId: t.teamId,
    total: countBirdiesForTeam(t, input.playerScoresPerHole, input.coursePars),
  }));
  const winners = findMaxTeams(teamTotals); // ny helper, motsatt av findMinTeams
  for (const teamId of winners) {
    award(teamId, {
      category: 'most_birdies_team',
      teamId,
      points: SIDE_TOURNAMENT_POINTS.mostBirdiesTeam,
    });
  }
}
if (!isDisabled('most_birdies_individual', config)) {
  // ... find player with most birdies, award team
}
```

### Task 3.2: Flest eagles+ (team + individ)
Samme mønster som 3.1, men `gross <= par - 2` (eller netto?). **Avklart i design:** netto. Bruk `perHoleNetto[h] <= coursePars[h] - 2`. IDs: `most_eagles_team` (4p), `most_eagles_individual` (2p).

### Task 3.3: Flest pars+ (team + individ)
`perHoleNetto[h] <= coursePars[h]`. IDs: `most_pars_team` (2p), `most_pars_individual` (1p).

### Task 3.4: Best brutto totalt 18 (team + individ)
- **Team:** best ball brutto sum over alle 18 hull (lowest of team's gross per hole, summed). Trenger ny helper `bestBallGrossPerHole(team, playerScores)`.
- **Individ:** laveste enkeltspiller brutto-sum.
- IDs: `best_brutto_18_team` (4p), `best_brutto_18_individual` (2p).

### Task 3.5: Best brutto F9 (team + individ)
Som 3.4, men kun hull 1–9. IDs: `best_brutto_f9_team` (2p), `best_brutto_f9_individual` (1p).

### Task 3.6: Best brutto B9 (team + individ)
Som 3.5, hull 10–18. IDs: `best_brutto_b9_team` (2p), `best_brutto_b9_individual` (1p).

### Task 3.7: Konge på par-3 (team + individ)
- Filtrer til hull der `coursePars[h] === 3`.
- **Team:** best ball brutto-sum på par-3-hull.
- **Individ:** laveste enkeltspiller-sum på par-3-hull.
- IDs: `king_par3_team` (4p), `king_par3_individual` (2p).

### Task 3.8: Konge på par-5 (team + individ)
Som 3.7, `coursePars[h] === 5`. IDs: `king_par5_team` (4p), `king_par5_individual` (2p).

### Task 3.9: Lengste bogey-fri-streak (individ-only)

**Regler:**
- For hver spiller, finn lengste sammenhengende rekke av hull der `perHoleNetto[h] <= coursePars[h]`.
- Spilleren(e) med lengste streak vinner. Tie → alle får full pott.
- Award går til vinnerens lag (samme mønster som LD/CTP).
- ID: `longest_bogey_free_streak` (4p).

**Tester:**
- Single winner
- Tie
- N=1 team
- Empty streak (alle bogey)

### Task 3.10: Lavest enkelthull brutto (individ-only)

**Regler:**
- For hver spiller, finn laveste enkelt-hull brutto over alle 18 hull.
- Spilleren(e) med laveste enkelt-tall vinner. Tie → alle får full pott.
- Award til lagets.
- ID: `lowest_single_hole_brutto` (2p).
- Include `detail`-felt med hull-nummer og score (for visning).

---

## Phase 4 — Achievements

### Task 4.1: Turkey per spiller

**Files:**
- Modify: `lib/scoring/sideTournament.ts`
- Modify: `lib/scoring/sideTournament.test.ts`

**Regler:**
- For hver spiller: finn ikke-overlappende rekker av 3 sammenhengende hull med netto-birdie.
- Greedy fra venstre: når du finner 3 i rad starter neste søk på hull #4.
- Hver streak → 4p (`turkeyPerPlayer`) til spillerens lag.
- ID: `turkey`.

**Tester:**
- 3 netto-birdier på rad → 1 turkey (4p)
- 6 i rad → 2 turkeys (8p)
- 5 i rad → 1 turkey (4p), siste 2 «venter»
- 2 i rad → 0 turkeys
- Spredt 3 birdier (hull 1, 5, 10) → 0 turkeys
- Honors `disabledCategories: ['turkey']`

**Implementasjon:** legg til en helper:
```ts
function findNonOverlappingStreaks(
  perHole: Array<boolean>,
  minLength: number,
): Array<{ start: number; end: number }> {
  const streaks = [];
  let i = 0;
  while (i <= perHole.length - minLength) {
    if (perHole.slice(i, i + minLength).every((b) => b)) {
      streaks.push({ start: i + 1, end: i + minLength }); // 1-indexed
      i += minLength; // hopp forbi denne streak-en
    } else {
      i += 1;
    }
  }
  return streaks;
}
```

**Award `detail`-format:** `"hull X–Y"` for visning på leaderboard.

### Task 4.2: Turkey lag-koord-bonus

**Regler:**
- Krever `N >= 2` (skip for 1-spillerlag).
- Sjekk: for hver hull-trippel (1-2-3, 2-3-4, ..., 16-17-18), har **alle** spillere på laget netto-birdie på alle tre hull?
- Hvis ja: gi `4p × N` ekstra. Ikke-overlappende stack (samme regel som per-spiller-tieren).
- ID: `turkey` (samme som 4.1, men separate `detail`-felt: `"lag-koord: hull X–Y"`)

**Tester:**
- 2v2 begge birdie 1-2-3 → +8p koord-bonus (utover per-spiller 4p × 2)
- 4v4 alle 4 birdie 1-2-3 → +16p koord-bonus
- 3 av 4 birdie 1-2-3 → 0 koord-bonus
- 1-spillerlag → 0 koord-bonus (men 4p per-spiller fortsatt utløst)

### Task 4.3: Solid per spiller

Samme som 4.1 men `minLength = 5` og predikat `perHoleNetto[h] <= coursePars[h]`. 2p per streak (`solidPerPlayer`).

### Task 4.4: Solid lag-koord-bonus

Samme som 4.2 men 5-streak. `2p × N` (`solidCoordPerMember`).

### Task 4.5: Snowman

**Regler:**
- For hvert hull: sjekk om **alle** spillere på laget har `perHoleGross[h] >= coursePars[h] + 5`.
- Hvis ja: −2p (`snowman`) til laget.
- ID: `snowman`. `detail`-felt: `"hele laget +N på hull H"` (vis verste brutto-over-par).

**Tester:**
- 2v2 begge +5 på samme hull → −2p
- 1 spiller +5, 1 spiller +4 → 0
- Multiple Snowman-hull → −2p × antall hull
- 1-spillerlag (1v1): den ene spilleren +5 → −2p (gjelder fortsatt for 1-spillerlag)
- Honors `disabledCategories: ['snowman']`

---

## Phase 5 — Team-size verification

### Task 5.1: N=1 (1-spillerlag) end-to-end-test

**Files:**
- Modify: `lib/scoring/sideTournament.test.ts`

**Steps:**

1. Skriv en integrasjonstest med 3 lag à 1 spiller (1v1v1). Hver spiller har realistiske scores. Verifiser:
   - Ingen lag-aggregat-kategori utløses (de hoppes for N=1)
   - Individ-versjoner kjører
   - Snowman utløses for den spilleren som har +5+
   - Turkey/Solid per-spiller fungerer
   - Koord-bonuser hoppes (krever N≥2)

2. Kjør, fix bugs i kategori-blokker som måtte hardkode N=2-antakelser.

3. Commit: `test(scoring): verify 1v1v1 team-size handling`

### Task 5.2: N=4 (4-spillerlag) end-to-end-test

**Files:**
- Modify: `lib/scoring/sideTournament.test.ts`

**Steps:**

1. Skriv en integrasjonstest med 2 lag à 4 spillere (4v4). Verifiser:
   - Lag-aggregat-kategorier teller riktig over 4 spillere
   - Best brutto 18 (team) bruker best ball over 4 brutto-tall per hull
   - Snowman krever **alle 4** spillere over par+5
   - Turkey lag-koord-bonus = `4p × 4 = 16p`

2. Kjør, fix.

3. Commit: `test(scoring): verify 4v4 team-size handling`

---

## Phase 6 — Payload builder

### Task 6.1: Utvid `sideTournamentPayload.ts` med kategori-parsing

**Files:**
- Modify: `lib/games/sideTournamentPayload.ts`

**Steps:**

1. Utvid `SideTournamentPayload`-typen:
   ```ts
   export type SideTournamentPayload = {
     enabled: boolean;
     ldCount: 0 | 1 | 2;
     ctpCount: 0 | 1 | 2;
     disabledCategories: SideCategoryId[]; // NY
   };
   ```

2. Parse `side_disabled_categories[]` fra FormData (kommer som array av strings via `getAll`).

3. Valider hver streng mot `ALL_CATEGORY_IDS` — ukjent verdi → error.

4. Skriv unit-test for parser-en (`lib/games/sideTournamentPayload.test.ts` — opprett hvis ikke finnes).

5. Commit: `feat(games): parse disabled-categories from side-tournament form`. Bruk `chore(games):`-prefix.

### Task 6.2: Bygg `coursePars` + `playerScoresPerHole` i leaderboard-loader

**Files:**
- Modify: `app/games/[id]/leaderboard/page.tsx`

**Steps:**

1. Identifiser hvor `calculateSideTournament` kalles fra (sannsynligvis i `page.tsx`-loaderen). Sjekk hvilke queries som allerede henter `course_holes` (for par) og `scores` (for brutto + netto).

2. Bygg `coursePars: number[]` (18 elementer, sortert på hole_number).

3. Bygg `playerScoresPerHole`-arrayet for alle spillere i spillet.

4. Pass til `calculateSideTournament` + `SideTournamentView`.

5. Commit: `chore(leaderboard): load pars + per-player scores for side tournament`.

---

## Phase 7 — Admin UI: SideCategoriesPicker

### Task 7.1: Komponentskall

**Files:**
- Create: `components/admin/SideCategoriesPicker.tsx`

**Steps:**

1. Skriv komponent med props:
   ```ts
   type Props = {
     name: string; // form field name prefix
     defaultDisabledCategories?: SideCategoryId[];
     locked?: boolean; // for edit-flow når spill er active
   };
   ```

2. Render struktur (presets + grupperte haker per design §UI). Bruk eksisterende UI primitives fra `components/ui/`.

3. State: `disabledSet: Set<SideCategoryId>`. Hver toggle muterer set-en.

4. Hidden input `side_disabled_categories[]` med én rad per disabled ID — submittes med form-en.

5. Preset-knapper:
   - **Klassisk** → set = `new Set(CLASSIC_DISABLED_CATEGORIES)`
   - **Full pakke** → set = `new Set()` (tom)
   - **Custom** → ingen endring (bare visuell aktiv-state hvis brukeren har avveket fra de to over)

6. Detekter preset-state automatisk: hvis `disabledSet` matcher `CLASSIC_DISABLED_CATEGORIES`, vis Klassisk aktiv. Hvis tom, vis Full pakke aktiv. Ellers Custom.

7. Commit: `feat(admin): add SideCategoriesPicker component`. Bruk `chore(admin):`-prefix.

### Task 7.2: Integrer i `/admin/games/new`

**Files:**
- Modify: `app/admin/games/new/GameForm.tsx`
- Modify: `app/admin/games/new/actions.ts`

**Steps:**

1. Importer + render `SideCategoriesPicker` inni eksisterende sideturnerings-seksjon (under master-toggle).

2. Default ved spill-opprett: **Klassisk** (per bruker-beslutning). Pass `defaultDisabledCategories={CLASSIC_DISABLED_CATEGORIES}`.

3. I action: bruk utvidet `parseSideTournamentFromFormData`, lagre `disabledCategories` i `games.side_disabled_categories`-kolonnen.

4. Commit: `chore(admin/games/new): integrate side-categories picker`

### Task 7.3: Integrer i `/admin/games/[id]/edit`

**Files:**
- Modify: `app/admin/games/[id]/edit/page.tsx`
- Modify: `app/admin/games/[id]/edit/actions.ts`

**Steps:**

1. Last `games.side_disabled_categories` fra DB.

2. Render `SideCategoriesPicker` med `defaultDisabledCategories={loaded}` og `locked={game.status !== 'pending'}`.

3. I action: parse + lagre. Lås mot endringer hvis spillet allerede er aktivt eller ferdig.

4. Commit: `chore(admin/games/edit): integrate side-categories picker`

---

## Phase 8 — Leaderboard UI

### Task 8.1: Refactor `SideTournamentView` til grupperte rader

**Files:**
- Modify: `app/games/[id]/leaderboard/SideTournamentView.tsx`

**Steps:**

1. Refactor `TeamAwards`-funksjonen til å gruppere awards under sub-headers per tier-rekkefølge fra design.

2. Definer `CATEGORY_GROUPS`-konstant som mapper hver kategori-ID til en gruppe (`'hovedkonkurranser' | 'skill_og_rarity' | 'moderate' | 'hull_konkurranser' | 'achievements' | 'penalty'`).

3. For hver gruppe: filtrer awards som tilhører gruppen. Hvis tom, skip hele blokken (header + tom liste).

4. Render sub-header med `text-xs uppercase tracking-wide font-semibold text-muted` (per design §UI mobile-først).

5. Commit: `feat(leaderboard): group side-tournament awards by tier`. Bruk `chore(leaderboard):`-prefix.

### Task 8.2: Render nye kategori-awards

**Files:**
- Modify: `app/games/[id]/leaderboard/SideTournamentView.tsx`

**Steps:**

1. For hver av de 12 nye kategoriene + 3 achievements: legg til en render-blokk i `TeamAwards` etter eksisterende-mønsteret. Bruk formatene fra design §UI award-format-tabellen.

2. Vinner-navn for individ-kategorier slås opp via `findTeamForUser` / `firstNameOf` (eksisterende helpers — kan trenge utvidelse til å støtte `userId` fra award `detail`-feltet).

3. Hull-range-formatering for Turkey/Solid: bruk eksisterende `formatHolesList`-helper på en singel-range-array (eller bygg en `formatHoleRange(start, end)`-helper for tydelighet).

4. Commit: `chore(leaderboard): render new category awards`.

### Task 8.3: Snowman penalty-visual

**Files:**
- Modify: `app/games/[id]/leaderboard/SideTournamentView.tsx`

**Steps:**

1. Penalty-gruppen får egen visuell tone — bruk en rød/varsel-fargevariabel fra `app/globals.css` (eller legg til en hvis det ikke finnes). Spør subagent å foreslå en `accent-warning`-token konsistent med paletten.

2. Snowman-rad: render `−2p` med rød fargetone. Header `Penalty` i samme tone.

3. Commit: `chore(leaderboard): style snowman penalty group with warning tone`.

---

## Phase 9 — Polish + ship

### Task 9.1: Smoke-test scenarier (no code)

**Action only — ingen filendringer.**

Subagent: les gjennom alle 25+ tester én gang for å se etter rare patterns. Notér eventuelle gaps. Hvis ingen — godkjent for prod.

(Per memory `feedback_production_only_testing`: prod-testing av UI-en gjøres av bruker etter deploy.)

### Task 9.2: Versjon-bump + CHANGELOG

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

**Steps:**

1. `npm version minor --no-git-tag-version` (bumper `1.1.x` → `1.2.0`, oppdaterer `package-lock.json`).

2. Legg til CHANGELOG-entry:

   ```markdown
   ## 1.2.y — Utvidet sideturnerings-poeng

   Sideturneringen får 12 nye kategorier og 3 stackbare achievements (Turkey/Solid/Snowman) som du kan slå av/på ved spill-opprett.

   ### [1.2.0] - 2026-05-16

   **Sideturneringen får 12 nye kategorier å spille om — fra «flest birdier» og «konge på par-3» til stackbare achievements som Turkey (3 birdier på rad) og Snowman (lagets felles katastrofe på ett hull). Du velger selv ved spill-opprett hvilke som er aktive.**

   <details><summary>Teknisk</summary>

   #### Added
   - Migrasjon 0026: `games.side_disabled_categories text[]` for per-spill kategori-toggle
   - `lib/scoring/sideTournamentConfig.ts` — sentralisert poeng-vekter for justering uten logikk-endring
   - 12 nye vinner-tar-alt-kategorier i `lib/scoring/sideTournament.ts`: flest birdier/eagles/pars, best brutto 18/F9/B9, konge på par-3/par-5, lengste bogey-fri-streak, lavest enkelthull brutto
   - 3 stackbare achievements: Turkey (4p per streak + lag-koord-bonus 4p × N), Solid (2p / 2p × N), Snowman (−2p)
   - `components/admin/SideCategoriesPicker.tsx` med tre presets (Klassisk/Full pakke/Custom)
   - Grupperte sub-headers per tier i `SideTournamentView` (Hovedkonkurranser / Skill og rarity / Moderate / Hull-konkurranser / Achievements / Penalty)
   - ~50 nye unit-tester med dekning for N=1, N=2, N=4 team-sizes

   #### Changed
   - `SideTournamentInput`-shape utvidet med `coursePars`, `playerScoresPerHole`, `disabledCategories`
   - `SideTournamentConfig` utvidet med `disabledCategories: readonly SideCategoryId[]`
   - Default-preset ved spill-opprett er **Klassisk** for å matche dagens v1.1.x-oppførsel

   #### Notes
   - Regelsettet er team-size-aware (1v1, 2v2, 4v4) klar for [#41](https://github.com/jdlarssen/golf-app/issues/41), men admin-UI lager fortsatt kun 2v2-spill til den epicen lander
   - Manuelle bragder (chip-ins, sand saves, one-putts, wow-shot) er ute av scope — egen leveranse v1.3.x

   </details>
   ```

3. Pakk nyeste minor-serie (`1.1.y`) i et `<details>`-element hvis den faller utenfor «tre-nyeste-grensen». Sjekk gjeldende state av CHANGELOG.md først.

4. Commit:
   ```bash
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "feat(side-tournament): ship v1.2.0 expanded points + achievements"
   ```

   Hooken vil godta dette siden alle tre fileme er staget.

### Task 9.3: Push + PR

**Steps:**

1. Push branch:
   ```bash
   git push origin claude/fervent-jang-fcf2bc
   ```

2. Lag PR:
   ```bash
   gh pr create --base main \
     --title "feat(side-tournament): v1.2.0 expanded points + achievements" \
     --body "Closes #XX

   Sideturneringen får 12 nye kategorier og 3 stackbare achievements (Turkey/Solid/Snowman) du kan slå av/på ved spill-opprett. Best netto totalt 18 forblir 10p-grunnpilaren."
   ```

   (Erstatt `XX` med faktisk issue-nummer hvis vi har en. Hvis ikke, opprett en first via `gh issue create` per Tørny-konvensjon.)

3. **Bruker tester på preview-URL** før merge.

---

## Risiko og fallbacks

- **Tester går trege:** ~50 nye unit-tester på en relativ kompleks scoring-funksjon. Vitest-runner kjører raskt i prod, så ingen praktisk risiko, men sjekk under 5 sek total.
- **`text[]` constraint feilmelder uklart:** Hvis ukjent kategori-ID slipper gjennom valideringen og treffer DB, får brukeren en stygg Postgres-feil. Mitigering: validering i action-laget før insert (allerede del av Task 7.2/7.3).
- **`detail`-felt-formatet** brukes av eksisterende collapse-view. Sjekk at endring til mer struktur (`holeNumber` for hole-win etc.) ikke bryter v1.1.1-rendering. Hvis ja: utvid heller med nye eksplisitte felter, ikke endre eksisterende.
- **Bruker fanget av magic-link cache** (per Supabase-historikk): denne leveransen rører ikke auth-flyten, så ingen risiko.

## Når å avbryte og spørre bruker

- Hvis du oppdager at en av de 18 eksisterende testene ikke kan oppdateres uten å bryte semantikk — stopp og spør.
- Hvis Snowman-regelen viser seg å være for hyppig (>1 % av runder) — fortell brukeren før prod, slik at de kan justere terskelen før mail-en til kompiser.
- Hvis Turkey lag-koord-bonus blir for kompleks (subagent kan ikke uttrykke det med 3-5 tester) — vurder å splitte 4.2 i 4.2a (detektering) + 4.2b (bonus-utdeling).

---

## Sammendrag

- **Filer endret:** ~10
- **Filer opprettet:** 3 (`sideTournamentConfig.ts`, `SideCategoriesPicker.tsx`, migrasjon 0026)
- **Commits:** ~22 (inkludert tests)
- **Tester:** ~50 nye
- **Migrasjon:** 1
- **Ship-mål:** v1.2.0

Implementering kjøres subagent-drevet (per memory `feedback_subagent_driven_plans` — ikke valg).
