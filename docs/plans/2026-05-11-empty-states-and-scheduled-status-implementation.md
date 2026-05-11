# Empty States + Scheduled Status — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the three Quick Win #3 empty states (Turneringer-tom, Scorekort venter, Leaderboard pre-spill) plus the underlying lifecycle expansion that introduces a `scheduled` game status, admin edit-after-publish capability, manual + auto-start fallback, and a partial-reveal leaderboard that hides back 9 mid-round.

**Architecture:** Server-rendered Next.js 16 pages (App Router) decide which view to render based on game status and score state. New `scheduled` enum value sits between `draft` and `active` and gates a new editable-but-published phase. Realtime status changes flip player UIs via existing Supabase realtime infrastructure (extended with a new channel for `games` table). Leaderboard logic stays in `lib/leaderboard.ts` unchanged; page-level filtering clips scores to front 9 during `active`. Three new inline SVG icons + a champagne radial-gradient medallion shipped as components. No new external dependencies.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4 (forest-and-champagne tokens), Supabase (Postgres + auth + realtime), `@supabase/ssr`, Vitest + Testing Library for unit tests, Playwright for E2E (existing).

**Design reference:** [docs/plans/2026-05-11-empty-states-and-scheduled-status-design.md](2026-05-11-empty-states-and-scheduled-status-design.md)
**Visual handoff:** [docs/design/incoming/handoff/quick-win-3/](../design/incoming/handoff/quick-win-3/) (open `design-reference.html` in a browser for the prototype)

---

## Conventions used in this plan

- **Norwegian for user-facing copy**, English for code/identifiers/commits.
- **Atomic commits** — one task = one commit. Never `--no-verify`.
- **TDD where it pays** — for pure logic helpers (countdown formatter, firstName extractor, frontNineGate). For React UI components, write behavioral tests, not pixel snapshots. For schema migrations, verify via `supabase db reset` + manual SQL check.
- **Subagent-driven** — most tasks can be dispatched to an implementer subagent + reviewed. Phase A (schema) is direct-edit since the user must run the SQL in Supabase Dashboard.
- **The user does NOT execute SQL.** Any migration file I write must be delivered as copy-paste-ready SQL the user runs in Supabase Dashboard → SQL Editor. The plan must NEVER instruct the user to "run the migration locally" — they don't have local Supabase setup.

---

## Phase A — Foundation (schema + types)

### Task A1: Write migration for `scheduled` status + tee-off + course length

**Files:**
- Create: `supabase/migrations/0008_scheduled_status_and_tee_off.sql`

**Step 1:** Inspect existing migration files for style conventions.

Run: `ls supabase/migrations/`

Expected: `0001_initial_schema.sql` through `0007_*.sql`. Read `0007_*.sql` to match comment style.

**Step 2:** Write the migration.

```sql
-- 0008_scheduled_status_and_tee_off.sql
-- Introduce 'scheduled' status (publish without starting), planned tee-off
-- time on games, and total course length per tee-box. See:
-- docs/plans/2026-05-11-empty-states-and-scheduled-status-design.md

-- Enum extension: 'scheduled' sits between 'draft' and 'active'.
-- Postgres requires this outside a transaction; if you get a "cannot run
-- inside a transaction block" error, run this statement separately first.
alter type game_status add value 'scheduled' before 'active';

alter table public.games
  add column scheduled_tee_off_at timestamptz;

comment on column public.games.scheduled_tee_off_at is
  'Planned tee-off time. Set when admin publishes (status=scheduled). '
  'Used by countdown UI and auto-start fallback.';

alter table public.tee_boxes
  add column length_meters int check (length_meters between 1000 and 12000);

comment on column public.tee_boxes.length_meters is
  'Total course length in meters from this tee-box. Optional; shown on '
  'pre-round scorecard if set.';

-- RLS: extend player-visible select policies to include 'scheduled'.
-- Existing policies typically check status in ('active','finished') — they
-- now need ('scheduled','active','finished'). Check existing policy names
-- with: select policyname, qual from pg_policies where tablename='games';
-- Replace the bodies of:
--   games: select policy where player is a participant
--   game_players: select policy where user is in same game
--   course_holes / tee_boxes: select via course join with visible game
-- to use ('scheduled','active','finished') instead of ('active','finished').
-- (The exact policy bodies are inlined below — these are the ones currently
-- in production; update them in place.)

-- TODO during implementation: read current policy bodies from migrations
-- 0001-0007 (specifically the RLS-defining ones) and inline updated
-- versions here. Do NOT guess; copy verbatim from existing files and modify
-- only the status-list check.
```

**Step 3:** Read current RLS policies from existing migrations.

Run: `grep -rn "create policy\|status.*active\|active.*finished" supabase/migrations/`

For each policy that gates player-visible reads on `games`, `game_players`, `course_holes`, `tee_boxes` using `status in ('active', 'finished')` (or equivalent): write a `drop policy ... on ...;` + `create policy ...` pair in the migration that updates the check to `status in ('scheduled', 'active', 'finished')`.

**Critical:** the `scores`-table policies must NOT be updated — score writes remain gated to `status = 'active'`.

**Step 4:** Verify the migration syntax by reading it back.

Run: `cat supabase/migrations/0008_scheduled_status_and_tee_off.sql`

Check: no placeholder TODOs left; all policy updates are concrete `drop/create` pairs.

**Step 5:** Commit.

```bash
git add supabase/migrations/0008_scheduled_status_and_tee_off.sql
git commit -m "feat(schema): add scheduled status + tee-off time + course length"
```

**Step 6:** Deliver to user.

Tell the user: "Migrasjon klar. Lim inn innholdet av `supabase/migrations/0008_*.sql` i Supabase Dashboard → SQL Editor → New query → Run. Forventer: 'Success. No rows returned.' Si fra hvis du får feilmelding."

---

### Task A2: Update GameStatus TypeScript type union throughout the codebase

**Files:**
- Modify: every `.tsx`/`.ts` file that defines `type GameStatus = 'draft' | 'active' | 'finished'` or `'draft' | 'active' | 'finished'` literal unions
- Modify: every `STATUS_LABELS` constant

**Step 1:** Find all definitions.

Run: `grep -rn "'draft'.*'active'.*'finished'\|'active'.*'finished'\|STATUS_LABELS" app/ lib/ components/ --include="*.ts" --include="*.tsx"`

Expected: ~5–8 locations across `app/page.tsx`, `app/games/[id]/page.tsx`, `app/games/[id]/leaderboard/page.tsx`, `app/admin/games/...`, possibly `lib/supabase/types.ts`.

**Step 2:** Update each definition.

For every `'draft' | 'active' | 'finished'` union: replace with `'draft' | 'scheduled' | 'active' | 'finished'`.

For every `STATUS_LABELS` object: add `scheduled: 'Planlagt',` between `draft` and `active`.

For every `STATUS_BADGE_CLASSES` (or equivalent styling map): add a `scheduled:` entry using champagne tokens. Suggested classes:

```ts
scheduled: 'bg-accent/10 text-accent border border-accent/30 dark:bg-accent/15',
```

(Or, if the file uses the project's CSS-variable-based palette helpers like `bg-primary-soft`, prefer those over Tailwind color names.)

**Step 3:** Run typecheck.

Run: `npx tsc --noEmit`

Expected: no errors related to `GameStatus`.

**Step 4:** Commit.

```bash
git add app/ lib/ components/
git commit -m "feat(types): extend GameStatus with 'scheduled' and add 'Planlagt' label"
```

---

### Task A3: Add helpers for first name extraction and tee-off date/time formatting

**Files:**
- Create: `lib/firstName.ts`
- Create: `lib/firstName.test.ts`
- Create: `lib/format/teeOff.ts`
- Create: `lib/format/teeOff.test.ts`

**Step 1: Write failing tests for firstName.**

```ts
// lib/firstName.test.ts
import { describe, it, expect } from 'vitest';
import { firstName } from './firstName';

describe('firstName', () => {
  it('returns the word before the first space', () => {
    expect(firstName('Sindre Haugen')).toBe('Sindre');
  });
  it('handles single-word names', () => {
    expect(firstName('Sindre')).toBe('Sindre');
  });
  it('handles multi-part names', () => {
    expect(firstName('Jan Erik Solberg')).toBe('Jan');
  });
  it('trims leading whitespace', () => {
    expect(firstName('  Sindre Haugen')).toBe('Sindre');
  });
  it('returns null for empty/whitespace', () => {
    expect(firstName('')).toBeNull();
    expect(firstName('   ')).toBeNull();
  });
  it('returns null for null/undefined input', () => {
    expect(firstName(null)).toBeNull();
    expect(firstName(undefined)).toBeNull();
  });
});
```

**Step 2:** Run tests.

Run: `npx vitest run lib/firstName.test.ts`
Expected: FAIL — `firstName` does not exist.

**Step 3:** Implement.

```ts
// lib/firstName.ts
export function firstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (trimmed === '') return null;
  return trimmed.split(/\s+/)[0];
}
```

**Step 4:** Run tests.

Run: `npx vitest run lib/firstName.test.ts`
Expected: PASS.

**Step 5: Write failing tests for tee-off formatting.**

```ts
// lib/format/teeOff.test.ts
import { describe, it, expect } from 'vitest';
import { formatTeeOffDate, formatTeeOffTime, expectedFirstScoreTime } from './teeOff';

const TEE_OFF = new Date('2026-05-12T14:24:00+02:00');

describe('formatTeeOffTime', () => {
  it('returns HH:MM in 24h Norwegian format', () => {
    expect(formatTeeOffTime(TEE_OFF)).toBe('14:24');
  });
});

describe('formatTeeOffDate', () => {
  it('returns short Norwegian date like "lør. 12. mai"', () => {
    expect(formatTeeOffDate(TEE_OFF)).toBe('lør. 12. mai');
  });
});

describe('expectedFirstScoreTime', () => {
  it('rounds tee-off + 30 min up to nearest 5 minutes', () => {
    // 14:24 + 30 = 14:54 → rounded to 14:55
    expect(expectedFirstScoreTime(TEE_OFF)).toBe('14:55');
  });
  it('handles exact 5-minute boundaries cleanly', () => {
    const exact = new Date('2026-05-12T14:00:00+02:00');
    // 14:00 + 30 = 14:30 (already on boundary)
    expect(expectedFirstScoreTime(exact)).toBe('14:30');
  });
});
```

**Step 6:** Run, expect FAIL, implement, verify PASS.

```ts
// lib/format/teeOff.ts
const dayNames = ['søn.', 'man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.'];
const monthNames = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des',
];

export function formatTeeOffTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatTeeOffDate(date: Date): string {
  const day = dayNames[date.getDay()];
  const dom = date.getDate();
  const mon = monthNames[date.getMonth()];
  return `${day} ${dom}. ${mon}`;
}

export function expectedFirstScoreTime(teeOff: Date): string {
  const plus30 = new Date(teeOff.getTime() + 30 * 60 * 1000);
  const minutes = plus30.getMinutes();
  const rounded = Math.ceil(minutes / 5) * 5;
  const result = new Date(plus30);
  if (rounded === 60) {
    result.setHours(plus30.getHours() + 1);
    result.setMinutes(0);
  } else {
    result.setMinutes(rounded);
  }
  return formatTeeOffTime(result);
}
```

**Step 7:** Commit.

```bash
git add lib/firstName.ts lib/firstName.test.ts lib/format/teeOff.ts lib/format/teeOff.test.ts
git commit -m "feat(lib): add firstName and tee-off formatting helpers"
```

---

### Task A4: Countdown formatter

**Files:**
- Create: `lib/format/countdown.ts`
- Create: `lib/format/countdown.test.ts`

**Step 1: Write failing tests.**

```ts
// lib/format/countdown.test.ts
import { describe, it, expect } from 'vitest';
import { formatCountdown } from './countdown';

describe('formatCountdown', () => {
  it('returns "Starter snart" when tee-off has passed', () => {
    expect(formatCountdown(-1000)).toBe('Starter snart');
    expect(formatCountdown(0)).toBe('Starter snart');
  });
  it('returns seconds when under 1 minute', () => {
    expect(formatCountdown(45 * 1000)).toBe('Starter om 45 s');
  });
  it('returns minutes when 1–60 minutes', () => {
    expect(formatCountdown(45 * 60 * 1000)).toBe('Starter om 45 min');
  });
  it('returns hours and minutes when 1–24 hours', () => {
    const twoH14m = (2 * 60 + 14) * 60 * 1000;
    expect(formatCountdown(twoH14m)).toBe('Starter om 2 t 14 min');
  });
  it('returns days when more than 24 hours', () => {
    expect(formatCountdown(4 * 24 * 60 * 60 * 1000)).toBe('Starter om 4 dager');
  });
  it('uses singular "1 dag" not "1 dager"', () => {
    expect(formatCountdown(36 * 60 * 60 * 1000)).toBe('Starter om 1 dag');
  });
});
```

**Step 2:** Run, expect FAIL.

**Step 3:** Implement.

```ts
// lib/format/countdown.ts
/**
 * Format milliseconds-until-tee-off as a Norwegian countdown string.
 * Negative or zero ms → "Starter snart" (tee-off has passed but status
 * hasn't flipped yet).
 */
export function formatCountdown(msUntilTeeOff: number): string {
  if (msUntilTeeOff <= 0) return 'Starter snart';

  const totalSeconds = Math.floor(msUntilTeeOff / 1000);
  if (totalSeconds < 60) return `Starter om ${totalSeconds} s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `Starter om ${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes - totalHours * 60;
    return `Starter om ${totalHours} t ${minutes} min`;
  }

  const days = Math.floor(totalHours / 24);
  return `Starter om ${days} ${days === 1 ? 'dag' : 'dager'}`;
}
```

**Step 4:** Run tests, verify PASS.

**Step 5:** Commit.

```bash
git add lib/format/countdown.ts lib/format/countdown.test.ts
git commit -m "feat(lib): add countdown formatter for state #2 banner"
```

---

### Task A5: Front-nine gate helper

**Files:**
- Create: `lib/leaderboard/frontNineGate.ts`
- Create: `lib/leaderboard/frontNineGate.test.ts`

This helper decides whether the front-9 leaderboard view (state #3.5) is unlocked. Rule: at least one team has scores on all 9 front holes (both team members have entered scores on holes 1–9).

**Step 1: Write failing tests.**

```ts
// lib/leaderboard/frontNineGate.test.ts
import { describe, it, expect } from 'vitest';
import { isFrontNineOpen } from './frontNineGate';

type Score = { user_id: string; hole_number: number; strokes: number | null };
type Player = { user_id: string; team_number: number };

const team1 = [
  { user_id: 'p1', team_number: 1 },
  { user_id: 'p2', team_number: 1 },
];
const team2 = [
  { user_id: 'p3', team_number: 2 },
  { user_id: 'p4', team_number: 2 },
];
const allPlayers: Player[] = [...team1, ...team2];

function scoresFor(userId: string, holes: number[]): Score[] {
  return holes.map((h) => ({ user_id: userId, hole_number: h, strokes: 4 }));
}

describe('isFrontNineOpen', () => {
  it('is false when no scores exist', () => {
    expect(isFrontNineOpen({ players: allPlayers, scores: [] })).toBe(false);
  });
  it('is false when only some front-9 holes are filled by one team', () => {
    const scores = [
      ...scoresFor('p1', [1, 2, 3, 4, 5]),
      ...scoresFor('p2', [1, 2, 3, 4, 5]),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(false);
  });
  it('is true when both players on team 1 have scores on all 9 front holes', () => {
    const scores = [
      ...scoresFor('p1', [1, 2, 3, 4, 5, 6, 7, 8, 9]),
      ...scoresFor('p2', [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(true);
  });
  it('is false if only one player on the team has all 9 front holes', () => {
    const scores = [
      ...scoresFor('p1', [1, 2, 3, 4, 5, 6, 7, 8, 9]),
      ...scoresFor('p2', [1, 2, 3]),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(false);
  });
  it('ignores back-9 scores when checking', () => {
    const scores = [
      ...scoresFor('p1', [1, 2, 3, 10, 11, 12]),
      ...scoresFor('p2', [10, 11, 12]),
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(false);
  });
  it('treats null strokes as "not entered"', () => {
    const scores: Score[] = [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => ({ user_id: 'p1', hole_number: h, strokes: 4 })),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((h) => ({ user_id: 'p2', hole_number: h, strokes: 4 })),
      { user_id: 'p2', hole_number: 9, strokes: null },
    ];
    expect(isFrontNineOpen({ players: allPlayers, scores })).toBe(false);
  });
});
```

**Step 2:** Run, expect FAIL.

**Step 3:** Implement.

```ts
// lib/leaderboard/frontNineGate.ts
type Player = { user_id: string; team_number: number };
type Score = { user_id: string; hole_number: number; strokes: number | null };

const FRONT_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * Returns true when at least one team has both players' scores entered
 * (non-null strokes) on all 9 front holes. Used by the leaderboard to
 * decide between state #3 (locked) and state #3.5 (front 9 visible).
 */
export function isFrontNineOpen(opts: {
  players: Player[];
  scores: Score[];
}): boolean {
  const teamGroups = new Map<number, string[]>();
  for (const p of opts.players) {
    const existing = teamGroups.get(p.team_number) ?? [];
    existing.push(p.user_id);
    teamGroups.set(p.team_number, existing);
  }

  const filledByUser = new Map<string, Set<number>>();
  for (const s of opts.scores) {
    if (s.strokes == null) continue;
    if (!FRONT_9.includes(s.hole_number as 1)) continue;
    const set = filledByUser.get(s.user_id) ?? new Set<number>();
    set.add(s.hole_number);
    filledByUser.set(s.user_id, set);
  }

  for (const userIds of teamGroups.values()) {
    const allComplete = userIds.every((uid) => {
      const set = filledByUser.get(uid);
      return set != null && FRONT_9.every((h) => set.has(h));
    });
    if (allComplete) return true;
  }
  return false;
}
```

**Step 4:** Run, verify PASS.

**Step 5:** Commit.

```bash
git add lib/leaderboard/frontNineGate.ts lib/leaderboard/frontNineGate.test.ts
git commit -m "feat(lib): add frontNineGate to drive partial-reveal leaderboard"
```

---

## Phase B — Shared UI primitives

### Task B1: PinFlag, MailEnvelope, HourGlass icons

**Files:**
- Create: `components/icons/PinFlag.tsx`
- Create: `components/icons/MailEnvelope.tsx`
- Create: `components/icons/HourGlass.tsx`
- Create: `components/icons/index.ts` (barrel export)

**Step 1:** Open the design reference to extract the canonical SVG markup.

Run: `cat docs/design/incoming/handoff/quick-win-3/design-reference.html | grep -A 30 'const PinFlag\|const MailEnvelope\|const HourGlass'`

Lift the JSX of each icon. Each comes as a `function PinFlag({...})` returning an inline `<svg>`.

**Step 2:** Adapt each to a typed React component.

For each icon, the props should be `{ size?: number; className?: string }`. Default size = 64 (matches viewBox). Stroke color comes from `currentColor`. Champagne fills are hard-coded `#C9A961`.

Example skeleton (PinFlag):

```tsx
// components/icons/PinFlag.tsx
type Props = { size?: number; className?: string };

export function PinFlag({ size = 64, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* paths lifted from design-reference.html */}
    </svg>
  );
}
```

Repeat for `MailEnvelope.tsx` and `HourGlass.tsx`. **Do not redraw from scratch — lift the exact SVG paths from the handoff.**

**Step 3:** Create barrel export.

```ts
// components/icons/index.ts
export { PinFlag } from './PinFlag';
export { MailEnvelope } from './MailEnvelope';
export { HourGlass } from './HourGlass';
```

**Step 4:** Verify by rendering in a Storybook-equivalent — since we don't have one, run typecheck and check imports manually.

Run: `npx tsc --noEmit`
Expected: no errors.

**Step 5:** Commit.

```bash
git add components/icons/
git commit -m "feat(ui): add PinFlag, MailEnvelope, HourGlass inline SVG icons"
```

---

### Task B2: ChampagneMedallion component

**Files:**
- Create: `components/ui/ChampagneMedallion.tsx`

**Spec from handoff (state #1):**
- 128×128 circle
- Background: `radial-gradient(circle at 50% 38%, #FFFFFF 0%, #F0EDE5 70%, #E5E0D3 100%)` (light)
- Dark variant: `#1F4A37 → #163A2A → #0F2C1F`
- Inset hairline: `inset 0 0 0 1px rgba(201,169,97,0.35)` (light), `rgba(201,169,97,0.4)` (dark)
- Drop shadow: `0 2px 12px rgba(26,46,31,0.04)`
- Centered child (icon)

```tsx
// components/ui/ChampagneMedallion.tsx
import type { ReactNode } from 'react';

type Props = { children: ReactNode; size?: number; className?: string };

export function ChampagneMedallion({ children, size = 128, className }: Props) {
  return (
    <div
      className={`rounded-full grid place-items-center bg-medallion-light dark:bg-medallion-dark shadow-medallion ring-1 ring-medallion-hairline ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      {children}
    </div>
  );
}
```

**Step 1:** Decide token strategy. The radial gradients and hairline are not yet in Tailwind tokens. Two options:
- (a) Add custom utility classes in `app/globals.css` (`.bg-medallion-light`, `.bg-medallion-dark`, etc.)
- (b) Inline styles in the component

Prefer (a) — keeps the design tokens central. Add to `app/globals.css`:

```css
@layer utilities {
  .bg-medallion-light {
    background: radial-gradient(
      circle at 50% 38%,
      #FFFFFF 0%,
      #F0EDE5 70%,
      #E5E0D3 100%
    );
  }
  .dark .bg-medallion-dark {
    background: radial-gradient(
      circle at 50% 38%,
      #1F4A37 0%,
      #163A2A 70%,
      #0F2C1F 100%
    );
  }
  .shadow-medallion {
    box-shadow: 0 2px 12px rgba(26, 46, 31, 0.04);
  }
  .ring-medallion-hairline {
    --tw-ring-color: rgba(201, 169, 97, 0.35);
  }
  .dark .ring-medallion-hairline {
    --tw-ring-color: rgba(201, 169, 97, 0.4);
  }
}
```

**Step 2:** Write the component (see above).

**Step 3:** Typecheck.

Run: `npx tsc --noEmit`

**Step 4:** Commit.

```bash
git add components/ui/ChampagneMedallion.tsx app/globals.css
git commit -m "feat(ui): add ChampagneMedallion primitive with radial-gradient tokens"
```

---

### Task B3: StatusPill update — add 'Planlagt' champagne variant

**Files:**
- Modify: every file that renders a status pill/badge

**Step 1:** Find existing pill renderings.

Run: `grep -rn "STATUS_BADGE_CLASSES\|StatusPill\|status === 'active'" app/ components/`

Expected matches: `app/page.tsx` (`StatusPill` function defined inline), `app/games/[id]/page.tsx` (`STATUS_BADGE_CLASSES`).

**Step 2:** Add the 'scheduled' variant in each location.

For `app/page.tsx::StatusPill`:

```tsx
const classes =
  status === 'active'
    ? 'bg-primary-soft text-primary border-primary/20'
    : status === 'scheduled'
      ? 'bg-accent/10 text-accent border-accent/30'
      : status === 'draft'
        ? 'bg-warning/10 text-warning border-warning/30'
        : 'bg-border/40 text-muted border-border';
```

For `app/games/[id]/page.tsx::STATUS_BADGE_CLASSES`:

```ts
scheduled: 'bg-accent/10 text-accent border border-accent/30 dark:bg-accent/15',
```

**Step 3:** Typecheck and visual sanity-check.

Run: `npx tsc --noEmit`
Then: start dev server (`npm run dev`), force a `scheduled` game (admin will get this in Phase D), confirm pill renders in champagne. Or skip visual until Phase D.

**Step 4:** Commit.

```bash
git add app/page.tsx app/games/[id]/page.tsx
git commit -m "feat(ui): champagne 'Planlagt' status pill"
```

---

### Task B4: Pull-quote component

**Files:**
- Create: `components/ui/PullQuote.tsx`

Used in states #1, #2 footer, and #3. Norwegian guillemets `«»`, Fraunces italic.

```tsx
// components/ui/PullQuote.tsx
type Props = { children: string; className?: string };

export function PullQuote({ children, className }: Props) {
  return (
    <p
      className={`font-serif italic text-[11.5px] leading-relaxed text-muted text-center ${className ?? ''}`}
    >
      «{children}»
    </p>
  );
}
```

**Note:** the component ADDS the guillemets, so callers pass plain text (e.g. `<PullQuote>En god runde begynner med god planlegging.</PullQuote>`).

**Commit:**

```bash
git add components/ui/PullQuote.tsx
git commit -m "feat(ui): add PullQuote primitive used across empty states"
```

---

### Task B5: Kicker component

**Files:**
- Create: `components/ui/Kicker.tsx`

Used everywhere — `KLUBBHUSET ER ÅPENT`, `DU ER PÅMELDT`, `STILLE FØR STORMEN`, `STARTLISTE`, `BANE`, `TEE-OFF`, `DIN FLIGHT`, etc.

```tsx
// components/ui/Kicker.tsx
type Props = {
  children: string;
  tone?: 'accent' | 'muted';
  className?: string;
};

export function Kicker({ children, tone = 'muted', className }: Props) {
  const color = tone === 'accent' ? 'text-accent' : 'text-muted';
  return (
    <p
      className={`font-sans text-[10px] font-semibold uppercase tracking-[0.2em] ${color} ${className ?? ''}`}
    >
      {children}
    </p>
  );
}
```

**Per design spec:** only the FIRST kicker on each screen uses `accent`. Subsequent kickers (`DIN FLIGHT`, `STARTLISTE`, etc.) use `muted`.

**Commit:**

```bash
git add components/ui/Kicker.tsx
git commit -m "feat(ui): add Kicker primitive for uppercase tracked labels"
```

---

## Phase C — State #1 (Turneringer-tom on home page)

### Task C1: Detect empty-state condition and render new layout

**Files:**
- Modify: `app/page.tsx`

**Step 1:** Open and read the current `app/page.tsx` to identify the insertion point.

The current page renders:
1. `BrandMark`
2. `PageHeader` with greeting
3. `activeGames` section (if any)
4. `finishedGames` section (if any)
5. Profil link
6. Admin section (if admin)
7. Logout

The empty state should replace items 2-4 (greeting + game sections) when both lists are empty. Items 1, 5, 6, 7 remain.

**Step 2:** Compute `isEmptyState`.

```ts
const isEmptyState = activeGames.length === 0 && finishedGames.length === 0;
const firstNameValue = firstName(profile?.name);
```

**Step 3:** Add the empty-state JSX above the existing nav.

Use the design spec layout exactly: center-aligned column, medallion, kicker, heading, body copy, CTA stack, pull-quote.

```tsx
{isEmptyState && (
  <section className="flex flex-col items-center text-center py-8">
    <ChampagneMedallion size={128} className="mb-7">
      <PinFlag size={72} className="text-primary" />
    </ChampagneMedallion>
    <Kicker tone="accent" className="mb-2.5">KLUBBHUSET ER ÅPENT</Kicker>
    <h1 className="font-serif text-[30px] font-medium tracking-[-0.02em] leading-tight text-text">
      Velkommen, {firstNameValue ?? 'spiller'}.
    </h1>
    <p className="mt-3 font-sans text-sm leading-relaxed text-muted max-w-[280px]">
      Ingen aktive turneringer enda. Bli med via en invitasjon i innboksen, eller sett opp din egen runde.
    </p>
    <div className="mt-8 w-full max-w-[280px] flex flex-col gap-2.5">
      <Link href="mailto:" className="block w-full min-h-[44px] bg-primary text-bg-tint font-sans text-sm font-semibold py-3.5 px-5 rounded-xl text-center">
        Sjekk innboksen for invitasjon
      </Link>
      {profile?.is_admin && (
        <Link href="/admin/games/new" className="block w-full min-h-[44px] bg-surface text-text font-sans text-sm font-semibold py-3.5 px-5 rounded-xl text-center border border-border">
          Opprett en turnering
        </Link>
      )}
    </div>
    <PullQuote className="mt-8">En god runde begynner med god planlegging.</PullQuote>
  </section>
)}

{!isEmptyState && (
  <PageHeader title={`Hei, ${profile?.name ?? 'spiller'} 👋`} />
)}
```

**Notes:**
- "Opprett en turnering" only renders for admins (non-admins can't create games)
- "Sjekk innboksen for invitasjon" uses `mailto:` as a passive primary — opens mail client if one is registered, otherwise no-ops
- The `<PageHeader>` greeting is suppressed in empty-state mode (the heading inside the medallion section replaces it)

**Step 4:** Verify with `npm run dev` — log in as a user with no games and confirm the empty state renders. Then log in as a user with games to confirm the normal layout still works.

**Step 5:** Commit.

```bash
git add app/page.tsx
git commit -m "feat(home): add state #1 Turneringer-tom empty state"
```

---

### Task C2: Move "Min profil" + logout to footer in empty-state mode

**Files:**
- Modify: `app/page.tsx`

**Step 1:** When `isEmptyState`, the `Profil`-section, admin section, and logout form should still render below the empty-state hero. Adjust layout so admin section sits naturally beneath the hero (with adequate spacing) and "Min profil" + "Logg ut" feel like footer items.

Suggested: in empty-state mode, wrap the admin/profile/logout block in a `<footer className="mt-12 pt-6 border-t border-border/50">` to visually demote them. Outside empty-state mode (normal home), keep the current layout.

**Step 2:** Visual check in browser.

**Step 3:** Commit.

```bash
git add app/page.tsx
git commit -m "feat(home): tuck profile/admin/logout into footer when empty"
```

---

### Task C3: Dark-mode pass for state #1

**Files:**
- Modify: `app/page.tsx` (only if classes need tweaking)
- Modify: `app/globals.css` (already covers medallion dark variant)

**Step 1:** Switch the device/browser to dark mode (Safari dev tools → Develop → Web Inspector → "Match system" or force prefers-color-scheme:dark).

**Step 2:** Walk through state #1:
- Medallion: should use the dark radial-gradient (already configured)
- PinFlag: stroke color comes from `text-primary` — does it read well on dark medallion bg? May need a dark variant of `text-primary` to lighten on dark mode. Check `app/globals.css` to see if `--primary` has a dark override that lightens it.
- Kicker champagne: should still pop on dark bg
- Body copy: `text-muted` — verify legibility
- Primary CTA: forest button with bg-tint text — verify contrast in dark mode
- Secondary CTA: bg-surface with border-border — verify the surface lifts off dark bg
- Pull-quote: `text-muted` italic — verify legibility

**Step 3:** Fix anything that doesn't read well. Most likely fix is adjusting the PinFlag's color in dark mode — perhaps use `text-bg-tint` instead of `text-primary` on dark medallion.

**Step 4:** Commit.

```bash
git add app/page.tsx app/globals.css
git commit -m "fix(home): dark-mode contrast for state #1 medallion and CTAs"
```

---

## Phase D — Admin publish/edit/start workflow

### Task D1: Add tee-off date/time field to GameForm

**Files:**
- Modify: `app/admin/games/new/GameForm.tsx`

**Step 1:** Add a new state piece + form field.

```tsx
const [scheduledTeeOffAt, setScheduledTeeOffAt] = useState<string>('');
```

Add a new section between section 1 (Spillet) and section 2 (Spillere), or fold it into section 1:

```tsx
<div>
  <label htmlFor="scheduled_tee_off_at" className="block text-sm font-medium ...">
    Tee-off
  </label>
  <input
    id="scheduled_tee_off_at"
    name="scheduled_tee_off_at"
    type="datetime-local"
    value={scheduledTeeOffAt}
    onChange={(e) => setScheduledTeeOffAt(e.target.value)}
    className="w-full rounded-lg border px-3.5 py-2.5 ..."
  />
  <p className="text-xs text-muted mt-1">
    Påkrevd for «Lagre og publiser». Valgfritt for utkast.
  </p>
</div>
```

**Step 2:** Update `canSubmit` logic so "publish" requires `scheduledTeeOffAt`, but "save as draft" does not.

Add two separate "can submit" booleans:

```ts
const canPublish = canSubmit && scheduledTeeOffAt !== '';
const canSaveDraft = canSubmit; // tee-off optional for drafts
```

Apply to button disabled states:

```tsx
<Button type="submit" formAction={createAndPublishAction} disabled={!canPublish}>
  Lagre og publiser
</Button>
<Button type="submit" variant="secondary" formAction={createDraftAction} disabled={!canSaveDraft}>
  Lagre som utkast
</Button>
```

**Step 3:** Run dev, manually try the form — confirm "Lagre og publiser" stays disabled until tee-off is set.

**Step 4:** Commit.

```bash
git add app/admin/games/new/GameForm.tsx
git commit -m "feat(admin): add tee-off date/time picker to GameForm"
```

---

### Task D2: Rename action to `createAndPublishAction` and set status='scheduled'

**Files:**
- Modify: `app/admin/games/new/actions.ts`
- Modify: `app/admin/games/new/page.tsx`
- Modify: `app/admin/games/new/GameForm.tsx`

**Step 1:** Read `actions.ts` to find the existing `createAndStartAction`.

**Step 2:** Rename to `createAndPublishAction`. Update its body to:
- Set `status = 'scheduled'` instead of `'active'`
- Parse and persist `scheduled_tee_off_at` from the FormData (use `new Date(formData.get('scheduled_tee_off_at') as string).toISOString()`)
- Do NOT set `started_at` (that happens at "Start runden nå" time)

```ts
const scheduledTeeOffAtRaw = formData.get('scheduled_tee_off_at') as string | null;
if (!scheduledTeeOffAtRaw) {
  throw new Error('Tee-off er påkrevd ved publisering');
}
const scheduled_tee_off_at = new Date(scheduledTeeOffAtRaw).toISOString();

await supabase.from('games').insert({
  // ... existing fields ...
  status: 'scheduled',
  scheduled_tee_off_at,
});
```

**Step 3:** Update `page.tsx` to pass `createAndPublishAction` to `GameForm` (replacing the old `createAndStartAction` prop name in `GameForm.tsx`).

**Step 4:** Update the button text in `GameForm.tsx` to read `Lagre og publiser`.

**Step 5:** Verify by creating a new game in dev — confirm status='scheduled' in Supabase Dashboard → Table editor → games.

**Step 6:** Commit.

```bash
git add app/admin/games/new/
git commit -m "feat(admin): 'Lagre og publiser' creates scheduled games with tee-off"
```

---

### Task D3: Allow draft games to also persist tee-off (optional)

**Files:**
- Modify: `app/admin/games/new/actions.ts`

**Step 1:** In `createDraftAction`, parse `scheduled_tee_off_at` if present; otherwise leave it null. Save as `status='draft'`.

**Step 2:** Commit.

```bash
git add app/admin/games/new/actions.ts
git commit -m "feat(admin): drafts may carry tee-off too (optional)"
```

---

### Task D4: Admin edit page for scheduled games

**Files:**
- Create: `app/admin/games/[id]/edit/page.tsx`
- Create: `app/admin/games/[id]/edit/actions.ts`
- Modify: `app/admin/games/[id]/page.tsx` (add "Rediger" link)

**Step 1:** Read existing `app/admin/games/[id]/page.tsx` to understand admin-side game view structure.

**Step 2:** Create the edit page. It should:
- Server-side guard: only render if `game.status === 'scheduled'`. Otherwise redirect to admin/games/[id] with a "Spillet er låst — kan ikke redigeres" toast/banner.
- Load existing values: course, tee-box, players (with team/flight), allowance, peer-approval, tee-off
- Render `GameForm` with these values pre-populated. (May require extending `GameForm.tsx` to accept an `initialValues` prop. Add it as a new optional prop, defaulting to empty/undefined for create flow.)

**Step 3:** Implement `updateGameAction(formData)` in `edit/actions.ts`:
- Re-validate: status must still be 'scheduled' (re-check in transaction; reject otherwise)
- Update `games` row: name, course_id, tee_box_id, hcp_allowance_pct, require_peer_approval, scheduled_tee_off_at
- Replace `game_players` rows: delete existing, insert new from the form payload
- Trigger realtime push by simply doing the UPDATE — Supabase will broadcast

**Step 4:** In `app/admin/games/[id]/page.tsx`, add a "Rediger" button that links to `./edit` — visible only when `game.status === 'scheduled'`.

**Step 5:** Test end-to-end:
1. Create + publish a scheduled game
2. Open admin/games/[id], confirm "Rediger" button visible
3. Click "Rediger", confirm form pre-populated
4. Change something (e.g. swap a player), save
5. Confirm DB updated and the change is reflected on the player's home/game view

**Step 6:** Commit.

```bash
git add app/admin/games/[id]/edit/ app/admin/games/[id]/page.tsx app/admin/games/new/GameForm.tsx
git commit -m "feat(admin): allow editing scheduled games before round starts"
```

---

### Task D5: "Start runden nå" admin action

**Files:**
- Modify: `app/admin/games/[id]/page.tsx`
- Modify: `app/admin/games/[id]/actions.ts` (or create if not present)

**Step 1:** Add a server action `startScheduledGame(gameId)`:
- Re-check: status must be 'scheduled' (otherwise throw)
- Update: status='active', started_at=now()
- Realtime will broadcast the UPDATE automatically

```ts
// app/admin/games/[id]/actions.ts
'use server';
import { getServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function startScheduledGame(gameId: string) {
  const supabase = await getServerClient();
  const { error } = await supabase
    .from('games')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', gameId)
    .eq('status', 'scheduled'); // optimistic-lock: only flip if still scheduled
  if (error) throw error;
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
}
```

**Step 2:** In `app/admin/games/[id]/page.tsx`, render a "Start runden nå" button when status='scheduled', with a `<form action={startScheduledGame.bind(null, id)}>`. Use a native HTML confirm dialog or a `<button>` with `onClick` confirmation in a client component.

Suggested simple version (native confirm in a small Client Component):

```tsx
// app/admin/games/[id]/StartGameButton.tsx
'use client';
export function StartGameButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button
        type="submit"
        onClick={(e) => {
          if (!confirm('Starter du runden nå? Spillere kan begynne å taste slag. Redigering låses.')) {
            e.preventDefault();
          }
        }}
        className="w-full min-h-[44px] bg-primary text-bg-tint font-medium rounded-xl"
      >
        Start runden nå
      </button>
    </form>
  );
}
```

**Step 3:** Test:
1. Open a scheduled game's admin page
2. Click "Start runden nå", confirm prompt
3. After confirm: status='active' in DB, started_at set, "Rediger" button disappears, "Avslutt spillet" appears (existing behavior)

**Step 4:** Commit.

```bash
git add app/admin/games/[id]/
git commit -m "feat(admin): 'Start runden nå' button flips scheduled to active"
```

---

### Task D6: Add `length_meters` input to tee-box admin

**Files:**
- Modify: `app/admin/courses/...` (find the tee-box form)

**Step 1:** Locate the tee-box editing UI.

Run: `grep -rn "tee_box\|slope\|course_rating" app/admin/courses/`

**Step 2:** Add a new optional integer input "Banelengde (m)" with `min=1000 max=12000`. Wire it to `tee_boxes.length_meters` via the existing server action (add a new field handler).

**Step 3:** Confirm in dev by editing a tee-box and checking the DB.

**Step 4:** Commit.

```bash
git add app/admin/courses/
git commit -m "feat(admin): optional total length (m) field on tee-box"
```

---

## Phase E — State #2 (Scorekort venter)

### Task E1: Add server-side guard for auto-start fallback

**Files:**
- Modify: `app/games/[id]/page.tsx`

**Step 1:** Near the top of the page (right after `game` is loaded), add the fallback:

```ts
if (
  game.status === 'scheduled' &&
  game.scheduled_tee_off_at &&
  new Date(game.scheduled_tee_off_at).getTime() <= Date.now()
) {
  // Tee-off passed but admin hasn't started; flip optimistically.
  await supabase
    .from('games')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'scheduled');
  // Re-fetch so the rest of the page sees the new status.
  const { data: refreshed } = await supabase
    .from('games')
    .select('...same select as above...')
    .eq('id', id)
    .single<GameRow>();
  if (refreshed) game = refreshed;
}
```

**Step 2:** Update the `GameRow` type and the select string to include `scheduled_tee_off_at`.

**Step 3:** Test by:
1. Creating a scheduled game with tee-off in the past
2. Open `/games/[id]` as a player
3. Confirm status flipped to 'active' in DB
4. Confirm the page rendered as 'active' (no state #2 shown)

**Step 4:** Commit.

```bash
git add app/games/[id]/page.tsx
git commit -m "feat(games): auto-start scheduled games when tee-off has passed"
```

---

### Task E2: Render state #2 when status='scheduled'

**Files:**
- Modify: `app/games/[id]/page.tsx`
- Create: `app/games/[id]/ScheduledWaitingRoom.tsx` (client component for countdown)

**Step 1:** In `app/games/[id]/page.tsx`, branch by status:

```tsx
if (game.status === 'scheduled') {
  // Render state #2; load flight data
  const { data: flightMates } = await supabase
    .from('game_players')
    .select('user_id, course_handicap, users(name, nickname)')
    .eq('game_id', id)
    .eq('flight_number', me.flight_number)
    .order('user_id'); // stable order

  return (
    <AppShell>
      {/* ... see below ... */}
    </AppShell>
  );
}
```

**Step 2:** Build the state #2 layout per the design handoff (lift specs from `docs/design/incoming/handoff/quick-win-3/README.md` § state 2).

Top-level structure:
- Header: BackLink + Kicker(game.name) as title
- Hero block: MailEnvelope (size 56) + kicker "DU ER PÅMELDT" + heading "Scorekortet åpner ved tee-off."
- Course card (server-rendered): BANE / course name / "18 hull · Par {par_total}" + ` · ${length_meters} m` if set / TEE-OFF / time / date
- Flight section (server-rendered): kicker "DIN FLIGHT" + rows (avatar, name, optional DEG chip, HCP)
- Countdown banner: rendered by `<ScheduledWaitingRoom />` client component (because it ticks every minute)
- Footer caption: "Vær på 1. tee 10 minutter før start."

**Step 3:** Create `ScheduledWaitingRoom.tsx` (client component):

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCountdown } from '@/lib/format/countdown';
import { getBrowserClient } from '@/lib/supabase/client';

type Props = { gameId: string; teeOffAt: string };

export function ScheduledWaitingRoom({ gameId, teeOffAt }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  // Tick every 30s to update the countdown text.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Realtime: listen for game.status flipping to 'active'.
  useEffect(() => {
    const supabase = getBrowserClient();
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;
      const channel = supabase
        .channel(`game-status:${gameId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
          (payload) => {
            const next = payload.new as { status?: string };
            if (next?.status === 'active') router.refresh();
          },
        )
        .subscribe();
      return () => { void supabase.removeChannel(channel); };
    })();
    return () => { cancelled = true; };
  }, [gameId, router]);

  const msUntil = new Date(teeOffAt).getTime() - now;
  const text = formatCountdown(msUntil);

  return (
    <div className="bg-primary text-bg-tint rounded-2xl px-5 py-4 flex items-center gap-3">
      <span className="inline-block w-2 h-2 rounded-full bg-accent animate-soft-pulse" aria-hidden />
      <div className="flex-1">
        <p className="font-serif text-[15px] font-medium">{text}</p>
        <p className="text-[11.5px] opacity-75 mt-0.5">Vi gir deg beskjed når kortet åpner.</p>
      </div>
    </div>
  );
}
```

Add the `softPulse` animation to `app/globals.css`:

```css
@layer utilities {
  @keyframes soft-pulse {
    0%, 100% { opacity: 0.5; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.12); }
  }
  .animate-soft-pulse {
    animation: soft-pulse 2.4s ease-in-out infinite;
  }
}
```

**Step 4:** Manually verify state #2 in browser by creating a scheduled game with a future tee-off, opening it as a player, confirming all elements match the design reference.

**Step 5:** Commit.

```bash
git add app/games/[id]/page.tsx app/games/[id]/ScheduledWaitingRoom.tsx app/globals.css
git commit -m "feat(games): state #2 Scorekort venter for scheduled games"
```

---

### Task E3: Show scheduled games on player home page

**Files:**
- Modify: `app/page.tsx`

**Step 1:** Update the `activeGames` query — `.in('games.status', ['active', 'draft'])` becomes `.in('games.status', ['scheduled', 'active'])`. Drafts are admin-only and should NOT show up for non-admin players.

Wait — currently `draft` games are pulled in (for admin who is also a participant). Confirm what the current behavior is. If drafts only show because admin is a participant, we may want to keep them only for admin. Two options:
- (a) Keep draft+scheduled+active in the active-games list; let the existing `if (game.status === 'draft') redirect('/')` in `app/games/[id]/page.tsx` keep non-admins out
- (b) Filter drafts out at the home-page query level for non-admins

Recommend (a) — minimum change.

So update to: `.in('games.status', ['draft', 'scheduled', 'active'])`.

**Step 2:** Update the GameRow type to include `'scheduled'` in the status union (already done in Task A2, double-check).

**Step 3:** Commit.

```bash
git add app/page.tsx
git commit -m "feat(home): show scheduled games in player's active-games list"
```

---

### Task E4: Make sure the existing scorecard page handles scheduled status

**Files:**
- Modify: `app/games/[id]/scorecard/page.tsx`
- Modify: `app/games/[id]/holes/[holeNumber]/page.tsx`

**Step 1:** Check both pages. If they assume `status='active'`, add a guard: if `status==='scheduled'`, redirect to `/games/[id]` (which renders state #2). If `status==='draft'`, redirect to `/`.

**Step 2:** Commit.

```bash
git add app/games/[id]/scorecard/page.tsx app/games/[id]/holes/
git commit -m "feat(games): redirect scorecard/holes routes away from scheduled status"
```

---

### Task E5: Dark mode pass for state #2

**Files:**
- Modify: `app/games/[id]/page.tsx`, `ScheduledWaitingRoom.tsx`, `app/globals.css` (if tokens needed)

**Step 1:** Run dev in dark mode, walk through state #2:
- MailEnvelope: forest stroke on bg-tint background — verify legibility
- Course card: bg-surface in dark mode might be too close to body bg
- Avatar circles: forest active vs surface-2 inactive — verify contrast
- Countdown banner: forest panel stays forest in both modes per design — verify dot pulse and copy
- Footer caption: muted italic

**Step 2:** Fix anything that doesn't read.

**Step 3:** Commit.

```bash
git add app/games/[id]/ app/globals.css
git commit -m "fix(games): dark-mode pass for state #2"
```

---

## Phase E.5 — Email notification when admin adds player to a game

**Motivation:** State #1's empty state currently tells non-admins "Du er klar. Admin setter opp neste runde." That's accurate for the current data flow (players just see new games appear on their home page when admin adds them), but it relies on the player periodically opening the app. An email when admin publishes a scheduled game (or adds a player to an existing scheduled game) would:

- Match the design's original CTA assumption that tournaments arrive by invite
- Give players a clear "you're in {turneringsnavn} — tee-off lørdag kl 14:24" message in their inbox
- Bridge to the eventual in-app notifications system (Phase Z or separate milestone) without requiring it first

**Scope:** Single email type — "you've been added to a game". Sent at two trigger points:
1. When admin publishes a game (status `draft → scheduled`) — one email per player on the roster
2. When admin edits a scheduled game and adds a NEW player to the roster — email only the newly-added player

NOT in scope for E.5:
- Email when player is removed from a roster
- Email when admin edits non-roster fields (tee-off time, course, etc.)
- Email when round actually starts (separate notification type — push or in-app, not email)

### Task E5.1: Resend email template "Du er med på {turneringsnavn}"

**Files:**
- Create: `supabase/email-templates/game-add-notification.html` (or wherever Resend templates live in this project — check existing structure under `docs/email-templates.md` for the conventions)

**Step 1:** Read `docs/email-templates.md` to understand the project's email template conventions (Supabase Auth uses inline templates pasted into the Supabase Dashboard; Resend transactional emails may use a different mechanism — verify before guessing).

**Step 2:** Design the email body. Norwegian copy, forest-and-champagne styling consistent with existing magic-link mails. Required fields:
- Greeting: `Hei, {firstName}.`
- Subject: `Du er med på {tournament_name}`
- Body: «{adminName} har meldt deg på {tournament_name} på {courseName}. Tee-off {dayName} {date} kl {time}.»
- Flight info (optional in v1): name + HCP of flight-mates
- CTA: link to `/games/{game_id}` (deep-link to the state #2 venterom)
- Footer: «Du får denne meldingen fordi du er registrert hos Tørny. Logg inn for å se detaljer.»

**Step 3:** Save template + commit.

### Task E5.2: Server action to send the email

**Files:**
- Create: `lib/email/sendGameAddNotification.ts`
- Modify: `app/admin/games/new/actions.ts` (call after successful publish)
- Modify: `app/admin/games/[id]/edit/actions.ts` (call after successful add-player on edit)

**Step 1:** Inspect existing transactional email plumbing in the project. There's likely an existing helper for Resend SMTP (or the project uses Supabase's auth-mail-only setup). Check `lib/supabase/` and any `lib/email/` directory. If no transactional setup exists, add `lib/email/sendTransactional.ts` first as a thin wrapper.

**Step 2:** Implement `sendGameAddNotification({ to, firstName, adminName, gameName, courseName, teeOffAt, gameId })` as a server-side function. Send via Resend SMTP using existing creds (already in env).

**Step 3:** Wire into `createAndPublishAction` and `updateGameAction`:
- After successful insert/update, query the new player list
- For each new player (compared to previous state on edit, or all on first publish), call `sendGameAddNotification`
- Run sends in parallel via `Promise.all` (or sequentially with `for await` if rate-limiting matters)
- Errors are logged but do NOT block the publish/edit transaction (email is best-effort)

**Step 4:** Add a feature flag or env-var gate so we can disable the emails temporarily if needed (e.g. during prod incidents). Default: enabled in production, disabled in dev (avoid spamming yourself with test invitations).

**Step 5:** Manual test: create a game with yourself as a player, confirm email arrives.

**Step 6:** Commit each piece atomically.

### Task E5.3: Update state #1 CTA copy to acknowledge email arrival

**Files:**
- Modify: `app/page.tsx`

Once E.5 ships, the non-admin empty-state body can be more confident:
- Before: `Du er klar. Admin setter opp neste runde.`
- After: `Du er klar. Admin sender e-post når neste runde er satt opp.`

Trivial copy fix; commit separately so it's bisectable.

### Acceptance criteria for Phase E.5

- [ ] Resend template exists, renders cleanly in major email clients (Gmail, Apple Mail, Outlook web)
- [ ] Email body uses Norwegian; tone matches existing magic-link mails
- [ ] Email is sent on first publish (all players notified)
- [ ] Email is sent on edit-with-new-player (only new player notified)
- [ ] Email is NOT sent on edit-without-roster-change
- [ ] Email failures don't block the admin action
- [ ] Dev mode default = disabled (no spam during local testing)
- [ ] State #1 copy reflects the new flow

---

## Phase F — Leaderboard partial-reveal (state #3 + #3.5)

### Task F1: Server-side branch — state #3 vs state #3.5 vs full

**Files:**
- Modify: `app/games/[id]/leaderboard/page.tsx`

**Step 1:** After loading game + players + scores, compute:

```ts
import { isFrontNineOpen } from '@/lib/leaderboard/frontNineGate';

const teamCount = new Set(players.map((p) => p.team_number)).size;
const noScores = scores.length === 0;
const frontNineOpen = isFrontNineOpen({
  players: players.map((p) => ({ user_id: p.user_id, team_number: p.team_number })),
  scores: scores.map((s) => ({ user_id: s.user_id, hole_number: s.hole_number, strokes: s.strokes })),
});

const view: 'state3' | 'state3.5' | 'full' =
  game.status === 'finished' ? 'full'
  : !frontNineOpen ? 'state3'
  : 'state3.5';
```

**Step 2:** Branch the render:
- `view === 'state3'`: render state #3 (timeglass, expected first-score-time, startliste, pull-quote)
- `view === 'state3.5'`: render state #3.5 (FRONT 9 badge, table filtered to front 9 with partial markers, locked back 9 block)
- `view === 'full'`: existing leaderboard component unchanged

**Step 3:** Commit (no UI yet, just branching plumbing).

```bash
git add app/games/[id]/leaderboard/page.tsx
git commit -m "feat(leaderboard): branch render between state #3/#3.5/full"
```

---

### Task F2: Render state #3 (timeglass)

**Files:**
- Modify: `app/games/[id]/leaderboard/page.tsx`
- Create: `app/games/[id]/leaderboard/PreRoundLeaderboard.tsx` (client wrapper for realtime auto-refresh)

**Step 1:** Layout per design handoff § state 3:
- Header kicker: "LEADERBOARD"
- Hero: HourGlass (48) + kicker "STILLE FØR STORMEN" + heading "Første score forventet kl HH:MM." + body
- "STARTLISTE" section header
- Team list rows: rank (Fraunces tabular-nums), team name ("Lag {team_number}"), members (`firstName(p.users.name)` joined with " · "), tee-off (same for all rows)
- Pull-quote: "Lykke til."

**Step 2:** Wrap in a client component that subscribes to `scores` table for the game; on first insert, call `router.refresh()` so the server re-renders and may flip to state #3.5 (when first team completes front 9) or stay in #3.

```tsx
// PreRoundLeaderboard.tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/client';

export function PreRoundLeaderboardRealtime({ gameId }: { gameId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = getBrowserClient();
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;
      const channel = supabase
        .channel(`leaderboard:${gameId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'scores', filter: `game_id=eq.${gameId}` },
          () => router.refresh(),
        )
        .subscribe();
      return () => { void supabase.removeChannel(channel); };
    })();
    return () => { cancelled = true; };
  }, [gameId, router]);
  return null;
}
```

(Note: this duplicates the score-realtime pattern. If concerned about double-subscriptions vs RealtimeMount, reuse RealtimeMount instead.)

**Step 3:** Verify state #3 renders for a scheduled game's leaderboard, and for an active game with zero scores.

**Step 4:** Commit.

```bash
git add app/games/[id]/leaderboard/
git commit -m "feat(leaderboard): state #3 timeglass pre-round view"
```

---

### Task F3: Render state #3.5 (front 9 open with locked back 9)

**Files:**
- Modify: `app/games/[id]/leaderboard/page.tsx`
- Reuse: existing leaderboard computation, but with scores filtered to holes 1-9

**Step 1:** Filter scores to front 9 before passing to `computeLeaderboard`:

```ts
const frontNineScores = scores.filter((s) => s.hole_number >= 1 && s.hole_number <= 9);
const lines = computeLeaderboard({ mode, players, holes: holes.filter((h) => h.hole_number <= 9), scores: frontNineScores });
```

**Step 2:** Render layout:
- Header kicker: "LEADERBOARD"
- Champagne pill "FRONT 9" right under the header (centered or left-aligned per design judgement — handoff doesn't specify)
- Standard leaderboard table (reuse existing rendering as much as possible — extract the table into a reusable component if not already)
- For each team line: if the team has fewer than 9 holes filled by BOTH players, append a kursiv tag like `({n}/9)` next to the total
- Locked back 9 block beneath the table — krittstrek-ramme i muted, 🔒 emoji, heading "🤫 Vi sees ved hull 18."
- Pull-quote: "Lykke til." (keep)

**Step 3:** Commit.

```bash
git add app/games/[id]/leaderboard/
git commit -m "feat(leaderboard): state #3.5 front-9 table with locked back-9 block"
```

---

### Task F4: Hole-by-hole leaderboard hides hull 10–18 during active

**Files:**
- Modify: `app/games/[id]/leaderboard/holes/page.tsx`

**Step 1:** If `game.status === 'active'`:
- Render only columns for holes 1–9
- After the front-9 columns, render a single column-spanning row with the locked-back-9 message
- Use the same "🤫 Vi sees ved hull 18." copy

If `game.status === 'finished'`: render all 18 columns as today.

**Step 2:** Commit.

```bash
git add app/games/[id]/leaderboard/holes/page.tsx
git commit -m "feat(leaderboard): hide holes 10-18 in hull-for-hull view during active"
```

---

### Task F5: Dark mode pass for states #3 and #3.5

Walk through both states in dark mode. Verify:
- HourGlass icon stroke + champagne fill
- Startliste cards: bg-surface with border
- "FRONT 9" champagne pill: legible on dark
- Locked back 9 block: krittstrek-ramme reads on dark

Commit fixes:

```bash
git add app/games/[id]/leaderboard/
git commit -m "fix(leaderboard): dark-mode pass for states #3 and #3.5"
```

---

## Phase G — Verification + polish

### Task G1: End-to-end UAT walkthrough

Run through the full happy path in dev with two browser profiles (admin + player):

1. **Admin: create + publish a scheduled game** with tee-off 1 hour in the future
2. **Player: see "Planlagt" pill on home page**, tap the card
3. **Player: see state #2** with correct flight, countdown showing "Starter om 59 min" or similar
4. **Admin: open admin/games/[id], click "Rediger"**, swap a player, save
5. **Player (other browser): state #2 re-renders** with updated flight (manually refresh if realtime is unreliable)
6. **Player: navigate to leaderboard**, see state #3 (timeglass, "Første score forventet kl..." correctly computed)
7. **Admin: click "Start runden nå"**, confirm prompt
8. **Player: state #2 auto-flips to hull-skjermen** via realtime (or manually refresh)
9. **Player: enter scores for holes 1-9** (both team members)
10. **Player: navigate to leaderboard**, see state #3.5 (FRONT 9 pill, front-9 standings, locked back 9 block with "🤫 Vi sees ved hull 18.")
11. **Player: enter scores for holes 10-18**
12. **All scorecards submitted + approved**
13. **Admin: click "Avslutt spillet"**
14. **Player: leaderboard shows full 18-hull standings** with confetti

**Document any issues** in a UAT-notes section at the bottom of this plan. Fix any blockers before moving to G2.

---

### Task G2: Test alternate paths

**Auto-start fallback:**
1. Create scheduled game with tee-off 1 minute in the past
2. As player, open `/games/[id]`
3. Confirm status flipped to active in DB and page rendered as if started

**Empty state for new admin user:**
1. Sign in as a brand-new admin user with no games
2. Confirm state #1 renders + admin section visible below

**Countdown edge cases:**
1. Game tee-off is 3 days from now → "Starter om 3 dager"
2. Game tee-off is 2h 14min from now → "Starter om 2 t 14 min"
3. Game tee-off is 45min from now → "Starter om 45 min"
4. Game tee-off is 50s from now → "Starter om 50 s"
5. Game tee-off is 30s ago and admin hasn't started → "Starter snart"

**Dark mode end-to-end:** repeat G1 in dark mode.

**Mobile viewport:** repeat G1 at 390px width in Safari iOS responsive mode.

---

### Task G3: Final commit + push

```bash
# Run full typecheck + tests once more
npx tsc --noEmit
npx vitest run
# If you have Playwright e2e: npx playwright test

# Push the branch
git push -u origin claude/hungry-brown-44a612
```

Open a PR with body referencing the design doc and listing the 7 phases. Use `gh pr create` per CLAUDE.md conventions.

---

## Out-of-band notes for the implementer

- **Always use `BackLink` and existing primitives** when building UI — don't reach for `<a>` or build new card components when `Card`, `Banner`, `PageHeader`, etc. exist in `components/ui/`.
- **Never rename Dexie database** (per CLAUDE.md). Score data is local-first.
- **Never edit `lib/scoring/` without writing a new test first** (per CLAUDE.md).
- **Per CLAUDE.md, the user does NOT execute SQL locally** — when a migration is ready, format the SQL in a copy-paste-ready block and tell the user: "Gå til Supabase → SQL Editor → New query → lim inn dette → Run."
- **Realtime quirk**: `supabase.realtime.setAuth(session.access_token)` MUST be called before subscribing on the browser client, otherwise events are silently dropped (see `lib/sync/realtime.ts:43-54` for the existing pattern).
- **Next.js 16 conventions** — middleware is `proxy.ts` not `middleware.ts`. Server actions need `'use server'`. Some APIs renamed; check `node_modules/next/dist/docs/` if unsure.
