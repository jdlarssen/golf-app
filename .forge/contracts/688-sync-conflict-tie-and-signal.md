# Contract: #688 — LWW tie-handling fix + conflict UX signal

## Context
Two parts of the offline-sync last-write-wins (LWW) path are inconsistent/silent.

**Part 1 — tie-handling disagreement (correctness).** `writeScore` stamps
`new Date().toISOString()` (ms resolution). The server RPC applies a write only on
strict `p_client_updated_at > existing` (`0073_..._.sql:115`), while realtime/catch-up
merges keep local on `>=` (`lib/sync/realtime.ts:21`, `RealtimeMount.tsx:27`). On an
identical-millisecond collision the RPC rejects, and `syncWorker` (`:55-64`) then
overwrites the local row with the server value — silently discarding the player's tap.
`lib/sync/conflict.ts` returns `'equal'` for ties but no caller uses it.

**Part 2 — silent overwrite (UX transparency).** In the server-wins branch
(`syncWorker.ts:55-64`) the local strokes are replaced and the queue item deleted with no
user-facing signal. `SyncBanner.tsx` only surfaces queue depth + transport errors. LWW is
intentional; the gap is purely the missing notice. P3.

Files: `lib/sync/writeScore.ts`, `lib/sync/syncWorker.ts`, `lib/sync/conflict.ts`,
`lib/sync/db.ts`, `components/sync/SyncBanner.tsx`.

## Success Criteria
### Part 1 (tie-handling)
- [ ] `writeScore` guarantees a strictly-increasing `clientUpdatedAt` per `(gameId, userId, holeNumber)`: read the existing Dexie row first and bump the new timestamp to `existing + 1ms` if it would be `<=` the stored value.
- [ ] The RPC's strict-`>` semantics now hold for all genuine user edits (no genuine edit collides on equal ms).
- [ ] `conflict.ts`'s `'equal'` resolution is either wired in to keep-local on the rejection path OR removed as dead code — no dangling unused branch.
- [ ] TDD: a failing test first (e.g. two writes that would collide on ms now strictly increase), then the fix.

### Part 2 (signal)
- [ ] When the server wins (`was_applied=false`) AND the local score was entered by the current user AND the strokes value actually changed, a lightweight conflict record is written to a Dexie `conflicts` table (gameId, userId, holeNumber, localStrokes, serverStrokes, resolvedAt).
- [ ] Dexie schema version is bumped to add the `conflicts` table — the database name stays `'golf-app'` (NEVER renamed), and existing tables/upgrade path are preserved.
- [ ] `SyncBanner.tsx` reads that table (e.g. `useLiveQuery`) and renders a one-line notice; it auto-clears on user dismiss/navigation.
- [ ] Notice copy lives in the next-intl message catalogs (no.json + en.json), not hardcoded; Norwegian run through the humanizer skill.
- [ ] Last-write-wins behaviour is otherwise UNCHANGED (data still converges to server value).

### Both
- [ ] `npx tsc --noEmit` clean; `lib/sync` co-located vitest green.

## Out of scope
- Changing the RPC's `>` to `>=` (the writeScore bump is the chosen approach; do not touch migration 0073).
- Any change to realtime/catch-up `>=` semantics.

## Gates
- `npx tsc --noEmit`
- `npx vitest run lib/sync`

## Notes
- `lib/sync` is "pure logic" → TDD discipline (test-first) per CLAUDE.md.
- Dexie DB name `'golf-app'` is historical — adding a table via a version upgrade is fine; renaming is forbidden.
