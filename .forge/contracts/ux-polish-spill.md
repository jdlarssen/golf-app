# Contract: ux/spill — Play-round + PWA-install UX polish (6 issues)

Worktree: `.claude/worktrees/ux-polish-spill` · Branch: `claude/ux-polish-spill` (off origin/main @ ee34b5fd)
Parent: see `.forge/contracts/ux-polish-set2.md` for common rules (npm install, hooks,
atomic-commit-per-issue, version-bump+CHANGELOG, humanizer, gate-per-file, one PR).

## Dependencies
None. Source files disjoint from set 1 and from ux/liga. Only shared files:
`messages/no.json`, `messages/en.json`, `package.json`, `CHANGELOG.md`.

## File boundaries
ONLY touch: `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx`,
`components/hole/SyncStatusLine.tsx` (+`.test.tsx`),
`components/hole/SpecificValueSheet.tsx` (+`.test.tsx`),
`components/hole/ScoreCard.tsx`, `lib/sync/syncWorker.ts`,
`app/[locale]/games/[id]/leaderboard/LeaderboardRealtime.tsx`,
`app/[locale]/games/[id]/leaderboard/PreRoundLeaderboard.tsx`,
`components/pwa/InstallBanner.tsx`, `components/pwa/InstallInstructionsModal.tsx`,
the 4 shared files, and co-located tests. Several issues touch the SAME file
(`HoleClient.tsx`: #744/#754/#770; `SyncStatusLine.tsx`: #744/#754; `InstallBanner.tsx`:
#749/#770) — that's fine, they're sequential commits in ONE branch. Follow the order
below so each commit builds cleanly on the previous.

## Recommended build order (atomic commit per issue)
`#745` → `#769` → `#749` → `#770` → `#744` → `#754`
(isolated files first; #749 before #770 since both edit InstallBanner; #744 before
#754 since #754 extends the same SyncStatusLine visibility predicate.)

---

## #745 — Subscribe to UPDATE events so live board catches score corrections  `fix(leaderboard)`
**Problem:** The live leaderboard only subscribes to `INSERT` on `scores`. A score
CORRECTION is an UPDATE (`upsert_score_if_newer`) and is never caught — a spectator's
numbers stay wrong until the next hole INSERT refreshes everything.

**`LeaderboardRealtime.tsx:67-80`** currently chains one `.on('postgres_changes',
{event:'INSERT', table:'scores', filter:game_id}, scheduleRefresh)`. **Add a second
`.on(...)` for `event:'UPDATE'`** on the same table/filter, reusing the SAME
`scheduleRefresh` (the 300ms debounce already exists, lines 61-65):
```ts
channel
  .on('postgres_changes', { event: 'INSERT', schema:'public', table:'scores', filter:`game_id=eq.${resolvedGameId}` }, scheduleRefresh)
  .on('postgres_changes', { event: 'UPDATE', schema:'public', table:'scores', filter:`game_id=eq.${resolvedGameId}` }, scheduleRefresh)
```

**`PreRoundLeaderboard.tsx` (component `PreRoundLeaderboardRealtime`, lines 26-48):**
currently chains `scores` INSERT + `games` UPDATE. **Add a `scores` UPDATE `.on(...)`**
(tied to scores, NOT games — the games-UPDATE stays for the reveal/status flip),
handler `() => router.refresh()` to match the existing plain handlers in this file:
```ts
.on('postgres_changes', { event:'UPDATE', schema:'public', table:'scores', filter:`game_id=eq.${gameId}` }, () => router.refresh())
```
Result: 3 subscriptions (scores INSERT, scores UPDATE, games UPDATE).

Update the JSDoc in both files to mention UPDATE catches corrections. `scores` has
REPLICA IDENTITY FULL (0006) and is in the realtime publication (0005), so UPDATE
events are deliverable — no migration needed.

**Gate:** tsc + any co-located tests (the format-view tests mock `useRouter`; adding
`.on` won't break them) + lint. Bump patch + CHANGELOG.

---

## #769 — Expand quick-pick sheet with par+1/par+2  `fix(play-round)` (enhancement)
**Problem:** `SpecificValueSheet` offers only `[par-2, par-1, par]` — all ≤ par. The
most common deviation score (bogey/double) needs repeated +-stepper taps one-handed.

**`SpecificValueSheet.tsx:101`** currently:
```ts
const values: number[] = [par - 2, par - 1, par].filter((v) => v >= 1);
```
**Fix:** extend to include par+1 and par+2:
```ts
const values: number[] = [par - 2, par - 1, par, par + 1, par + 2]
  .filter((v) => v >= 1 && v <= MAX_STROKES);
```
- `MAX_STROKES = 15` is defined module-locally in `ScoreCard.tsx`. Either import it
  (preferred if exported) or define the same const locally in SpecificValueSheet with
  a comment. par+2 won't exceed 15 for normal pars, but keep the clamp for safety.
- **Decision (owner gray-area):** upper bound is **par+2**, matching the issue title
  "par+1/par+2" — NOT the issue body's parenthetical "par-2..par+5". Five value
  buttons + the X button = 6 buttons.
- **Grid:** change `gridTemplateColumns` (line 52) from `'repeat(4, 1fr)'` to
  `'repeat(3, 1fr)'` so 6 buttons form a clean 2×3 layout. Tap targets stay ≥44px
  (buttonStyle padding `14px 0` + fontSize 22 ≈ 50px tall — keep it).
- Keep the X (clear) button as the last cell. Update the comment at lines 99-100
  ("only under-par + par...") to reflect the new range.

**Update `SpecificValueSheet.test.tsx`** (it locks exact button arrays):
- par=4 → `['2','3','4','5','6','X']`
- par=3 → `['1','2','3','4','5','X']`
- par=2 → `['1','2','3','4','X']` (par-2=0 filtered out)

No i18n change (buttons are numbers). `writeScore` path unchanged.

**Gate:** tsc + `SpecificValueSheet.test.tsx` (updated) + lint. Bump patch + CHANGELOG.

---

## #749 — Localize InstallBanner AND InstallInstructionsModal  `fix(nav-shell)` (i18n)
**Problem:** `InstallBanner` (most visible banner on Home) and
`InstallInstructionsModal` are hardcoded Norwegian; an English-locale user sees
Norwegian and a fully-Norwegian instructions modal. Breaks the language choice.

Both are `'use client'` → use `useTranslations(...)` directly.

**`InstallBanner.tsx`** hardcoded strings: "Installer Tørny som app" (~69),
"Raskere åpning, og du kan registrere slag uten dekning." (~72), "Installer" (~81),
"✕" / close aria (~89). Add `useTranslations('installBanner')`; create namespace:
```
installBanner: { title, body, install, closeAria }
```
Keep "Tørny" verbatim in the title. (The "✕" glyph can stay literal; localize its
`aria-label`/title via `closeAria`.)

**`InstallInstructionsModal.tsx`** hardcoded strings (title variants + 3 iOS-Safari
steps + ios-other text + unsupported text + close aria). Add
`useTranslations('installInstructions')`; create namespace covering each variant:
```
installInstructions: {
  titleSafari, titleOtherBrowser,
  iosStep1, iosStep2, iosStep3,
  iosOtherDescription, iosOtherInstructions,
  unsupportedDescription, unsupportedInstructions,
  closeAria
}
```
(Match the actual variant set in the component — read it and mirror exactly.)

**Copy:** the Norwegian values ARE the existing prod strings — copy them verbatim into
`no.json` (light humanizer check only). Author clean idiomatic **English** twins in
`en.json`. catalogParity must stay green (no/en keys identical).

**Gate:** tsc + i18n parity + lint. Bump patch + CHANGELOG. (Do this BEFORE #770,
which restyles the same InstallBanner buttons.)

---

## #770 — Bump InstallBanner buttons + hole-header nav to 44px  `fix(tap-targets)`
**Problem:** Sub-44px tap targets violate the ≥44px rule: InstallBanner "Installer"
(~28px) and "✕" (~22px) sit 4px apart as opposite actions; the hole-header back-arrow
(32px) and leaderboard icon (34px) are primary nav mid-round.

**(a) `InstallBanner.tsx`:** add `min-h-11` to the "Installer" button; add
`min-h-11 min-w-11` + flex-center to the "✕" button; widen the container `gap-1` →
`gap-2`. (Tailwind `h-11`/`w-11` = 44px.)

**(b) `HoleClient.tsx`:** the back link (`backLinkStyle`, ~line 178-191) is currently
`minWidth:32, minHeight:32, marginLeft:-6, padding:6`; the leaderboard icon link
(`leaderboardIconLinkStyle`, ~line 193-203) is `width:34, height:34, marginRight:-6`.
Bump BOTH to `minWidth:44, minHeight:44` (back) / `width:44, height:44`
(leaderboard), **keeping the negative -6 margins** so the visual footprint is
unchanged — only the hit area grows. Pure style change.

No i18n change. **Gate:** tsc + lint. Bump patch + CHANGELOG.

---

## #744 — Hide "Lagret nylig" status line on empty hole before first tap  `fix(offline-sync)`
**Problem:** On mount, `SyncStatusLine` shows a green dot + "Lagret nylig" on every
empty hole (the `key={holeNumber}` remount resets state). A false success receipt —
the app says "Lagret" before the player has entered anything. On a flaky course
connection it undermines trust in the real receipts.

**`HoleClient.tsx:813`** currently renders `<SyncStatusLine syncing={syncing}
savedAt={savedAt} />` unconditionally. `syncing`/`savedAt` are state (lines 519-520);
`pulseSync()` (529-542) sets them on a real write.

**Fix:** render `SyncStatusLine` only when there has been real activity:
```tsx
{(syncing || savedAt.length > 0) && (
  <SyncStatusLine syncing={syncing} savedAt={savedAt} />
)}
```
The line now first appears as a genuine receipt after the first tap.

**Test (Type C, ONE render test):** add coverage that the sync line is hidden when
`syncing===false && savedAt===''`. Check whether `HoleClient.test.tsx` exists. If
HoleClient is impractical to mount in isolation (heavy Dexie/realtime deps), assert
the predicate at the smallest honest unit and note the deviation in the closing
comment — do NOT build a brittle mega-mock. (`SyncStatusLine` itself can't test the
hide, since the hide lives in the parent — so this is a HoleClient-level concern.)

**Gate:** tsc + co-located test + lint. Bump patch + CHANGELOG.

---

## #754 — Third "Venter på nett" state in SyncStatusLine (yellow)  `fix(offline-sync)` (enhancement)
**Problem:** `pulseSync()` goes green after 700ms showing "Lagret · 14:32" regardless
of whether `drainQueue` reached the server. The green dot only means a local Dexie
write, but reads as "synced to server". A player on dead network sees green and
trusts it.

### ⚠️ Do NOT change the `syncing`/`savedAt` semantics — 3 locked tests must stay green
`SyncStatusLine.test.tsx` locks: (1) `syncing=true` → "Sender…" + amber dot;
(2) `syncing=false, savedAt='14:32'` → "Lagret · 14:32" + green dot;
(3) `syncing=false, savedAt=''` → "Lagret nylig" + green dot. These tests pass no
`pendingCount`, so it must DEFAULT to 0/absent and leave those three paths untouched.

**`SyncStatusLine.tsx`** — add an optional prop and a third state with this precedence:
```ts
export interface SyncStatusLineProps {
  syncing: boolean;
  savedAt: string;
  pendingCount?: number; // unsynced queue items; 0/undefined = nothing waiting
}
```
Precedence (insert the yellow state BETWEEN syncing and savedAt):
1. `syncing` → amber (`var(--warning)`) + `t('sending')`  ← locked
2. `(pendingCount ?? 0) > 0` → **yellow** + `t('waitingForNetwork')`  ← NEW
3. `savedAt.length > 0` → green (`var(--success)`) + `t('savedAt', {time})`  ← locked
4. else → green + `t('savedRecently')`  ← locked

For the yellow dot color use a token distinct from the amber `--warning` if one
exists (e.g. a `--score-over*`/accent yellow); if none is obviously right, reuse
`--warning` — the text carries the meaning and the 3 locked tests only assert the
warning/success paths, so the new path is free. Namespace is `holes.sync`.

**Also (`holes.sync.sending`):** the issue notes "endre verb fra «synker» (leses som
sinks)". Read the current `holes.sync.sending` value in `no.json`; if it is "Synker…"
change it to "Sender…" (the rendered component already calls `t('sending')`). If it's
already "Sender…", no change.

**Wire `pendingCount` in `HoleClient.tsx`** via a live Dexie count (mirror SyncBanner,
which does `useLiveQuery(() => localDb.syncQueue.toArray(), [])`). "Pending" =
non-abandoned queue items (drainQueue removes pushed items; abandoned items have
`abandonedAt` set — `lib/sync/db.ts:27`):
```ts
const queue = useLiveQuery(() => localDb.syncQueue.toArray(), []);
const pendingCount = (queue ?? []).filter((i) => i.abandonedAt == null).length;
```
Pass `pendingCount={pendingCount}` to `<SyncStatusLine .../>`. **Update the #744
visibility predicate** to also keep showing the line when there's a real backlog:
`{(syncing || savedAt.length > 0 || pendingCount > 0) && <SyncStatusLine ... />}`.
(Green "saved on a blank hole" stays suppressed since savedAt='' on a fresh remount;
the honest yellow "venter" can still appear if items are genuinely queued.)

**Norwegian copy (run humanizer):** "Lagret på telefonen · sendes når nettet er
tilbake". EN twin: e.g. "Saved on your phone · sends when you're back online". Key:
`holes.sync.waitingForNetwork` in both catalogs.

**Tests:** add ONE new SyncStatusLine test for the yellow state
(`pendingCount > 0, syncing=false` → "Venter…"/the new copy + yellow dot). Keep the
3 locked tests UNCHANGED and green.

**Gate:** tsc + `SyncStatusLine.test.tsx` (3 locked + 1 new) + i18n parity + lint.
Bump patch + CHANGELOG.

---

## Closing (for the coordinator, not the builder)
The coordinator (main session) writes the mandatory per-issue closing comments and
opens the PR. Builder: land clean atomic commits + leave the branch ready.
