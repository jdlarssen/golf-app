# Evaluation: #1210 Avstand til green — crowdsourcet green-pinning

**Contract:** `.forge/contracts/1210-avstand-til-green.md`
**Branch:** `claude/issue-1210-distance-green-7f24e2` (4409e1d1..d7415df8, 6 commits)
**Evaluated:** 2026-07-13, fresh context, independent verification.

## Verdict: ACCEPT

All 6 Success Criteria hold up under independent re-verification — local commands re-run,
migration/RLS/trigger/grants re-checked live against `torny-staging` via read-only SQL (not
just the file), and the contract's staging screenshots opened and visually confirmed to show
what the evidence annotations claim. No contract violations found. No fixes required.

## Evidence

### Criterion 1 — `green_pins` DB shape on staging + pgTAP suite

- Read `supabase/migrations/0142_green_pins.sql` in full: FK → `courses(id)` (never
  `course_holes`), CHECKs for hole_number/lat/lng/accuracy_m, RLS with SELECT
  (`using (true)`), INSERT (`with check (user_id = auth.uid())` — blocks forged AND null
  user_id), DELETE (`using (user_id = auth.uid())`), **no UPDATE policy** (commented as
  0119-pattern), column-privilege revoke/grant excluding `user_id`, `green_pins_gate` BEFORE
  INSERT trigger (SECURITY DEFINER, `search_path = ''`, execute revoked from
  anon/authenticated), and `anonymize_user` redefinition.
- Cross-checked the `anonymize_user` redefinition against the sole prior definition
  (`0131_user_soft_delete.sql:100-153`, confirmed via `grep -rl anonymize_user
  supabase/migrations/` → only 0131 and 0142 match, so the "only prior definition" claim in
  the commit message holds). The 0142 body is a byte-for-byte match of 0131's body plus one
  added line (`update public.green_pins set user_id = null ...`) and an updated
  `comment on function`. `CREATE OR REPLACE` used, no re-issued grants (correct — grants
  survive `CREATE OR REPLACE`, and the original 0131 revoke/grant block wasn't touched).
- **Live staging re-verification** (read-only SQL via Supabase MCP, project
  `snwmueecmfqqdurxedxv`), independent of the contract's own claimed introspection:
  - `pg_policies` → exactly 3 policies (`green_pins delete own`, `green_pins insert own`,
    `green_pins select authenticated`), no UPDATE policy. Matches file exactly.
  - `information_schema.column_privileges` → `authenticated` has SELECT on every column
    except `user_id` (which has only INSERT + REFERENCES, no SELECT/UPDATE). `anon` has
    **0** grants of any kind.
  - `pg_trigger` → `green_pins_gate` trigger present on `public.green_pins`.
  - `pg_proc` → `green_pins_gate` is `prosecdef = true`; `has_function_privilege` confirms
    execute is denied to both `anon` and `authenticated`.
  - `pg_get_functiondef('green_pins_gate')` on staging → constants `pin_gate_max_pins := 3`,
    `pin_gate_window_days := 30`, byte-identical to the migration file.
  - `pg_get_functiondef('anonymize_user')` on staging → identical to the migration file,
    including the `green_pins` nulling line.
  - `list_migrations` on staging → `0142_green_pins` is registered (after
    `0141_admin_onboarding_funnel`, confirming the sequential-numbering claim).
  - `public.green_pins` on **prod** (`glofubopddkjhymcbaph`) → `to_regclass` returns null
    (table does not exist). Confirms the migration was NOT applied to prod, consistent with
    "prod apply awaits owner hatch" and no `.claude/approve-prod` file present in the
    worktree.
- Read `supabase/tests/green_pins_rls_test.sql` in full: `plan(18)`, and manually counted 18
  `ok`/`throws_ok` assertions matching the plan. Covers every ALLOWED/FORBIDDEN/gate/CHECK
  case the contract lists, including the "pin #4 from a DIFFERENT user still trips the gate"
  case (proves per-hole not per-user) and the "3 aged-out pins don't count" window-semantics
  case. Reuses the shared `torny_rls` fixture rig (`supabase/tests/fixtures/rls_helpers.psql`)
  without modifying it — confirmed via `git diff` (0 changes to that file).
- `VERIFICATION GAP: test:rls not run` is honestly declared — this repo genuinely has no
  local Postgres stack (accepted gap per task brief).

### Criterion 2 — `lib/geo/` Type A suite + parity test

- **Ran:** `npx vitest run lib/geo components/hole/DistanceToGreen.test.tsx
  messages/catalogParity.test.ts` → **EXPECT: all pass** → **got:** 5 files / 37 tests, all
  green.
- Read `lib/geo/distance.ts` (haversine, R=6371000, standard formula — correct),
  `lib/geo/greenCenter.ts` (per-axis median, null on empty array — correct), `lib/geo/
  pinRules.ts` (constants 30/1000/3/30, `shouldShowDistance`, `isAcceptablePinAccuracy`).
  All match the design doc's stated thresholds.
- The gate-constant parity test (`lib/geo/pinRules.test.ts`) regex-extracts
  `pin_gate_max_pins`/`pin_gate_window_days` from the actual `0142_green_pins.sql` file on
  disk and asserts equality with the TS constants — a real cross-file guard, not a
  hardcoded duplicate.

### Criterion 3 — distance line show/hide + Type C test

- Read `components/hole/DistanceToGreen.tsx` in full: `watchPosition` cleaned up on unmount
  (`useEffect` return `stopWatch`), paused on `visibilitychange === 'hidden'` and resumed
  when visible again (`watching && watchIdRef.current == null` guard), graceful fallback to
  the «Vis avstand» button on `PERMISSION_DENIED` (never a silent empty slot — non-denied
  errors also fall back to the button), `GEO_GRANTED_KEY` localStorage flag shared with
  `GreenPinChip.tsx`.
- Read `components/hole/HoleHero.tsx`: `distanceLine` is a genuinely new optional slot
  rendered in the right column directly under the index line (`t('hullIndex', ...)` then
  `{distanceLine}` on the next line) — confirmed it does NOT collide with `contextLine`
  (separate prop, separate render branch).
- **Ran:** the Type C test — exactly one `it`, asserts empty render with `center={null}` and
  the button with a center. Matches "maks én Type C-rendertest" test discipline.
- **Staging screenshot verification (visual, not just trusting the filename):** opened
  `1210-distance-line.png` from the scratchpad — shows the actual staging hole-3 screen with
  «~150 m til green» rendered exactly under the index line, matching the contract's evidence
  claim verbatim.

### Criterion 4 — pinning end-to-end + team-collapsed chip

- Read `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx`:
  - `scoredThisSession` state is a plain `useState(false)`, set to `true` only inside
    `onSetScore` (line 685), never inside `onSetPutts` — confirmed by reading both functions
    in full. The gating logic is explicitly NOT `playerId === myUserId` — it fires on any
    `onSetScore` call regardless of which card, correctly sidestepping the #1058
    team-collapsed trap the contract calls out (a non-captain team member's score entry
    writes to the captain's `playerId`, so an ownership check would have excluded them).
  - Chip render condition (line 1042-1049):
    `courseId != null && scoredThisSession && freshPinCount < PIN_GATE_MAX_PINS &&
    !gameInactive` — a superset of everything the task brief asked to confirm.
- Read `app/[locale]/games/[id]/holes/[holeNumber]/greenPinActions.ts` in full:
  `getServerClient` (user-scoped) is used, never `getAdminClient` (grepped the file — no
  admin-client import at all). `callerId` comes from `getProxyVerifiedUserId()`, never from
  the client payload. `isAcceptablePinAccuracy` is enforced server-side before the insert
  (authoritative, independent of the client's pre-check in `GreenPinChip.tsx`). `expectOne`
  (a stricter variant of `expectAffected` that also asserts exactly 1 row) wraps the insert
  with `.select('id')` — correctly omits `user_id`, which `authenticated` cannot even select
  per the column-privilege grant verified above.
- Read `components/hole/GreenPinChip.tsx` in full: `navigator.onLine` tracked via
  `useSyncExternalStore` (no `useOnline` hook exists in the repo, confirmed by the contract's
  own research note and not contradicted by a search here), offline → chip renders `null`.
  Accuracy pre-check mirrors the server. Error states map to `weakGps`/`denied`/`failed`
  copy keys, never a raw crash.
- **Staging screenshots opened and visually confirmed:**
  - `1210-thanks.png` — shows «Punkt lagret — takk!» rendered at the SyncStatusLine spot
    after a successful pin.
  - `1210-texas-chip.png` — shows the chip («Står du ved greenen? Lagre punkt») rendered on
    a seeded `texas_scramble` game (`E2E-1210-TEXAS`, 2 team cards) after a score entry —
    direct visual confirmation of the team-collapsed claim, the single most fragile part of
    this criterion.
  - `1210-chip.png` — hole 2, pre-pin state (visible above the fold cut off the chip itself,
    but the other three screenshots more than cover the claim).
  - `1210-failure.png` — an earlier debugging screenshot timestamped 02:08, before the
    `maximumAge: 15000` fix landed at 02:12; consistent with genuine debugging history, not
    a hidden unresolved failure (the later screenshots at 02:12 show success).
- **Live staging re-check:** `select count(*) from public.green_pins` → 0 rows. Consistent
  with the contract's "alt opprydda" (cleaned up afterward) claim — not evidence against the
  drive, since the screenshots independently show the flow working at capture time.
- The follow-up commit (`c1be9ab9`, `maximumAge: 15000`) is a plausible, well-explained fix
  for a real Playwright/CDP emulated-geolocation quirk, correctly marked `[no-changelog]`
  and bumped as a patch release. The 30 m accuracy cap is untouched by this change (accuracy
  still comes from the geolocation result, not defaulted).

### Criterion 5 — `anonymize_user` nulls `green_pins.user_id`

- Confirmed structurally (file read + live staging `pg_get_functiondef` match, see
  Criterion 1). The DO-block probe itself isn't independently re-run here (would require
  writing a throwaway user — out of the read-only scope for this evaluation), but the
  function body live on staging is byte-identical to the reviewed migration, so the claimed
  probe result is consistent with what's actually deployed.

### Criterion 6 — i18n parity, humanizer, version bump, CHANGELOG

- **Ran:** `messages/catalogParity.test.ts` → 2/2 pass (included in the Criterion-2 run).
- Verified both `messages/no.json` and `messages/en.json` have parallel `holes.distance`
  (3 keys) and `holes.greenPin` (6 keys) leaf structures; every key referenced by
  `DistanceToGreen.tsx`/`GreenPinChip.tsx` (`t('line', ...)`, `t('showButton')`,
  `t('deniedHint')`, `t('prompt')`, `t('saving')`, `t('thanks')`, `t('weakGps')`,
  `t('denied')`, `t('failed')`) exists in both files. Norwegian copy reads idiomatically, no
  obvious AI-tell patterns (no em-dash pile-ups, no "sømløst"/"utnytte"/"kraftig" filler).
- `package.json` version: `1.201.4` → `1.202.1` (minor bump for the `feat` commit, patch
  bump for the follow-up `fix` commit — correct per the bump-type rule). `CHANGELOG.md` has
  a "1.202 · Avstand til green på hullskjermen" Funksjon-rad linking #1210; the `fix` commit
  is correctly `[no-changelog]`-tagged (internal GPS-timing tweak, not a new user fact).
- All 6 commits carry `Refs #1210` in the body (`git log --format` grep confirms 6/6).
- **Ran:** `npx tsc --noEmit` → **EXPECT: exit 0** → **got: exit 0.**
- **Ran:** `npm run lint` → **EXPECT: 0 errors** → **got: 0 errors, 56 warnings** (all
  pre-existing complexity warnings in unrelated files — none introduced by this branch's
  diff; `HoleClient.tsx`/`page.tsx` complexity warnings pre-date this change, the diff only
  adds ~90 lines to already-large functions).
- **Ran:** `npm run build` → **EXPECT: exit 0** → **got: exit 0.**
- **Ran:** full `npx vitest run` → **EXPECT: all green** → **got: 396 files / 4894 tests,
  all passed** — matches the contract's claimed count exactly.

### Out-of-scope check

- `git diff origin/main..HEAD --stat -- e2e/ lib/sync/` → empty. No Dexie/offline-sync
  changes, no new e2e specs. Full changed-file list (22 files) reviewed — everything traces
  to the contract's "Files Likely Touched" list. No drive-by edits to unrelated code.

## Issues

None. No contract violations, no broken gates, no evidence contradictions found.

## Notes (non-blocking style observations)

1. `.claude/launch.json` has an uncommitted local addition (`torny-staging-alt`, port 3111) —
   this is the dev-server config the builder used for the staging Playwright drive
   (matches the task brief's mention of "a dev server against staging runs on
   http://localhost:3111"). It's local tooling, not part of the diff being evaluated, and
   harmless either way — flagging only so it isn't mistaken for scope creep if seen in
   `git status`.
2. `lib/database.types.ts`'s hand-extended `green_pins.Row` type includes `user_id: string |
   null` as if it were client-readable. This is a known, explicitly-commented interim state
   (`// TODO: regen after prod apply of 0142 — gen:types reads PROD`) and does not weaken
   runtime security (the actual Postgres column-privilege grant is what's enforced, verified
   live above). Purely a TypeScript-level over-statement of what's readable; resolved
   automatically once `npm run gen:types` runs post-prod-apply.
