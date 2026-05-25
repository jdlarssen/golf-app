# Evaluation: #92 — Profil-felt for kjønn og spillerklasse

**Verdict:** ACCEPT
**Date:** 2026-05-25
**Reviewer:** Skeptical evaluator subagent (Opus)

## Gates

| Gate | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` | PASS | exit 0, no output |
| `npx vitest run lib/games/playerGenderDefault.test.ts` | PASS (8/8) | `Test Files 1 passed (1)` / `Tests 8 passed (8)` (341 ms) |
| `npx vitest run app/profile/ app/complete-profile/ app/admin/games/new/` | PASS (88/88) | `Test Files 7 passed (7)` / `Tests 88 passed (88)` (2.29 s) |
| `npx eslint <changed-files>` | PASS | 0 errors. 1 pre-existing warning (`'vi' is defined but never used` in `app/admin/games/new/GameForm.test.tsx:1:32` — not introduced by this PR) |
| Humanizer pre-commit hook patterns | PASS | grep over new diff lines for `feature/release/by default/entry/markerer/representerer/spennings/pivotal/vennligst/spill-spillet/em-dash-chain` → 0 hits |

## Success Criteria

### ✅ Migrasjon `0036_users_gender_level.sql` + `lib/database.types.ts` regenerert

- `supabase/migrations/0036_users_gender_level.sql` exists with the spec'd SQL (lines 1–22). Adds two new enums (`user_gender`, `player_level`), adds `users.gender` nullable + `users.level NOT NULL DEFAULT 'normal'`, and includes useful column comments. No destructive ops.
- `lib/database.types.ts` regenerated — `gender: Database["public"]["Enums"]["user_gender"] | null` and `level: Database["public"]["Enums"]["player_level"]` appear in `users.Row` (line 676/682), `Insert` (line 691/697), and `Update` (line 706/712). Enum values mirrored in `Constants.Enums` (lines 899–901).

### ✅ Onboarding-form (`/complete-profile`) krever begge nye felt + tydelig norsk feilmelding

- `app/complete-profile/page.tsx:109-149` — radio-fieldsets for kjønn (no pre-select, `required`) + spillerklasse (`defaultChecked` Voksen). Sub-text matches contract copy: «Brukes til å foreslå riktig tee og beregne course handicap riktig.»
- `app/complete-profile/actions.ts:32-40` — server-side validation against literal enum allowlists (`GENDERS`, `LEVELS`) before insert. Invalid → redirect to `?error=gender_required` or `?error=level_invalid`.
- `app/complete-profile/page.tsx:14-20` — `ERROR_MESSAGES` map renders Norwegian banner via existing `<Banner tone="error">` pattern.
- Persistence: `app/complete-profile/actions.ts:55-66` includes `gender` + `level` in the `update()` payload. ✓

### ✅ Profile-edit (`/profile`) viser og lar bruker oppdatere begge felt

- `app/profile/ProfileFormBody.tsx:124-191` renders kjønn + spillerklasse fieldsets with `defaultChecked` reflecting current values. Dirty-tracking includes both fields (lines 58-68), so Lagre-knappen activates on radio change.
- `app/profile/actions.ts:38-46` validates against allowlists, `:73-86` includes both in the `update()` payload.
- ⚠️ **Minor deviation from contract § 3a:** spec calls for a separate "Vis"-state showing `Kjønn: Herre` / `Spillerklasse: Voksen` above the edit form (with `—` for null). Implementation surfaces current values only via `defaultChecked` on the radios. Functionally equivalent (user sees their current value before changing), but doesn't add a standalone display row. Pre-existing `/profile`-page is edit-form-only (no view-mode block), so this matches existing flatness rather than introducing a new pattern. Acceptable in my view, but documenting the deviation.

### ✅ Soft-prompt vises når `gender IS NULL` og forsvinner etter set

- `app/profile/page.tsx:199-228` — `GenderSoftPrompt` server component renders `Card` with title «Velg kjønn for tee-anbefaling», CTA `Sett kjønn` as `<SmartLink href="#kjonn">`. Anchor target `id="kjonn"` lives on the gender-fieldset in `ProfileFormBody.tsx:124`. ✓
- Trigger condition (line 207): `if (!profile || profile.gender !== null) return null;` — strictly NULL-check, matches spec.
- Cache-invalidation: server-component re-runs per request (no `unstable_cache`; `cache()` on line 51 is React's per-request dedup). After `updateProfile` redirects to `/profile?profile=updated`, the next render fetches fresh `gender` from DB → soft-prompt disappears automatically. No explicit `revalidatePath` needed because there's no cross-request cache to bust.

### ✅ Admin-spillere-edit (`/admin/spillere/[id]`) speiler /profile-edit

- `app/admin/spillere/[id]/page.tsx:206-272` — same radio fieldsets as `ProfileFormBody`, with current values preselected.
- `app/admin/spillere/[id]/actions.ts:50-58` — same enum-allowlist validation, `:122-129` includes both in `updatePayload`.
- Row fetch (`page.tsx:77`) includes `gender, level` in the select.

### ✅ Game-wizard auto-defaulter M/D/J-toggle

- `lib/games/newGameFormData.ts:53` — select includes `gender, level`. `:85-94` maps to `PlayerOption` (single helper, propagates to both `/admin/games/new` + `/opprett-spill`).
- `app/admin/games/[id]/edit/page.tsx:274-283` — edit-flyt's parallel mapping also includes both fields.
- `app/admin/games/new/GameForm.tsx:26-35` — `PlayerOption` type extended with `gender: 'mens'|'ladies'|null` + `level: 'junior'|'normal'|'senior'`.
- `app/admin/games/new/useGameFormState.ts:125-134` — lazy `useState` initializer derives defaults via `playerGenderDefault(p.gender, p.level)` ONLY when `initialValues?.player_genders` is not provided. Edit-flyt still wins (spec § 5b confirmed).
- Data flow traced end-to-end: DB → `getNewGameFormData` → `PlayerOption[]` → page `<GameForm players={...}>` / `<GameWizard players={...}>` → `useGameFormState({ players, initialValues })` → derived default. ✓
- Toggle consumers (`TeamsAssignmentSection.tsx:297,300,315,374,377,392` and `GameWizard.tsx:418`) read from the `playerGenders` state map.

### ✅ `playerGenderDefault`-helper har 8/8 unit-tester

- `lib/games/playerGenderDefault.test.ts` covers all 8 combinations exactly as spec'd in § 6. All pass.

## Skeptical findings

### 1. ⚠️ `setCourseId` wipes derived defaults (minor, pre-existing behaviour preserved)

`app/admin/games/new/useGameFormState.ts:216-220` — when admin changes the course, `setPlayerGenders({})` is called to reset per-player tee state. Same in `BasicsSection.tsx:123`. After a course change, the derived defaults are LOST and the toggle falls back to `'M'` (the `?? 'M'` fallback in `TeamsAssignmentSection.tsx:300/315/392`).

**Why this is probably fine:** the wipe was already there to invalidate stale tee choices when a different course (with possibly no ladies/juniors tee) is selected. Pre-empting the derived re-population on course change would be a reasonable polish but is out of scope. The defaults work as intended for the default flow (course chosen first → derived defaults computed when `useState` initializer runs once at mount based on `players` prop, which is always available before course selection).

**Acceptable:** spec's intent of "90 % av tilfellene bør virke uten manuell tagging" holds for the typical first-time flow. Course-swap is the edge case.

### 2. ⚠️ Profile view doesn't show standalone `Kjønn: Herre` row

Already noted above. Spec § 3a calls for a display block above the form. Implementation shows the value only through the pre-selected radio. Pragmatic call but a deviation from the letter of the contract.

### 3. ✅ No TypeScript `any` / `unknown` leakage in new validations

Verified `app/complete-profile/actions.ts`, `app/profile/actions.ts`, `app/admin/spillere/[id]/actions.ts`. All use narrow `as Gender` / `as Level` casts AFTER `Array.includes` allowlist guards — the only `Record<string, unknown>` is the pre-existing `updatePayload` in admin actions (line 122), not introduced by this PR.

### 4. ✅ Migration uses safe SQL

`0036_users_gender_level.sql` is purely additive: `create type` + `alter table … add column`. No `DROP`, no `ALTER COLUMN`, no data destruction. The default on `level` ensures backfill is implicit. `gender` nullable means no failed inserts on existing rows.

### 5. ✅ Norwegian copy follows CLAUDE.md voice rules

Scanned all new user-facing strings in `.tsx` files: no `feature`, `release`, `entry`, `by default`, `vennligst`, em-dash-chains, or X-spillet-redundancy. Helper texts read idiomatically («Brukes til å foreslå riktig tee og beregne course handicap riktig», «Junior gir juniortee når banen har en. Senior er en informasjons-tag for nå»). The CHANGELOG tagline («Du kan nå sette kjønn og spillerklasse i profilen din. Når noen oppretter et spill … så damer og juniorer slipper å havne på herretee ved et uhell.») is action-oriented, idiomatic, and avoids AI-tells.

### 6. ✅ ALL `PlayerOption` test fixtures updated

`grep -rn "PlayerOption" --include="*.test.*"` → 3 files reference the type:
- `app/admin/games/new/GameForm.test.tsx:27-28` — fixture extended with `gender: null, level: 'normal'`
- `app/admin/games/new/GameWizard.test.tsx:39-40` — same fixture extension
- `app/profile/ProfileFormBody.test.tsx` — touched (per `git diff --stat`), 88 tests pass

`SideWinnersForm.tsx` defines its own (different) `PlayerOption` type with no gender/level fields — correctly NOT touched, since it's a separate type for a different screen.

### 7. ✅ Auth-flow guards (defence in depth)

`app/admin/spillere/[id]/actions.ts:60` re-asserts admin via `requireAdmin()` before any DB write. `updateProfile` calls `supabase.auth.getUser()` defensively. No new auth holes introduced.

## Recommendation

**ACCEPT.** All success criteria are met. All four gates pass. Implementation is clean, types are tight, validation is layered (client `required` + server allowlist + DB enum), and the user-facing copy is idiomatic Norwegian.

Two minor findings noted for honesty (course-change wipe; missing standalone display row in profile § 3a), but neither blocks the contract's intent. Both could be filed as follow-up polish issues if desired, but neither warrants a NEEDS WORK verdict.

Recommendation for the PR merge step:
- Spot-check on Vercel preview that the soft-prompt actually disappears after saving gender (the only mechanism here is "next-request fetches fresh DB row" — confirmed in code, but worth one preview click).
- Verify that opening `/admin/games/new` with mixed-gender roster pre-selects toggles correctly (the human-verification gate).
