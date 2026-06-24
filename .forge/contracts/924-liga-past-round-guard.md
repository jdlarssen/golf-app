# Contract: #924 — Past-window guard on liga round creation (symmetry with #902)

Worktree: `.claude/worktrees/competent-babbage-7f80d0` · Branch: `claude/competent-babbage-7f80d0` (off origin/main)
Issue: [#924](https://github.com/jdlarssen/golf-app/issues/924) · `enhancement, area:admin` · follow-up to #902

## Premise correction (verified against code, owner-confirmed 2026-06-24)

The issue assumes liga rounds + cup matches share #902's "tee-off in the past via
`parseOsloDateTimeLocal`" pattern. **They don't** — verified by reading the code:

- **Cup has no tee-off field at all.** `createTournamentDraft` (`lib/cup/actions.ts`) stores
  name/teams/points/allowances, no date. `createCupMatchesFromPlan`
  (`app/[locale]/admin/cup/[id]/generer/actions.ts`) inserts `games` with `status:'scheduled'`
  and **never** `scheduled_tee_off_at`. The one cup path that *can* carry a tee-off is the manual
  single match via `/admin/games/new?intent=cup` → `createGameInternal`, which is **already
  #902-guarded**. → **Cup dropped from scope**; documented at close, no code.
- **Liga rounds use play windows (`opens_at`/`closes_at`), not a tee-off.** The #902 auto-start
  symptom doesn't apply (flight games start immediately via `startScheduledGame`, no countdown).
  The real footgun: creating a round whose window has **already closed** (`closes_at` past) →
  `startLeagueRoundFlight` returns `outside_window`, so nobody can ever play it. Almost always a
  mistyped year — the liga analog of #902's mistyped date.

**Owner decision (AskUserQuestion 2026-06-24):** drop cup; guard `addLeagueRound` +
`createLeagueDraft`; leave the edit/reopen paths alone.

## Decisions (locked)

1. **Block, not clamp** — server-side, with a clear Norwegian error (mirrors #902).
2. **Grace = 5 min, shared.** Reuse `isTeeOffInPast(iso, nowMs)` + `TEE_OFF_PAST_GRACE_MS` from
   `lib/games/gamePayload.ts` — one home for the rule (AGENTS.md trap #4). For liga we pass the
   round's window-close instant as the "playable-until" instant; a comment documents that.
3. **Server is authoritative** (AGENTS.md trap #3).
4. **`addLeagueRound`** (manual round add): reject when the new round's `closes_at` is >grace in
   the past → an already-closed round is unplayable.
5. **`createLeagueDraft`** (auto-generated rounds): reject only when the *entire* season is over —
   i.e. the **last** generated window's `closes_at` is >grace in the past. Mid-season setup (past
   start, **future** end) stays legal; only the last window matters. `custom` frequency generates
   no windows → no check (rounds get added later via the guarded `addLeagueRound`).
6. **Exempt the edit/reopen paths.** `updateLeagueRound` + `overrideRoundWindow` may legitimately
   touch past windows (`overrideRoundWindow` exists *to* reopen past windows). Add a one-line
   comment on `overrideRoundWindow` so nobody "fixes" it later.

## File boundaries

ONLY touch:
- `lib/league/actions.ts` — `addLeagueRound` guard; `createLeagueDraft` guard (move `generateRounds`
  above the leagues insert and check the last window); one-line exempt-comment on `overrideRoundWindow`.
- `lib/league/actions.test.ts` — per-flow guard tests.
- `app/[locale]/admin/liga/[id]/LigaAddRound.tsx` — add `round_in_past` to the recognized error set.
- `app/[locale]/admin/liga/new/CreateLigaForm.tsx` — add `season_over` to the recognized error set.
- `messages/no.json` + `messages/en.json` — `liga.addRound.errors.round_in_past`,
  `liga.create.errors.season_over`.
- `package.json` (+ `package-lock.json`) + `CHANGELOG.md` — patch bump 1.141.2 + entry.

Do NOT touch: any migration, RLS, scoring, cup code, `updateLeagueRound`/`overrideRoundWindow`
behavior, `isTeeOffInPast`'s signature (reuse as-is — renaming would churn #902/#928 call sites).

## Implementation notes

- **`addLeagueRound`** (`lib/league/actions.ts` ~L290): after the existing
  `if (new Date(closesAt) <= new Date(opensAt)) return { error: 'window' }`, add:
  ```ts
  // #924: a round whose play window has already closed is unplayable
  // (startLeagueRoundFlight → outside_window). Treat the window-close as the
  // "playable-until" instant; reuse the #902 grace so liga + games agree.
  if (isTeeOffInPast(closesAt)) return { error: 'round_in_past' };
  ```
- **`createLeagueDraft`** (`lib/league/actions.ts` ~L142): hoist
  `const windows = generateRounds(seasonStart, seasonEnd, frequency);` above the `leagues.insert`,
  then before the insert:
  ```ts
  // #924: block creating a league whose entire season is already over (last
  // generated window closed >grace in the past) — every round would be
  // unplayable. Mid-season setup (past start, future end) stays legal: only the
  // last window matters. 'custom' → no windows → no check (rounds added later
  // via the guarded addLeagueRound). Reject before any insert → no rollback.
  if (windows.length > 0 && isTeeOffInPast(windows[windows.length - 1].closes_at)) {
    return { error: 'season_over' };
  }
  ```
  Keep the existing `if (windows.length > 0) { ...insert rounds... }` block (now reuses the hoisted
  `windows`). Import `isTeeOffInPast` alongside the existing `parseOsloDateTimeLocal` import.
- **`overrideRoundWindow`**: add a one-line comment — intentionally unguarded (it reopens past windows).
- **i18n** — NO: `round_in_past` = "Fristen har allerede passert. Velg en frist fram i tid.";
  `season_over` = "Sesongen er allerede over. Velg datoer som strekker seg fram i tid."
  EN: `round_in_past` = "That close date has already passed. Pick one in the future.";
  `season_over` = "The season has already ended. Pick dates that reach into the future."
  Run `humanizer` on the Norwegian strings + the CHANGELOG tagline before commit.
- **Surfacing components** — `LigaAddRound.tsx`: add `'round_in_past'` to the
  `['missing','window','not_found','insert_failed']` recognized tuple (both the `.includes` array
  and the cast union). `CreateLigaForm.tsx`: add `season_over: 1` to the recognized-codes object
  and the cast union (else it falls to `errors.unexpected` with a raw code).
- **Tests** — use drift-proof literal instants: far-past `2020-…` (always past), far-future
  `2099-…` (always future), so fixtures never expire. Mirror the existing `buildSupabaseMock` +
  `makeRedirectMock` pattern (auth: `adminMock` group_id read + `supabaseMock` `is_admin`).

## Success criteria

- [x] `addLeagueRound`: a round whose `closes_at` is >5 min in the past is blocked server-side with `{ error: 'round_in_past' }` (no `league_rounds` insert issued); a future window passes through to the insert.
- [x] `createLeagueDraft`: a fully-past season (last generated window >5 min past) is blocked with `{ error: 'season_over' }` (no `leagues` insert issued). Mid-season (past start, future end) and future seasons still create.
- [x] `updateLeagueRound` + `overrideRoundWindow` behavior unchanged (reopening past windows still possible); `overrideRoundWindow` carries a comment documenting the intentional exemption.
- [x] Cup: no code — confirmed no tee-off field exists and the manual path is already #902-guarded; documented in the closing comment.
- [x] Reuses `isTeeOffInPast` + `TEE_OFF_PAST_GRACE_MS` (no new grace constant, no helper rename).
- [x] Unit tests: `addLeagueRound` past-rejected + future-accepted; `createLeagueDraft` past-rejected (accepted path already locked by the existing #675/#737 future-season tests — noted in the test).
- [x] `liga.addRound.errors.round_in_past` + `liga.create.errors.season_over` present in `messages/no.json` and `messages/en.json`; both surfacing components recognize the codes (no `fallback`/`unexpected` leak).
- [x] Same 5-min grace as #902; now/future accepted.
- [x] Patch bump to 1.141.2 + CHANGELOG entry (`· #924`) under the open "1.141.y — Spillerens klubbhus" theme; humanizer-clean tagline.

## Gates (scoped to changed files)

- `npx tsc --noEmit` (whole-project; new code must typecheck).
- `npx eslint lib/league/actions.ts app/[locale]/admin/liga/[id]/LigaAddRound.tsx app/[locale]/admin/liga/new/CreateLigaForm.tsx`
- `npx vitest run lib/league/actions.test.ts lib/league/generateRounds.test.ts lib/games/gamePayload.test.ts`
- Commit-msg hook: `fix` → patch bump + CHANGELOG + `Refs #924` in body.
- **Staging:** `addLeagueRound` with a past close date → blocked inline; `createLeagueDraft` with a
  fully-past season → blocked banner; a normal future round/season → creates as before.

## Out of scope

- Cup (no tee-off field; manual path #902-guarded) — dropped, documented at close.
- `updateLeagueRound` / `overrideRoundWindow` guards (edit/reopen legitimately touch past windows).
- Client-side `min`/inline nudge (#928's inline-entry UX is games-only; liga server block is the ask).
- Adding a tee-off/date field to cup matches (separate epic if ever wanted).
- Any DB CHECK/trigger (a CHECK can't reference `now()` cleanly; server-action guard is sufficient).
