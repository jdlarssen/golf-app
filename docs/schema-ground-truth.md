> **SNAPSHOT, NOT AUTHORITY. Verified 2026-06-18 via Supabase MCP.**
> The live DB is the source of truth — regenerate with `npm run gen:types` / query via MCP when in doubt.
> Facts here go stale (e.g. `team_number` was `1..4`, now `>=1`).

See also: [docs/bug-prevention.md](bug-prevention.md) · [docs/audits/2026-06-17-health-audit.md](audits/2026-06-17-health-audit.md)

---

# Schema Ground Truth

Non-obvious, runtime/CHECK/RLS facts the typed Supabase client **cannot** catch.
Typed clients (#672) make wrong column names a compile error — treat a red squiggle on a column as
"go check the live schema", not "cast it away".

---

## `course_holes`

- Columns: **`par_mens`**, **`par_ladies`**, **`par_juniors`** — all `NOT NULL`. There is **no `par` column** and **no `par_seniors`**.
- Per-gender par. `CHECK` on each: `3..6`.
- `hole_number` `CHECK 1..18`.
- `stroke_index` `CHECK 1..18`.

---

## `game_players`

- There is **no `status` column**. Lifecycle is encoded in timestamp columns:
  `accepted_at`, `submitted_at`, `approved_at`, `withdrawn_at`
  (plus `approved_by_user_id`, `withdrawn_by_user_id`, `rejection_reason`, `deliver_reminder_sent_at`).

- **`team_number`**: nullable `int`. `CHECK = (team_number IS NULL OR team_number >= 1)`.
  **No upper bound.** The audit-era `1..4` was widened to `>=1` by migration 0101 (#669).
  Any doc that says `1..4` is **stale**.

- **`flight_number`**: nullable `int`. `CHECK = (NULL OR >= 1)`. No upper bound.

- **`game_players_team_flight_consistency` CHECK**: `team_number NOT NULL` implies `flight_number NOT NULL`.

- **`course_handicap`**: nullable `int`. **`tee_gender`**: `NOT NULL` enum (`player_tee_gender`).

- **Guard trigger `guard_game_players_self_update`** (migrations 0103/0106, #670/#704):
  - A player cannot self-approve their own scorecard or change their own `course_handicap` post-start.
  - A peer may only touch approval columns on another player's row.
  - The game **creator** is explicitly exempted so roster editing still works.
  - A `BEFORE UPDATE` trigger enforcing column-level rules that RLS `USING`/`WITH CHECK` clauses can't express on their own (it inspects which columns changed).

---

## `scores`

- **`strokes`**: `NULLABLE int`. `CHECK (strokes >= 1 AND strokes <= 20)` applies when not null (null = hole not yet entered).
- `hole_number` `CHECK 1..18`.
- **`client_updated_at`** + **`updated_at`**: `NOT NULL`. Last-write-wins key = `client_updated_at`.
- Real write path: `SECURITY DEFINER` RPC **`upsert_score_if_newer`**, which has a graceful no-op guard when `withdrawn_at`/`submitted_at` is set (migration 0102, #668).

---

## Status type mismatch across entities

| Table | `status` type |
|-------|---------------|
| `games` | `enum game_status` (USER-DEFINED, `NOT NULL`) |
| `tournaments` | `TEXT` |
| `leagues` | `TEXT` |

Do **not** assume one shape across the three. `games.status` is a typed enum; the other two are free text.

---

## `games` — other CHECKs

- `score_visibility IN ('live', 'reveal')`
- `short_id ~ ^[0-9a-z]{8}$`

---

## RLS — the real authorization boundary

RLS is the enforcement layer; app-layer TypeScript guards are not sufficient. A direct PostgREST `PATCH`
bypasses every TS guard — only RLS + the guard trigger stop it.

**`game_players` per-actor policies:**

| Actor | Operation | Policy |
|-------|-----------|--------|
| creator | INSERT / UPDATE / DELETE | authenticated |
| self (open) | INSERT (register) | public |
| self (pre-active) | DELETE (withdraw) | public |
| self | UPDATE (mark accepted) | authenticated |
| self | UPDATE (submit scorecard) | public |
| peer (flightmate) | UPDATE (approve scorecard) | authenticated — added migration 0106 (#704) |

**`scores`:** INSERT / UPDATE / SELECT by flight (public).

---

## How to verify

1. **Typed types:** `npm run gen:types` regenerates `lib/database.types.ts` from the live schema.
   A column mismatch becomes a compile error immediately.

2. **Supabase MCP:** query the live DB directly — use `execute_sql` or `list_tables` against
   project `glofubopddkjhymcbaph` to inspect CHECK constraints, nullability, and RLS policies.

3. **CI schema-drift job (#673):** the pre-push gate runs type generation and flags drift before
   it reaches prod. See the health audit for status.

---

Cross-links: [docs/bug-prevention.md](bug-prevention.md) · [docs/audits/2026-06-17-health-audit.md](audits/2026-06-17-health-audit.md)
