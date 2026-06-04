# Evaluation — #427: Vanlige brukere oppretter + kjører + avslutter egne spill

## Overall verdict: **ACCEPT**

All 7 success criteria (K1–K7) independently verified. RLS re-verified against the LIVE Supabase project (`glofubopddkjhymcbaph`) with a real non-admin `auth.uid()` in a rollback transaction — own→allowed, foreign→blocked on every table, no leaked rows. All four gates green. Admin flow confirmed byte-identical via git diff against the pre-#427 actions. No security gaps found.

One **low-severity contract deviation** noted (does not block): the §4 promise to switch `startScheduledGame`'s internal pending-defense `users`-read to the RPC was NOT done — it still does a direct `users` read. Harmless because the auto-start fallback now passes the service-role client (read succeeds), and the admin button path also reads as admin. Belt-and-suspenders only; K4 is met regardless.

---

## Gate results

| Gate | Result |
|------|--------|
| `npm run lint` | **PASS** — 0 errors, 23 warnings (all pre-existing, in untouched files: `_gameId`/`_gameStatus` leaderboard view params, etc.) |
| `npx vitest run` | **PASS** — 2640 passed / 2640 (217 test files) |
| `npm run build` | **PASS (exit 0)** — clean; route table includes `ƒ /games/[id]/avslutt` (line 62) and `ƒ /opprett-spill` (line 79) |
| `npx tsc --noEmit` | **PASS (exit 0)** — clean |
| `app/admin/games/new/actions.test.ts` (focused) | **PASS** — 17/17 |

---

## Per-criterion

### K1 — Migration + policies + RPC exist — **PASS**
- Migration recorded applied: `supabase_migrations.schema_migrations` → `games_creator_rls` (version `20260604200356`).
- `pg_policies` (live DB) confirms all **8 new creator policies** exist with exactly the specified predicates, and the 10 pre-existing admin/self/is_in_game policies are untouched:
  - `games`: `games select own created` (SELECT `created_by = auth.uid()`), `games creator insert` (INSERT with_check `created_by=auth.uid()`), `games creator update` (USING+WITH CHECK `created_by=auth.uid()`), `games creator delete` (DELETE). Existing `games admin write` + `games select if participant or admin` intact.
  - `game_players`: `creator insert`/`creator update`/`creator delete`, all gating on parent `g.created_by = auth.uid()`. Existing `admin write`, `select shared game`, `self register open`, `self submit`, `self withdraw pre active` intact.
  - `game_side_winners`: `creator all` (ALL, parent subquery). Existing `_admin_all` + `_select` intact.
- RPC `incomplete_profiles_for_ids(p_user_ids uuid[])`: `prosecdef=true`, `proconfig=search_path=""`, returns `TABLE(id uuid, email text)`.
- **Advisor finding correctly addressed:** `information_schema.role_routine_grants` → EXECUTE granted to `authenticated`, `postgres`, `service_role` only. **`anon` is NOT executable**, `public` absent. (anon would otherwise probe arbitrary UUIDs for profile-completion + emails.)

### K2 — RLS against real `auth.uid()` (not mock) — **PASS**
Single rollback transaction (DO block, `raise exception` at end → full rollback), `set_config('role','authenticated')` + `request.jwt.claims.sub = 0ab3e34c-…` (verified non-admin, complete profile). Foreign game `d6258d40-…` created_by `069cda6e-…` (verified NOT the test user). All 9 sub-tests PASS:

```
T1 own games INSERT (created_by=self):              PASS (allowed)
T2 foreign created_by INSERT:                       PASS (42501 blocked)
T3 own games UPDATE:                                PASS (1 row)
T4 foreign games UPDATE:                            PASS (0 rows, blocked)
T5 game_players INSERT own game:                    PASS (allowed)
T6 game_players INSERT foreign game:               PASS (42501 blocked)
T7 game_side_winners INSERT own game:              PASS (allowed)
T8 game_side_winners INSERT foreign game:          PASS (42501 blocked)
T9 RPC incomplete_profiles_for_ids([incomplete,complete]): count=1 PASS
```
**Rollback verified:** post-test query → `leaked_games=0, leaked_players=0`, foreign game status unchanged. Addresses the #230 lesson (no trust in mocked RLS tests).

### K3 — Create opened to any logged-in user — **PASS**
- `grep getAdminClient app/admin/games/new/actions.ts` → no match (exit 1). No service-role bypass.
- Gate is getUser-based: `actions.ts:38-49` — `supabase.auth.getUser()` → `if (!user) redirect('/login')`, then a light `users.is_admin` read only for redirect branching. `created_by = userId` (line 174). All writes (`games.insert` line 147, `game_players.insert` line 199) + pending RPC (line 112) on the request-scoped `supabase`.
- `app/opprett-spill/page.tsx:54-58` — getUser gate, unauth → `/login`, no admin/trusted requirement.
- `app/page.tsx:183` — `canCreateGame = !!userId`; `isTrustedCreator` fully removed (0 references); CTA branches admin→`/admin/games/new` else→`/opprett-spill`.
- `actions.test.ts` (17/17) covers the real cases non-vacuously: regular non-admin creates → asserts redirect `/games/reg-game-1` AND `games.insert` ran on request-scoped mock with `created_by==='reg-1'`; validation error → `/opprett-spill?error=name_required`; publish pending player (RPC returns row) → `/opprett-spill?error=pending_players` before insert; unauth → `/login`; admin paths preserved (`/admin/*`).

### K4 — Robust auto-start — **PASS**
- `app/games/[id]/page.tsx:285` — auto-start fallback calls `startScheduledGame(getAdminClient(), id)`. Service-role bypasses RLS, so the per-player `course_handicap` bulk update + `games` status flip succeed regardless of which player triggers (vs. the prior silent 0-row no-op on a non-owner request-scoped client). Idempotent + optimistic-locked (`startScheduledGame.ts:145-149` `.eq('status','scheduled')`). `revalidateTag` deferred via `after()` (line 300) to avoid throwing during render.
- Admin "Start runden nå" (`startScheduledGameAction`) unchanged (request-scoped admin client; `loadAdminContext`→`requireAdmin`).
- **Deviation (low):** §4 also said `startScheduledGame`'s internal pending-defense would move to the RPC; it still does a direct `users` read (`startScheduledGame.ts:104-107`). No functional impact since the client is now service-role (admin button path also reads as admin). Belt-and-suspenders only.

### K5 — Creator finish flow — **PASS**
- New `app/games/[id]/avslutt/page.tsx`: gate `requireAdminOrCreator(supabase, gameId)` (line 55); guards game-exists `notFound()` (74) + `status==='active'` else redirect `?error=not_active` (75-77). Reuses `SideWinnersForm` (imported, not duplicated) with new `cancelHref` prop. Adapts to state: peer-approval pending → blocking notice (no finish button), side-on → LD/CTP picker (`endGameWithSideWinners`), side-off+missing → «avslutt likevel» with optional per-player WD (`endGameMarkingWithdrawals`), all-submitted → plain `endGame`.
- All three finish actions self-gate on `requireAdminOrCreator(gameId)` and branch `detailPath`/`actorName` on `isAdmin` (admin→`/admin/games/*`, creator→`/games/*`):
  - `endGame` (`actions.ts:253-265`), `endGameWithSideWinners` (`avslutt/actions.ts:21-30,53-55`), `endGameMarkingWithdrawals` (`avslutt-likevel/actions.ts:25-29`).
- **Peer-approval + submission gates preserved** in every action (e.g. `endGame:312-328`, `endGameWithSideWinners:139-150`). The page also surfaces the pending-approval state so the creator gets feedback rather than a silent bounce.
- Game-home «Avslutt spillet» button (`page.tsx:757`) gated `isActive && isCreator` where `isCreator = gwp.game.created_by === userId` — shown only to the creator on active games; NOT to a regular non-creator player.
- **Admin byte-identity confirmed** via git diff of `32c5fa8^` vs working tree: admin `detailPath`, `wizardPath`, `actorName ('Admin')`, `revalidatePath`s, and `?status=finished` redirect are identical for all three actions.

### K6 — Full suite + lint + build green — **PASS**
vitest 2640/2640 (217 files), lint 0 errors, build clean (exit 0, route table includes new routes), tsc clean (exit 0). See gate table above.

### K7 — Version + CHANGELOG — **PASS**
- `package.json` version = `1.75.0`.
- CHANGELOG: new `## 1.75.y — Lag og styr ditt eget spill` section (open, three-layer format: theme heading + tagline blockquote + `<details>` Teknisk with Added/Changed/Decided). Previous `1.74.y` series wrapped in `<details>`.
- README intro updated (any signed-in player can set up/run/finish a game; admins still run club-scale + secretariat). Contract checkboxes all checked.

---

## Bugs / gaps / regressions / security

- **No security gaps found.** RLS blocks foreign INSERT/UPDATE on all three tables (live-verified). RPC is not anon-executable. All finish actions self-gate; no path lets a non-creator non-admin finish. The non-playing-creator-via-URL edge is explicitly accepted in the contract (created_by-SELECT + creator-gated avslutt; game-home still `notFound`s for a non-player). Pending-player publish gate bites (RPC returns real data; not a silent no-op).
- **Low — contract deviation (K4/§4):** `startScheduledGame` pending-defense still reads `users` directly instead of via the RPC. No functional impact (auto-start now uses service-role; admin button reads as admin). Optional follow-up only.
- **Trivial — stale comment:** `avslutt-likevel/actions.ts:18` JSDoc still says "Requires admin." (action now allows creator too). Cosmetic.
- **Live UI not exercised:** no `.env.local` with Supabase creds in this worktree, and logged-in schema rendering needs OTP (contract line 125 + prior #366 evaluation acknowledge this). Logged-out redirect for `/opprett-spill` is deterministic from code (`getUser()` null → `redirect('/login')`), same gate pattern as every other protected page; not separately spun up. Owner does visual prod verification on deploy.

## If NEEDS WORK
N/A — ACCEPT. Optional (non-blocking): (1) move `startScheduledGame` pending-defense to the RPC per §4; (2) fix the stale "Requires admin" comment in `avslutt-likevel/actions.ts`.
