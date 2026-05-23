# Players-First + Stableford Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Plan-eksekvering kjøres via subagent-driven-development (per CLAUDE.md): fresh implementer per task, code-reviewer mellom faser, atomic commits.

**Goal:** Refaktorere Tørny til å støtte valgbar spillmodus + variabel lagstruktur, og levere solo stableford som første ny modus ved siden av dagens best-ball-netto.

**Architecture:** `games.game_mode` (text + CHECK) + `games.mode_config` (JSONB) som discriminator i DB. `lib/scoring/index.ts` som mode-router foran modul-per-mode i `lib/scoring/modes/`. GameForm omstrukturert til «spillere først → modus → lagstørrelse → lag-grid». Solo-modus bypasser flight-RLS.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres + RLS, Vitest, Testing Library. Subagenter på Opus per memory `feedback_subagent_model_routing.md`. Migrasjoner via Supabase MCP per `reference_supabase_mcp.md` — ingen Dashboard-copy-paste.

**Design-dokumentet:** [docs/plans/2026-05-23-players-first-multi-mode-design.md](docs/plans/2026-05-23-players-first-multi-mode-design.md) — referer hit for begrunnelser av valg.

**Issue:** [#41](https://github.com/jdlarssen/golf-app/issues/41) (dekker også #46, delvis #43).

---

## Fase-oversikt og PR-strategi

Hver fase = egen branch + egen PR. Rekkefølge er strikt (avhengigheter er én-vei: 1 → 2 → 3 → 4 → 5 → 6 → 7). Verifiser at forrige fase er merget til main før neste fase starter.

| # | Fase | Synlig for bruker? | Versjon-bump | Conventional-commit-prefiks |
|---|------|-------------------|--------------|------------------------------|
| 1 | DB-fundament | Nei | Nei | `chore(db)` |
| 2 | Scoring-arkitektur | Nei | Nei | `refactor(scoring)` + `chore(scoring)` |
| 3 | Validation-lag | Nei | Nei | `refactor(games)` |
| 4 | GameForm-restrukturering | Ja | MINOR | `feat(admin/games)` |
| 5 | Stableford spillerflyt | Ja | MINOR | `feat(scoring)` / `feat(leaderboard)` |
| 6 | Reveal + completion-mail | Ja | PATCH | `feat(reveal)` |
| 7 | Polish + admin-chip | Ja | PATCH | `feat(admin/games)` / `chore(...)` |

**Branch-navn:** `feature/41-phase-N-<short-name>`. Eksempel: `feature/41-phase-1-db-foundation`.

**Commit-disiplin:** Hver task ender med commit. Tasks merket «commit» har eksakt commit-melding. Tasks i samme fase som ikke er bruker-synlig bruker `chore`/`refactor`/`test`-prefiks for å passere hooken uten versjon-bump.

---

## Fase 1: DB-fundament

**PR:** `feature/41-phase-1-db-foundation` → `main`
**Bumper versjon:** Nei (ren DB-refaktor, ingen bruker-synlig endring).

### Task 1.1: Lag migrasjon 0030_game_modes.sql

**Files:**
- Create: `supabase/migrations/0030_game_modes.sql`

**Step 1: Skriv migrasjonsfilen**

```sql
-- 0030_game_modes.sql
-- Introduserer game_mode + mode_config på games, gjør team/flight nullable på game_players.

-- 1. Nye kolonner på games (med default for backfill)
alter table public.games
  add column game_mode text not null default 'best_ball_netto',
  add column mode_config jsonb not null default '{}'::jsonb;

alter table public.games
  add constraint games_mode_check
    check (game_mode in ('best_ball_netto', 'stableford'));

-- 2. Backfill mode_config for eksisterende best-ball-spill
update public.games
  set mode_config = jsonb_build_object('team_size', 2, 'teams_count', 4)
  where game_mode = 'best_ball_netto' and mode_config = '{}'::jsonb;

-- 3. Drop default på game_mode — nye spill må velge eksplisitt
alter table public.games alter column game_mode drop default;

-- 4. game_players: drop NOT NULL på team/flight
alter table public.game_players
  alter column team_number drop not null,
  alter column flight_number drop not null;

-- 5. Rebuild CHECK-constraints for å tillate null
alter table public.game_players
  drop constraint if exists game_players_team_number_check,
  drop constraint if exists game_players_flight_number_check;

alter table public.game_players
  add constraint game_players_team_number_check
    check (team_number is null or team_number between 1 and 4),
  add constraint game_players_flight_number_check
    check (flight_number is null or flight_number between 1 and 4);

-- 6. Konsistens: team og flight må være satt/null sammen
alter table public.game_players
  add constraint game_players_team_flight_consistency
    check ((team_number is null) = (flight_number is null));

-- 7. Indeks på game_mode for queries som filtrerer per mode
create index if not exists games_game_mode_idx on public.games(game_mode);
```

**Step 2: Apply migrasjon via Supabase MCP**

Bruk `mcp__36be25a6-...__apply_migration` med project_id `glofubopddkjhymcbaph` og navn `0030_game_modes`.

**Step 3: Verifiser med execute_sql**

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'games' and column_name in ('game_mode', 'mode_config')
order by column_name;
```

Expected: 2 rader. `game_mode text not_null null` (default-en er nå droppet), `mode_config jsonb not_null '{}'`.

```sql
select id, name, game_mode, mode_config from public.games;
```

Expected: 1 rad, det eksisterende prod-spillet, `game_mode='best_ball_netto'`, `mode_config={"team_size":2,"teams_count":4}`.

**Step 4: Commit**

```bash
git add supabase/migrations/0030_game_modes.sql
git commit -m "chore(db): innfør game_mode + mode_config + nullable team/flight

Refs #41"
```

### Task 1.2: Lag migrasjon 0031_solo_visibility_rls.sql

**Files:**
- Create: `supabase/migrations/0031_solo_visibility_rls.sql`

**Step 1: Skriv migrasjon (utvider score-visibility for solo-modus)**

Avhengig av dagens score-policy-formulering — les `supabase/migrations/0021_score_visibility.sql` først for å se eksakt policy som skal endres. Forventet endring: policy «scores select same flight» utvides til «...ELLER game er solo-mode (flight_number is null på alle game_players-rader)».

Konkret SQL (juster basert på eksisterende policy-navn):

```sql
-- 0031_solo_visibility_rls.sql
-- Utvider score-visibility til å dekke solo-spill (der flight_number er null).

-- Drop og recreate same_flight helper til å håndtere solo-spill
create or replace function public.same_flight_or_solo(p_game_id uuid, p_other_user uuid) returns boolean
  language sql security definer stable
  as $$
    select exists(
      select 1
      from public.games g
      join public.game_players me on me.game_id = g.id
      join public.game_players them on them.game_id = g.id
      where g.id = p_game_id
        and me.user_id = auth.uid()
        and them.user_id = p_other_user
        and (
          -- Klassisk: samme flight
          (me.flight_number is not null and me.flight_number = them.flight_number)
          -- Solo: alle game-medlemmer ser hverandre
          or g.game_mode = 'stableford'
        )
    );
  $$;

-- Drop gammel scores select-policy, recreate med ny helper
drop policy if exists "scores select same flight active or any when finished" on public.scores;

create policy "scores select per mode active or any when finished" on public.scores
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or exists(
      select 1 from public.games g
      where g.id = scores.game_id
        and (
          g.status = 'finished'
          or public.same_flight_or_solo(g.id, scores.user_id)
        )
    )
  );
```

NB: Eksakt eksisterende policy-navn må verifiseres mot `0021_score_visibility.sql` og senere migrasjoner. Hvis policy-navnet er annerledes, juster `drop policy if exists`-linjen.

**Step 2: Apply migrasjon via Supabase MCP**

Bruk `mcp__36be25a6-...__apply_migration` med navn `0031_solo_visibility_rls`.

**Step 3: Verifiser**

```sql
select policyname from pg_policies where tablename = 'scores';
```

Expected: en policy som inneholder «per mode» eller liknende navn. Den gamle «same flight»-policy skal være borte.

**Step 4: Commit**

```bash
git add supabase/migrations/0031_solo_visibility_rls.sql
git commit -m "chore(db): RLS for solo-spill — same_flight_or_solo helper

Utvider score-visibility til å dekke solo-modus der flight_number
er null. Refs #41"
```

### Task 1.3: Regenerer TypeScript-types

**Step 1: Generer types**

Bruk `mcp__36be25a6-...__generate_typescript_types` med project_id `glofubopddkjhymcbaph`. Lagre output til `lib/supabase/database.types.ts` (eller hva eksisterende sti er — sjekk imports i `lib/supabase/server.ts`).

**Step 2: Verifiser at types-filen kompilerer**

```bash
npx tsc --noEmit
```

Expected: ingen feil (om noen feil oppstår fordi konsumenter forventer NOT NULL team/flight, noter dem — de fikses i senere faser).

**Step 3: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(types): regenerate Supabase types after 0030/0031

Refs #41"
```

### Task 1.4: Push og lag PR

```bash
git push -u origin feature/41-phase-1-db-foundation
gh pr create --base main \
  --title "chore(db): players-first + game_mode foundation (fase 1/7)" \
  --body "$(cat <<'EOF'
Refs #41

Fase 1/7 av epic for valgbar spillmodus.

## Endringer

- `0030_game_modes.sql`: ny `games.game_mode` (text + CHECK) og `games.mode_config` (JSONB). Nullable `team_number`/`flight_number` på `game_players` med konsistens-CHECK.
- `0031_solo_visibility_rls.sql`: ny `same_flight_or_solo()` helper. Score-visibility-policy utvides for solo-modus.
- Regenererte Supabase TS-types.

Ingen bruker-synlig endring — ingen versjon-bump.

## Verifisering

- [x] Migrasjonene applied via Supabase MCP (ikke Dashboard).
- [x] Eksisterende prod-spill backfilled med `game_mode='best_ball_netto'` og `mode_config={team_size:2,teams_count:4}`.
- [x] `npx tsc --noEmit` grønn.

## Neste fase

Fase 2: scoring-arkitektur (mode-router + stableford-modul).
EOF
)"
```

Etter merge: `gh pr merge --rebase --delete-branch`.

---

## Fase 2: Scoring-arkitektur

**PR:** `feature/41-phase-2-scoring-router` → `main`
**Bumper versjon:** Nei (kun intern arkitektur, ingen koblet til UI ennå).
**Forutsetning:** Fase 1 merget til main.

### Task 2.1: Lag types-fil for mode-router

**Files:**
- Create: `lib/scoring/modes/types.ts`

**Step 1: Skriv types**

```typescript
// lib/scoring/modes/types.ts
// Felles types for mode-router og mode-modules.

import type { CourseHole } from '@/lib/courses/types'; // juster import-sti hvis nødvendig

export type GameMode = 'best_ball_netto' | 'stableford';

export type GameModeConfig =
  | { kind: 'best_ball_netto'; team_size: 2; teams_count: 4 }
  | { kind: 'stableford'; team_size: 1; points_table: 'standard' };

export interface ScoringPlayer {
  userId: string;
  teamNumber: number | null;
  flightNumber: number | null;
  courseHandicap: number;
}

export interface ScoringHoleScore {
  userId: string;
  holeNumber: number;
  gross: number | null;
}

export interface ScoringContext {
  game: {
    id: string;
    game_mode: GameMode;
    mode_config: GameModeConfig;
  };
  players: ScoringPlayer[];
  holes: CourseHole[];
  scores: ScoringHoleScore[];
}

// Discriminated union — konsumenter narrower på `kind`.
export type ModeResult =
  | BestBallNettoResult
  | StablefordResult;

export interface BestBallNettoResult {
  kind: 'best_ball_netto';
  teams: Array<{
    teamNumber: 1 | 2 | 3 | 4;
    totalNet: number | null;
    rank: number;
    playerIds: string[];
  }>;
  // ... per-spiller-data; behold eksisterende shape fra BestBallResult
}

export interface StablefordResult {
  kind: 'stableford';
  players: Array<{
    userId: string;
    totalPoints: number;
    rank: number;
    holesPlayed: number;
  }>;
}
```

NB: `BestBallNettoResult` skal mappe 1:1 til dagens `BestBallResult`-shape i `bestBall.ts`. Sjekk eksisterende konsumenter for å sikre at `kind`-felt + struktur er bakoverkompatibel.

**Step 2: Verifiser kompilering**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add lib/scoring/modes/types.ts
git commit -m "chore(scoring): types for mode-router + discriminated ModeResult

Refs #41"
```

### Task 2.2: Flytt bestBall.ts → modes/bestBallNetto.ts (rename + tilpasning)

**Files:**
- Move: `lib/scoring/bestBall.ts` → `lib/scoring/modes/bestBallNetto.ts`
- Move: `lib/scoring/bestBall.test.ts` → `lib/scoring/modes/bestBallNetto.test.ts`
- Move: `lib/scoring/__snapshots__/bestBall.test.ts.snap` → `lib/scoring/modes/__snapshots__/bestBallNetto.test.ts.snap` (hvis snapshot eksisterer)

**Step 1: Git-mv begge filer**

```bash
mkdir -p lib/scoring/modes
git mv lib/scoring/bestBall.ts lib/scoring/modes/bestBallNetto.ts
git mv lib/scoring/bestBall.test.ts lib/scoring/modes/bestBallNetto.test.ts
# Eventuelt snapshot:
[ -f lib/scoring/__snapshots__/bestBall.test.ts.snap ] && git mv lib/scoring/__snapshots__/bestBall.test.ts.snap lib/scoring/modes/__snapshots__/bestBallNetto.test.ts.snap
```

**Step 2: Oppdater test-fil-imports**

I `lib/scoring/modes/bestBallNetto.test.ts`: bytt alle `from './bestBall'` til `from './bestBallNetto'`.

**Step 3: Legg til `compute()`-eksport som returnerer `BestBallNettoResult`-shape**

I `lib/scoring/modes/bestBallNetto.ts`: legg til en ny eksport som wrapper eksisterende logikk i den nye discriminated-union-shapen.

```typescript
// Eksisterende eksporter beholdes uendret for bakoverkompatibilitet.
// Ny eksport for mode-router:
import type { ScoringContext, BestBallNettoResult } from './types';

export function compute(ctx: ScoringContext): BestBallNettoResult {
  // Gjenbruk eksisterende bestBallForHole + sumTeamScores under hetten.
  // Map til BestBallNettoResult med kind: 'best_ball_netto'.
  // ... (detaljer fylles inn basert på eksisterende per-hull-loop-logikk)
}
```

NB: Implementering må gjenbruke eksisterende `bestBallForHole`, `sumTeamScores` etc. Ingen scoring-endring — kun shape-wrapping.

**Step 4: Kjør tester**

```bash
npm test -- lib/scoring/modes/bestBallNetto.test.ts
```

Expected: alle eksisterende tester grønne.

**Step 5: Commit (refactor — passerer hook uten bump)**

```bash
git add lib/scoring/modes/
git commit -m "refactor(scoring): flytt bestBall til modes/bestBallNetto + compute()

Reorganiserer scoring-laget i modul-per-mode-struktur. Eksisterende
eksporter beholdes for bakoverkompatibilitet. Ny compute() returnerer
discriminated-union-shape for mode-router. Refs #41"
```

### Task 2.3: Oppdater alle imports av bestBall i resten av kodebasen

**Step 1: Finn alle imports**

```bash
grep -rn "from '@/lib/scoring/bestBall'" --include="*.ts" --include="*.tsx" .
grep -rn "from '@/lib/scoring/bestBall'" --include="*.ts" --include="*.tsx" .
```

**Step 2: Bytt alle til nye sti**

Bruk Edit per fil: `from '@/lib/scoring/bestBall'` → `from '@/lib/scoring/modes/bestBallNetto'`.

**Step 3: Verifiser**

```bash
npx tsc --noEmit && npm test
```

Expected: grønn på begge.

**Step 4: Commit**

```bash
git add -u
git commit -m "refactor(scoring): oppdater bestBall-imports til ny sti

Refs #41"
```

### Task 2.4: TDD stableford — failing test for standard scoring

**Files:**
- Create: `lib/scoring/modes/stableford.test.ts`

**Step 1: Skriv failing test**

```typescript
// lib/scoring/modes/stableford.test.ts
import { describe, it, expect } from 'vitest';
import { computeStablefordPoints } from './stableford';

describe('computeStablefordPoints', () => {
  it('returns 2 for par', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 4 })).toBe(2);
  });

  it('returns 3 for birdie (1 under par)', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 3 })).toBe(3);
  });

  it('returns 4 for eagle (2 under par)', () => {
    expect(computeStablefordPoints({ par: 5, netStrokes: 3 })).toBe(4);
  });

  it('returns 5 for double-eagle (3 under par)', () => {
    expect(computeStablefordPoints({ par: 5, netStrokes: 2 })).toBe(5);
  });

  it('returns 1 for bogey (1 over par)', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 5 })).toBe(1);
  });

  it('returns 0 for double-bogey-or-worse', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 6 })).toBe(0);
    expect(computeStablefordPoints({ par: 4, netStrokes: 7 })).toBe(0);
  });

  it('returns 0 for null netStrokes (no score)', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: null })).toBe(0);
  });
});
```

**Step 2: Run tests — confirm they fail**

```bash
npm test -- lib/scoring/modes/stableford.test.ts
```

Expected: «Cannot find module './stableford'».

### Task 2.5: Implementer stableford-poeng

**Files:**
- Create: `lib/scoring/modes/stableford.ts`

**Step 1: Minimal implementasjon**

```typescript
// lib/scoring/modes/stableford.ts
// Stableford-scoring per Tørny-spec: standard poeng-tabell etter netto-score.

export function computeStablefordPoints(input: {
  par: number;
  netStrokes: number | null;
}): number {
  if (input.netStrokes === null) return 0;
  const diff = input.netStrokes - input.par;
  // diff <= -3 → 5 (double-eagle eller bedre)
  // diff === -2 → 4 (eagle)
  // diff === -1 → 3 (birdie)
  // diff === 0 → 2 (par)
  // diff === 1 → 1 (bogey)
  // diff >= 2 → 0 (double-bogey eller verre)
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}
```

**Step 2: Run tests — confirm pass**

```bash
npm test -- lib/scoring/modes/stableford.test.ts
```

Expected: 7/7 grønn.

**Step 3: Commit**

```bash
git add lib/scoring/modes/stableford.ts lib/scoring/modes/stableford.test.ts
git commit -m "chore(scoring): stableford per-hull poeng (standard tabell)

TDD per-hull-konvertering fra netto-stroke til stableford-poeng.
Refs #41 #43 #46"
```

### Task 2.6: TDD stableford compute() — full leaderboard

**Step 1: Utvid stableford.test.ts**

Legg til ny describe-blokk for `compute()`-funksjonen:

```typescript
describe('compute (full stableford leaderboard)', () => {
  it('summerer per spiller over alle hull', () => {
    const ctx: ScoringContext = {
      game: { id: 'g1', game_mode: 'stableford', mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' } },
      players: [
        { userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 },
        { userId: 'u2', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      ],
      holes: [{ number: 1, par: 4, hcpIndex: 1 }, { number: 2, par: 4, hcpIndex: 2 }],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 }, // par → 2
        { userId: 'u1', holeNumber: 2, gross: 3 }, // birdie → 3
        { userId: 'u2', holeNumber: 1, gross: 5 }, // bogey → 1
        { userId: 'u2', holeNumber: 2, gross: 4 }, // par → 2
      ],
    };
    const result = compute(ctx);
    expect(result.kind).toBe('stableford');
    expect(result.players).toEqual([
      { userId: 'u1', totalPoints: 5, rank: 1, holesPlayed: 2 },
      { userId: 'u2', totalPoints: 3, rank: 2, holesPlayed: 2 },
    ]);
  });

  it('inkluderer extraStrokes via courseHandicap → stroke-fordeling', () => {
    // CH = 18 → 1 ekstra slag på alle 18 hull
    const ctx: ScoringContext = {
      game: { id: 'g1', game_mode: 'stableford', mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' } },
      players: [{ userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 18 }],
      holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, hcpIndex: i + 1 })),
      scores: Array.from({ length: 18 }, (_, i) => ({ userId: 'u1', holeNumber: i + 1, gross: 5 })),
    };
    const result = compute(ctx);
    // Brutto 5 - extra 1 = netto 4 = par → 2 poeng per hull × 18 = 36
    expect(result.players[0].totalPoints).toBe(36);
  });

  // Flere edge-cases: partial round, ties, etc.
});
```

**Step 2: Run — confirm fail**

```bash
npm test -- lib/scoring/modes/stableford.test.ts
```

Expected: «compute is not a function».

### Task 2.7: Implementer stableford compute()

**Files:**
- Modify: `lib/scoring/modes/stableford.ts`

**Step 1: Implementer compute()**

```typescript
// Tillegg i lib/scoring/modes/stableford.ts
import type { ScoringContext, StablefordResult } from './types';
import { allocateStrokes } from '../strokeAllocation';

export function compute(ctx: ScoringContext): StablefordResult {
  const holesByNumber = new Map(ctx.holes.map(h => [h.number, h]));

  const playerPoints = ctx.players.map(player => {
    // Bygg stroke-fordeling per hull basert på courseHandicap
    const strokes = allocateStrokes({
      courseHandicap: player.courseHandicap,
      holes: ctx.holes,
    });

    let totalPoints = 0;
    let holesPlayed = 0;

    for (const score of ctx.scores) {
      if (score.userId !== player.userId) continue;
      if (score.gross === null) continue;
      const hole = holesByNumber.get(score.holeNumber);
      if (!hole) continue;

      const extra = strokes.get(score.holeNumber) ?? 0;
      const net = score.gross - extra;
      totalPoints += computeStablefordPoints({ par: hole.par, netStrokes: net });
      holesPlayed += 1;
    }

    return { userId: player.userId, totalPoints, holesPlayed };
  });

  // Sorter etter poeng (høyest øverst), assign rank (med tie-breaking via tiebreaker.ts senere)
  const sorted = [...playerPoints].sort((a, b) => b.totalPoints - a.totalPoints);
  const withRank = sorted.map((p, i) => ({ ...p, rank: i + 1 }));

  return { kind: 'stableford', players: withRank };
}
```

NB: `allocateStrokes`-signaturen må sjekkes — kan kreve tilpasning.

**Step 2: Run tests**

```bash
npm test -- lib/scoring/modes/stableford.test.ts
```

Expected: grønn (eller juster implementasjon basert på faktisk `allocateStrokes`-signatur).

**Step 3: Commit**

```bash
git add lib/scoring/modes/stableford.ts lib/scoring/modes/stableford.test.ts
git commit -m "chore(scoring): stableford compute() — full leaderboard med rank

Summerer per-hull-poeng per spiller. Inkluderer stroke-fordeling via
allocateStrokes for netto-score-beregning. Tie-break-cascade kommer
i egen task. Refs #41 #43 #46"
```

### Task 2.8: TDD stableford tie-break

**Step 1: Utvid test**

```typescript
describe('compute tie-break', () => {
  it('bryter likhet på siste 9 poeng', () => {
    // To spillere med samme total, men forskjellig back-9
    // ... bygg fixture
    const result = compute(ctx);
    expect(result.players[0].userId).toBe('vinneren-på-back-9');
  });

  it('cascade: 9 → 6 → 3 → 18', () => {
    // ... edge-case
  });
});
```

**Step 2: Implementer tie-break i compute()**

Gjenbruk `lib/scoring/tiebreaker.ts` med invertert sammenligning (høyest vinner). Hvis eksisterende tiebreaker er bygd for «laveste vinner» (stroke-mode), wrap output med en invertering for stableford-poeng.

**Step 3: Run tests, commit**

```bash
git add lib/scoring/modes/stableford.test.ts lib/scoring/modes/stableford.ts
git commit -m "chore(scoring): stableford tie-break (5-tier cascade på poeng)

Gjenbruker tiebreaker-cascade fra strokeplay, invertert til 'høyest
poeng vinner'. Refs #41"
```

### Task 2.9: Mode-router i lib/scoring/index.ts

**Files:**
- Create: `lib/scoring/index.ts`
- Create: `lib/scoring/index.test.ts`

**Step 1: TDD router**

```typescript
// lib/scoring/index.test.ts
import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from './index';

describe('computeLeaderboard mode router', () => {
  it('delegates best_ball_netto to bestBallNetto.compute', () => {
    const result = computeLeaderboard({
      game: { id: 'g', game_mode: 'best_ball_netto', mode_config: { kind: 'best_ball_netto', team_size: 2, teams_count: 4 } },
      players: [/* ... */],
      holes: [/* ... */],
      scores: [/* ... */],
    });
    expect(result.kind).toBe('best_ball_netto');
  });

  it('delegates stableford to stableford.compute', () => {
    const result = computeLeaderboard({
      game: { id: 'g', game_mode: 'stableford', mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' } },
      players: [/* ... */],
      holes: [/* ... */],
      scores: [/* ... */],
    });
    expect(result.kind).toBe('stableford');
  });
});
```

**Step 2: Implementer router**

```typescript
// lib/scoring/index.ts
import * as bestBallNetto from './modes/bestBallNetto';
import * as stableford from './modes/stableford';
import type { ScoringContext, ModeResult } from './modes/types';

export function computeLeaderboard(ctx: ScoringContext): ModeResult {
  switch (ctx.game.game_mode) {
    case 'best_ball_netto':
      return bestBallNetto.compute(ctx);
    case 'stableford':
      return stableford.compute(ctx);
  }
}

// Re-eksporter helpers for bakoverkompatibilitet
export { computeCourseHandicap } from './courseHandicap';
export { allocateStrokes } from './strokeAllocation';
export { resolveTiebreak } from './tiebreaker';
export type { GameMode, GameModeConfig, ModeResult } from './modes/types';
```

**Step 3: Run tests, commit**

```bash
npm test -- lib/scoring/index.test.ts
git add lib/scoring/index.ts lib/scoring/index.test.ts
git commit -m "chore(scoring): mode-router computeLeaderboard()

Switcher på games.game_mode, delegerer til mode-modul. Returnerer
discriminated ModeResult. Refs #41"
```

### Task 2.10: Push og lag PR

```bash
git push -u origin feature/41-phase-2-scoring-router
gh pr create --base main \
  --title "refactor(scoring): mode-router + stableford-modul (fase 2/7)" \
  --body "$(cat <<'EOF'
Refs #41

Fase 2/7 av epic for valgbar spillmodus.

## Endringer

- `lib/scoring/modes/bestBallNetto.ts` (flyttet fra `bestBall.ts`) — eksisterende logikk + ny `compute()`-wrapper i discriminated-union-shape.
- `lib/scoring/modes/stableford.ts` (ny) — per-hull-poeng + `compute()` for full leaderboard inkludert tie-break.
- `lib/scoring/index.ts` (ny) — mode-router `computeLeaderboard()` som switcher på `games.game_mode`.
- Alle eksisterende `bestBall`-imports oppdatert til ny sti.

Ingen koblet til UI ennå — ingen bruker-synlig endring.

## Tester

Nye tester: stableford poeng-tabell (7), stableford full leaderboard (3+), stableford tie-break (2+), router-delegation (2). Eksisterende bestBall-tester (~30) består uendret.

## Neste fase

Fase 3: validation-laget (mode-aware `gamePayload.ts`).
EOF
)"
```

Etter merge: `gh pr merge --rebase --delete-branch`.

---

## Fase 3: Validation-lag

**PR:** `feature/41-phase-3-validation-mode-aware` → `main`
**Bumper versjon:** Nei.
**Forutsetning:** Fase 2 merget til main.

### Task 3.1: Utvid GamePlayerInput + ValidationError-typer

**Files:**
- Modify: `lib/games/gamePayload.ts`

**Step 1: Gjør team/flight nullable i GamePlayerInput**

```typescript
// gamePayload.ts — endring
export type GamePlayerInput = {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
};
```

**Step 2: Legg til mode-relaterte error-koder**

```typescript
export type GameValidationErrorCode =
  | 'name_required'
  | 'course_required'
  | 'tee_required'
  | 'bad_allowance'
  // ... eksisterende
  | 'mode_required'
  | 'unsupported_mode_size_combo'
  | 'min_players_for_mode';
```

**Step 3: Commit (refactor)**

```bash
git add lib/games/gamePayload.ts
git commit -m "refactor(games): GamePlayerInput nullable team/flight + mode-error-koder

Refs #41"
```

### Task 3.2: Splitt buildGameInsertPayload i base + mode-validators

**Files:**
- Modify: `lib/games/gamePayload.ts`
- Modify: `lib/games/gamePayload.test.ts` (hvis finnes — ellers create)

**Step 1: TDD — failing test for stableford-payload**

Legg til ny describe-blokk i test-fila:

```typescript
describe('buildGameInsertPayload — stableford solo', () => {
  it('publishes stableford with 1+ player, all team/flight null', () => {
    const form = makeFormData({
      name: 'Test',
      course_id: 'c1',
      tee_box_id: 't1',
      start_at: '2026-06-01T10:00',
      game_mode: 'stableford',
      players: [{ user_id: 'u1' }, { user_id: 'u2' }],
    });
    const result = buildGameInsertPayload(form, 'publish');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.game_mode).toBe('stableford');
      expect(result.value.mode_config).toEqual({ team_size: 1, points_table: 'standard' });
      expect(result.value.players).toEqual([
        { user_id: 'u1', team_number: null, flight_number: null },
        { user_id: 'u2', team_number: null, flight_number: null },
      ]);
    }
  });

  it('rejects publish with 0 players', () => {
    const form = makeFormData({ game_mode: 'stableford', players: [] });
    const result = buildGameInsertPayload(form, 'publish');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual({ field: 'players', code: 'min_players_for_mode' });
  });
});
```

**Step 2: Refaktorer buildGameInsertPayload til å delegere per mode**

Konkret arkitektur:
- `parseBase(form)` returnerer felles felter (navn, bane, tee, dato).
- `parseGameMode(form)` returnerer `'best_ball_netto'` eller `'stableford'` (eller validation error).
- `modeValidators[mode](form, opts)` bygger mode-config + players-array.
- Top-level `buildGameInsertPayload` kombinerer.

**Step 3: Run tests, commit**

```bash
npm test -- lib/games/gamePayload
git add lib/games/gamePayload.ts lib/games/gamePayload.test.ts
git commit -m "refactor(games): gamePayload — base + mode-aware validators

Splitter buildGameInsertPayload i felles base + mode-validators
(best_ball_netto, stableford). Stableford krever min 1 spiller,
ingen lag-tilordning. Refs #41"
```

### Task 3.3: Oppdater actions.ts til å motta game_mode fra FormData

**Files:**
- Modify: `app/admin/games/new/actions.ts`
- Modify: `app/admin/games/[id]/edit/actions.ts`
- Modify: `app/admin/games/new/actions.test.ts`

**Step 1: Les game_mode fra form**

I `actions.ts` der `buildGameInsertPayload(formData, ...)` kalles, ingen kode-endring (allerede tar formData) — men sørg for at form-felt `game_mode` blir lest av payload-builder.

**Step 2: Stableford-test for actions**

Utvid `actions.test.ts` med happy-path-test for create-stableford-game.

**Step 3: Mode-lock ved edit — verifiser**

Edit-actions må sjekke at `game_mode` IKKE byttes etter publisering. Legg til guard:

```typescript
if (existing.status === 'published' && payload.game_mode !== existing.game_mode) {
  return { ok: false, errors: [{ field: 'game_mode', code: 'mode_locked_after_publish' }] };
}
```

**Step 4: Commit**

```bash
git add app/admin/games/
git commit -m "refactor(admin/games): actions reads game_mode + mode-lock på edit

Refs #41"
```

### Task 3.4: Push og lag PR

```bash
git push -u origin feature/41-phase-3-validation-mode-aware
gh pr create --base main \
  --title "refactor(games): mode-aware gamePayload + actions (fase 3/7)" \
  --body "$(cat <<'EOF'
Refs #41

Fase 3/7 av epic for valgbar spillmodus.

## Endringer

- `lib/games/gamePayload.ts`: splittet i base + mode-validators. Nullable team/flight i `GamePlayerInput`. Nye error-koder for mode-related validation.
- `app/admin/games/new/actions.ts` + `[id]/edit/actions.ts`: leser `game_mode` fra FormData. Edit-action guarder mode-bytte etter publisering.
- Tester for stableford-payload (publish + reject 0 spillere).

Ingen UI-endring ennå — kommer i fase 4.

## Neste fase

Fase 4: GameForm-restrukturering (players-first + mode/lagstørrelse-velgere).
EOF
)"
```

Etter merge: `gh pr merge --rebase --delete-branch`.

---

## Fase 4: GameForm-restrukturering (FØRSTE BRUKER-SYNLIGE LEVERING)

**PR:** `feature/41-phase-4-gameform-players-first` → `main`
**Bumper versjon:** Ja, MINOR (ny modus-velger synlig i admin-flyten).
**Forutsetning:** Fase 3 merget til main.

### Task 4.1: Component-test scaffold for GameForm

**Files:**
- Create: `app/admin/games/new/GameForm.test.tsx`

**Step 1: Minimal test som verifiserer dagens flyt**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameForm } from './GameForm';

describe('GameForm — dagens best-ball-flow', () => {
  it('rendrer spiller-checkbox-liste', () => {
    render(<GameForm courses={[]} players={[/* fixture */]} />);
    expect(screen.getByRole('group', { name: /spillere/i })).toBeInTheDocument();
  });

  // Flere baseline-tests for å fange regresjon i den kommende refaktoreringen.
});
```

**Step 2: Run, commit**

```bash
npm test -- app/admin/games/new/GameForm
git add app/admin/games/new/GameForm.test.tsx
git commit -m "test(admin/games): baseline component-test for GameForm

Pre-refactor regresjons-net før players-first-restrukturering. Refs #41"
```

### Task 4.2: Flytt spillere FØR lag-tilordning i GameForm

**Files:**
- Modify: `app/admin/games/new/GameForm.tsx`

**Step 1: Refaktor — fjern auto-team-assignment**

I `togglePlayer`: fjern `nextAvailableTeam`-kallet. Spiller-toggle bare oppdaterer `selectedPlayerIds`-state, ingenting med lag.

Fjern `nextAvailableTeam`-funksjonen helt.

**Step 2: Lag-tilordnings-grid blir egen seksjon under spiller-listen**

Render gridet bare hvis dagens valgte modus krever det (vil bli mode-conditional i 4.4).

**Step 3: Verifiser med eksisterende test + manuell test**

Manuell sjekk: opprett-spill-flyten skal fortsatt fungere visuelt for best-ball (dvs. spillere må manuelt tildeles lag etterpå).

**Step 4: Commit (refactor)**

```bash
git add app/admin/games/new/GameForm.tsx
git commit -m "refactor(admin/games): players-first — fjern auto-team-assignment

Spiller-toggle setter bare selectedPlayerIds. Lag-tilordning blir
eksplisitt egen seksjon under listen. Forberedelse for mode-velger.
Refs #41"
```

### Task 4.3: Bygg ModeSelector-komponent

**Files:**
- Create: `app/admin/games/new/ModeSelector.tsx`
- Create: `app/admin/games/new/ModeSelector.test.tsx`

**Step 1: TDD komponent-struktur**

```typescript
// ModeSelector.test.tsx
it('rendrer to tiles: Stableford og Best ball netto', () => {
  render(<ModeSelector value="best_ball_netto" onChange={() => {}} />);
  expect(screen.getByRole('radio', { name: /stableford/i })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /best ball/i })).toBeInTheDocument();
});

it('caller onChange ved tile-klikk', async () => {
  const onChange = vi.fn();
  render(<ModeSelector value="best_ball_netto" onChange={onChange} />);
  await userEvent.click(screen.getByRole('radio', { name: /stableford/i }));
  expect(onChange).toHaveBeenCalledWith('stableford');
});
```

**Step 2: Implementer**

```typescript
// ModeSelector.tsx
'use client';
import { Card } from '@/components/ui/Card';
import { ScoreboardIcon, TeamFlagsIcon } from '@/components/icons';

type GameMode = 'best_ball_netto' | 'stableford';

export function ModeSelector({ value, onChange }: { value: GameMode; onChange: (v: GameMode) => void }) {
  return (
    <fieldset>
      <legend>Velg spillmodus</legend>
      <div className="grid grid-cols-2 gap-3">
        <Tile
          mode="stableford"
          icon={<ScoreboardIcon />}
          title="Stableford"
          description="Poeng per hull. Par = 2, birdie = 3, eagle = 4 osv. Høyest total vinner."
          selected={value === 'stableford'}
          onSelect={() => onChange('stableford')}
        />
        <Tile
          mode="best_ball_netto"
          icon={<TeamFlagsIcon />}
          title="Best ball netto"
          description="Sum av beste netto-resultat per hull per lag. Laveste vinner."
          selected={value === 'best_ball_netto'}
          onSelect={() => onChange('best_ball_netto')}
        />
      </div>
    </fieldset>
  );
}
```

Plassér ikonene som SVG-komponenter i `components/icons/` — Stableford-ikon = stilisert poeng-tavle, Best-ball-ikon = lag-flagg-grid.

**Step 3: Commit**

```bash
git add app/admin/games/new/ModeSelector.tsx app/admin/games/new/ModeSelector.test.tsx components/icons/
git commit -m "refactor(admin/games): ModeSelector-komponent (2 tiles, ikoner)

Stableford + Best ball netto med ikoner. Forberedelse for integrasjon
i GameForm. Refs #41"
```

### Task 4.4: Bygg TeamSizeSelector med disabled tiles

**Files:**
- Create: `app/admin/games/new/TeamSizeSelector.tsx`
- Create: `app/admin/games/new/TeamSizeSelector.test.tsx`

**Step 1: TDD**

```typescript
it('viser tre tiles: Solo (1p) / Par (2p) / 4-mann (4p)', () => {
  render(<TeamSizeSelector mode="stableford" value={1} onChange={() => {}} />);
  expect(screen.getByRole('radio', { name: /solo/i })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /par/i })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /4-mann/i })).toBeInTheDocument();
});

it('disabler Par + 4-mann for Stableford med "kommer snart"-tekst', () => {
  render(<TeamSizeSelector mode="stableford" value={1} onChange={() => {}} />);
  expect(screen.getByRole('radio', { name: /par/i })).toBeDisabled();
  expect(screen.getByRole('radio', { name: /4-mann/i })).toBeDisabled();
  expect(screen.getAllByText(/kommer snart/i).length).toBe(2);
});

it('disabler Solo + 4-mann for Best ball', () => {
  render(<TeamSizeSelector mode="best_ball_netto" value={2} onChange={() => {}} />);
  expect(screen.getByRole('radio', { name: /solo/i })).toBeDisabled();
  expect(screen.getByRole('radio', { name: /4-mann/i })).toBeDisabled();
  expect(screen.getByRole('radio', { name: /par/i })).toBeEnabled();
});
```

**Step 2: Implementer + mapping av aktive kombinasjoner**

```typescript
// TeamSizeSelector.tsx
const ENABLED_COMBOS: Record<GameMode, Set<TeamSize>> = {
  stableford: new Set([1]),
  best_ball_netto: new Set([2]),
};

export function TeamSizeSelector({ mode, value, onChange }: Props) {
  const enabled = ENABLED_COMBOS[mode];
  return (
    <fieldset>
      <legend>Velg lagstørrelse</legend>
      <div className="grid grid-cols-3 gap-3">
        {([1, 2, 4] as const).map(size => {
          const isEnabled = enabled.has(size);
          return (
            <SizeTile
              key={size}
              size={size}
              label={SIZE_LABELS[size]}
              disabled={!isEnabled}
              hint={!isEnabled ? 'kommer snart' : undefined}
              selected={value === size}
              onSelect={() => isEnabled && onChange(size)}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
```

**Step 3: Commit**

```bash
git add app/admin/games/new/TeamSizeSelector.tsx app/admin/games/new/TeamSizeSelector.test.tsx
git commit -m "refactor(admin/games): TeamSizeSelector med disabled \"kommer snart\"

Tre tiles (Solo/Par/4-mann) per modus. ENABLED_COMBOS-mapping bestemmer
hvilke som er aktive — andre vises grayed-out. Refs #41"
```

### Task 4.5: Integrer ModeSelector + TeamSizeSelector i GameForm

**Files:**
- Modify: `app/admin/games/new/GameForm.tsx`
- Modify: `app/admin/games/new/GameForm.test.tsx`

**Step 1: Wire-up i GameForm**

- Legg til state `gameMode` (default `'best_ball_netto'`) og `teamSize` (default `2`).
- Renderer ModeSelector under spiller-listen.
- Renderer TeamSizeSelector under ModeSelector.
- Lag-tilordnings-grid renderes kun hvis `teamSize >= 2`.
- Sender `game_mode` + `team_size` med i FormData ved submit (hidden inputs eller eksplisitt form-felt).

**Step 2: Utvid component-test**

Test at:
- Default = best_ball_netto + 2 → lag-grid synlig.
- Bytt til stableford → solo auto-velges → lag-grid skjult.
- Submit sender riktig game_mode.

**Step 3: Manuell test i dev-server**

```bash
npm run dev
```

Åpne `/admin/games/new`, klikk gjennom flyten. Verifiser at:
- Spiller-listen er flat (ingen auto-tildeling).
- Modus-velger viser to tiles.
- Lagstørrelse-velger viser disabled-tiles for inaktive kombinasjoner.
- «Publiser»-knapp fungerer for begge moduser.

**Step 4: Commit (refactor — ikke bruker-synlig ennå før commit 4.6)**

```bash
git add app/admin/games/new/
git commit -m "refactor(admin/games): integrer ModeSelector + TeamSizeSelector i GameForm

Players-first + mode/size velgere. Lag-grid betinget på team_size >= 2.
Refs #41"
```

### Task 4.6: Versjon-bump + CHANGELOG + final commit

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

**Step 1: Bump MINOR**

```bash
npm version minor --no-git-tag-version
```

Versjon går fra `1.8.12` til `1.9.0`.

**Step 2: Legg til CHANGELOG-entry**

Per CLAUDE.md format: åpne ny minor-serie-heading `## 0.X.y — Valgbar spillmodus` (eller `## 1.9.y — ...` siden vi er over 1.0). Tagline blockquote først:

```markdown
## 1.9.y — Valgbar spillmodus

Tørny støtter nå flere spillformat. Solo stableford-turneringer kan opprettes
ved siden av dagens best-ball-netto, og admin-flyten viser klart hva som
kommer som neste spillformat.

### [1.9.0] - 2026-05-23

> Når du oppretter et nytt spill ser du nå et tydelig valg mellom Stableford
> og Best ball netto. Spillerne plukkes først som en flat liste, og lag-grid-en
> dukker opp først hvis spillformatet krever lag. Lagstørrelser som ennå ikke
> er tilgjengelige vises som "kommer snart" så du ser hvor det bærer.

<details><summary>Teknisk</summary>

#### Added
- `app/admin/games/new/ModeSelector.tsx` + `TeamSizeSelector.tsx` med ikoner og disabled-tiles.
- Mode-aware `lib/games/gamePayload.ts` med separate validators per mode.

#### Changed
- `GameForm.tsx`: players-first-flow, `nextAvailableTeam`-hack fjernet, lag-grid betinget på `team_size >= 2`.

</details>
```

NB: Hvis 1.8.y-serien er åpen i CHANGELOG, pakk den inn i `<details>` per CLAUDE.md format-regel.

**Step 3: Commit (feat = trigger hook for bump-sjekk)**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "feat(admin/games): players-first opprett-flow + modus-velger

Skiller modus fra lagstruktur som to selvstendige aksene. Stableford
+ Best ball netto velges via tiles med ikoner. Lagstørrelse-tiles viser
disabled \"kommer snart\" for ikke-implementerte kombinasjoner.

Refs #41

Closes phase 4/7."
```

Hooken sjekker at commit har bump + CHANGELOG-endring stageret → skal passere.

### Task 4.7: Push og lag PR

```bash
git push -u origin feature/41-phase-4-gameform-players-first
gh pr create --base main \
  --title "feat(admin/games): players-first + modus-velger (fase 4/7)" \
  --body "$(cat <<'EOF'
Closes #41 — delvis (fase 4/7).

Refs #41 #43 #46.

Første bruker-synlige levering av valgbar spillmodus. Versjon: 1.9.0.

## Skjermbilder

[legg til skjermbilder fra Vercel preview når PR er pushed]

## Endringer

- Ny `ModeSelector`-komponent (Stableford / Best ball netto med ikoner).
- Ny `TeamSizeSelector`-komponent (Solo / Par / 4-mann, disabled "kommer snart").
- `GameForm` omstrukturert: spillere først, modus, lagstørrelse, lag-grid (betinget).
- Mode-aware `gamePayload.ts` validator.

## Bruker-synlig

> Når du oppretter et nytt spill ser du nå et tydelig valg mellom
> Stableford og Best ball netto...

(samme tagline som CHANGELOG-entry)

## Test plan

- [ ] Opprett best-ball-spill (legacy path) — alle 8 spillere må fortsatt fordeles på 4 lag.
- [ ] Opprett stableford solo-spill med 2 spillere — publiser uten lag-tilordning.
- [ ] Verifiser at "kommer snart"-tiles vises grayed-out.
- [ ] Mode-lock på edit: prøv å bytte modus på publisert spill → skal feile.

## Neste fase

Fase 5: stableford spillerflyt (scorecard, leaderboard).
EOF
)"
```

Etter merge: `gh pr merge --rebase --delete-branch`.

---

## Fase 5: Stableford spillerflyt

**PR:** `feature/41-phase-5-stableford-player-flow` → `main`
**Bumper versjon:** Ja, MINOR (stableford er nå faktisk spillbar end-to-end).
**Forutsetning:** Fase 4 merget til main.

### Task 5.1: Scorecard header — vis «Dine poeng» for stableford

**Files:**
- Modify: `app/games/[id]/holes/[holeNumber]/page.tsx` (eller scorecard-header-komponent)
- Modify: `components/hole/ScoreCard.tsx`

**Step 1:** Les game.game_mode i scorecard-page, send som prop til ScoreCard.

**Step 2:** I ScoreCard: betinget render header — «Lagets totalsum: X» (best-ball) vs «Dine poeng: X» (stableford). Hent stableford-poeng via `computeLeaderboard` eller direkte `computeStablefordPoints` per ferdig-tastet hull.

**Step 3:** Commit (refactor — ingen bruker-synlig endring før fase 5 ship).

### Task 5.2: Vis stableford-poeng per hull i hull-list-view

**Files:**
- Modify: scorecard-oversikt-komponent (find via grep)

**Step 1:** Per ferdig-tastet hull, vis to mini-chips: «-1 netto» og «3 poeng». For best-ball: kun netto.

**Step 2:** Component-test for begge moduser.

**Step 3:** Commit (refactor).

### Task 5.3: «Lever scorekort»-copy

**Step 1:** Bytt tekst basert på mode: «Lever ditt scorekort» (stableford solo) vs «Lever lagets scorekort» (best-ball).

**Step 2:** Commit (refactor).

### Task 5.4: Bygg SoloStablefordView leaderboard

**Files:**
- Create: `app/games/[id]/leaderboard/SoloStablefordView.tsx`
- Create: `app/games/[id]/leaderboard/SoloStablefordView.test.tsx`

**Step 1: TDD struktur**

```typescript
it('rendrer flat liste sortert på poeng, høyest øverst', () => {
  render(<SoloStablefordView result={fixture} />);
  const rows = screen.getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent(/spiller1.*45 poeng/i);
  expect(rows[1]).toHaveTextContent(/spiller2.*38 poeng/i);
});

it('viser "X hull spilt"-chip per rad', () => {
  render(<SoloStablefordView result={fixture} />);
  expect(screen.getAllByText(/18 hull spilt/i).length).toBeGreaterThan(0);
});
```

**Step 2: Implementer med samme fairway-bakgrunn + typografi som State4View**

Gjenbruk visuelle tokens for visuell konsistens. Hver rad: rank-chip, navn, poeng-total (tabular-nums), hull-spilt-chip.

**Step 3:** Commit (refactor).

### Task 5.5: State-router for leaderboard

**Files:**
- Modify: `app/games/[id]/leaderboard/page.tsx` (eller dagens state-router-komponent)

**Step 1:** Endre routing-logikken: hvis `game.game_mode === 'stableford'`, render `SoloStablefordView` i stedet for `State4View`. Reveal-state håndteres i fase 6.

**Step 2:** Commit (refactor).

### Task 5.6: Drop team-strip på spill-hjem for solo

**Files:**
- Modify: `app/games/[id]/page.tsx` (eller game-home-komponent)

**Step 1:** Hvis solo, render «individuell stableford-turnering»-undertittel i stedet for «du er på lag X».

**Step 2:** Commit (refactor).

### Task 5.7: Versjon-bump + CHANGELOG + ship-commit

**Step 1: Bump MINOR**

```bash
npm version minor --no-git-tag-version
```

`1.9.0` → `1.10.0`.

**Step 2: CHANGELOG-entry**

```markdown
### [1.10.0] - 2026-05-24

> Stableford-turneringer er nå spillbare end-to-end. Spillerne taster slag
> som vanlig, men ser stableford-poeng per hull og en flat leaderboard
> sortert på totalt poeng.

<details><summary>Teknisk</summary>

#### Added
- `SoloStablefordView` leaderboard-komponent.
- Stableford-poeng vises per hull i scorecard.

#### Changed
- Scorecard-header viser «Dine poeng» for solo, «Lagets totalsum» for best-ball.
- Spill-hjem dropper team-strip for solo, viser «individuell stableford-turnering».

</details>
```

**Step 3:** Commit

```bash
git add -u package.json package-lock.json CHANGELOG.md
git commit -m "feat(scoring): stableford spillerflyt — scorecard + leaderboard

Stableford er nå spillbar end-to-end. Scorecard viser per-hull-poeng,
leaderboard rangerer på total. Refs #41 #43 #46

Phase 5/7."
```

### Task 5.8: Push + PR (samme mønster som tidligere)

---

## Fase 6: Reveal + completion-mail

**PR:** `feature/41-phase-6-reveal-podium` → `main`
**Bumper versjon:** Ja, PATCH (polish på existing reveal-feature).
**Forutsetning:** Fase 5 merget til main.

### Task 6.1: Bygg SoloStablefordPodium-komponent

**Files:**
- Create: `app/games/[id]/leaderboard/SoloStablefordPodium.tsx`
- Create: tests

**Step 1: Komponent-struktur**

- Topp 3 podium: 1. plass i midten (høyest trinn), 2. til venstre, 3. til høyre.
- Champagne/sølv/bronse fargekoding via design-tokens.
- Konfetti på 1.-plass-en (gjenbruk eksisterende confetti-komponent).
- Resten av rangeringen i `<details>`-element under podiet (collapsed by default).

**Step 2:** TDD, implementer, commit (refactor).

### Task 6.2: Reveal-flow router

**Files:**
- Modify: reveal-page eller -komponent

**Step 1:** Hvis `game.game_mode === 'stableford'`, render `SoloStablefordPodium` ved reveal-state. Best-ball beholder dagens reveal.

**Step 2:** Commit (refactor).

### Task 6.3: Completion-mail for stableford

**Files:**
- Modify: `lib/mail/gameFinishedNotification.ts`

**Step 1:** Mail-template må håndtere begge moduser. For stableford: «Du endte på X.-plass med Y poeng». For best-ball: «Lag Z vant med totalt N netto-strokes».

**Step 2:** Commit (refactor).

### Task 6.4: Versjon-bump + ship

Bump PATCH (`1.10.0` → `1.10.1`), CHANGELOG-entry, commit `feat(reveal): stableford podium + completion-mail`.

### Task 6.5: PR

---

## Fase 7: Polish + admin-chip

**PR:** `feature/41-phase-7-polish-admin-chip` → `main`
**Bumper versjon:** Ja, PATCH.
**Forutsetning:** Fase 6 merget til main.

### Task 7.1: Modus-chip i admin/games-listen

**Files:**
- Modify: `app/admin/games/page.tsx` (ledger-row-komponent)

**Step 1:** Per spill-rad, legg til en `StatusChip`-variant som viser modus-navn («Stableford» / «Best ball»).

**Step 2:** Commit (refactor).

### Task 7.2: Verifiser side-tournament for solo

**Step 1:** Manuell test: opprett solo stableford med LD/CTP-hull. Verifiser at admin kan plukke vinner per hull uten lag-kontekst.

**Step 2:** Hvis copy-justering trengs, edit relevante strings. Commit.

### Task 7.3: Edge-case-håndtering

- Hva skjer hvis admin prøver å redigere ett ikke-eksisterende mode? → Validation error.
- Hva skjer hvis migrasjon ikke har kjørt og koden forventer game_mode? → Defensive default.

**Step 1:** Identifiser edge-cases via manuell testing. Fix per case.

**Step 2:** Commit.

### Task 7.4: Versjon-bump + ship

Bump PATCH, CHANGELOG-entry, commit `feat(admin/games): modus-chip i ledger + polish`.

### Task 7.5: PR

---

## Final: Issue-lukking

### Task F.1: Closing-comment per CLAUDE.md

Etter fase 7 er merget:

```bash
gh issue comment 41 --body "$(cat <<'EOF'
## Teknisk

Epic levert over 7 atomic PRer:

1. [Fase 1 — DB-fundament](URL): 0030_game_modes.sql + 0031_solo_visibility_rls.sql
2. [Fase 2 — Scoring-arkitektur](URL): lib/scoring/modes/ + computeLeaderboard router
3. [Fase 3 — Validation](URL): mode-aware gamePayload med separate validators
4. [Fase 4 — GameForm](URL): players-first + ModeSelector + TeamSizeSelector
5. [Fase 5 — Spillerflyt](URL): SoloStablefordView leaderboard + scorecard-tilpasninger
6. [Fase 6 — Reveal](URL): podium + collapsed rangering + completion-mail
7. [Fase 7 — Polish](URL): modus-chip i admin-listen + side-tournament-verify

**Arkitektur:** Discriminated union `games.game_mode` + JSONB `mode_config`. Nullable team/flight i `game_players`. Mode-router i `lib/scoring/index.ts`.

**Avvik fra design:** Ingen vesentlige.

**Coverage:** Lib/scoring tester utvidet med 12+ nye stableford-tests + router-tests. GameForm fikk component-test-baseline (gap fra før). Spillerflyt manuelt verifisert i Vercel preview + prod.

## Funksjonell

Du kan nå opprette stableford-turneringer ved siden av best-ball-netto. I admin-flyten plukker du først spillerne, så velger du modus (med ikoner), så lagstørrelse. Solo stableford er aktiv nå; par-stableford og 4-mann er forberedt som «kommer snart»-tiles.

For spillerne: stableford-spillere ser per-hull-poeng på scorecardet, en flat leaderboard sortert på poeng, og topp 3 podium ved avslutning med resten av rangeringen utvidbar under.

Side-tournaments (LD/CTP) fungerer for begge moduser uten endringer.

Roadmap-issues som naturlig følger: par-stableford, 4-mann-stableford, matchplay (#45), Texas scramble (#44).
EOF
)"
```

### Task F.2: Verifiser issue auto-closed

Fase 4-PR-en inkluderte `Closes #41` i body (delvis), men siden epic strakk seg over 7 PRer, må issue lukkes manuelt etter fase 7:

```bash
gh issue close 41
gh issue view 41 --json state  # bekreft state=closed
```

---

## Sammendrag for solo-dev

Total: 7 faser, hver sin PR, hver atomic.

- **Foundation (fase 1-3):** ren intern refaktor, ingen versjon-bump. ~15 tasks. Risiko: lav (mest TDD-disiplinert kode).
- **First user delivery (fase 4):** MINOR-bump til 1.9.0. ~8 tasks. Risiko: medium (GameForm-refactor er stor).
- **Player flow (fase 5):** MINOR til 1.10.0. ~7 tasks. Risiko: medium (mange touch-points).
- **Reveal (fase 6):** PATCH. ~5 tasks. Risiko: lav.
- **Polish (fase 7):** PATCH. ~4 tasks. Risiko: lav.

**Estimat:** ~40 tasks totalt. Per subagent-driven-development med code-review mellom faser, realistisk 1-2 dager med fokusert arbeid.

**Risiko-håndtering:**
- Hver fase shippes til prod via PR-merge. Hvis noe brekker oppdages tidlig.
- GameForm-baseline-test (task 4.1) reduserer regresjonsrisiko for den største refactoren.
- Stableford bygges med TDD før UI rør den — scoring-logikken er solid før vi ser den.

**Følge-issues å åpne etter at epic er stengt:**
- Par-stableford (2-mann, best-ball-stableford-aggregering).
- 4-mann-stableford.
- Stableford-modifikatorer (modified stableford osv).
