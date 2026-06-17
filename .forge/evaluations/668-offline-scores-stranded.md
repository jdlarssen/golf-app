# Evaluering: #668 — Offline-scores strandet ved levering før synk

**Verdict: ACCEPT**

Independent, skeptical verification of the 4-layered fix for the P1 data-loss bug. All
five success criteria verified by code-reading + live-prod SQL + a fresh run of every gate
(not trusting the contract's checkboxes). No regressions found.

---

## Gates (run fresh, not trusted)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **exit 0** |
| `npx vitest run lib/sync/` | **3 files / 33 tests passed** (incl. 24 classifyError cases) |
| `npx vitest run HoleClient.test.tsx` | **1 file / 22 tests passed** |
| `npm run build` | **✓ Compiled successfully; 256/256 static pages; full PPR route table; no errors** |

---

## Per-criterion verdict

### K1 (Del 1a — RPC graceful no-op for submitted) — PASS

- Migration `supabase/migrations/0102_block_submitted_score_writes_in_rpc.sql:60-68` extends the
  frozen guard from `withdrawn_at is not null` to `(withdrawn_at is not null or submitted_at is not null)`,
  returning `was_applied := false` (lines 88-90) BEFORE any INSERT/UPDATE. Mirrors 0073 exactly aside
  from the predicate + `v_withdrawn → v_frozen` rename.
- **Live prod verified** via Supabase MCP (`glofubopddkjhymcbaph`):
  - `has_submitted_guard = true`, `has_withdrawn_guard = true` (string-position probe on `pg_get_functiondef`).
  - `pg_proc.prosecdef = false` → function is **SECURITY INVOKER**, so RLS on `scores` is still enforced.
    (`pg_get_functiondef` omits the literal "security invoker" because it's the default — the `prosecdef`
    flag is the authoritative check, and it confirms RLS is unchanged.)
- RLS policies (0002/0073) are **not** touched by this migration — confirmed by reading the SQL (only the
  RPC function is `create or replace`d). Authz model unchanged.

### K2 (Del 2 — lokal hull-telling) — PASS

- `HoleClient.tsx:330-338`: `useLiveQuery(() => localDb.scores.where('[gameId+userId]').equals([gameId, myUserId]).filter(r => r.strokes != null).count())` — counts the player's own non-null local scores across **all 18 holes** (compound index, no hole filter), exactly as claimed.
- The `[gameId+userId]` compound index is **real**: `db.ts:37` declares `scores: 'id, gameId, [gameId+userId], [gameId+holeNumber]'`. (The index lives on the `scores` table, which is what the query targets — correct.)
- `HoleClient.tsx:603`: `const roundComplete = Math.max(myCompletedHoles, localCompletedHoles ?? 0) >= 18;`
  - **Cannot hide a CTA that used to show**: `Math.max` keeps the server count as a floor, so a Dexie that
    holds fewer rows than the server (fresh device mid-tournament) never under-counts → no false-negative.
  - **No false-positive**: reaching 18 requires 18 of the player's own non-null entered strokes — precisely
    the condition under which the submit CTA *should* appear.
- 22/22 HoleClient tests green; the change is purely additive (no schema/RPC change).

### K3 (Del 1b + Del 3 — drain før levering) — PASS

- `SubmitForm.tsx:35-40`: `pendingCount = useLiveQuery(() => localDb.syncQueue.filter(i => i.abandonedAt == null).count())`; `syncing = pendingCount > 0`. **Abandoned items are excluded** from the block-count, so a quarantined item can never trap the player on the submit screen forever.
- **Both block layers present**: button `disabled={syncing}` (line 83) AND `onSubmit` guard `if (syncing) { event.preventDefault(); return; }` (lines 66-69). Belt-and-suspenders against a programmatic submit.
- Mount-drain: `useEffect(() => { void drainQueue(); }, [])` (lines 44-46) — Del 1b/3, fires on every `/submit` arrival (including the re-submit-after-reject path).
- `router.refresh()` **cannot loop**: the `wasPending` ref (lines 51-59) only refreshes on the `pending → empty` *transition*, immediately resets the flag to `false`, and a refresh never re-adds queue items → `syncing` stays `false`, effect won't re-fire.
- i18n key `game.submit.syncingPending` present in **both** catalogs (parity confirmed): `no.json` = "Lagrer slag …", `en.json` = "Saving strokes …".

### K4 (Del 4 — nett-trygg attempt-cap) — PASS (scrutinized hardest)

**A network/offline error can NEVER abandon an item, regardless of attempt count.** Traced directly:

- `isPermanentSyncError` (`classifyError.ts:41-55`): lowercases the raw error, returns `false` for jwt/expired/401/unauthorized, then `true` only if it matches a `PERMANENT_PATTERNS` entry (permission/forbidden/row-level/violates/constraint/invalid input/not-null/403/400/422).
  - `"TypeError: Load failed"` → no permanent pattern → **false** ✓
  - `"TypeError: Failed to fetch"` → no permanent pattern → **false** ✓
  - `"NetworkError when attempting to fetch resource."` → no permanent pattern → **false** ✓
  - Unknown `"something weird happened"` / `null` / `""` → **false** (safe default: rather loop than lose) ✓
- `syncRetryDecision` (`classifyError.ts:66-77`): returns `'abandon'` **only** when `isPermanentSyncError(...) && nextAttempt >= max`. BOTH conditions required — a transient error short-circuits to `'retry'` no matter how high `attemptCount` is. The test `'NEVER abandons a transient error, no matter how many attempts'` asserts exactly this at `attemptCount: 9999`.
- `syncWorker.ts:49-76`: the `decision === 'abandon'` branch sets `abandonedAt`; otherwise it just bumps `attemptCount` + `lastError` and keeps retrying. The abandon branch is the *only* place `abandonedAt` is written, and it's gated on `syncRetryDecision`.
- **Abandoned items skipped without head-of-line blocking**: `syncWorker.ts:30` `if (item.abandonedAt) continue;` — the loop continues past them, no infinite re-fire.
- **Still surfaced**: `SyncBanner.tsx:81-83,113-115` splits `abandoned` vs `active`, shows a distinct danger-toned "Kunne ikke lagre N slag. Kontakt arrangøren." and `showRetry = active.length > 0` hides the retry button when nothing is retryable. A lost stroke is never silent.
- 24 classifyError tests green covering all three real offline strings + auth + rate-limit + unknown + the permanent set.

### K5 (Gates grønne) — PASS

All gates re-run fresh above: tsc exit 0, both targeted vitest suites green, build compiles with full PPR
route table and zero errors.

---

## Regressions / collateral — none found

- **`drainQueue` return-type change** (added `abandoned`): every caller uses `void drainQueue()`, `.then(...)`,
  or `await drainQueue()` for side-effects only — none destructure the return shape. Non-breaking. The new
  `abandoned` field is also returned from the early-exit paths (lines 13, 18) so the shape is consistent.
- **e2e `e2e/sync/offline-sync.spec.ts`** still logically holds: it uses its own in-page `drainQueueInPage`
  mirror (lines 164-219), independent of the production function, and asserts a single offline drain leaves
  the item queued with `attemptCount >= 1` + `lastError != null` (lines 309-312). In production a network
  error is classified non-permanent → never abandoned → item retained with bumped attemptCount. The asserted
  behavior matches; no contradiction introduced.
- **No exhaustive-switch / type breaks**: `tsc --noEmit` exit 0 and `npm run build` (which enforces the
  exhaustive `GameMode` switches + PPR) both pass. No `GameMode`-touching change in this diff.
- **RLS / authz**: migration only replaces the RPC body; `prosecdef = false` confirmed live → RLS still gates
  every write. The frozen no-op returns the existing row untouched (verified by the contract's roll-back probe
  and re-confirmed by reading the function body — no INSERT/UPDATE on the frozen branch).

## Risk notes (non-blocking)

- The `PERMANENT_PATTERNS` substring match is broad-but-conservative: a transient error whose message happens
  to contain e.g. "400" would be mis-classified as permanent. In practice transient errors (network/auth/rate)
  carry the strings the classifier explicitly excludes first, and even a mis-classification needs **5** failed
  attempts before abandoning. Given the owner's "never drop on lost signal" priority, the design correctly errs
  toward retry; this residual edge is acceptable and well below the bar for blocking.
- The actual data-loss elimination depends on Del 1b + Del 2 (drain-before-deliver + local hole count) firing
  on the client; the RPC no-op (Del 1a) only covers the sub-second post-drain race. This layering is exactly
  what the contract states, and all three layers are present and verified.

## UI verification note

The offline-sync behaviors (drain-before-submit, CTA-reveal-while-offline, abandon-surfacing) require an
authenticated active-game session plus offline network simulation. That is not feasible to drive here without
live credentials and seeded game state, and the contract deliberately excludes an offline e2e as too flaky.
I did **not** fabricate a browser check. Verification rests on: live-prod SQL (K1), the Type-A classifier
suite (K4), the HoleClient render suite (K2), full code-reading of all touch-points, and the green build —
which is the correct evidence basis for this change.

---

**Bottom line:** Solid. The fix is correctly layered, the network-safe-abandon invariant holds under
adversarial tracing, RLS/security model is unchanged on live prod, catalog parity is intact, and every gate
is green. ACCEPT.
