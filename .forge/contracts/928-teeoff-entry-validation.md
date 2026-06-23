# Contract: #928 — Past tee-off caught at entry (inline) in wizard + edit, never corner the user

Branch: `claude/928-teeoff-entry-validation` (off origin/main)
Issue: [#928](https://github.com/jdlarssen/golf-app/issues/928) · `bug, area:admin, area:ui` · follow-up to #902 (closed)

## Why

#902 shipped a correct server backstop but the UX is frustrating (owner test 2026-06-24): the
block fires only at publish, via a redirect that **resets the wizard to step 1** and shows the
banner off-screen. Owner: "block when they ENTER a past time, not at publish" + "as long as the
round hasn't started, let the organizer just fix it — don't force start-or-recreate."

## Decisions (owner, 2026-06-24)

1. **Catch at entry, inline.** Past tee-off → inline error at the field + the advance/publish
   button is disabled with a clear reason. No server redirect, no wizard reset.
2. **Never corner.** A not-yet-started game (draft/scheduled) stays freely editable; fixing the
   tee-off is a normal edit.
3. **"Start spillet" / "Start runden nå" just starts** — it means "begin now", so a planned time
   that has since passed is irrelevant. **No block on the start paths** (`startGame`,
   `startScheduledGame`). Add a short comment documenting this so nobody "fixes" it later.
4. **Server guard (#902) unchanged** — silent backstop; a normal user never hits it.

## Architecture (grounded)

The fix centralizes in the form state machine, which already drives every surface:

- `useGameFormState.ts` computes `canPublish` + `missingForPublish` (~L1437). `canPublish`
  gates the **edit** publish button (`GameForm.tsx:801,816`) AND the wizard publish.
- The **wizard** gates "Neste" via `canAdvance()` (`GameWizard.tsx:336`, step 3) +
  `nextDisabledHint()` (step 3, ~L352). Step 3 renders `BasicsSection` (the tee-off field).
- `BasicsSection`'s tee-off `<Input>` already accepts an `error` prop (inline error at the field).

So: add the past-check to the state machine once → it flows to canPublish (edit + wizard publish),
a new `teeOffInPast` flag (wizard canAdvance/hint), and an inline `error` on the field (both
surfaces, since both render BasicsSection).

## Implementation

- **Client-safe past helper** (one home, consistent with #902): reuse `TEE_OFF_PAST_GRACE_MS`
  from `lib/games/gamePayload.ts`. Add a client comparator for the `datetime-local` wall-clock
  value (browser-local 'YYYY-MM-DDTHH:mm'): past when `value` is more than the grace before
  browser-local now. Browser-local is consistent with the existing `min` nudge; the server
  (`isTeeOffInPast`, Oslo instant) stays authoritative. Document client=nudge / server=authority.
- **`useGameFormState.ts`:** compute `teeOffInPast` (true only when a tee-off is set AND past);
  expose it; factor `!teeOffInPast` into `canPublish`; surface a specific reason string
  (`teeOffError` or a dedicated `missingForPublish` entry) so the edit form's hint names it.
- **`GameWizard.tsx`:** `canAdvance()` step 3 → `... && !state.teeOffInPast`. `nextDisabledHint()`
  step 3 → past-tee-off hint (before/after the course/tee hints).
- **`GameForm.tsx` (edit):** `canPublish` already disables publish; ensure the disabled-reason
  text shows the past-tee-off message (via the `missingForPublish`/hint it already renders).
- **`BasicsSection.tsx`:** pass `error={teeOffError}` to the tee-off `<Input>` for the inline
  message. Keep the existing `min` nudge.
- **i18n:** new no/en strings for the inline error + the disabled hint (humanizer on no copy).
- **Start paths:** `startGame` + `startScheduledGame` — no behavior change; add a one-line comment
  citing the #928 decision (start-now is intentionally unguarded).

## Success criteria

- [ ] Wizard: entering a past tee-off (>5 min) on step 3 disables "Neste" with an inline error on the field + a disabled hint. No reset, no advance.
- [ ] Edit form: a past tee-off disables "Publiser" with a visible reason at/near the field (not just an off-screen banner). The organizer fixes the time and publishes without being kicked out.
- [ ] A not-yet-started game (draft/scheduled) is freely editable — the tee-off is corrected as a normal edit (verify no hidden block).
- [ ] "Start spillet" / "Start runden nå" still starts a game whose planned tee-off has passed (behavior unchanged; documented).
- [ ] Server guard (#902) still present as backstop (createGameInternal / updateGameInternal unchanged).
- [ ] Same 5-min grace as #902; "now"/future accepted.
- [ ] Unit tests: state-machine `teeOffInPast` / `canPublish` past-vs-now/future; wizard `canAdvance` step 3 rejects past, accepts valid.

## Gates

- `npx tsc --noEmit`
- `npx eslint` on changed files
- `npx vitest run` on the changed files' co-located tests (`useGameFormState` + wizard + BasicsSection consumers + the #902 `gamePayload`/action tests must stay green)
- Commit-msg hook: `fix` → patch bump + CHANGELOG + `Refs #928`
- **Staging:** drive the real wizard with a past tee-off → "Neste" blocked inline (no reset); edit a draft → "Publiser" disabled with reason; "Start spillet" on a past-tee-off draft still starts.

## Out of scope

- The server guard itself (#902, done).
- Liga/cup (#924), the GameForm bruttoHelper crash (#927).
- Edit-form length/IA rework (#909).
