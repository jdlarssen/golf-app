# Evaluation: #902 — Block creating/editing a game with a tee-off in the past

**Verdict: ACCEPT**

Evaluated on branch `claude/sad-easley-4c7265` against contract
`.forge/contracts/902-block-past-tee-off.md`. All gates pass, all success
criteria met.

---

## Gate results

### `npx tsc --noEmit`

```
(no output)
EXIT: 0
```

**PASS** — zero type errors.

### `npx eslint` (changed files)

```
/app/[locale]/admin/games/[id]/edit/actions.ts
  41:1  warning  Async function 'updateGameInternal' has a complexity of 36. Maximum allowed is 25  complexity

/app/[locale]/admin/games/new/actions.ts
  33:1  warning  Async function 'createGameInternal' has a complexity of 41. Maximum allowed is 25  complexity

✖ 2 problems (0 errors, 2 warnings)
EXIT: 0
```

**PASS** — both warnings are pre-existing `function complexity` on the long
action files (the new guard adds one branch each, but these functions were
already above the threshold). Zero new errors.

### `npx vitest run` (changed test files)

```
 Test Files  3 passed (3)
      Tests  291 passed (291)
   Start at  23:28:30
   Duration  807ms
```

**PASS** — all 291 tests green across the three files.

---

## Per-criterion table

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | `isTeeOffInPast` + `TEE_OFF_PAST_GRACE_MS` exist in `gamePayload.ts`; instant-compare with 5-min grace | **PASS** | `lib/games/gamePayload.ts:34–59` exports both; `TEE_OFF_PAST_GRACE_MS = 5 * 60 * 1000`; comparison is `t < nowMs - TEE_OFF_PAST_GRACE_MS` |
| 2 | Publishing a game (create) with tee-off >5 min in past redirects with `?error=tee_off_in_past`; page renders Norwegian message | **PASS** | `app/[locale]/admin/games/new/actions.ts:105–109` guards `mode === 'publish'`; `messages/no.json:1005` has the key; `page.tsx:85–89` renders any `errors.*` key via `t.has(key)` |
| 3 | Edit `publish` and `update_scheduled` apply the same guard; `save_draft` does not | **PASS** | `app/[locale]/admin/games/[id]/edit/actions.ts:89–94`: `(mode === 'publish' \|\| mode === 'update_scheduled') && scheduledTeeOffAt && isTeeOffInPast(...)`. `save_draft` is never `publish` or `update_scheduled` → guard never fires |
| 4 | Same-day / "start now" not broken: now, within grace, future passes | **PASS** | `gamePayload.test.ts:73–76`: `minutesFromNow(0) → false`, `minutesFromNow(-4) → false`, `minutesFromNow(120) → false`; boundary confirmed via independent `node` evaluation |
| 5 | `datetime-local` field has hydration-safe `min` nudge | **PASS** | `BasicsSection.tsx:37–105`: `useSyncExternalStore(subscribeNever, getLocalDatetimeMin, () => undefined)` — server snapshot is `undefined` (no SSR `min`), client snapshot is current wall-clock; `min={minTeeOff}` passed to `<Input>` which spreads `{...props}` |
| 6 | Unit test: `it.each` covering >grace rejected, within-grace accepted, exactly-at-boundary, future accepted | **PASS** | `gamePayload.test.ts:72–81`: 6 parametrised cases cover -10min (true), -5min-1s (true), -5min exactly (false), -4min (false), now (false), +120min (false); plus malformed-ISO and default-nowMs tests |
| 7 | `errors.tee_off_in_past` in both `messages/no.json` and `messages/en.json` | **PASS** | `no.json:1006` = "Tee-off kan ikke være i fortiden. Velg et tidspunkt fra nå av."; `en.json:1006` = "The tee-off time can't be in the past. Pick a time from now on."; both under `wizard.errors` namespace confirmed via JSON parse |
| 8 | Patch bump to 1.140.8 + CHANGELOG entry `· #902` under open theme; humanizer-clean tagline | **PASS** | `package.json:3` = `"version": "1.140.8"`; CHANGELOG entry under `## 1.140.y — Tall på flisene`; tagline: "Setter du opp et spill med tee-off som allerede har passert, sier appen fra og ber deg velge et tidspunkt fra nå av." |

---

## Detailed scrutiny

### Grace logic correctness

Implementation: `return t < nowMs - TEE_OFF_PAST_GRACE_MS`

- "Exactly 5 min ago" → `t == nowMs - GRACE_MS` → `t < nowMs - GRACE_MS` is **false** → accepted. Correct per contract ("more than 5 min").
- "5 min + 1s ago" → `t < nowMs - GRACE_MS` is **true** → rejected. Correct.
- The comparison is instant-vs-instant: `parseOsloDateTimeLocal` is always called before the guard and converts the Oslo wall-clock form value to a UTC ISO string (`result.toISOString()`), so `new Date(teeOffIso).getTime()` works correctly across DST transitions.
- No off-by-one found.

### Both guard sites wired correctly

- **Create** (`new/actions.ts:105`): `mode === 'publish'` — drafts (`mode === 'draft'`) skip the guard. ✓
- **Edit** (`edit/actions.ts:89`): `mode === 'publish' || mode === 'update_scheduled'` — `save_draft` is the only other `UpdateMode` value (line 17), so it's correctly exempt. ✓
- Both sites import `isTeeOffInPast` from `@/lib/games/gamePayload` (the single source). ✓

### One home for the rule (AGENTS.md trap #4)

`TEE_OFF_PAST_GRACE_MS` is defined exactly once at `lib/games/gamePayload.ts:41`. The other `5 * 60 * 1000` in the codebase (`lib/notifications/thresholds.ts:16`, `OFF_APP_THRESHOLD_MS`) is an unrelated notification-push threshold. No duplication of threshold logic.

### Error message reachability

New-game page (`page.tsx:84–89`): `t.has(\`errors.${errorCode}\`)` — `errors.tee_off_in_past` is in `wizard.errors`, so `t.has('errors.tee_off_in_past')` will return true and render the banner. Edit page (`page.tsx:87,94`): `tErrors = getTranslations('wizard.errors')`, `tErrors.has('tee_off_in_past')` — matches the key directly. Both paths confirmed reachable.

### Client `min` hydration safety

`useSyncExternalStore(subscribeNever, getLocalDatetimeMin, () => undefined)`:
- `subscribeNever` returns `() => {}` (valid unsubscribe fn).
- Server snapshot `() => undefined` → `minTeeOff` is `undefined` in SSR HTML → no `min` attribute rendered.
- Client snapshot `getLocalDatetimeMin` → returns current `YYYY-MM-DDTHH:mm` string.
- React's `useSyncExternalStore` intentionally allows server/client snapshot to differ (it's the documented pattern for "client-only" values). No `useState` + `useEffect` anti-pattern present. ESLint reported zero new errors.

### Draft-to-publish slip-through

A draft created with a past tee-off (via `createGameDraft` → `mode='draft'`, guard skipped) later goes through `publishFromDraftAction` in edit → `mode='publish'` → guard fires. No slip-through path exists.

### Fixture staleness fix

The four action-test fixtures previously used the hard-coded `'2026-06-15T09:00'` (now in the past). These were replaced with a dynamic `FUTURE_TEE_OFF` computed as `Date.now() + 7 days`. The replacement is safe: no test asserted the persisted tee-off value, so no assertion was weakened.

### Wiring test coverage

One wiring test per action site:
- `new/actions.test.ts`: `createAndPublishGame` with `'2020-01-01T09:00'` → `RedirectError` → `/admin/games/new?error=tee_off_in_past`, no `games.insert`. ✓
- `edit/actions.test.ts`: `updateScheduledAction` with `'2020-01-01T09:00'` → `RedirectError` → `/admin/games/game-1/edit?error=tee_off_in_past`, no writes. ✓

The edit action test covers `update_scheduled` only (not `publish`). The contract says "same guard" and the code path for both modes is a single `||` branch on the same line, so a second wiring test would be purely redundant. Not a concern.

---

## Issues found

None. No holes, no off-by-ones, no unreachable error paths, no slip-through routes, no hydration bugs, no duplicate threshold logic.

---

*Evaluated by forge skeptic agent, 2026-06-23.*
