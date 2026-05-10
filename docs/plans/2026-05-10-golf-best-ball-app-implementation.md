# Golf Best Ball Netto App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a mobile-first PWA where 8 friends can run a one-round best-ball-net golf tournament with hidden leaderboard, offline-tolerant score entry, configurable handicap allowance, and admin-controlled reveal.

**Architecture:** Next.js (App Router) + TypeScript + Tailwind on Vercel; Supabase (Postgres + Auth + RLS + Realtime) as backend; Resend for invitation emails. Client-side IndexedDB queue with Service Worker for offline writes; conflict resolution by client_updated_at last-write-wins.

**Tech Stack:** Next.js 15, TypeScript 5, Tailwind 4, Supabase JS v2, Dexie (IndexedDB wrapper), Resend, Vitest (unit), Playwright (e2e), Vercel.

**Design source:** See `docs/plans/2026-05-10-golf-best-ball-app-design.md`. Every task here must trace back to a section of that doc.

**User context:** The end-user (project owner) has no programming experience. Each phase MUST end with a manual-verification checklist phrased in plain Norwegian that the user can execute themselves. Never ask the user to read code.

**Working language:** Code, identifiers, comments, commits → English. User-facing UI copy → Norwegian.

---

## Phase Overview

| # | Phase | Outcome | Estimated effort |
|---|---|---|---|
| 0 | Project bootstrap | Empty Next.js project on Vercel, deploys on push | 1–2 h |
| 1 | Supabase setup & schema | Database tables, RLS policies, auth configured | 2–3 h |
| 2 | Pure scoring library | All scoring math, fully unit-tested, no UI | 2 h |
| 3 | Auth & invitations | Admin sends invite, recipient registers, logs in | 3–4 h |
| 4 | Admin: course management | Create/list/edit courses with tee boxes | 2–3 h |
| 5 | Admin: game creation | Create game with players, teams, flights, settings | 3 h |
| 6 | Hole screen (online only) | Enter scores live with Supabase round-trip | 3 h |
| 7 | IndexedDB sync layer | Optimistic UI, offline queue, conflict resolution | 4 h |
| 8 | Service Worker & PWA | Installable, offline app-shell, Background Sync | 2 h |
| 9 | Realtime updates | Flight-mates see each other's entries live | 1 h |
| 10 | Submit scorecard | Lever scorekort + optional peer approval + admin override | 3 h |
| 11 | End game & leaderboard | Reveal, netto/brutto toggle, drill-down | 3 h |
| 12 | Admin spill-admin panel | During-play progress view (no scores) | 1 h |
| 13 | Final polish & deploy | Mobile review, Resend wired up, end-to-end smoke test | 2–3 h |

**Critical ordering rules:**
- Phase 2 (pure scoring) MUST be 100% green before Phase 5 or later. Bugs in scoring are unforgivable.
- Phase 7 (IndexedDB) builds on top of Phase 6's working online flow — don't reorder.
- Phases 8, 9, 12 are independent of each other after Phase 7 lands.

**Cross-cutting conventions:**
- TDD strictly enforced for pure logic (scoring, sync conflict resolution, stroke allocation).
- For UI: write a Playwright e2e test that captures the happy path BEFORE building the screen.
- Every task ends with a commit. Atomic commits, one logical change each.
- Never use `--no-verify` or skip hooks.
- All Supabase secrets in `.env.local` (gitignored); production secrets only in Vercel env-var UI.

---

## Phase 0: Project Bootstrap

**Goal:** A blank Next.js app with TypeScript, Tailwind, Vitest, Playwright, ESLint, and a working Vercel deploy on git push.

**User-facing outcome:** A blank page on `kompis-golf.vercel.app` that says "Hei, golf-app kommer snart!".

### Task 0.1: Initialize Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore`, `README.md`, `.nvmrc`.

**Step 1:** From `/Users/jdl/Dokumenter/GitHub/golf-app`, run:
```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir=false --eslint --no-import-alias --turbopack --use-npm
```
Accept all defaults when prompted. Approve overwriting `.gitignore` and `README.md`.

**Step 2:** Set Node version. Create `.nvmrc`:
```
20
```

**Step 3:** Edit `app/page.tsx` to display the placeholder text:
```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <h1 className="text-2xl font-semibold">Hei, golf-app kommer snart!</h1>
    </main>
  );
}
```

**Step 4:** Verify it builds:
```bash
npm run build
```
Expected: build completes with zero errors.

**Step 5:** Commit:
```bash
git add -A
git commit -m "chore: bootstrap Next.js app with TypeScript and Tailwind"
```

### Task 0.2: Add Vitest for unit tests

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `tests/smoke.test.ts`.
- Modify: `package.json` (add scripts and devDependencies).

**Step 1:** Install:
```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```

**Step 2:** Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
});
```

**Step 3:** Create `vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

**Step 4:** Add scripts in `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 5:** Create `tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Step 6:** Run:
```bash
npm test
```
Expected: 1 test passes.

**Step 7:** Commit:
```bash
git add -A
git commit -m "test: add Vitest with smoke test"
```

### Task 0.3: Add Playwright for e2e

**Files:**
- Create: `playwright.config.ts`, `e2e/home.spec.ts`.

**Step 1:** Install:
```bash
npm init playwright@latest -- --quiet --browser=chromium --no-examples --no-github-actions
```

**Step 2:** Create `e2e/home.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Hei, golf-app kommer snart!')).toBeVisible();
});
```

**Step 3:** Ensure `playwright.config.ts` has `baseURL: 'http://localhost:3000'` and `webServer: { command: 'npm run dev', port: 3000, reuseExistingServer: !process.env.CI }`.

**Step 4:** Run:
```bash
npx playwright test
```
Expected: 1 test passes.

**Step 5:** Commit:
```bash
git add -A
git commit -m "test: add Playwright with home e2e smoke"
```

### Task 0.4: Vercel deployment

**User actions (with Claude guidance):**

1. Create GitHub repo `golf-app` (private). Push initial commits:
   ```bash
   git remote add origin git@github.com:<username>/golf-app.git
   git push -u origin main
   ```
2. Sign in to vercel.com with GitHub. Import the repo. Accept defaults.
3. Wait for first deploy (~1 min). Open the assigned URL.

**Acceptance:** The user can navigate to `<project-name>.vercel.app` on their phone and see "Hei, golf-app kommer snart!".

### Phase 0 user-verification checklist (Norwegian)

- [ ] Du har en GitHub-konto og repo som heter `golf-app`.
- [ ] Du har en Vercel-konto knyttet til GitHub.
- [ ] Du har åpnet din vercel.app-URL i mobil-nettleseren og sett teksten «Hei, golf-app kommer snart!».
- [ ] Når du gjør en endring i koden lokalt og pusher med git, oppdateres siden automatisk innen 1–2 min.

---

## Phase 1: Supabase Setup & Schema

**Goal:** Postgres database with all 7 tables, RLS policies active, Supabase Auth configured, app connects.

**User-facing outcome:** None visible yet — but a sign-in form (no users yet) works mechanically.

### Task 1.1: Create Supabase project (user action)

**User actions:**
1. Sign up at supabase.com (free tier).
2. Create new project. Region: `eu-west-1` or `eu-central-1`. Strong DB password (save it).
3. Wait ~2 min for provisioning.
4. From Project Settings → API, copy `Project URL` and `anon public` key. Save them.

### Task 1.2: Install Supabase client and wire env vars

**Files:**
- Create: `.env.local`, `.env.example`, `lib/supabase/client.ts`, `lib/supabase/server.ts`.
- Modify: `.gitignore` (ensure `.env*.local`).

**Step 1:** Install:
```bash
npm install @supabase/supabase-js @supabase/ssr
```

**Step 2:** Create `.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

**Step 3:** Create `.env.local` with real Supabase values from Task 1.1.

**Step 4:** Create `lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr';

export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

**Step 5:** Create `lib/supabase/server.ts` (cookies-based for SSR):
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}
```

**Step 6:** Commit:
```bash
git add -A
git commit -m "feat: wire Supabase clients for browser and server"
```

### Task 1.3: Database schema migration

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`.

**Step 1:** Write the migration. Full SQL:

```sql
-- Users (extends Supabase auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  nickname text,
  hcp_index numeric(4,1) not null default 54.0,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Courses
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.course_holes (
  course_id uuid not null references public.courses(id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  par int not null check (par between 3 and 6),
  stroke_index int not null check (stroke_index between 1 and 18),
  primary key (course_id, hole_number),
  unique (course_id, stroke_index)
);

create table public.tee_boxes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,
  slope int not null check (slope between 55 and 155),
  course_rating numeric(4,1) not null,
  par_total int not null check (par_total between 60 and 80)
);

-- Games
create type game_status as enum ('draft', 'active', 'finished');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  course_id uuid not null references public.courses(id),
  tee_box_id uuid not null references public.tee_boxes(id),
  hcp_allowance_pct int not null default 100 check (hcp_allowance_pct between 0 and 100),
  require_peer_approval boolean not null default false,
  status game_status not null default 'draft',
  created_by uuid references public.users(id),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.users(id),
  team_number int not null check (team_number between 1 and 4),
  flight_number int not null check (flight_number between 1 and 4),
  course_handicap int,  -- frozen at game start
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by_user_id uuid references public.users(id),
  primary key (game_id, user_id)
);

-- Scores
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.users(id),
  hole_number int not null check (hole_number between 1 and 18),
  strokes int check (strokes between 1 and 20),
  entered_by uuid not null references public.users(id),
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (game_id, user_id, hole_number)
);

-- Invitations
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text not null unique,
  game_id uuid references public.games(id) on delete cascade,
  invited_by uuid not null references public.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes for common queries
create index scores_game_user_hole on public.scores(game_id, user_id, hole_number);
create index game_players_game on public.game_players(game_id);
create index invitations_token on public.invitations(token);
```

**Step 2:** Apply via Supabase SQL Editor (web UI). Paste the contents, run.

**Step 3:** Verify in Table Editor that all 7 tables exist with correct columns.

**Step 4:** Commit:
```bash
git add -A
git commit -m "feat: initial database schema"
```

### Task 1.4: Row Level Security policies

**Files:**
- Create: `supabase/migrations/0002_rls_policies.sql`.

**Step 1:** Write RLS policies. Full SQL:

```sql
-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.courses enable row level security;
alter table public.course_holes enable row level security;
alter table public.tee_boxes enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.scores enable row level security;
alter table public.invitations enable row level security;

-- Helper function: is current user admin?
create or replace function public.is_admin() returns boolean
  language sql security definer stable
  as $$
    select exists(select 1 from public.users where id = auth.uid() and is_admin = true);
  $$;

-- Helper: same flight as another user in a game?
create or replace function public.same_flight(p_game_id uuid, p_other_user uuid) returns boolean
  language sql security definer stable
  as $$
    select exists(
      select 1
      from public.game_players me
      join public.game_players them
        on me.game_id = them.game_id
        and me.flight_number = them.flight_number
      where me.game_id = p_game_id
        and me.user_id = auth.uid()
        and them.user_id = p_other_user
    );
  $$;

-- USERS
create policy "users select own or shared games" on public.users
  for select using (
    id = auth.uid()
    or public.is_admin()
    or exists(
      select 1 from public.game_players gp1
      join public.game_players gp2 on gp1.game_id = gp2.game_id
      where gp1.user_id = auth.uid() and gp2.user_id = public.users.id
    )
  );

create policy "users update own" on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "users insert own" on public.users
  for insert with check (id = auth.uid());

-- COURSES
create policy "courses select all" on public.courses for select using (true);
create policy "courses admin write" on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

create policy "holes select all" on public.course_holes for select using (true);
create policy "holes admin write" on public.course_holes
  for all using (public.is_admin()) with check (public.is_admin());

create policy "tees select all" on public.tee_boxes for select using (true);
create policy "tees admin write" on public.tee_boxes
  for all using (public.is_admin()) with check (public.is_admin());

-- GAMES
create policy "games select if participant or admin" on public.games
  for select using (
    public.is_admin()
    or exists(select 1 from public.game_players where game_id = public.games.id and user_id = auth.uid())
  );

create policy "games admin write" on public.games
  for all using (public.is_admin()) with check (public.is_admin());

-- GAME_PLAYERS
create policy "game_players select shared game" on public.game_players
  for select using (
    public.is_admin()
    or exists(
      select 1 from public.game_players gp
      where gp.game_id = public.game_players.game_id and gp.user_id = auth.uid()
    )
  );

create policy "game_players admin write" on public.game_players
  for all using (public.is_admin()) with check (public.is_admin());

create policy "game_players self submit" on public.game_players
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- SCORES (the important one)
create policy "scores select gating" on public.scores
  for select using (
    -- admin always sees
    public.is_admin()
    -- finished game: any participant sees all
    or (exists(select 1 from public.games g where g.id = public.scores.game_id and g.status = 'finished')
        and exists(select 1 from public.game_players gp where gp.game_id = public.scores.game_id and gp.user_id = auth.uid()))
    -- active game: own scores
    or user_id = auth.uid()
    -- active game: same-flight scores
    or public.same_flight(public.scores.game_id, public.scores.user_id)
  );

create policy "scores insert by flight" on public.scores
  for insert with check (
    public.is_admin()
    or (
      exists(select 1 from public.games g where g.id = public.scores.game_id and g.status = 'active')
      and entered_by = auth.uid()
      and (user_id = auth.uid() or public.same_flight(public.scores.game_id, public.scores.user_id))
      and not exists(
        select 1 from public.game_players gp
        where gp.game_id = public.scores.game_id and gp.user_id = public.scores.user_id and gp.submitted_at is not null
      )
    )
  );

create policy "scores update by flight" on public.scores
  for update using (
    public.is_admin()
    or (
      exists(select 1 from public.games g where g.id = public.scores.game_id and g.status = 'active')
      and (user_id = auth.uid() or public.same_flight(public.scores.game_id, public.scores.user_id))
      and not exists(
        select 1 from public.game_players gp
        where gp.game_id = public.scores.game_id and gp.user_id = public.scores.user_id and gp.submitted_at is not null
      )
    )
  ) with check (entered_by = auth.uid() or public.is_admin());

-- INVITATIONS
create policy "invitations admin write" on public.invitations
  for all using (public.is_admin()) with check (public.is_admin());

create policy "invitations select by token" on public.invitations
  for select using (true);  -- token is the secret; we filter by it in queries
```

**Step 2:** Apply via Supabase SQL Editor.

**Step 3:** Smoke-test in SQL Editor: switch role to `authenticated` with no user, try to `select * from scores` — should return 0 rows.

**Step 4:** Commit:
```bash
git add -A
git commit -m "feat: row level security policies"
```

### Task 1.5: Generate TypeScript types from Supabase

**Files:**
- Create: `lib/supabase/types.ts`.
- Modify: `package.json` (add `db:types` script).

**Step 1:** Install CLI:
```bash
npm install -D supabase
```

**Step 2:** Add script:
```json
"db:types": "supabase gen types typescript --project-id <YOUR_PROJECT_ID> > lib/supabase/types.ts"
```

**Step 3:** Run:
```bash
npm run db:types
```

**Step 4:** Commit generated types:
```bash
git add lib/supabase/types.ts package.json
git commit -m "feat: generate Supabase TS types"
```

### Phase 1 user-verification checklist (Norwegian)

- [ ] Du har et Supabase-prosjekt og kan se 8 tabeller i Table Editor.
- [ ] Du har lagret Supabase URL og anon key i `.env.local` lokalt.
- [ ] Du har lagt samme verdier inn i Vercel sin «Environment Variables»-side.
- [ ] Det nye Vercel-deployet bygger uten feil.

---

## Phase 2: Pure Scoring Library

**Goal:** All scoring math as pure TypeScript functions, 100% unit-tested, zero dependencies on UI/DB. **Phase gate: 100% test coverage required.**

**User-facing outcome:** None. But this is the most-tested code in the app.

### Task 2.1: Course handicap calculation (TDD)

**Files:**
- Create: `lib/scoring/courseHandicap.ts`, `lib/scoring/courseHandicap.test.ts`.

**Step 1:** Write failing tests:
```ts
import { describe, it, expect } from 'vitest';
import { calculateCourseHandicap } from './courseHandicap';

describe('calculateCourseHandicap', () => {
  it('matches Byneset Nord tee 57 example: 26.8 → 31', () => {
    expect(calculateCourseHandicap({ hcpIndex: 26.8, slope: 130, courseRating: 70, par: 70 })).toBe(31);
  });

  it('returns 0 for scratch on a standard course', () => {
    expect(calculateCourseHandicap({ hcpIndex: 0, slope: 113, courseRating: 72, par: 72 })).toBe(0);
  });

  it('handles plus golfers (negative HCP)', () => {
    expect(calculateCourseHandicap({ hcpIndex: -2, slope: 113, courseRating: 72, par: 72 })).toBe(-2);
  });

  it('applies course rating - par offset', () => {
    // HCP 10, slope 113 → first term = 10. CR 70, par 72 → offset = -2. Total = 8.
    expect(calculateCourseHandicap({ hcpIndex: 10, slope: 113, courseRating: 70, par: 72 })).toBe(8);
  });

  it('rounds half up', () => {
    // 10 * (130/113) + 0 = 11.504 → 12
    expect(calculateCourseHandicap({ hcpIndex: 10, slope: 130, courseRating: 72, par: 72 })).toBe(12);
  });
});

describe('applyAllowance', () => {
  it('100% leaves unchanged', () => {
    expect(applyAllowance(31, 100)).toBe(31);
  });
  it('85% fourball', () => {
    expect(applyAllowance(31, 85)).toBe(26);  // round(26.35) = 26
  });
  it('0% gives zero', () => {
    expect(applyAllowance(31, 0)).toBe(0);
  });
});
```

**Step 2:** Run tests, confirm fail (no implementation yet).

**Step 3:** Implement `lib/scoring/courseHandicap.ts`:
```ts
export interface CourseHandicapInput {
  hcpIndex: number;
  slope: number;
  courseRating: number;
  par: number;
}

export function calculateCourseHandicap(input: CourseHandicapInput): number {
  const raw = input.hcpIndex * (input.slope / 113) + (input.courseRating - input.par);
  return Math.round(raw);
}

export function applyAllowance(courseHandicap: number, percent: number): number {
  return Math.round(courseHandicap * (percent / 100));
}
```

**Step 4:** Run tests, confirm pass.

**Step 5:** Commit:
```bash
git add lib/scoring/
git commit -m "feat: course handicap + allowance calculation"
```

### Task 2.2: Stroke allocation per hole (TDD)

**Files:**
- Create: `lib/scoring/strokeAllocation.ts`, `lib/scoring/strokeAllocation.test.ts`.

**Step 1:** Write failing tests:
```ts
import { describe, it, expect } from 'vitest';
import { strokesForHole, allStrokeAllocations } from './strokeAllocation';

describe('strokesForHole', () => {
  it('HCP 18 gives 1 stroke on every hole', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesForHole(18, si)).toBe(1);
    }
  });

  it('HCP 0 gives no strokes', () => {
    expect(strokesForHole(0, 1)).toBe(0);
    expect(strokesForHole(0, 18)).toBe(0);
  });

  it('HCP 6: strokes on SI 1..6 only', () => {
    expect(strokesForHole(6, 1)).toBe(1);
    expect(strokesForHole(6, 6)).toBe(1);
    expect(strokesForHole(6, 7)).toBe(0);
    expect(strokesForHole(6, 18)).toBe(0);
  });

  it('HCP 31: SI 1..13 get 2, SI 14..18 get 1', () => {
    expect(strokesForHole(31, 1)).toBe(2);
    expect(strokesForHole(31, 13)).toBe(2);
    expect(strokesForHole(31, 14)).toBe(1);
    expect(strokesForHole(31, 18)).toBe(1);
  });

  it('plus handicap -2: SI 17 and 18 give -1 each', () => {
    expect(strokesForHole(-2, 17)).toBe(-1);
    expect(strokesForHole(-2, 18)).toBe(-1);
    expect(strokesForHole(-2, 16)).toBe(0);
    expect(strokesForHole(-2, 1)).toBe(0);
  });

  it('plus handicap -1: only SI 18 gives -1', () => {
    expect(strokesForHole(-1, 18)).toBe(-1);
    expect(strokesForHole(-1, 17)).toBe(0);
  });
});

describe('allStrokeAllocations', () => {
  it('returns map of 18 holes summing to handicap', () => {
    const result = allStrokeAllocations(31);
    expect(Object.keys(result).length).toBe(18);
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    expect(total).toBe(31);
  });
});
```

**Step 2:** Run tests → fail.

**Step 3:** Implement `lib/scoring/strokeAllocation.ts`:
```ts
/**
 * Strokes awarded on a single hole for a player with the given course handicap.
 * Negative handicaps return negative strokes (added to gross).
 */
export function strokesForHole(courseHandicap: number, strokeIndex: number): number {
  if (courseHandicap === 0) return 0;

  if (courseHandicap > 0) {
    const base = Math.floor(courseHandicap / 18);
    const extra = strokeIndex <= (courseHandicap % 18) ? 1 : 0;
    return base + extra;
  }

  // Plus golfer: hand back strokes from highest SI down.
  const abs = Math.abs(courseHandicap);
  const threshold = 18 - abs + 1;
  return strokeIndex >= threshold ? -1 : 0;
}

export function allStrokeAllocations(courseHandicap: number): Record<number, number> {
  const result: Record<number, number> = {};
  for (let si = 1; si <= 18; si++) {
    result[si] = strokesForHole(courseHandicap, si);
  }
  return result;
}
```

**Step 4:** Run, pass.

**Step 5:** Commit:
```bash
git add lib/scoring/
git commit -m "feat: stroke allocation per hole"
```

### Task 2.3: Net score and best-ball team score (TDD)

**Files:**
- Create: `lib/scoring/bestBall.ts`, `lib/scoring/bestBall.test.ts`.

**Step 1:** Write failing tests:
```ts
import { describe, it, expect } from 'vitest';
import { netScore, bestBallForHole, teamTotal } from './bestBall';

describe('netScore', () => {
  it('subtracts strokes from gross', () => {
    expect(netScore({ gross: 6, extraStrokes: 2 })).toBe(4);
  });
  it('returns null for missing gross', () => {
    expect(netScore({ gross: null, extraStrokes: 1 })).toBeNull();
  });
});

describe('bestBallForHole', () => {
  it('returns min of two net scores', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: 6, extraStrokes: 2 }, // net 4
      { userId: 'b', gross: 5, extraStrokes: 1 }, // net 4
    ]);
    expect(r.teamNet).toBe(4);
    expect(r.contributors).toEqual(['a', 'b']);  // both contributed
  });

  it('picks the lower one', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: 7, extraStrokes: 1 }, // net 6
      { userId: 'b', gross: 5, extraStrokes: 1 }, // net 4
    ]);
    expect(r.teamNet).toBe(4);
    expect(r.contributors).toEqual(['b']);
  });

  it('handles one missing player', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: null, extraStrokes: 1 },
      { userId: 'b', gross: 5, extraStrokes: 1 },
    ]);
    expect(r.teamNet).toBe(4);
    expect(r.contributors).toEqual(['b']);
  });

  it('returns null teamNet when both missing', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: null, extraStrokes: 1 },
      { userId: 'b', gross: null, extraStrokes: 1 },
    ]);
    expect(r.teamNet).toBeNull();
  });
});

describe('teamTotal', () => {
  it('sums all holes', () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, teamNet: 4 }));
    expect(teamTotal(holes)).toEqual({ total: 72, missingHoles: [] });
  });
  it('tracks missing holes', () => {
    const holes = [
      { holeNumber: 1, teamNet: 4 },
      { holeNumber: 2, teamNet: null },
    ];
    expect(teamTotal(holes)).toEqual({ total: 4, missingHoles: [2] });
  });
});
```

**Step 2:** Run, fail.

**Step 3:** Implement `lib/scoring/bestBall.ts`:
```ts
export interface PlayerHoleScore {
  userId: string;
  gross: number | null;
  extraStrokes: number;
}

export interface BestBallResult {
  teamNet: number | null;
  contributors: string[];
}

export function netScore(input: { gross: number | null; extraStrokes: number }): number | null {
  if (input.gross === null) return null;
  return input.gross - input.extraStrokes;
}

export function bestBallForHole(players: PlayerHoleScore[]): BestBallResult {
  const nets = players
    .map((p) => ({ userId: p.userId, net: netScore({ gross: p.gross, extraStrokes: p.extraStrokes }) }))
    .filter((p): p is { userId: string; net: number } => p.net !== null);

  if (nets.length === 0) {
    return { teamNet: null, contributors: [] };
  }

  const min = Math.min(...nets.map((n) => n.net));
  const contributors = nets.filter((n) => n.net === min).map((n) => n.userId);
  return { teamNet: min, contributors };
}

export interface HoleTeamScore {
  holeNumber: number;
  teamNet: number | null;
}

export function teamTotal(holes: HoleTeamScore[]): { total: number; missingHoles: number[] } {
  const missingHoles: number[] = [];
  let total = 0;
  for (const h of holes) {
    if (h.teamNet === null) {
      missingHoles.push(h.holeNumber);
    } else {
      total += h.teamNet;
    }
  }
  return { total, missingHoles };
}
```

**Step 4:** Run, pass.

**Step 5:** Commit:
```bash
git add lib/scoring/
git commit -m "feat: net score and best-ball team total"
```

### Task 2.4: Tiebreaker (TDD)

**Files:**
- Create: `lib/scoring/tiebreaker.ts`, `lib/scoring/tiebreaker.test.ts`.

**Step 1:** Tests:
```ts
import { describe, it, expect } from 'vitest';
import { rankTeams } from './tiebreaker';

describe('rankTeams', () => {
  it('orders by total ascending', () => {
    const teams = [
      { id: 1, holes: Array.from({ length: 18 }, () => 4) },  // 72
      { id: 2, holes: Array.from({ length: 18 }, () => 3) },  // 54
    ];
    expect(rankTeams(teams).map((t) => t.id)).toEqual([2, 1]);
  });

  it('tiebreaker by back 9', () => {
    // Same total, but team 2 plays back 9 better.
    const front = Array.from({ length: 9 }, () => 4);
    const teams = [
      { id: 1, holes: [...front, ...Array.from({ length: 9 }, () => 4)] },  // back 9 = 36
      { id: 2, holes: [...front.map(() => 5), ...Array.from({ length: 9 }, () => 3)] },  // back 9 = 27
    ];
    expect(rankTeams(teams).map((t) => t.id)).toEqual([2, 1]);
  });

  it('cascades back 6, back 3, hole 18, then ties', () => {
    // Construct identical front 9 and back 9 totals but differing back 6.
    const teams = [
      { id: 1, holes: [
        ...Array.from({ length: 9 }, () => 4),  // front 9 = 36
        ...[5, 4, 3,  3, 3, 3,  3, 3, 3],         // back 9 = 30 (back 6 = 18)
      ]},
      { id: 2, holes: [
        ...Array.from({ length: 9 }, () => 4),  // front 9 = 36
        ...[3, 4, 5,  3, 3, 3,  3, 3, 3],         // back 9 = 30 (back 6 = 18)
      ]},
    ];
    // Same back 9, same back 6. Same back 3. Same hole 18. → tied.
    const result = rankTeams(teams);
    expect(result[0].tiedWith).toContain(2);
  });
});
```

**Step 2:** Run, fail.

**Step 3:** Implement `lib/scoring/tiebreaker.ts`:
```ts
export interface TeamForRanking {
  id: number;
  holes: number[];  // length 18 expected, gross or net depending on mode
}

export interface RankedTeam extends TeamForRanking {
  rank: number;
  total: number;
  tiedWith: number[];
}

export function rankTeams(teams: TeamForRanking[]): RankedTeam[] {
  const withTotals = teams.map((t) => ({
    ...t,
    total: t.holes.reduce((a, b) => a + b, 0),
    back9: sum(t.holes.slice(9, 18)),
    back6: sum(t.holes.slice(12, 18)),
    back3: sum(t.holes.slice(15, 18)),
    hole18: t.holes[17],
  }));

  withTotals.sort((a, b) =>
    a.total - b.total
    || a.back9 - b.back9
    || a.back6 - b.back6
    || a.back3 - b.back3
    || a.hole18 - b.hole18);

  const result: RankedTeam[] = [];
  for (let i = 0; i < withTotals.length; i++) {
    const t = withTotals[i];
    const tiedWith = withTotals
      .filter((other, j) =>
        j !== i
        && other.total === t.total
        && other.back9 === t.back9
        && other.back6 === t.back6
        && other.back3 === t.back3
        && other.hole18 === t.hole18)
      .map((o) => o.id);

    result.push({
      id: t.id,
      holes: t.holes,
      total: t.total,
      rank: i + 1,
      tiedWith,
    });
  }
  return result;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
```

**Step 4:** Run, pass.

**Step 5:** Commit:
```bash
git add lib/scoring/
git commit -m "feat: tiebreaker with back 9 / 6 / 3 / 18 cascade"
```

### Task 2.5: End-to-end scoring integration test

**Files:**
- Create: `lib/scoring/integration.test.ts`.

**Step 1:** Write a full scenario test using all four modules together. One 18-hole game, 4 teams of 2 players each, realistic scores, verify final leaderboard.

(Plan author: pad this out with explicit numbers when writing. Keep it deterministic.)

**Step 2:** Verify all tests still pass:
```bash
npm test
```

**Step 3:** Commit:
```bash
git add lib/scoring/
git commit -m "test: end-to-end scoring integration"
```

### Phase 2 user-verification checklist (Norwegian)

- [ ] `npm test` viser «All tests passed» med minst 25 tester grønne.
- [ ] Du har sett at Byneset-eksempelet (HCP 26.8 → 31) er dekket av en test.
- [ ] Du har ikke trengt å se på koden — bare bekrefte at testene er grønne.

---

## Phase 3: Auth & Invitations

**Goal:** Admin can invite players by email; recipient clicks link, registers, logs in, can update HCP later.

### Task 3.1: Sign-in page (Playwright e2e first)

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/login/actions.ts`, `e2e/auth/login.spec.ts`.

(Write e2e first that expects login form with email + password fields and a submit button. Then implement using Supabase Auth via server action.)

### Task 3.2: Invitation creation (admin)

**Files:**
- Create: `app/admin/invitations/new/page.tsx`, `app/admin/invitations/actions.ts`, `lib/email/send-invitation.ts`.

(Admin enters an email → creates invitation row with random token → sends email via Resend with link `<baseUrl>/register?token=<token>`.)

### Task 3.3: Registration flow

**Files:**
- Create: `app/register/page.tsx`, `app/register/actions.ts`, `e2e/auth/register.spec.ts`.

(Page accepts token via query param, fetches invitation, shows form for name/nickname/hcp_index/password, calls `supabase.auth.signUp` then inserts row in `public.users` then marks invitation accepted.)

### Task 3.4: Profile management (logged-in user)

**Files:**
- Create: `app/profile/page.tsx`, `app/profile/actions.ts`.

(Allow user to update name, nickname, hcp_index, password. Trigger Supabase password-reset flow for password.)

### Phase 3 user-verification checklist (Norwegian)

- [ ] Du kan logge inn på admin-kontoen din (som du opprettet manuelt i Supabase Auth).
- [ ] Du kan sende en invitasjons-mail til deg selv på en annen mail-adresse.
- [ ] Du mottar mail-en med en lenke som funker.
- [ ] Lenken åpner en registreringsside du kan fylle ut.
- [ ] Etter registrering kan du logge inn med ny bruker.
- [ ] Du kan endre HCP-index i profilen og verdien lagres.

---

## Phase 4: Admin — Course Management

**Goal:** Admin can create a course (Stiklestad) with 18 holes (par + SI) and 1–5 tee boxes.

### Task 4.1: Course list page

(Standard CRUD list. E2e first.)

### Task 4.2: Create-course form

(Form has: course name, 18 hole rows (par + SI), 1–5 tee-box rows (name + slope + CR + par_total). Client-side validation: SI 1..18 each used once.)

### Task 4.3: Edit-course form

(Reuse form, prefilled.)

### Phase 4 user-verification checklist (Norwegian)

- [ ] Du har opprettet «Stiklestad Golfbane» som bane.
- [ ] Du har lagt inn alle 18 hull med riktig par og stroke-indeks (sjekk med banens scorekort).
- [ ] Du har lagt inn minst én tee-boks (f.eks. «Gul herretee») med slope, course rating og par-total.

---

## Phase 5: Admin — Game Creation

**Goal:** Admin creates a game by picking course + tee + 8 players, assigning teams (manual or random), assigning flights, choosing settings.

### Task 5.1: Create-game form, step 1 (course + tee + name)

### Task 5.2: Create-game form, step 2 (player selection)

(Multi-select from existing users. Exactly 8 required.)

### Task 5.3: Team assignment (manual + random shuffle)

(Drag-and-drop into 4 team buckets OR click "Trekk tilfeldig" button which uses `crypto.getRandomValues` for a fair shuffle.)

### Task 5.4: Flight assignment

(Same UI pattern, but flights can have any size 2-4.)

### Task 5.5: Settings (allowance %, peer approval toggle)

### Task 5.6: Start-game action

(Server action: validates 8 players in 4 teams; calculates course handicap for each player based on user.hcp_index + tee.slope + tee.course_rating + tee.par_total; writes to `game_players.course_handicap`; flips `games.status` to `'active'`; sets `started_at`.)

### Phase 5 user-verification checklist (Norwegian)

- [ ] Du har opprettet et test-spill med deg selv og 7 testbrukere.
- [ ] Du har trukket lag tilfeldig — det fungerer.
- [ ] Du har satt flights.
- [ ] Spilleren får varsel når spillet starter.

---

## Phase 6: Hole Screen (Online Only)

**Goal:** Players can navigate hole-by-hole and enter strokes. Online-only direct writes to Supabase. **No offline yet — that's Phase 7.**

### Task 6.1: Hole-screen layout

(URL: `/games/[gameId]/holes/[holeNumber]`. Shows hole metadata + flight members with input field per player. Shows extra-strokes indicator computed from `game_players.course_handicap` + `course_holes.stroke_index`.)

### Task 6.2: Score input with debounced server write

(On change → 500ms debounce → upsert to `scores` with `client_updated_at = now()`, `entered_by = auth.uid()`. Show sync indicator: 🟡 sending, 🟢 saved.)

### Task 6.3: Hole-to-hole navigation (prev/next buttons + swipe)

### Task 6.4: My scorecard view

(Read-only list of player's own 18 holes.)

### Phase 6 user-verification checklist (Norwegian)

- [ ] Du kan navigere mellom hull 1–18 i et aktivt spill.
- [ ] Du kan taste inn et tall i ditt eget felt og se det lagre seg (grønt ikon).
- [ ] Du kan taste inn for en annen i flighten din.
- [ ] Du kan se «Mitt scorekort» med dine 18 hull.

---

## Phase 7: IndexedDB Sync Layer

**Goal:** Replace direct Supabase writes with an optimistic local-first flow using Dexie.

### Task 7.1: Dexie schema

**Files:**
- Create: `lib/sync/db.ts`.

```ts
import Dexie, { Table } from 'dexie';

interface LocalScore {
  id: string;          // game_id:user_id:hole_number
  gameId: string;
  userId: string;
  holeNumber: number;
  strokes: number | null;
  enteredBy: string;
  clientUpdatedAt: string;
  serverUpdatedAt: string | null;  // null = not yet synced
}

interface SyncQueueItem {
  id: string;
  scoreId: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
}

class GolfDb extends Dexie {
  scores!: Table<LocalScore, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super('golf-app');
    this.version(1).stores({
      scores: 'id, gameId, [gameId+userId], [gameId+holeNumber]',
      syncQueue: 'id, createdAt',
    });
  }
}

export const db = new GolfDb();
```

### Task 7.2: Optimistic write API

(Function `writeScore({ gameId, userId, holeNumber, strokes })` → writes to Dexie + adds to queue → returns immediately.)

### Task 7.3: Sync worker

(A function that drains the queue: reads queue → for each item, upsert to Supabase → on success, mark scored row with serverUpdatedAt, remove queue item. On 4xx (RLS denial), keep in queue with error logged. On 5xx/network, leave for retry.)

### Task 7.4: Online/offline event listeners

(Trigger sync worker on `online` event, on app focus, and on a 30s interval as backup.)

### Task 7.5: Conflict resolution (TDD)

**Files:**
- Create: `lib/sync/conflict.ts`, `lib/sync/conflict.test.ts`.

(Pure function: `resolveConflict(local: LocalScore, server: RemoteScore): 'local-wins' | 'server-wins' | 'equal'`. Test all three cases.)

### Task 7.6: UI integration

(Replace direct Supabase calls in hole-screen with `writeScore`. Display sync state from Dexie subscription.)

### Phase 7 user-verification checklist (Norwegian)

- [ ] Slå på flymodus på telefonen.
- [ ] Tast inn slag på flere hull — alle dukker opp umiddelbart med gult ikon.
- [ ] Lås telefonen i 2 minutter.
- [ ] Slå av flymodus, åpne appen igjen — innen 10 sekunder skal alle ikoner bli grønne.
- [ ] Hvis du bytter telefon og logger inn på nytt, ser du de samme tallene.

---

## Phase 8: Service Worker & PWA

**Goal:** App is installable on home screen and works offline (shell + cached data).

### Task 8.1: Web manifest

**Files:**
- Create: `app/manifest.ts`, `public/icon-192.png`, `public/icon-512.png`.

### Task 8.2: Service Worker registration

(Use `next-pwa` or a hand-rolled SW. Cache app shell. Cache API responses with network-first.)

### Task 8.3: Background Sync (Android only — iOS gracefully degrades)

### Phase 8 user-verification checklist (Norwegian)

- [ ] Du kan «Legge til på hjemskjerm» fra mobil-nettleseren.
- [ ] Etter installering åpner appen seg fra hjemskjermen som en native-app (uten nettleser-UI).
- [ ] Hvis du er offline, åpner appen seg likevel og viser siste data.

---

## Phase 9: Realtime Updates

**Goal:** Flight-mates' score entries appear live without manual refresh.

### Task 9.1: Subscribe to scores changes

(On hole-screen mount, `supabase.channel(`game-${gameId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `game_id=eq.${gameId}` }, ...)`. RLS filters server-side; client only receives rows it's allowed to see.)

### Task 9.2: Merge incoming events into Dexie

(For each event: compare `client_updated_at` with local. If incoming wins, write to Dexie; if local wins, ignore.)

### Phase 9 user-verification checklist (Norwegian)

- [ ] To telefoner logget inn som ulike flight-medlemmer i samme spill.
- [ ] Telefon A taster slag for B → telefon B ser endringen innen 2 sekunder uten å trykke noe.

---

## Phase 10: Submit Scorecard & Peer Approval

### Task 10.1: «Lever scorekort» action

(On `My scorecard` page, button «Lever scorekort». Confirmation dialog showing full card with who entered each. On confirm: set `game_players.submitted_at = now()`.)

### Task 10.2: Peer-approval flow (when game.require_peer_approval = true)

(After submit, card enters "awaiting approval" state. Other flight members see "X har levert sitt kort — godkjenn?" with two buttons: Approve / Reject with comment.)

### Task 10.3: Admin override

(Admin button in admin panel: «Godkjenn på vegne av flighten» with required comment.)

### Phase 10 user-verification checklist (Norwegian)

- [ ] Du har levert et test-scorekort.
- [ ] (Hvis peer-godkjenning på) En annen testbruker kan godkjenne det.
- [ ] (Hvis peer-godkjenning på) Du kan også avvise med kommentar → spilleren får varsel og kan rette.
- [ ] Som admin kan du overstyre.

---

## Phase 11: End Game & Leaderboard

### Task 11.1: «Avslutt spill» action (admin)

(Server action: validates all players have `submitted_at`. Sets `games.status = 'finished'`, `ended_at = now()`.)

### Task 11.2: Leaderboard page

(`/games/[gameId]/leaderboard`. Compute teams using Phase 2 lib. Show ranking with tie indicators. Netto/brutto toggle (URL query param).)

### Task 11.3: Hole-by-hole drill-down

(Tab on leaderboard. Shows per-team, per-hole table. Highlights contributing player. Greys out non-contributing.)

### Phase 11 user-verification checklist (Norwegian)

- [ ] Du kan avslutte spillet og se leaderboardet.
- [ ] Vinneren er beregnet riktig (du kan dobbeltsjekke 1–2 hull i hodet).
- [ ] Du kan toggle netto/brutto og rekkefølgen endrer seg sannsynlig vis.
- [ ] Hull-for-hull-detalj viser hvem som bidro på hvert hull.

---

## Phase 12: Admin Spill-admin Panel (During Play)

### Task 12.1: Progress aggregation query

(Server-side function: returns per-flight `{ flight_number, max_hole_with_score }` without exposing actual stroke values.)

### Task 12.2: Admin spill-admin page

(Path `/admin/games/[gameId]`. Shows progress, sync status, list of submission states. NO score values until game finished.)

### Phase 12 user-verification checklist (Norwegian)

- [ ] Som admin kan du åpne spill-admin-siden under et aktivt spill.
- [ ] Du ser hvor langt hver flight har kommet (hull-nummer) — men ingen scoreverdier.
- [ ] Du kan ikke ved et uhell se hvem som leder før alle er ferdige.

---

## Phase 13: Final Polish & Deploy

### Task 13.1: Mobile-responsive sweep

(Open every page in Playwright at iPhone 13 viewport, snapshot. Look for overflow, tap-targets <44px, etc.)

### Task 13.2: Resend wired up in production

(Verify domain in Resend, set RESEND_FROM_EMAIL in Vercel env, send test invitation to real address.)

### Task 13.3: End-to-end smoke test

(Single Playwright test that: registers admin, creates course, invites and registers 7 players, creates game, simulates 18 holes of play across all 8, submits all, admin ends game, reads leaderboard.)

### Task 13.4: Production checklist

- [ ] All env vars set in Vercel
- [ ] Supabase production project has same schema and RLS as dev
- [ ] First real admin user created in Supabase Auth (`is_admin = true`)
- [ ] Custom domain (optional)
- [ ] Test from a teammate's phone end-to-end before tournament day

---

## Deferred items (Future work, NOT in v1)

- Stableford / skins / matchplay scoring
- Multi-round tournaments / season standings
- Push notifications
- Native iOS / Android app
- Stats across rounds
- PDF/Excel export
- Multi-tenant (groups + group-admins)
- Image upload / signatures on scorecards
- In-app chat
- Internationalization beyond Norwegian

These are tracked in the design doc's "Veivalg for fremtidig utvidelse" section. Datamodellen is designed to support them without rewriting.
