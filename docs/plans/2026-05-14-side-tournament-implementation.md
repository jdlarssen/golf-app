# Sideturnering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship en opt-in sideturnering med poeng-konkurranse i seks kategorier (best netto 18/F9/B9, hole-win, longest drive, closest to pin) oppå dagens best-ball-netto-spill. Resultatet vises i egen leaderboard-fane, kun etter at admin har avsluttet spillet.

**Architecture:** Datamodellen utvider `games` med tre kolonner (`side_tournament_enabled`, `side_ld_count`, `side_ctp_count`) og legger til tabellen `game_side_winners` for admin-valgte LD/CTP-vinnere. Scoring lever i ny ren-TypeScript-modul `lib/scoring/sideTournament.ts` (TDD-strikt, matcher resten av `lib/scoring/`). Admin-form ved spill-opprett får en ny seksjon; admin-avslutt-flyten får dedikert route `/admin/games/[id]/avslutt` med dropdown-wizard for LD/CTP-vinnere. Leaderboard-siden får tabs som først aktiveres når `status='finished'`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), Tailwind v4, Vitest + Testing Library. Migrasjoner committes til `supabase/migrations/`; Supabase MCP brukes for å applye dem (per memory `reference_supabase_mcp`).

**Design-doc:** [`docs/plans/2026-05-14-side-tournament-design.md`](./2026-05-14-side-tournament-design.md)

**Subagent-modell:** Opus for alle implementer/reviewer-subagenter (per memory `feedback_subagent_model_routing`).

---

## Task 1: DB-migrasjon — games-kolonner + game_side_winners-tabell

**Files:**
- Create: `supabase/migrations/0024_side_tournament.sql`

**Step 1: Skriv migrasjonsfilen**

```sql
-- 0024_side_tournament.sql
-- Adds opt-in side tournament: parallel point competition layered onto best-ball netto.

-- 1. Konfig-kolonner på games
alter table public.games
  add column side_tournament_enabled boolean not null default false,
  add column side_ld_count int not null default 0
    check (side_ld_count between 0 and 2),
  add column side_ctp_count int not null default 0
    check (side_ctp_count between 0 and 2);

-- Consistency: hvis sideturnering ikke er aktivert, må LD/CTP-counts være 0
alter table public.games add constraint games_side_consistency check (
  side_tournament_enabled = true
  or (side_ld_count = 0 and side_ctp_count = 0)
);

-- 2. LD/CTP-vinnere
create table public.game_side_winners (
  game_id uuid not null references public.games(id) on delete cascade,
  category text not null check (category in ('longest_drive', 'closest_to_pin')),
  position int not null check (position between 1 and 2),
  winner_user_id uuid references public.users(id),  -- null = "Ingen kvalifiserte"
  decided_at timestamptz not null default now(),
  primary key (game_id, category, position)
);

create index game_side_winners_game on public.game_side_winners(game_id);

-- 3. RLS
alter table public.game_side_winners enable row level security;

-- Select: spillere kan se vinnere bare når spillet er ferdig
create policy game_side_winners_select on public.game_side_winners
  for select using (
    exists (
      select 1
      from public.games g
      join public.game_players gp on gp.game_id = g.id
      where g.id = game_side_winners.game_id
        and g.status = 'finished'
        and gp.user_id = auth.uid()
    )
  );

-- Insert/update/delete: kun admin
create policy game_side_winners_admin_all on public.game_side_winners
  for all using (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_admin = true
    )
  ) with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_admin = true
    )
  );
```

**Step 2: Apply via Supabase MCP**

Bruk `mcp__36be25a6-2d72-41c3-a675-2352133ed510__apply_migration` med name `side_tournament` og query = filen over.

Expected: success, ingen feilmelding.

**Step 3: Verifiser via execute_sql**

Kjør:
```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='games'
  and column_name in ('side_tournament_enabled','side_ld_count','side_ctp_count')
order by column_name;
```

Expected: 3 rader. `side_tournament_enabled` = `boolean`, `not null`, `false`. De to count-feltene = `integer`, `not null`, `0`.

Verifiser også tabellen:
```sql
select count(*) from public.game_side_winners;
```
Expected: `0` (tom tabell, ingen feil).

**Step 4: Commit**

```bash
git add supabase/migrations/0024_side_tournament.sql
git commit -m "feat(side-tournament): add db schema for side tournament

Adds side_tournament_enabled + side_ld_count + side_ctp_count to games,
plus game_side_winners table for admin-picked LD/CTP winners.
RLS: select only when game status=finished; mutations admin-only."
```

NB: dette er en `feat`-commit. Commit-msg-hooken vil kreve `package.json`-version-bump og CHANGELOG-entry. Migrasjonen alene endrer ikke bruker-synlig oppførsel, så vi vil enten:
- Bytte prefiks til `chore(db): ...` (skip-typer passerer hooken fritt), eller
- Bundle DB-arbeidet inn i Task 11 (final feature-commit) og bare stage filen lokalt nå.

Velg `chore(db)` her — migrasjonen er teknisk forberedelse, ikke bruker-synlig. Endre commit-msg til:

```bash
git commit -m "chore(db): add side-tournament schema

Migrasjon 0024. Schema er på plass; UI-en som bruker den landes i
påfølgende tasks. games-kolonnene har defaults (false/0) så
eksisterende spill påvirkes ikke."
```

---

## Task 2: Scoring-bibliotek — failing tests først

**Files:**
- Create: `lib/scoring/sideTournament.test.ts`

**Step 1: Skriv hele test-fila først (TDD — alle tester skal feile)**

Skriv `lib/scoring/sideTournament.test.ts`. Test-cases:

```ts
import { describe, it, expect } from 'vitest';
import {
  calculateSideTournament,
  type SideTournamentInput,
} from './sideTournament';

// Helper: bygg per-hole-netto-array for et lag
function holes(values: Array<number | null>): Array<number | null> {
  if (values.length !== 18) throw new Error('test bug: must be 18 holes');
  return values;
}

// Standard 2-lags-input som test-cases utvider
function baseInput(overrides: Partial<SideTournamentInput> = {}): SideTournamentInput {
  return {
    config: { enabled: true, ldCount: 0, ctpCount: 0 },
    teams: [
      { teamId: 1, userIds: ['user-a', 'user-b'] },
      { teamId: 2, userIds: ['user-c', 'user-d'] },
    ],
    nettoBestBallPerHole: [
      { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
      { teamId: 2, perHoleNetto: holes(new Array(18).fill(5)) },
    ],
    sideWinners: [],
    ...overrides,
  };
}

describe('calculateSideTournament', () => {
  it('best netto 18: single winner gets 10 points', () => {
    const result = calculateSideTournament(baseInput());
    const team1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const team2 = result.teamStandings.find((t) => t.teamId === 2)!;

    const team1Award = team1.awards.find((a) => a.category === 'best_netto_18');
    expect(team1Award?.points).toBe(10);
    expect(team2.awards.find((a) => a.category === 'best_netto_18')).toBeUndefined();
  });

  it('best netto 18: tie → both teams get full 10 (no split)', () => {
    const input = baseInput({
      nettoBestBallPerHole: [
        { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        { teamId: 2, perHoleNetto: holes(new Array(18).fill(4)) }, // tie
      ],
    });
    const result = calculateSideTournament(input);
    const team1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const team2 = result.teamStandings.find((t) => t.teamId === 2)!;

    expect(team1.awards.find((a) => a.category === 'best_netto_18')?.points).toBe(10);
    expect(team2.awards.find((a) => a.category === 'best_netto_18')?.points).toBe(10);
  });

  it('front 9 and back 9 winners can be different teams', () => {
    // Team 1 sterk på F9 (3 per hull), Team 2 sterk på B9 (3 per hull)
    const team1 = [...Array(9).fill(3), ...Array(9).fill(5)];
    const team2 = [...Array(9).fill(5), ...Array(9).fill(3)];
    const result = calculateSideTournament(baseInput({
      nettoBestBallPerHole: [
        { teamId: 1, perHoleNetto: holes(team1) },
        { teamId: 2, perHoleNetto: holes(team2) },
      ],
    }));

    const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

    expect(t1.awards.find((a) => a.category === 'best_netto_front9')?.points).toBe(5);
    expect(t2.awards.find((a) => a.category === 'best_netto_back9')?.points).toBe(5);
  });

  it('hole-win: alone winner gets 2 points per hole', () => {
    // Team 1 vinner alle 18 hull alene → 18 × 2 = 36 hole-win-poeng
    const result = calculateSideTournament(baseInput());
    const t1 = result.teamStandings.find((t) => t.teamId === 1)!;

    const holeWinAwards = t1.awards.filter((a) => a.category === 'hole_win');
    const totalHoleWin = holeWinAwards.reduce((sum, a) => sum + a.points, 0);
    expect(totalHoleWin).toBe(36);
  });

  it('hole-win: tie on a hole → no points for that hole', () => {
    // Begge lag 4 på hull 1, ulikt resten (team 1 vinner resten)
    const t1Holes = [4, ...new Array(17).fill(3)];
    const t2Holes = [4, ...new Array(17).fill(5)];
    const result = calculateSideTournament(baseInput({
      nettoBestBallPerHole: [
        { teamId: 1, perHoleNetto: holes(t1Holes) },
        { teamId: 2, perHoleNetto: holes(t2Holes) },
      ],
    }));

    const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const t2 = result.teamStandings.find((t) => t.teamId === 2)!;

    // Team 1 vinner hull 2-18 alene → 17 × 2 = 34p
    expect(t1.awards.filter((a) => a.category === 'hole_win').reduce((s, a) => s + a.points, 0)).toBe(34);
    // Team 2 vinner ingen hull alene
    expect(t2.awards.filter((a) => a.category === 'hole_win').length).toBe(0);
  });

  it('hole-win: 3-way tie → no points', () => {
    const input = baseInput({
      teams: [
        { teamId: 1, userIds: ['a'] },
        { teamId: 2, userIds: ['b'] },
        { teamId: 3, userIds: ['c'] },
      ],
      nettoBestBallPerHole: [
        { teamId: 1, perHoleNetto: holes(new Array(18).fill(4)) },
        { teamId: 2, perHoleNetto: holes(new Array(18).fill(4)) },
        { teamId: 3, perHoleNetto: holes(new Array(18).fill(4)) },
      ],
    });
    const result = calculateSideTournament(input);
    const totalHoleWin = result.teamStandings.reduce((sum, t) => {
      return sum + t.awards.filter((a) => a.category === 'hole_win').reduce((s, a) => s + a.points, 0);
    }, 0);
    expect(totalHoleWin).toBe(0);
  });

  it('LD: 1 slot, winner set → 2p to winner team', () => {
    const input = baseInput({
      config: { enabled: true, ldCount: 1, ctpCount: 0 },
      sideWinners: [
        { category: 'longest_drive', position: 1, winnerUserId: 'user-a' },
      ],
    });
    const result = calculateSideTournament(input);
    const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
    expect(t1.awards.find((a) => a.category === 'longest_drive')?.points).toBe(2);
  });

  it('LD: 2 slots, same player both → 4p to that team', () => {
    const input = baseInput({
      config: { enabled: true, ldCount: 2, ctpCount: 0 },
      sideWinners: [
        { category: 'longest_drive', position: 1, winnerUserId: 'user-a' },
        { category: 'longest_drive', position: 2, winnerUserId: 'user-a' },
      ],
    });
    const result = calculateSideTournament(input);
    const t1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const ldAwards = t1.awards.filter((a) => a.category === 'longest_drive');
    expect(ldAwards.reduce((s, a) => s + a.points, 0)).toBe(4);
  });

  it('LD: slot with null winner → 0p, no award', () => {
    const input = baseInput({
      config: { enabled: true, ldCount: 1, ctpCount: 0 },
      sideWinners: [
        { category: 'longest_drive', position: 1, winnerUserId: null },
      ],
    });
    const result = calculateSideTournament(input);
    const totalLd = result.teamStandings.reduce(
      (sum, t) => sum + t.awards.filter((a) => a.category === 'longest_drive').reduce((s, a) => s + a.points, 0),
      0
    );
    expect(totalLd).toBe(0);
  });

  it('CTP mirrors LD logic', () => {
    const input = baseInput({
      config: { enabled: true, ldCount: 0, ctpCount: 1 },
      sideWinners: [
        { category: 'closest_to_pin', position: 1, winnerUserId: 'user-c' }, // user-c is on team 2
      ],
    });
    const result = calculateSideTournament(input);
    const t2 = result.teamStandings.find((t) => t.teamId === 2)!;
    expect(t2.awards.find((a) => a.category === 'closest_to_pin')?.points).toBe(2);
  });

  it('integration: all modules on, totals add up', () => {
    // Team 1: vinner F9 alene (3p/hull → 27 sum), Team 2 vinner B9 alene (3p/hull → 27 sum)
    // Begge har sum 27 + 45 = 72 totalt = tie på 18 → begge får 10
    // Hole-wins: team 1 vinner alle F9-hull alene = 9 × 2 = 18p, team 2 vinner alle B9-hull alene = 18p
    // LD: 2 slots; user-a + user-c (lag 1 og 2)
    // CTP: 2 slots; user-b + user-d (lag 1 og 2)
    const t1 = [...Array(9).fill(3), ...Array(9).fill(5)];
    const t2 = [...Array(9).fill(5), ...Array(9).fill(3)];
    const input = baseInput({
      config: { enabled: true, ldCount: 2, ctpCount: 2 },
      nettoBestBallPerHole: [
        { teamId: 1, perHoleNetto: holes(t1) },
        { teamId: 2, perHoleNetto: holes(t2) },
      ],
      sideWinners: [
        { category: 'longest_drive', position: 1, winnerUserId: 'user-a' },
        { category: 'longest_drive', position: 2, winnerUserId: 'user-c' },
        { category: 'closest_to_pin', position: 1, winnerUserId: 'user-b' },
        { category: 'closest_to_pin', position: 2, winnerUserId: 'user-d' },
      ],
    });
    const result = calculateSideTournament(input);
    const team1 = result.teamStandings.find((t) => t.teamId === 1)!;
    const team2 = result.teamStandings.find((t) => t.teamId === 2)!;

    // Team 1: best_netto_18 (10, tie) + best_netto_front9 (5) + hole_win F9 (18) + LD (2) + CTP (2) = 37
    expect(team1.totalPoints).toBe(37);
    // Team 2: best_netto_18 (10, tie) + best_netto_back9 (5) + hole_win B9 (18) + LD (2) + CTP (2) = 37
    expect(team2.totalPoints).toBe(37);
  });

  it('config.enabled = false → all teams 0 points, no awards', () => {
    const input = baseInput({ config: { enabled: false, ldCount: 0, ctpCount: 0 } });
    const result = calculateSideTournament(input);
    for (const team of result.teamStandings) {
      expect(team.totalPoints).toBe(0);
      expect(team.awards).toHaveLength(0);
    }
  });

  it('handles 4-team game without crashing', () => {
    const input: SideTournamentInput = {
      config: { enabled: true, ldCount: 0, ctpCount: 0 },
      teams: [1, 2, 3, 4].map((id) => ({ teamId: id, userIds: [`u${id}`] })),
      nettoBestBallPerHole: [1, 2, 3, 4].map((id) => ({
        teamId: id,
        perHoleNetto: holes(new Array(18).fill(3 + id)), // team 1 best (4/hole), team 4 worst (7/hole)
      })),
      sideWinners: [],
    };
    const result = calculateSideTournament(input);
    expect(result.teamStandings).toHaveLength(4);
    const team1 = result.teamStandings.find((t) => t.teamId === 1)!;
    expect(team1.awards.find((a) => a.category === 'best_netto_18')?.points).toBe(10);
    expect(team1.awards.filter((a) => a.category === 'hole_win').reduce((s, a) => s + a.points, 0)).toBe(36);
  });
});
```

**Step 2: Kjør testene → alle skal feile**

```bash
npx vitest run lib/scoring/sideTournament.test.ts
```

Expected: alle 13 tester feiler med «Cannot find module './sideTournament'» eller lignende. Hvis noen feiler av andre grunner — stopp og fiks test-fila.

**Step 3: Commit failing tests**

```bash
git add lib/scoring/sideTournament.test.ts
git commit -m "test(side-tournament): failing tests for scoring lib

TDD red-state for sideTournament-modulen: 13 test-cases dekker
netto-kategoriene, hole-win, LD/CTP og integrasjon. Implementasjon
i neste commit."
```

---

## Task 3: Scoring-bibliotek — implementasjon

**Files:**
- Create: `lib/scoring/sideTournament.ts`

**Step 1: Implementer fila**

```ts
// lib/scoring/sideTournament.ts
// Pure TypeScript side tournament scoring.
// No external dependencies, deterministic, fully unit-tested.

export type TeamId = number;
export type UserId = string;

export type SideCategory =
  | 'best_netto_18'
  | 'best_netto_front9'
  | 'best_netto_back9'
  | 'hole_win'
  | 'longest_drive'
  | 'closest_to_pin';

export interface SideTournamentConfig {
  enabled: boolean;
  ldCount: 0 | 1 | 2;
  ctpCount: 0 | 1 | 2;
}

export interface SideWinner {
  category: 'longest_drive' | 'closest_to_pin';
  position: 1 | 2;
  winnerUserId: UserId | null;
}

export interface SideTournamentInput {
  config: SideTournamentConfig;
  teams: Array<{ teamId: TeamId; userIds: UserId[] }>;
  nettoBestBallPerHole: Array<{
    teamId: TeamId;
    perHoleNetto: Array<number | null>;  // 18 elementer
  }>;
  sideWinners: SideWinner[];
}

export interface SideCategoryAward {
  category: SideCategory;
  teamId: TeamId;
  points: number;
  detail?: string;
}

export interface SideTournamentResult {
  teamStandings: Array<{
    teamId: TeamId;
    totalPoints: number;
    awards: SideCategoryAward[];
  }>;
}

// --- private helpers ---

function sumHoles(perHole: Array<number | null>, start: number, end: number): number | null {
  let sum = 0;
  for (let i = start; i < end; i++) {
    const v = perHole[i];
    if (v == null) return null; // partial → not eligible
    sum += v;
  }
  return sum;
}

function findMinTeams(
  totals: Array<{ teamId: TeamId; total: number | null }>
): TeamId[] {
  const valid = totals.filter((t): t is { teamId: TeamId; total: number } => t.total !== null);
  if (valid.length === 0) return [];
  const min = Math.min(...valid.map((t) => t.total));
  return valid.filter((t) => t.total === min).map((t) => t.teamId);
}

function teamIdForUser(
  teams: SideTournamentInput['teams'],
  userId: UserId
): TeamId | null {
  for (const t of teams) {
    if (t.userIds.includes(userId)) return t.teamId;
  }
  return null;
}

// --- public API ---

export function calculateSideTournament(
  input: SideTournamentInput
): SideTournamentResult {
  const standingsMap = new Map<TeamId, { totalPoints: number; awards: SideCategoryAward[] }>();
  for (const team of input.teams) {
    standingsMap.set(team.teamId, { totalPoints: 0, awards: [] });
  }

  // Tidlig retur: sideturnering ikke aktiv
  if (!input.config.enabled) {
    return {
      teamStandings: input.teams.map((t) => ({
        teamId: t.teamId,
        totalPoints: 0,
        awards: [],
      })),
    };
  }

  const award = (teamId: TeamId, a: SideCategoryAward) => {
    const s = standingsMap.get(teamId);
    if (!s) return;
    s.awards.push(a);
    s.totalPoints += a.points;
  };

  // 1. Best netto 18 — 10p, tie = alle får 10
  const totals18 = input.nettoBestBallPerHole.map((t) => ({
    teamId: t.teamId,
    total: sumHoles(t.perHoleNetto, 0, 18),
  }));
  for (const teamId of findMinTeams(totals18)) {
    award(teamId, { category: 'best_netto_18', teamId, points: 10 });
  }

  // 2. Best netto F9 — 5p
  const totalsF9 = input.nettoBestBallPerHole.map((t) => ({
    teamId: t.teamId,
    total: sumHoles(t.perHoleNetto, 0, 9),
  }));
  for (const teamId of findMinTeams(totalsF9)) {
    award(teamId, { category: 'best_netto_front9', teamId, points: 5 });
  }

  // 3. Best netto B9 — 5p
  const totalsB9 = input.nettoBestBallPerHole.map((t) => ({
    teamId: t.teamId,
    total: sumHoles(t.perHoleNetto, 9, 18),
  }));
  for (const teamId of findMinTeams(totalsB9)) {
    award(teamId, { category: 'best_netto_back9', teamId, points: 5 });
  }

  // 4. Hole-win — 2p per hull, kun alene-vinner
  for (let hole = 0; hole < 18; hole++) {
    const holeTotals = input.nettoBestBallPerHole.map((t) => ({
      teamId: t.teamId,
      total: t.perHoleNetto[hole] != null ? (t.perHoleNetto[hole] as number) : null,
    }));
    const winners = findMinTeams(holeTotals);
    if (winners.length === 1) {
      award(winners[0]!, {
        category: 'hole_win',
        teamId: winners[0]!,
        points: 2,
        detail: `Hull ${hole + 1}`,
      });
    }
  }

  // 5. LD — 2p per slot (gated by ldCount)
  for (const w of input.sideWinners) {
    if (w.category === 'longest_drive' && w.position <= input.config.ldCount && w.winnerUserId) {
      const teamId = teamIdForUser(input.teams, w.winnerUserId);
      if (teamId != null) {
        award(teamId, {
          category: 'longest_drive',
          teamId,
          points: 2,
          detail: `Slot ${w.position}`,
        });
      }
    }
  }

  // 6. CTP — 2p per slot (gated by ctpCount)
  for (const w of input.sideWinners) {
    if (w.category === 'closest_to_pin' && w.position <= input.config.ctpCount && w.winnerUserId) {
      const teamId = teamIdForUser(input.teams, w.winnerUserId);
      if (teamId != null) {
        award(teamId, {
          category: 'closest_to_pin',
          teamId,
          points: 2,
          detail: `Slot ${w.position}`,
        });
      }
    }
  }

  return {
    teamStandings: input.teams.map((t) => ({
      teamId: t.teamId,
      totalPoints: standingsMap.get(t.teamId)!.totalPoints,
      awards: standingsMap.get(t.teamId)!.awards,
    })),
  };
}
```

**Step 2: Kjør testene → alle skal nå passere**

```bash
npx vitest run lib/scoring/sideTournament.test.ts
```

Expected: 13/13 pass.

**Step 3: Lint + typecheck**

```bash
npx tsc --noEmit
npx eslint lib/scoring/sideTournament.ts
```

Expected: ingen feil.

**Step 4: Commit**

```bash
git add lib/scoring/sideTournament.ts
git commit -m "feat(side-tournament): scoring library

Pure TypeScript module calculateSideTournament. 6 kategorier
(best netto 18/F9/B9, hole-win, LD, CTP), 13 test-cases passerer.
Tie i netto-kategoriene = alle får full pott; hole-win krever
alene-vinner."
```

NB: commit-msg-hook vil kreve `package.json`-bump + CHANGELOG. Siden scoring-modulen alene ikke er bruker-synlig (ingen route bruker den ennå), bruk `chore(scoring): ...` istedenfor:

```bash
git commit -m "chore(scoring): add side-tournament scoring library

Pure TS module. UI som bruker den landes i påfølgende tasks."
```

---

## Task 4: GameForm — sideturnering-seksjon (admin spill-opprett)

**Files:**
- Modify: `app/admin/games/new/GameForm.tsx` — ny seksjon før Players-seksjonen (rundt linje 597)
- Modify: `app/admin/games/new/actions.ts` — validering + insert av nye felter
- Modify: `app/admin/games/[id]/edit/page.tsx` — passere initial-verdier + lock-flag

**Step 1: Utvid `InitialValues`-typen i GameForm.tsx**

Finn `export type InitialValues = {` (rundt linje 28). Etter `lock_score_visibility?: boolean;`, legg til:

```ts
  /** Whether the side-tournament module is enabled for this game. Default false. */
  side_tournament_enabled?: boolean;
  /** Antall LD-vinnere (0/1/2). Krever side_tournament_enabled=true. */
  side_ld_count?: number;
  /** Antall CTP-vinnere (0/1/2). Krever side_tournament_enabled=true. */
  side_ctp_count?: number;
  /** Lås feltene (når status er active/finished). */
  lock_side_tournament?: boolean;
```

**Step 2: Initial-state i GameForm.tsx**

Etter `const lockScoreVisibility = ...` (rundt linje 168), legg til:

```ts
  const initialSideEnabled = initialValues?.side_tournament_enabled ?? false;
  const initialLdCount = ([0, 1, 2] as const).includes(
    (initialValues?.side_ld_count ?? 0) as 0 | 1 | 2
  )
    ? (initialValues?.side_ld_count ?? 0)
    : 0;
  const initialCtpCount = ([0, 1, 2] as const).includes(
    (initialValues?.side_ctp_count ?? 0) as 0 | 1 | 2
  )
    ? (initialValues?.side_ctp_count ?? 0)
    : 0;
  const lockSideTournament = initialValues?.lock_side_tournament ?? false;

  const [sideEnabled, setSideEnabled] = useState<boolean>(initialSideEnabled);
```

**Step 3: Beregn antall lag (gate-regel ≥2 lag)**

Lengst opp i komponenten finner du allerede `teamAssignments`-state. Etter den, legg til (eller utvid eksisterende derived-state):

```ts
  const distinctTeams = useMemo(() => {
    const set = new Set<number>();
    for (const [, team] of Object.entries(teamAssignments)) {
      if (team != null) set.add(team as number);
    }
    return set.size;
  }, [teamAssignments]);

  const sideTournamentEligible = distinctTeams >= 2;
```

**Step 4: Skriv selve seksjonen — rett før `{/* Section 2: Players */}` (rundt linje 599)**

```tsx
        {/* Section 1c: Side tournament */}
        <fieldset>
          <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Sideturnering
          </legend>
          <div className="mt-2 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="side_tournament_enabled"
                value="true"
                checked={sideEnabled && sideTournamentEligible}
                onChange={(e) => setSideEnabled(e.target.checked)}
                disabled={lockSideTournament || !sideTournamentEligible}
                className="mt-1"
              />
              <div>
                <div className="font-serif text-base text-text">
                  Legg til sideturnering
                </div>
                <div className="text-xs text-muted">
                  Parallell lag-konkurranse med poeng. Vises etter at spillet er avsluttet.
                </div>
              </div>
            </label>

            {!sideTournamentEligible && (
              <p className="text-xs text-muted">
                Krever minst 2 lag for å aktiveres.
              </p>
            )}

            {sideEnabled && sideTournamentEligible && (
              <div className="space-y-4 rounded-md border border-line bg-surface-2 p-3">
                <p className="text-xs text-muted">
                  Poengfordeling: best netto 18 = 10p, front 9 + back 9 = 5p hver,
                  hole-win = 2p per hull (kun alene-vinner), longest drive + closest to pin = 2p per vinner.
                </p>

                <fieldset>
                  <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                    Antall longest-drive-vinnere
                  </legend>
                  <div className="mt-2 flex gap-2">
                    {[0, 1, 2].map((n) => (
                      <label key={n} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="side_ld_count"
                          value={n}
                          defaultChecked={initialLdCount === n}
                          disabled={lockSideTournament}
                        />
                        <span className="font-serif text-base text-text tabular-nums">{n}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                    Antall closest-to-pin-vinnere
                  </legend>
                  <div className="mt-2 flex gap-2">
                    {[0, 1, 2].map((n) => (
                      <label key={n} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="side_ctp_count"
                          value={n}
                          defaultChecked={initialCtpCount === n}
                          disabled={lockSideTournament}
                        />
                        <span className="font-serif text-base text-text tabular-nums">{n}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {lockSideTournament && (
                  <p className="text-xs text-muted">
                    <strong>Kan ikke endres etter spill-start.</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        </fieldset>
```

**Step 5: Utvid `actions.ts` — validering + persistering**

Åpne `app/admin/games/new/actions.ts`. Finn `score_visibility`-håndteringen.

Etter parsing av `score_visibility`, legg til:

```ts
  const sideEnabledRaw = formData.get('side_tournament_enabled');
  const sideEnabled = sideEnabledRaw === 'true';

  const sideLdCountRaw = formData.get('side_ld_count');
  const sideCtpCountRaw = formData.get('side_ctp_count');

  let sideLdCount = 0;
  let sideCtpCount = 0;
  if (sideEnabled) {
    const parsedLd = Number(sideLdCountRaw);
    const parsedCtp = Number(sideCtpCountRaw);
    if (!Number.isInteger(parsedLd) || parsedLd < 0 || parsedLd > 2) {
      return { error: 'Ugyldig antall LD-vinnere' };
    }
    if (!Number.isInteger(parsedCtp) || parsedCtp < 0 || parsedCtp > 2) {
      return { error: 'Ugyldig antall CTP-vinnere' };
    }
    sideLdCount = parsedLd;
    sideCtpCount = parsedCtp;
  }
```

I `insert`-objektet for games-tabellen, legg til:

```ts
      side_tournament_enabled: sideEnabled,
      side_ld_count: sideLdCount,
      side_ctp_count: sideCtpCount,
```

Også: oppdater edit-action (samme fil eller `app/admin/games/[id]/edit/actions.ts` — sjekk hvor edit-flow lever) med samme felter, men respekter lock-regelen (skip update av disse hvis status='active' eller 'finished').

**Step 6: Test manuelt**

```bash
npm run dev
```

Åpne `http://localhost:3000/admin/games/new`, logg inn som admin (eller bruk allerede aktiv session). Sjekk:
- Sideturnerings-seksjonen viser «Krever minst 2 lag» når 0–1 lag er valgt
- Tildel spillere til 2 lag → seksjonen blir tilgjengelig
- Hak av master-toggle → LD/CTP-radioer dukker opp
- Submit form med LD=2, CTP=1 → spillet opprettes uten feil
- Verifiser via Supabase MCP `execute_sql`:
  ```sql
  select id, name, side_tournament_enabled, side_ld_count, side_ctp_count
  from public.games order by created_at desc limit 1;
  ```
  Expected: `side_tournament_enabled=true, side_ld_count=2, side_ctp_count=1`

**Step 7: Commit**

```bash
git add app/admin/games/new/GameForm.tsx app/admin/games/new/actions.ts app/admin/games/[id]/edit/page.tsx
git commit -m "feat(side-tournament): admin form section for game create

Adds opt-in toggle + LD/CTP count radios til admin-formen.
Gates på >=2 lag. Bruker eksisterende lock-mønster fra
score_visibility for edit-flow."
```

NB: dette er fortsatt teknisk ikke bruker-synlig (sideturneringen vises ingen steder ennå), men den er admin-synlig — så bruk `chore(form)` eller bundle med Task 11. Velg `chore`:

```bash
git commit -m "chore(side-tournament): admin form section for game create"
```

---

## Task 5: EndGameButton conditional redirect

**Files:**
- Modify: `app/admin/games/[id]/EndGameButton.tsx`
- Modify: `app/admin/games/[id]/page.tsx` — passere `side_tournament_enabled`, `side_ld_count`, `side_ctp_count` til EndGameButton

**Step 1: Utvid `EndGameButton` props**

Sjekk dagens signatur. Du legger til:

```ts
type Props = {
  gameId: string;
  disabled?: boolean;
  // NEW:
  sideTournament?: {
    enabled: boolean;
    ldCount: number;
    ctpCount: number;
  };
};
```

**Step 2: Conditional redirect**

I komponenten — hvis `sideTournament?.enabled && (sideTournament.ldCount + sideTournament.ctpCount > 0)`, render en `<Link>` som peker til `/admin/games/[id]/avslutt` (med samme styling som dagens button). Hvis ikke, behold dagens `<form action={endGame}>`-knapp.

```tsx
const needsWizard =
  sideTournament?.enabled &&
  (sideTournament.ldCount + sideTournament.ctpCount > 0);

if (needsWizard) {
  return (
    <Link
      href={`/admin/games/${gameId}/avslutt`}
      className="..."  // match dagens Button-styling
    >
      Avslutt spillet
    </Link>
  );
}
// existing form-action button
```

**Step 3: Oppdater game-detail page**

I `app/admin/games/[id]/page.tsx`, finn der `EndGameButton` rendres. Pass nye props:

```tsx
<EndGameButton
  gameId={game.id}
  disabled={!canEnd}
  sideTournament={{
    enabled: game.side_tournament_enabled,
    ldCount: game.side_ld_count,
    ctpCount: game.side_ctp_count,
  }}
/>
```

Du må også utvide `select`-spørringen som henter game-objektet til å inkludere de tre kolonnene.

**Step 4: Test manuelt**

- Spill uten sideturnering: «Avslutt»-knappen kjører fortsatt direkte
- Spill med side_tournament_enabled + LD/CTP > 0: «Avslutt»-knappen linker til `/avslutt`-route (som ikke eksisterer ennå → 404 forventet inntil Task 6)

**Step 5: Commit**

```bash
git add app/admin/games/[id]/EndGameButton.tsx app/admin/games/[id]/page.tsx
git commit -m "chore(side-tournament): route end-game via /avslutt when LD/CTP set

EndGameButton sjekker side-tournament-config og redirecter til
dedikert wizard hvis admin må velge vinnere. Ellers: dagens
direkte endGame-flyt (uendret)."
```

---

## Task 6: /admin/games/[id]/avslutt route + form + action

**Files:**
- Create: `app/admin/games/[id]/avslutt/page.tsx`
- Create: `app/admin/games/[id]/avslutt/SideWinnersForm.tsx`
- Create: `app/admin/games/[id]/avslutt/actions.ts`

**Step 1: Skriv server-action — `actions.ts`**

```ts
// app/admin/games/[id]/avslutt/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { sendGameFinishedNotification } from '@/lib/mail/gameFinishedNotification';
import { firstName } from '@/lib/users/firstName';
import type { GameStatus } from '@/lib/games/status';

export async function endGameWithSideWinners(
  gameId: string,
  formData: FormData
) {
  const { supabase } = await requireAdmin();
  const detailPath = `/admin/games/${gameId}`;
  const wizardPath = `${detailPath}/avslutt`;

  // Hent game-config + verifiser status
  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, require_peer_approval, side_tournament_enabled, side_ld_count, side_ctp_count'
    )
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: GameStatus;
      require_peer_approval: boolean;
      side_tournament_enabled: boolean;
      side_ld_count: number;
      side_ctp_count: number;
    }>();

  if (!game || game.status !== 'active') {
    redirect(`${detailPath}?error=not_active`);
  }

  // Parse vinnere fra formData
  // Hver dropdown heter f.eks. "ld_winner_1", "ld_winner_2", "ctp_winner_1", "ctp_winner_2"
  // Verdi: user_id eller "none" (mappes til null)
  type Winner = {
    category: 'longest_drive' | 'closest_to_pin';
    position: 1 | 2;
    winner_user_id: string | null;
  };

  const winners: Winner[] = [];
  for (let pos = 1; pos <= game!.side_ld_count; pos++) {
    const raw = formData.get(`ld_winner_${pos}`);
    if (typeof raw !== 'string' || raw === '') {
      redirect(`${wizardPath}?error=missing_ld_${pos}`);
    }
    winners.push({
      category: 'longest_drive',
      position: pos as 1 | 2,
      winner_user_id: raw === 'none' ? null : raw,
    });
  }
  for (let pos = 1; pos <= game!.side_ctp_count; pos++) {
    const raw = formData.get(`ctp_winner_${pos}`);
    if (typeof raw !== 'string' || raw === '') {
      redirect(`${wizardPath}?error=missing_ctp_${pos}`);
    }
    winners.push({
      category: 'closest_to_pin',
      position: pos as 1 | 2,
      winner_user_id: raw === 'none' ? null : raw,
    });
  }

  // Verifiser at alle spillere har submittet (matcher dagens endGame)
  const { data: players } = await supabase
    .from('game_players')
    .select(
      'submitted_at, approved_at, users!game_players_user_id_fkey(email, name)'
    )
    .eq('game_id', gameId)
    .returns<
      {
        submitted_at: string | null;
        approved_at: string | null;
        users: { email: string | null; name: string | null } | null;
      }[]
    >();

  if (!players || players.length === 0) {
    redirect(`${detailPath}?error=no_players`);
  }
  for (const p of players!) {
    if (!p.submitted_at) redirect(`${detailPath}?error=not_all_submitted`);
    if (game!.require_peer_approval && !p.approved_at) {
      redirect(`${detailPath}?error=not_all_approved`);
    }
  }

  // Insert vinnere FØRST (idempotent på (game_id, category, position) — bruker upsert)
  if (winners.length > 0) {
    const rows = winners.map((w) => ({
      game_id: gameId,
      category: w.category,
      position: w.position,
      winner_user_id: w.winner_user_id,
    }));
    const { error: winnerErr } = await supabase
      .from('game_side_winners')
      .upsert(rows, { onConflict: 'game_id,category,position' });
    if (winnerErr) {
      console.error('[endGameWithSideWinners] winners insert failed', winnerErr);
      redirect(`${wizardPath}?error=db_winners`);
    }
  }

  // Flip game til finished
  const { error: statusErr } = await supabase
    .from('games')
    .update({ status: 'finished', ended_at: new Date().toISOString() })
    .eq('id', gameId);
  if (statusErr) redirect(`${detailPath}?error=db_finish`);

  // Send mail (best-effort) — kopier fra endGame
  const recipients = (players ?? [])
    .map((p) => p.users)
    .filter((u): u is { email: string; name: string | null } => {
      return u != null && typeof u.email === 'string' && u.email.length > 0;
    });
  if (recipients.length > 0) {
    const results = await Promise.allSettled(
      recipients.map((u) =>
        sendGameFinishedNotification({
          to: u.email,
          playerFirstName: firstName(u.name),
          gameName: game!.name,
          gameId,
        })
      )
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[endGameWithSideWinners] mail failed', r.reason);
      }
    }
  }

  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  redirect(`${detailPath}?status=finished`);
}
```

**Step 2: Skriv `SideWinnersForm.tsx`**

```tsx
// app/admin/games/[id]/avslutt/SideWinnersForm.tsx
'use client';

import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export type PlayerOption = {
  user_id: string;
  display_name: string;
};

type Props = {
  gameId: string;
  ldCount: number;
  ctpCount: number;
  players: PlayerOption[];
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
};

export function SideWinnersForm({
  gameId,
  ldCount,
  ctpCount,
  players,
  action,
  error,
}: Props) {
  return (
    <form action={action} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          Mangler valg. Vennligst fyll inn alle vinner-feltene.
        </div>
      )}

      {ldCount > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Longest drive
          </legend>
          {Array.from({ length: ldCount }, (_, i) => i + 1).map((pos) => (
            <label key={`ld-${pos}`} className="block">
              <span className="font-serif text-base text-text">
                Longest drive #{pos}
              </span>
              <select
                name={`ld_winner_${pos}`}
                required
                defaultValue=""
                className="mt-1 block w-full rounded-md border-line bg-surface px-3 py-2"
              >
                <option value="" disabled>
                  — Velg vinner —
                </option>
                {players.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.display_name}
                  </option>
                ))}
                <option value="none">Ingen kvalifiserte</option>
              </select>
            </label>
          ))}
        </fieldset>
      )}

      {ctpCount > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Closest to pin
          </legend>
          {Array.from({ length: ctpCount }, (_, i) => i + 1).map((pos) => (
            <label key={`ctp-${pos}`} className="block">
              <span className="font-serif text-base text-text">
                Closest to pin #{pos}
              </span>
              <select
                name={`ctp_winner_${pos}`}
                required
                defaultValue=""
                className="mt-1 block w-full rounded-md border-line bg-surface px-3 py-2"
              >
                <option value="" disabled>
                  — Velg vinner —
                </option>
                {players.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.display_name}
                  </option>
                ))}
                <option value="none">Ingen kvalifiserte</option>
              </select>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex gap-3">
        <Button type="submit" variant="primary">
          Avslutt spillet og publiser sideturneringen
        </Button>
        <Link
          href={`/admin/games/${gameId}`}
          className="text-sm text-muted underline"
        >
          Avbryt
        </Link>
      </div>
    </form>
  );
}
```

**Step 3: Skriv `page.tsx`**

```tsx
// app/admin/games/[id]/avslutt/page.tsx
import { notFound, redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { AppShell } from '@/components/ui/AppShell';
import { SideWinnersForm, type PlayerOption } from './SideWinnersForm';
import { endGameWithSideWinners } from './actions';
import { formatRevealName } from '@/lib/names/formatRevealName';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

export default async function AvsluttPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id: gameId } = await params;
  const { error } = await searchParams;

  const { supabase } = await requireAdmin();

  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, side_tournament_enabled, side_ld_count, side_ctp_count'
    )
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: 'draft' | 'active' | 'finished' | 'scheduled';
      side_tournament_enabled: boolean;
      side_ld_count: number;
      side_ctp_count: number;
    }>();

  if (!game) notFound();

  // Hvis spillet ikke krever wizard, redirect tilbake
  if (game.status !== 'active') {
    redirect(`/admin/games/${gameId}?error=not_active`);
  }
  if (
    !game.side_tournament_enabled ||
    game.side_ld_count + game.side_ctp_count === 0
  ) {
    redirect(`/admin/games/${gameId}`);
  }

  // Hent spillere for dropdown
  const { data: gamePlayers } = await supabase
    .from('game_players')
    .select(
      'user_id, users!game_players_user_id_fkey(name, nickname)'
    )
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        users: { name: string | null; nickname: string | null } | null;
      }[]
    >();

  const players: PlayerOption[] =
    gamePlayers
      ?.map((gp) => ({
        user_id: gp.user_id,
        display_name: formatRevealName(
          gp.users?.name ?? null,
          gp.users?.nickname ?? null
        ),
      })) ?? [];

  // Bind gameId til action
  const action = endGameWithSideWinners.bind(null, gameId);

  return (
    <AppShell>
      <TopBar back={`/admin/games/${gameId}`} kicker="Avslutt spillet" />
      <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
        <PageHeader
          title="Avslutt spill"
          subtitle={`Velg sideturnerings-vinnere for «${game.name}». Spillet låses når du bekrefter.`}
        />

        <SideWinnersForm
          gameId={gameId}
          ldCount={game.side_ld_count}
          ctpCount={game.side_ctp_count}
          players={players}
          action={action}
          error={error}
        />
      </main>
    </AppShell>
  );
}
```

**Step 4: Test manuelt**

```bash
npm run dev
```

1. Lag et spill med sideturnering aktivert, LD=2, CTP=1
2. Tilfør spillere, start spillet, fyll inn scores, lever alle scorekort
3. Som admin på `/admin/games/[id]`: trykk «Avslutt spillet»
4. Forventet: redirect til `/admin/games/[id]/avslutt`
5. Velg vinnere (eller «Ingen kvalifiserte»). Trykk submit
6. Forventet: redirect til `/admin/games/[id]?status=finished`
7. Verifiser i DB:
   ```sql
   select * from public.game_side_winners where game_id = '<game-id>';
   ```
   Expected: 3 rader (2 LD + 1 CTP).

**Step 5: Commit**

```bash
git add app/admin/games/[id]/avslutt/
git commit -m "feat(side-tournament): admin wizard for LD/CTP winners

Ny route /admin/games/[id]/avslutt med dropdown per slot.
Insert vinnere i game_side_winners, deretter status=finished.
Dedikert side framfor modal — matcher mønster fra slett-flyter."
```

NB: dette er heller ikke bruker-synlig (siden leaderboard-fanen ikke finnes). Bruk `chore(admin)`:

```bash
git commit -m "chore(admin): wizard for LD/CTP winners at game end"
```

---

## Task 7: Leaderboard data-henting — utvid med side-tournament-data

**Files:**
- Modify: `app/games/[id]/leaderboard/page.tsx` (eller hvor leaderboard-data hentes — sjekk fila først)

**Step 1: Inspiser eksisterende leaderboard-side**

```bash
ls app/games/\[id\]/leaderboard/
```

Forventet å se `page.tsx` + ulike View-komponenter (`RevealBruttoView`, `PreRoundLeaderboardRealtime`, etc.). Sjekk hvordan data hentes.

**Step 2: Utvid game-spørringen**

I `page.tsx`, finn `supabase.from('games').select(...)`-kallet. Legg til feltene:

```ts
.select('id, name, status, score_visibility, side_tournament_enabled, side_ld_count, side_ctp_count, /* ... eksisterende felter */')
```

**Step 3: Hent vinnere kun hvis finished + sideturnering aktiv**

Etter game-spørringen:

```ts
let sideWinners: Array<{
  category: 'longest_drive' | 'closest_to_pin';
  position: number;
  winner_user_id: string | null;
}> = [];

if (game.status === 'finished' && game.side_tournament_enabled) {
  const { data } = await supabase
    .from('game_side_winners')
    .select('category, position, winner_user_id')
    .eq('game_id', game.id)
    .order('category')
    .order('position');
  sideWinners = data ?? [];
}
```

**Step 4: Bestem om tabs skal vises**

```ts
const showSideTournament =
  game.status === 'finished' && game.side_tournament_enabled;
```

Pass denne flagg-en + data ned til render-koden.

**Step 5: Commit (foreløpig — UI kommer i neste task)**

```bash
git add app/games/[id]/leaderboard/page.tsx
git commit -m "chore(leaderboard): fetch side-tournament data when game finished"
```

---

## Task 8: Leaderboard-tabs + SideTournamentView

**Files:**
- Create: `app/games/[id]/leaderboard/LeaderboardTabs.tsx`
- Create: `app/games/[id]/leaderboard/SideTournamentView.tsx`
- Modify: `app/games/[id]/leaderboard/page.tsx` — render via tabs

**Step 1: `LeaderboardTabs.tsx` — client-komponent for tab-veksling**

```tsx
// app/games/[id]/leaderboard/LeaderboardTabs.tsx
'use client';

import { useState, type ReactNode } from 'react';

type Tab = 'main' | 'side';

type Props = {
  mainContent: ReactNode;
  sideContent: ReactNode;
};

export function LeaderboardTabs({ mainContent, sideContent }: Props) {
  const [active, setActive] = useState<Tab>('main');

  return (
    <div className="space-y-4">
      <div className="flex border-b border-line" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={active === 'main'}
          onClick={() => setActive('main')}
          className={`flex-1 py-2 font-serif text-base ${
            active === 'main'
              ? 'border-b-2 border-primary text-text'
              : 'text-muted'
          }`}
        >
          Hovedturnering
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === 'side'}
          onClick={() => setActive('side')}
          className={`flex-1 py-2 font-serif text-base ${
            active === 'side'
              ? 'border-b-2 border-primary text-text'
              : 'text-muted'
          }`}
        >
          Sideturnering
        </button>
      </div>

      <div role="tabpanel">
        {active === 'main' ? mainContent : sideContent}
      </div>
    </div>
  );
}
```

**Step 2: `SideTournamentView.tsx` — render poeng-tabell + detaljer**

```tsx
// app/games/[id]/leaderboard/SideTournamentView.tsx
import { calculateSideTournament, type SideTournamentInput, type SideTournamentResult } from '@/lib/scoring/sideTournament';

type Team = {
  teamId: number;
  label: string;             // "Lag 1", "Lag 2"
  members: Array<{ userId: string; displayName: string }>;
};

type Props = {
  teams: Team[];
  result: SideTournamentResult;
  ldCount: number;
  ctpCount: number;
  sideWinners: Array<{
    category: 'longest_drive' | 'closest_to_pin';
    position: number;
    winnerUserId: string | null;
  }>;
};

export function SideTournamentView({
  teams,
  result,
  ldCount,
  ctpCount,
  sideWinners,
}: Props) {
  const sorted = [...result.teamStandings].sort((a, b) => b.totalPoints - a.totalPoints);
  const teamById = new Map(teams.map((t) => [t.teamId, t]));

  const userDisplayName = (userId: string): string => {
    for (const team of teams) {
      const m = team.members.find((m) => m.userId === userId);
      if (m) return `${m.displayName} (${team.label})`;
    }
    return 'Ukjent spiller';
  };

  return (
    <div className="space-y-6">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line">
            <th className="py-2 text-left font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Lag
            </th>
            <th className="py-2 text-right font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Poeng
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
            return (
              <tr key={s.teamId} className="border-b border-line/50">
                <td className="py-2 font-serif text-base text-text">
                  {teamById.get(s.teamId)?.label ?? `Lag ${s.teamId}`} {medal}
                </td>
                <td className="py-2 text-right font-serif text-base text-text tabular-nums">
                  {s.totalPoints}p
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <details className="rounded-md border border-line bg-surface-2 p-3">
        <summary className="cursor-pointer font-serif text-base text-text">
          Vis hvordan poengene ble fordelt
        </summary>
        <div className="mt-3 space-y-3 text-sm">
          {/* Best netto 18 */}
          <CategoryRow
            label="Best netto 18 hull"
            winners={sorted.flatMap((s) =>
              s.awards
                .filter((a) => a.category === 'best_netto_18')
                .map(() => teamById.get(s.teamId)?.label ?? `Lag ${s.teamId}`)
            )}
            points={10}
          />
          <CategoryRow
            label="Best netto front 9"
            winners={sorted.flatMap((s) =>
              s.awards
                .filter((a) => a.category === 'best_netto_front9')
                .map(() => teamById.get(s.teamId)?.label ?? `Lag ${s.teamId}`)
            )}
            points={5}
          />
          <CategoryRow
            label="Best netto back 9"
            winners={sorted.flatMap((s) =>
              s.awards
                .filter((a) => a.category === 'best_netto_back9')
                .map(() => teamById.get(s.teamId)?.label ?? `Lag ${s.teamId}`)
            )}
            points={5}
          />

          {/* Hole-wins */}
          <HoleWinGrid sorted={sorted} teamById={teamById} />

          {/* LD */}
          {ldCount > 0 && (
            <div>
              <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                Longest drive
              </div>
              {Array.from({ length: ldCount }, (_, i) => i + 1).map((pos) => {
                const w = sideWinners.find(
                  (sw) => sw.category === 'longest_drive' && sw.position === pos
                );
                return (
                  <div key={`ld-${pos}`} className="font-serif text-base text-text">
                    #{pos}:{' '}
                    {w?.winnerUserId ? `${userDisplayName(w.winnerUserId)} → 2p` : 'Ingen kvalifiserte'}
                  </div>
                );
              })}
            </div>
          )}

          {/* CTP */}
          {ctpCount > 0 && (
            <div>
              <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                Closest to pin
              </div>
              {Array.from({ length: ctpCount }, (_, i) => i + 1).map((pos) => {
                const w = sideWinners.find(
                  (sw) => sw.category === 'closest_to_pin' && sw.position === pos
                );
                return (
                  <div key={`ctp-${pos}`} className="font-serif text-base text-text">
                    #{pos}:{' '}
                    {w?.winnerUserId ? `${userDisplayName(w.winnerUserId)} → 2p` : 'Ingen kvalifiserte'}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function CategoryRow({
  label,
  winners,
  points,
}: {
  label: string;
  winners: string[];
  points: number;
}) {
  if (winners.length === 0) return null;
  return (
    <div className="font-serif text-base text-text">
      <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted block">
        {label}
      </span>
      {winners.join(', ')} → {points}p {winners.length > 1 && '(hver — tie)'}
    </div>
  );
}

function HoleWinGrid({
  sorted,
  teamById,
}: {
  sorted: SideTournamentResult['teamStandings'];
  teamById: Map<number, Team>;
}) {
  // Bygg per-hull-vinner-map fra awards med detail "Hull N"
  const perHole: Map<number, number | null> = new Map();
  for (let h = 1; h <= 18; h++) perHole.set(h, null);

  for (const s of sorted) {
    for (const a of s.awards) {
      if (a.category === 'hole_win' && a.detail) {
        const match = a.detail.match(/Hull (\d+)/);
        if (match) {
          perHole.set(Number(match[1]), s.teamId);
        }
      }
    }
  }

  return (
    <div>
      <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-2">
        Hole-wins
      </div>
      <div className="grid grid-cols-6 gap-1 text-xs font-serif">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => {
          const winnerTeam = perHole.get(h);
          const label =
            winnerTeam == null
              ? '—'
              : teamById.get(winnerTeam)?.label.replace(/^Lag /, 'L') ?? `L${winnerTeam}`;
          return (
            <div
              key={h}
              className="rounded border border-line bg-surface px-1 py-1 text-center tabular-nums"
            >
              <div className="text-[9px] text-muted">{h}</div>
              <div>{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 3: Wire i `page.tsx`**

I `app/games/[id]/leaderboard/page.tsx`, omslutt den eksisterende leaderboard-renderingen i `<LeaderboardTabs>` hvis `showSideTournament`:

```tsx
if (showSideTournament) {
  // Bygg SideTournamentInput basert på game-data + scores
  const input = buildSideTournamentInput(game, players, scores, sideWinners);
  const result = calculateSideTournament(input);

  return (
    <AppShell>
      <TopBar ... />
      <main ...>
        <PageHeader ... />
        <LeaderboardTabs
          mainContent={<MainLeaderboardContent ... />}
          sideContent={
            <SideTournamentView
              teams={teamsForView}
              result={result}
              ldCount={game.side_ld_count}
              ctpCount={game.side_ctp_count}
              sideWinners={sideWinners.map((w) => ({
                category: w.category,
                position: w.position,
                winnerUserId: w.winner_user_id,
              }))}
            />
          }
        />
      </main>
    </AppShell>
  );
}
// else: dagens leaderboard, unchanged
```

Du må implementere `buildSideTournamentInput`-helperen — den må:
- Gruppere spillere etter `team_number` → `teams[]`
- For hvert lag, beregne `perHoleNetto` ved å bruke `bestBallForHole` per hull (samme måte som hovedleaderboarden gjør i dag — finn og gjenbruk den koden, ikke skriv på nytt)

**Step 4: Test manuelt**

- Åpne `/games/[finished-game-id]/leaderboard`
- Sjekk at to tabs vises hvis sideturnering var aktiv
- Sjekk at sideturneringsfanen viser riktig poeng-fordeling
- Sjekk at fanen IKKE vises hvis spillet er active eller hvis sideturnering ikke var aktivert

**Step 5: Commit**

```bash
git add app/games/[id]/leaderboard/
git commit -m "feat(side-tournament): leaderboard tab with point breakdown

Sideturneringsfanen vises kun når status=finished AND
side_tournament_enabled. Poeng-tabell + collapsibel detalj-seksjon
med hole-win-grid, LD/CTP-vinnere. Bruker calculateSideTournament
fra scoring-biblioteket."
```

Dette ER bruker-synlig — den første `feat`-commiten. Trenger version-bump + CHANGELOG. Se neste task.

---

## Task 9: Version bump + CHANGELOG-entry

**Files:**
- Modify: `package.json` — version `1.0.9` → `1.1.0`
- Modify: `CHANGELOG.md` — ny minor-tema-heading + v1.1.0-entry

**Step 1: Bump versjonen**

```bash
npm version minor --no-git-tag-version
```

Verifiser:
```bash
grep '"version"' package.json
```
Expected: `"version": "1.1.0"`

**Step 2: Skriv CHANGELOG-entry**

Åpne `CHANGELOG.md`. På toppen (under `# Changelog`-tittelen), legg til:

```markdown
## 1.1.y — Sideturnering

Sideturnering shipped som første feature etter v1.0.0. Lag kan nå konkurrere parallelt med best-ball-netto.

### [1.1.0] - 2026-05-14

**Du kan nå legge til en sideturnering i admin-formen. Lag samler poeng fra 6 kategorier — best netto 18, front 9, back 9, hole-wins, longest drive og closest to pin. Resultatet vises i en egen fane på leaderboarden etter at spillet er avsluttet.**

<details><summary>Teknisk</summary>

#### Added
- Migrasjon `0024_side_tournament` — `games.side_tournament_enabled`, `games.side_ld_count`, `games.side_ctp_count` (alle med safe defaults) + ny tabell `game_side_winners` med RLS (select kun ved `status=finished`, mutations admin-only)
- `lib/scoring/sideTournament.ts` — `calculateSideTournament`-pure-funksjon med 13 unit-tester. Tie i netto-kategoriene gir alle full pott; hole-win krever alene-vinner
- Admin-form-seksjon i `GameForm` med master-toggle + radio-grupper for LD/CTP-antall (0/1/2). Gates på ≥2 lag
- Ny route `app/admin/games/[id]/avslutt/` med dropdown-wizard for LD/CTP-vinnere. `EndGameButton` redirecter dit conditional på sideturnerings-config
- Leaderboard-tabs (`LeaderboardTabs`) + `SideTournamentView` med poeng-tabell + kollapsibel detalj-seksjon (hole-win-grid, LD/CTP-vinnere)

#### Changed
- `app/admin/games/[id]/page.tsx` henter nå sideturnerings-config og passerer det til `EndGameButton`
- `app/games/[id]/leaderboard/page.tsx` henter `game_side_winners` når `status=finished` og bygger `SideTournamentInput` fra eksisterende score-data

</details>
```

**Step 3: Pakk eldste åpne minor-serie i `<details>` hvis nødvendig**

Per CLAUDE.md: tre nyeste minor-seriene står åpne; eldre wrappes. Vi har nå:
- 1.1.y (ny)
- 1.0.y (åpen)
- 0.X.y (åpne — sjekk hva som finnes)

Hvis det er ≥3 åpne minor-serier fra før, pakk den eldste inn i `<details>` per CLAUDE.md-mønsteret.

**Step 4: Verifiser footeren leser ny versjon**

Footer-en henter versjonen fra `next.config.ts` → `NEXT_PUBLIC_APP_VERSION` → `package.json`. Sjekk at det skjer:

```bash
npm run build 2>&1 | head -30
```

Expected: bygger uten feil.

**Step 5: Sammen-commit med Task 8-arbeidet hvis ikke allerede committed**

Hvis Task 8 ble committed uten bump (= hooken blokkerte): rull tilbake og inkluder versjon-bump i samme commit:

```bash
git reset --soft HEAD^  # angre Task 8-commit
git add package.json package-lock.json CHANGELOG.md
git commit -m "feat(side-tournament): leaderboard tab with point breakdown

Sideturneringen vises som egen fane på leaderboarden når
status=finished AND side_tournament_enabled. Poeng-tabell +
collapsibel detalj-seksjon med hole-win-grid, LD/CTP-vinnere.

Bumper v1.0.9 → v1.1.0 (MINOR). Første feature shipped post-v1.0."
```

(Hvis Task 8 ikke ble committed ennå — bare inkluder alle endringene i denne commit-en.)

---

## Task 10: Smoke-test i prod

**Files:** ingen kode-endringer.

**Step 1: Pushe til main**

```bash
git push origin claude/inspiring-wozniak-d6fa1e:main
```

Wait. Det er en worktree-branch. Sjekk om vi er i hovedrepoet eller i worktree:

```bash
git branch --show-current
git remote -v
```

Hvis worktree: følg dagens prosess (`gh pr create` eller direkte push fra hoved-checkout etter manuell merge — sjekk hvordan dette har vært gjort før i `git log --oneline main`).

**Step 2: Vent på Vercel-deploy**

Sjekk Vercel dashboard (eller via MCP `mcp__3cf899ed-9e2a-439d-993a-9be7b39814d4__list_deployments`). Vent til status `READY`.

**Step 3: Smoke-test på tornygolf.no**

1. Logg inn som admin
2. Lag nytt spill med sideturnering: LD=1, CTP=1, 2 lag
3. Verifiser at admin-formen viser sideturnerings-seksjon
4. Tildel spillere, start spill (eller bruk en test-runde)
5. Som spiller: spill ut alle 18 hull, lever scorekort
6. Som admin: trykk «Avslutt». Forventet redirect til `/avslutt`
7. Velg LD- og CTP-vinner. Submit
8. Sjekk leaderboard: tabs synlige? Sideturnerings-fanen viser poeng?
9. Verifiser at footer-versjonen viser `v1.1.0`

**Step 4: Hvis alt fungerer — markér leveransen ferdig**

Ingen ekstra commit nødvendig.

**Step 5: Hvis noe feiler**

Bruk `superpowers:systematic-debugging`-skill. Ikke quick-fix.

---

## Out-of-scope (eksplisitt ikke i denne leveransen)

- Sideturnerings-data i finished-mail (kan legges til senere)
- Per-spiller sideturnerings-poeng (kun lag i v1.1.0)
- Custom poeng-vekter
- Stableford-style alternativ
- Realtime-oppdatering av sideturnering (irrelevant — den vises kun etter finished)
- Hull-spesifikke LD/CTP (kun antall, ikke hull-nummer)

---

## Verifisering-sjekkliste før Task 10-push

- [ ] Alle 13 sideTournament-tester passerer
- [ ] `npm run build` lykkes
- [ ] `npx tsc --noEmit` lykkes
- [ ] `npx eslint .` ingen nye warnings
- [ ] Migrasjon 0024 applyet i Supabase (verifiser via `list_migrations`)
- [ ] Footer viser v1.1.0 lokalt på `npm run dev`
- [ ] CHANGELOG.md har 1.1.0-entry med tagline
- [ ] commit-msg-hook ikke omgått med `--no-verify`
