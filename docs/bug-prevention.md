# Bug-prevention checklist

Read this before building anything that touches the DB, scoring, RLS, or multi-step creation flows. The 2026-06-17 health audit (`docs/audits/2026-06-17-health-audit.md`) traced the prod-break cluster (#641/#642/#647/#648 — cup & liga broken end-to-end) to builders who were confident they were right. These five principles steer the next builder away from those same wrong turns.

Related: `docs/schema-ground-truth.md` (live-schema snapshot) · `lib/supabase/AGENTS.md` (mutation patterns) · `lib/supabase/affectedRows.ts` (0-row helper).

---

## 1. The live DB is the source of truth — not the types file, not memory

**Wrong turn:** building against an imagined schema. `course_holes.par` (#666), `game_players.status` (#641/#647), `team_number "1..4"` (#669) — all compiled green and failed only in prod.

**Why:** hand-recalled or stale schema produces zero type-check errors and blows up at runtime.

**How to apply:**
- When unsure about a column or constraint, query the live DB (Supabase MCP `execute_sql`) or run `npm run gen:types`.
- Treat a red squiggle on a column name as "go check the live schema", not "cast it away".
- Note the irony deliberately: `team_number "1..4"` is itself now stale — it became `>= 1` via migration 0101 (#669). That is exactly why the DB, not any doc, is the anchor. `docs/schema-ground-truth.md` is a convenience snapshot with a regenerate date, not the authority.

**Enforced:** ✅ typed clients (#672) · CI schema-drift job (#673) · pre-push gate.

---

## 2. A write that affects 0 rows is a failure, not a success

**Wrong turn:** trusting `error == null`. #667 swallowed an insert error and returned "success". #704 peer-approval hit no RLS policy, matched 0 rows, got `error == null`, reported success — and the game could then never be finished.

**Why:** PostgREST returns no error for an `UPDATE`/`DELETE` that matched zero rows. The happy path fires even when nothing was written.

**How to apply:**
- Chain `.select()` on every mutation and assert the returned row count.
- Use the `expectAffected` / `expectOne` helpers in `lib/supabase/affectedRows.ts` — they make the intent explicit and collapse the multi-line guard into a single call.
- Roughly 180 existing Supabase mutation call sites (insert/update/delete) predate the helper; they are being retrofitted incrementally (#712). New code has no excuse.

**Enforced:** `lib/supabase/affectedRows.ts` helper · retrofit issue #712 for existing sites.

---

## 3. RLS is the real authorization layer; app-layer checks are not enough

**Wrong turn:** securing only the server action and leaving the row open to a direct PostgREST `PATCH`. #670 allowed a player to self-approve their own scorecard or lower their own course handicap. #671 exposed an anon email-oracle via a missing policy.

**Why:** a client can call PostgREST directly and bypass every TypeScript guard. The app layer is convenience, not security.

**How to apply:**
- Every write path needs a matching RLS policy on the table.
- Column-level rules that cannot be expressed in a single `USING`/`WITH CHECK` clause need a `BEFORE UPDATE` trigger (see `guard_game_players_self_update`, migrations 0103/0106, #670/#704).
- Test each write against a hostile direct call using the RLS test rig (#440).

**Enforced:** RLS policies · `guard_game_players_self_update` trigger (0103/0106) · RLS test rig (#440).

---

## 4. A rule has one home; if it lives in several layers, change them together and test that they agree

**Wrong turn:** widening `flight_number`'s DB constraint (migration 0095) but forgetting the mirror constraint on `team_number` (#669). A cap enforced in the validator but not in RLS (#660/#662).

**Why:** a duplicated rule drifts silently until a user hits the half that lagged behind.

**How to apply:**
- When a limit lives in DB `CHECK` + validator + RLS policy + UI, touch all four in one commit.
- Add a test asserting they match (not just that each layer individually works).
- Before widening a constraint, grep for every place the old bound is referenced; the type system won't find them.

**Enforced:** code review + test suite — no automated gate yet.

---

## 5. Multi-step creation is atomic or compensated; errors surface, never a raw 500

**Wrong turn:** cup/liga creation inserting a parent then children with no rollback on failure (#675 orphan rows). No error boundary on the route, so a network blip threw the user to Next.js's raw English 500 page (#680).

**Why:** partial failure leaves half-built state and a confused user with no recovery path.

**How to apply:**
- Wrap multi-insert flows in a compensating delete (mirror the `startLeagueRoundFlight` pattern) or move them into a single RPC so Postgres rolls back on error.
- Every route that runs a creation flow must have a co-located `error.tsx`.

**Enforced:** compensating-delete pattern (#675) · `error.tsx` boundaries (#680).

---

## Placement hierarchy

Principles bite harder the higher they sit.

| Layer | What lives here |
|---|---|
| **1. Executable** — cannot be skimmed past | Typed clients ✅ (#672); `expectAffected` helper; CI + pre-push gate ✅ (#673) |
| **2. Co-located** with the code it governs | `lib/supabase/AGENTS.md` — mutation patterns and 0-row rules |
| **3. Decision-time checklist** | This file (`docs/bug-prevention.md`), pointed to from root `AGENTS.md` |
| **4. Reference** | `docs/schema-ground-truth.md` — snapshot + "verify against live DB" mantra |

---

## Meta

Issue count is a poor health metric. The backlog looked calm (16 open) while cup & liga were broken end-to-end in prod. The 2026-06-17 audit found these bugs by sweeping git history and the live schema — not the issue list. Re-run a prod-schema-grounded audit periodically; do not trust a quiet backlog.
