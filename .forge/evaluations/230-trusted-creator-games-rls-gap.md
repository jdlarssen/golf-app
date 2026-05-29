# Evaluation: #230 — trusted-creator games-RLS-gap

**Verdict: ACCEPT**

Commit `14c1b7d` (`fix(admin): route trusted-creator game creation through admin client`) correctly closes the RLS gap. All 11 success criteria verified independently. The crux — the regression test — was proven to catch the reverted bug. No real adversarial gaps found; the items the contract claimed are FINE are confirmed FINE by direct inspection of code + live RLS.

---

## Per-criterion verification (K1–K11)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| K1 | `isAdmin` destructured; `writeClient = isAdmin ? supabase : getAdminClient()` | PASS | `actions.ts:5` import `getAdminClient`; `:92` `const { userId, isAdmin } = await requireAdminOrTrustedCreator(supabase)`; `:101` binding. |
| K2 | `games` INSERT uses `writeClient` | PASS | `actions.ts:140` `const { data: game, error: gameError } = await writeClient.from('games').insert({...})`. |
| K3 | `game_players` INSERT uses `writeClient` | PASS | `actions.ts:192` `const { error: gpError } = await writeClient.from('game_players').insert(rows)`. |
| K4 | publish-roster-read uses `writeClient` (gate parity) | PASS | `actions.ts:104` `const { data: rosterUsers, error: rosterErr } = await writeClient.from('users').select(...).in('id', ...)`. |
| K5 | Admin path unchanged; `tournaments` read stays on `supabase` | PASS | `:101` `writeClient === supabase` when `isAdmin`. `:128` `tournaments` read uses `supabase`. Live RLS: `tournaments_select_authenticated` polcmd `r`, USING `true` → any authenticated user can read, so leaving it on `supabase` is correct. Admin test (`actions.test.ts:276`) asserts `getAdminClientMock` NOT called. |
| K6 | Regression test — trusted draft + publish use admin client; revert proves it catches the bug | PASS | Draft test `:179-232` asserts `getAdminClientMock` called 1×, both writes on `adminMock`, `games.insert` NOT on `supabaseMock`, `created_by='trusted-1'`. Publish test `:285-333` asserts gate read `users.in` on `adminMock`, not on `supabaseMock`. Revert proof below. |
| K7 | Regression test — admin: `getAdminClient` NOT called, writes on request-scoped client | PASS | `actions.test.ts:276` `expect(getAdminClientMock).not.toHaveBeenCalled()`; `:277-281` `games.insert` present on `supabaseMock`. |
| K8 | `npm test` (full suite) green | PASS | `npx vitest run` → **Test Files 151 passed (151) / Tests 1766 passed (1766)**. |
| K9 | `npm run lint` — 0 errors | PASS | `✖ 11 problems (0 errors, 11 warnings)` — all 11 are pre-existing `_gameId`/`_gameStatus`/unused-import warnings in unrelated leaderboard views + one in `GameForm.test.tsx`. None touched by this commit. |
| K10 | `npm run build` green | PASS | Build completed, full route table rendered, no typecheck errors. |
| K11 | PATCH bump 1.44.0 → 1.44.1 + CHANGELOG entry | PASS | `package.json` version = `1.44.1` (confirmed via `node -p`); `package-lock.json` bumped; CHANGELOG `[1.44.1] - 2026-05-29` entry with stakeholder tagline + Teknisk `<details>`. |

**Count: 11 PASS / 0 FAIL.**

---

## Gate outputs (tails)

### `npm run lint`
```
.../app/games/[id]/leaderboard/WolfView.tsx
  75:11  warning  '_gameId' is defined but never used  @typescript-eslint/no-unused-vars

✖ 11 problems (0 errors, 11 warnings)
```
Gate = 0 errors → PASS. All warnings pre-existing in unrelated files.

### `npx vitest run app/admin/games/new/actions.test.ts` (targeted)
```
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

### `npm run build`
```
ƒ /opprett-spill
...
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```
Full route table, no typecheck errors → PASS.

### `npx vitest run` (full suite)
```
 Test Files  151 passed (151)
      Tests  1766 passed (1766)
   Duration  23.62s
```

---

## Revert-test result (the crux)

The contract claims the OLD #198 test gave false confidence because it mocked `games.insert` to succeed regardless of which client ran it. I proved the NEW test would fail if the fix were reverted.

**Method:** temporarily changed `actions.ts:140` `await writeClient.from('games')` → `await supabase.from('games')` (reverting just one of the three call-sites), then ran the targeted suite.

**Result:** 2 tests FAILED, 16 passed:
```
 ❯ app/admin/games/new/actions.test.ts (18 tests | 2 failed)
   × trusted non-admin: ... → writes via admin client (RLS bypass, #230)
   × trusted non-admin publish: ... writes all run on admin client
AssertionError: expected '/admin/games/new?error=db_game' to be '/admin/games/new-game-trusted-1?status=draft_created'
```

Mechanism: when `games.insert` is routed through the request-scoped `supabaseMock`, that mock's response queue was already drained by `loadRole`'s `users` lookup, so `games.insert` returns the queue-exhausted error → action redirects to `?error=db_game` — the exact production symptom ("Klarte ikke å lagre spillet"). The admin tests stayed green (admin path never used `adminMock`). This is precisely the assertion the old test lacked.

**Restoration confirmed:** after restoring the edit, `git diff -- app/admin/games/new/actions.ts` prints **nothing** (empty), and the targeted suite is back to 18/18 green. Working tree contains only the untracked evaluation/contract files under `.forge/`.

---

## Adversarial findings

### Confirmed FINE (audited, no gap)

1. **`tournaments` read left on request-scoped `supabase` (`actions.ts:128`).** Verified live RLS via Supabase MCP: the only policy on `public.tournaments` is `tournaments_select_authenticated`, polcmd `r`, `using = true`. Any authenticated user (including a trusted-non-admin) can read it. Leaving it on the RLS-bound client is correct and matches contract decision #4. Not a gap.

2. **`notifyInvitedToGame` left untouched.** Confirmed `lib/notifications/notifyInvitedToGame.ts:28` calls `getAdminClient()` internally for its own `games` + `users` reads, so it is never RLS-blocked for a trusted creator. Matches contract decision #5. Not a gap.

3. **Reusing `writeClient` for the publish roster READ is semantically sound.** `findPendingPlayers` (`lib/games/pendingPlayers.ts:16`) is a pure filter on `profile_completed_at === null`. Running the read through the service-role client returns the *full, unfiltered* roster — which is exactly the set the gate must evaluate. Under the old RLS-bound read, brand-new players (who don't yet share a game with the trusted creator) would be hidden, shrinking the result and silently no-op-ing the gate. The fix makes the trusted creator's gate behave identically to an admin's. Correct.

4. **`getAdminClient()` is safe to call here.** `lib/supabase/admin.ts` is `import 'server-only'` and constructs a service-role client from `SUPABASE_SERVICE_ROLE_KEY` with `persistSession: false`. `actions.ts` is a `'use server'` module, so this never reaches the client bundle. It throws loudly if the env var is missing rather than silently degrading. Fine.

5. **Admin path truly unchanged.** When `isAdmin` is true, `writeClient === supabase` (same object reference) — no behavioral or client-identity change for admins. The admin regression test asserts `getAdminClientMock` is never called. Confirmed.

6. **Type-safety of the mixed binding.** `writeClient = isAdmin ? supabase : getAdminClient()` mixes the `@supabase/ssr` server client (`supabase`) and the `@supabase/supabase-js` admin client. TypeScript narrows the union to the common query-builder surface; only `.from(...).select/insert/in/eq/single` are used downstream, which both clients share. `npm run build` (full typecheck) passed with no errors, so the binding type-checks cleanly. Fine.

7. **Bug premise verified against live RLS.** `games admin write` and `game_players admin write` are both polcmd `*` (ALL) with USING + WITH CHECK = `is_admin()`. No SELECT/insert policy covers a trusted-non-admin inserting a `games` row or bulk-inserting `game_players` for others. So pre-fix, the INSERTs genuinely failed for the trusted creator — the bug was real, and `is_admin()` (not configuration drift) is the cause. Confirms contract diagnosis.

### Real gaps
None found within the scope of the contract (which explicitly defers full RLS revision to parent #22 and keeps the #198 small-bet shape).

### Minor observations (non-blocking, not gaps)
- The contract's own K6 line references `:140-141` / `:101` / `:104-105` line numbers that drift by a line or two from the final file (e.g. games insert is at `:140`, binding at `:101`, roster read at `:104`). All call-sites are present and correct; the line references are close enough to be unambiguous. No action needed.
- The `db_game` redirect (`actions.ts:175-177`) is the same generic error a trusted creator hit pre-fix. Post-fix, an env-var misconfiguration (missing `SUPABASE_SERVICE_ROLE_KEY`) would surface as a thrown error from `getAdminClient()` rather than `db_game` — louder, which is appropriate. Out of scope, noted only for completeness.

---

## Working-tree cleanliness
- `git diff -- app/admin/games/new/actions.ts` → empty (temporary revert fully restored).
- `git status --short` → only untracked `.forge/` files (the contract; this evaluation file is added by this run). No source files modified.
