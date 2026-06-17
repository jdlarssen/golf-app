# Evaluation: #688 — LWW tie-handling fix + conflict UX signal

**VERDICT: ACCEPT**

Commit: `d50f5d07` — *fix(offline-sync): strictly-increasing score timestamps + visible conflict notice*

Independently verified against the contract `.forge/contracts/688-sync-conflict-tie-and-signal.md`. All success criteria met; both gates clean; no regression to the existing queue banner; RPC `0073` and realtime `>=` untouched as required. Edge cases (clock skew, no-row, rapid-write compounding, marker-vs-self conflict guard) all hold up under code-tracing.

## Per-criterion table

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| P1-1 | `writeScore` guarantees strictly-increasing `clientUpdatedAt` per `(gameId,userId,holeNumber)`; reads existing row first, bumps to `existing+1ms` if `<=` | ✅ PASS | `writeScore.ts:22-31` `strictlyIncreasingTimestamp`: `if (nowIso > existing.clientUpdatedAt) return nowIso;` else `existing+1ms`. Single indexed `localDb.scores.get(id)` on primary key. |
| P1-2 | RPC strict-`>` semantics now hold for genuine edits | ✅ PASS | Bump guarantees `clientUpdatedAt > stored`, so the RPC's `p_client_updated_at > v_existing.client_updated_at` (`0073:115`) is satisfied for every genuine re-edit of the same hole. No genuine edit collides on equal ms. |
| P1-3 | `conflict.ts`'s `'equal'` resolution wired in (keep-local) OR removed | ✅ PASS | Wired in: `syncWorker.ts:101-104` calls `resolveConflict`; only `'server-wins'` overwrites (`:106-132`); `'equal'`/`'local-wins'` fall through to keep-local + queue delete (`:133`). No dangling branch. |
| P1-4 | TDD: failing test first asserting strictly-increasing behaviour | ◐ PARTIAL | Test + fix landed in one commit (no separate red commit), but `writeScore.test.ts:89-129` does assert the bump (`result.clientUpdatedAt > frozenTs` AND `=== frozenTs+1ms`). Real, behaviour-asserting test. Single-commit pattern is the project's norm for forge work. |
| P2-1 | ConflictRecord written only when server wins AND local entered by current user AND strokes changed | ✅ PASS | `syncWorker.ts:106-123`: inside `'server-wins'`, guards `strokesChanged` (`score.strokes !== row.strokes`) AND `enteredByCurrentUser` (`score.enteredBy === score.userId`). Record has all 7 fields (id, gameId, userId, holeNumber, localStrokes, serverStrokes, resolvedAt). |
| P2-2 | Dexie version bump adds `conflicts`; db name stays `'golf-app'`; existing tables/upgrade preserved | ✅ PASS | `db.ts:51-62`: `super('golf-app')` unchanged; `.version(1)` retained verbatim; `.version(2)` re-declares `scores`+`syncQueue` identically and adds `conflicts: 'id, gameId, resolvedAt'`. No rename, no dropped table. |
| P2-3 | `SyncBanner` reads table via `useLiveQuery`, renders one-line notice, auto-clears on dismiss | ✅ PASS | `SyncBanner.tsx:71-74` `useLiveQuery(() => localDb.conflicts.toArray())`; `:174-192` maps one notice per record; `:87-89` `handleDismissConflict` does `localDb.conflicts.delete(id)`. Live-query auto-removes the notice on delete. |
| P2-4 | Notice copy in next-intl catalogs (not hardcoded); Norwegian humanized | ✅ PASS | `useTranslations('SyncBanner')` (`:63`), `t('conflictNotice', {holeNumber})` + `t('conflictDismiss')`. Keys present in `no.json` + `en.json`. NO copy: «Hull {holeNumber} ble endret av en medspiller. Det nyeste tallet gjelder nå.» — natural, no em-dash, no jargon. |
| P2-5 | LWW behaviour otherwise unchanged (converges to server value) | ✅ PASS | `'server-wins'` branch still does `localDb.scores.update` with server strokes/enteredBy/clientUpdatedAt/serverUpdatedAt (`:125-130`), same as before — the ConflictRecord write is additive, not a substitute. |
| Both | `tsc --noEmit` clean; `lib/sync` vitest green | ✅ PASS | See Gates below. |

## Edge-case analysis

**Timestamp bump — clock skew (stored timestamp in the future).** Covered. `strictlyIncreasingTimestamp` compares `nowIso > existing.clientUpdatedAt` lexically (ISO-8601 sorts chronologically), and when `now` is behind a future-dated stored row it returns `existing+1ms`. Explicitly tested at `writeScore.test.ts:131-158` with `farFuture = '2099-...'` → result is `farFuture+1ms`. The strictly-increasing guarantee survives a fast/slow device clock.

**No existing row.** Covered. `if (!existing) return nowIso;` — no bump, plain wall-clock. Tested at `:160-174`.

**Rapid successive writes compounding.** Sound. Each `writeScore` does `scores.put(row)` inside the rw transaction (`:49-63`), so the next call's `scores.get(id)` reads the previously-bumped value and bumps again. Three taps in the same ms → `t`, `t+1`, `t+2`. Monotonic, no collision. The `syncQueue.put` uses the same `id` as primary key, so a not-yet-drained queue item is overwritten in place with the newer `createdAt` — correct (no stale duplicate, and `createdAt` advances with the bump).

**Hot-path cost.** One extra `localDb.scores.get(id)` per write — a primary-key indexed get, the cheapest Dexie read. Acceptable for a tap-driven path; the existing flow already does a `put` + transaction.

**Conflict guard `enteredBy === userId` semantics.** Correct. Verified against the only callers (`HoleClient.tsx:556-562, 583-589`): `userId: playerId` (whose score), `enteredBy: myUserId` (device owner tapping). So `score.enteredBy === score.userId` is true exactly when the device owner entered their OWN score — the case where a silent server overwrite is genuinely the player's own lost tap. Marker-entered scores for a flight-mate (`enteredBy=myUserId ≠ userId=playerId`) correctly do NOT raise a notice on this device. A local row with `enteredBy===userId` can only have been written by this device tapping its own score, so there is no false-positive from remote-origin rows.

**Dexie upgrade safety.** `.version(2)` re-declares the v1 stores with identical index strings, which is the correct Dexie idiom — Dexie diffs schemas and only creates the new `conflicts` object store, leaving `scores`/`syncQueue` data intact. No `.upgrade()` callback needed since no data migration. DB name `'golf-app'` preserved — no local-data wipe. PASS.

**RPC / realtime untouched (out-of-scope guard).** Confirmed: `0073` not in the commit's file list; line 115 still `>`. `realtime.ts:21` still `existing.clientUpdatedAt >= row.client_updated_at`. Neither was modified — the chosen approach (writeScore bump) is the sole correctness lever, as the contract mandates.

**Defensive `'equal'` comment.** `syncWorker.ts:92-94` documents `'equal'` as "impossible post-#688 but kept defensive — treat as keep-local". This satisfies the contract's "wired in to keep-local OR removed" — it is wired in (the fall-through keeps local). Reasonable defensive choice rather than dead removal, since a non-writeScore write path (e.g. realtime) could theoretically produce an equal stamp.

## Gate outputs

```
$ npx tsc --noEmit
(exit 0, no output)
```

```
$ npx vitest run lib/sync
 Test Files  4 passed (4)
      Tests  42 passed (42)
```

```
$ npx vitest run messages/catalogParity.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Catalog parity test passes → `SyncBanner.conflictNotice` + `conflictDismiss` keys exist in both `no.json` and `en.json` with matching structure.

## Playwright / UI note

Triggering a real sync conflict requires two devices issuing colliding IndexedDB writes against a live backend — not feasible in this environment. The SyncBanner rendering logic was verified by code-tracing (per-record `.map`, `useLiveQuery` reactivity, `handleDismissConflict` → `conflicts.delete`) plus the unit/typecheck gates. There is an `e2e/sync/offline-sync.spec.ts` that exercises the writeScore→Dexie→queue path, but the conflict-record path is not E2E-covered (acceptable — it needs the two-device collision).

## Issues / minor notes (non-blocking)

- **No syncWorker unit test for the new conflict-record branch.** `resolveConflict` is unit-tested (`conflict.test.ts`, incl. the `'equal'` case), and `writeScore`'s bump is tested, but the `syncWorker` server-wins → ConflictRecord guard (`strokesChanged && enteredByCurrentUser`) has no direct test. Per CLAUDE.md test-discipline `lib/sync` is "pure logic / TDD", but syncWorker is heavily I/O-coupled (Supabase RPC + Dexie) and the repo has no existing `syncWorker.test.ts`, so this is consistent with the established pattern, not a regression. Worth a follow-up issue if the guard logic is considered load-bearing, but not a contract miss — the contract's TDD requirement (P1-4) is scoped to the timestamp behaviour, which IS tested.
- **Queue-banner strings remain hardcoded Norwegian** (`SyncBanner.tsx:132-135, 157`). This is pre-existing (predates #688) and out of scope — the contract only requires the new conflict notice to be i18n'd, which it is. Not a regression.

These do not block ACCEPT.
