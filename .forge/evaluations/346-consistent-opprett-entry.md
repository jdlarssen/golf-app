# Evaluation — #346: Én konsistent «Opprett»-inngang

**Date:** 2026-05-31
**Branch:** claude/crazy-tesla-a3678f
**Evaluated commit:** 251dd4d8f655a4efdea299eec5b8166649c52e63

---

## Verdict: ACCEPT

All eight acceptance criteria pass. All four gates pass. No regressions found.

---

## AC Results

### AC1 — Consistent label from single const: PASS

`lib/games/createGameLabel.ts` exports `CREATE_GAME_LABEL = 'Opprett spill'` (line 13).

Import confirmed in:
- `app/page.tsx:24` — used at lines 224 (empty-state CTA) and 258 (non-empty button)
- `app/admin/games/page.tsx` — used at TopBar action (line 127) and empty-state body copy (line 242)

Stale labels grep result: the only occurrences of old labels ("Opprett en turnering", "+ Nytt", "Sett opp ny runde") are:
- `lib/games/createGameLabel.ts:6` — JSDoc comment documenting what was replaced (not rendered)
- `app/admin/games/new/page.tsx:108` and `app/opprett-spill/page.tsx:72` — wizard destination page H1 titles, correctly out of scope per contract

No stale create-action labels rendered to users.

### AC2 — Always-visible Opprett entry in BOTH home branches: PASS

Non-empty branch renders at `app/page.tsx:252–261`:
```tsx
{canCreateGame && (
  <div className="mb-6">
    <LinkButton
      href={profile?.is_admin ? '/admin/games/new' : '/opprett-spill'}
      full
    >
      {CREATE_GAME_LABEL}
    </LinkButton>
  </div>
)}
```
Prominent `LinkButton full` — same treatment as the empty-state CTA. Gated on `canCreateGame`.

Empty-state branch renders at `app/page.tsx:218–227` (also gated on `canCreateGame`).

### AC3 — One Sekretariatet representation, shared footer both branches: PASS

`HomeUtilityFooter` defined once at `app/page.tsx:421–456`. Used at:
- Line 237 — empty-state branch (inside `if (isEmptyState)` return)
- Line 358 — non-empty branch (bottom of second return)

The old accent `<Section label="Admin">` card is removed from the non-empty branch (confirmed by diff and grep: no `<Section ... accent` call remains in the non-empty return). The old duplicate `<Section label="Profil">` card is also removed.

Non-admin non-creator players still get "Min profil" and "Logg ut" in both branches — `HomeUtilityFooter` renders those unconditionally; only "Sekretariatet" is `{isAdmin && ...}`.

### AC4 — Role routing preserved in all Opprett surfaces: PASS

Both home buttons use identical role routing:
- `app/page.tsx:221` (empty): `href={profile?.is_admin ? '/admin/games/new' : '/opprett-spill'}`
- `app/page.tsx:255` (non-empty): `href={profile?.is_admin ? '/admin/games/new' : '/opprett-spill'}`

Admin games list action routes to `/admin/games/new` only (admin-only surface, no trusted-creator routing needed there).

### AC5 — Game-list action relabeled: PASS

`app/admin/games/page.tsx:127`: `{CREATE_GAME_LABEL}` replaces old `+ Nytt`.
`app/admin/games/page.tsx:242`: empty-state body copy uses template literal `\`Trykk «${CREATE_GAME_LABEL}» for å sette opp den første runden.\`` — both render "Opprett spill".

### AC6 — Non-creators see no Opprett button: PASS

`canCreateGame` is defined at `app/page.tsx:183–184`:
```ts
const canCreateGame =
  profile?.is_admin === true || isTrustedCreator(profile?.email);
```
Both Opprett buttons are inside `{canCreateGame && (...)}` guards (lines 218 and 252). Regular players (not admin, not trusted) satisfy neither condition — button not rendered in either branch.

### AC7 — Norwegian copy passes humanizer: PASS

New user-facing strings:
- Label: «Opprett spill» — verb-first, no anglicisms, no særskriving
- Empty-state descriptor: «Ingen turneringer enda. Sett opp første runde og kom i gang.» — idiomatic, action-oriented
- CHANGELOG tagline: «Opprett spill ser nå lik ut overalt: på hjem og i spill-lista. Knappen blir værende på hjem selv når du allerede har spill, ikke bare når lista er tom. Før het samme handling tre forskjellige ting avhengig av hvor du sto.» — natural Norwegian, no AI-tell patterns detected

No «Vennligst», no em-dash chains, no «Tap»-anglicism, no «X-spillet»-redundancy.

### AC8 — Version bump + CHANGELOG: PASS

`package.json:3`: `"version": "1.60.3"` (was 1.60.2, PATCH bump as specified).

`CHANGELOG.md` has a proper `### [1.60.3] - 2026-05-31` entry with tagline blockquote + Teknisk details section covering Added/Changed/Removed. Entry is inside the `## 1.60.y` series heading (correct grouping). commit-msg hook passed (commit exists without `--no-verify`).

---

## Gates

### `npm run build`: PASS
```
✓ Compiled successfully in 2.6s
✓ Generating static pages using 9 workers (29/29) in 231ms
```
No errors. All routes compile including `/` and `/admin/games`.

### `npm run lint`: PASS
```
✖ 18 problems (0 errors, 18 warnings)
```
0 errors. All 18 warnings are pre-existing `_gameId` warnings in leaderboard views. No warnings in `app/page.tsx`, `app/admin/games/page.tsx`, or `lib/games/createGameLabel.ts`.

### `npx vitest run app`: PASS
```
Test Files  76 passed (76)
     Tests  649 passed (649)
```
All 649 tests pass. No test asserting an old label.

### `npx tsc --noEmit`: PASS (for changed files)
Errors in output are exclusively pre-existing test files:
- `app/admin/games/[id]/signups/*.test.ts`
- `app/signup/[shortId]/*.test.ts`
- `app/games/[id]/withdrawActions.test.ts`

Zero new errors in `app/page.tsx`, `app/admin/games/page.tsx`, or `lib/games/createGameLabel.ts`.

---

## Regressions / Concerns

**None.**

The non-empty home restructure did not drop anything a user needs:
- Profile access: `HomeUtilityFooter` always renders "Min profil" (→ `/profile`) for all authenticated users in both branches.
- Logout: `HomeUtilityFooter` always renders "Logg ut" for all authenticated users in both branches.
- Sekretariatet: still accessible from home for admins via `HomeUtilityFooter` (conditional on `isAdmin`).
- Spillformer section: still present in non-empty branch (`app/page.tsx:337–348`).
- Active/finished games lists: untouched.
- `Card`, `Section`, `SmartLink`, `LinkButton`, `Banner` imports all still have usages — no dead imports.

The `Section` component still has an `accent` prop (used by the component definition), but no call site in `HomeBody` uses it now that the Admin and trusted-creator sections are removed. This is harmless — the prop is available for future use and does not trigger a lint warning.

## UI Verification

Live Playwright skipped — project is tested in production only; home page is behind a login gate with no running local server. Static source + build verification is sufficient per contract.
