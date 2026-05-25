# Evaluation: #168 Handicap-prompt før turneringsdeltakelse

**Date:** 2026-05-25
**Branch:** claude/ecstatic-swanson-aaa7b1
**Verdict:** ACCEPT

## Criterion checks

- **K1** ✓ Migration `supabase/migrations/0034_users_handicap_updated_at.sql` adds `handicap_updated_at timestamptz not null default now()` and backfills existing rows with `now()`. Live DB query against project `glofubopddkjhymcbaph` returned `null_count=0, not_null_count=10` — every user row has the column populated.
- **K2** ✓ `lib/handicap/staleness.ts` exports `HANDICAP_STALENESS_WEEKS=4`, `HANDICAP_STALENESS_MS = 4*7*24*60*60*1000`, and `isHandicapStale(updatedAt, now?)`. Accepts `Date | string | null | undefined`. `npm test -- --run lib/handicap/staleness.test.ts` → 10/10 passing. Tests cover: null → stale, undefined → stale, exact boundary (= MS) → stale, 1ms before boundary → fresh, fresh now → fresh, far-past (2024-01-01) → stale, stale ISO-string variant, fresh ISO-string variant. All branches of the spec covered.
- **K3** ✓ All three actions write `handicap_updated_at: new Date().toISOString()`:
  - `app/profile/actions.ts:59` — inside `updateProfile`, bumped unconditionally on every save (per spec: "selv om hcp_index ikke endret seg")
  - `app/complete-profile/actions.ts:44` — inside `completeProfile`, stamped on first onboarding
  - `app/admin/spillere/[id]/actions.ts:110` — inside `updateUser`, bumped unconditionally per spec ("admin saving the form is an endorsement of the current hcp_index")
- **K4** ✓ `app/games/[id]/page.tsx`:
  - L31-32 imports both `isHandicapStale` and `HandicapConfirmCard`
  - L297-301 — slim direct fetch of `hcp_index, handicap_updated_at` filtered by `id=userId`
  - L302-304 — `showHandicapCard = meUser ? isHandicapStale(meUser.handicap_updated_at) : false` — safe-default on query failure (no card shown)
  - L314-320 — card rendered inside the `if (game.status === 'scheduled')` branch only, gated on `showHandicapCard && meUser`
  - Active/finished/draft branches do not render the card. Correct.
- **K5** ✓ `app/games/[id]/actions.ts` exports `confirmHandicap(gameId)`:
  - Authenticates via `supabase.auth.getUser()` → redirects to /login if missing
  - `UPDATE users SET handicap_updated_at = now-iso WHERE id = user.id` — self-scoped (auth.uid only, gameId not used for the WHERE — gameId only feeds revalidatePath)
  - Calls `revalidatePath(\`/games/${gameId}\`)` to refresh the RSC payload. Since the slim user-row fetch lives outside `getGameWithPlayers`'s tag cache, path revalidation correctly invalidates the route and re-runs the slim query on next render.
- **K6** ✓ `app/profile/safeNext.ts` + 11 tests (`npm test -- --run app/profile/safeNext.test.ts` → 11/11 passing). Validator rejects null, undefined, empty, `//evil.com/x`, absolute http/https, missing leading slash, fragment-only, and non-string. `updateProfile` (`app/profile/actions.ts:17-21, 68`) reads `formData.get('next')`, sanitises via `safeNextPath`, redirects to it on success, falls back to `/profile?profile=updated` otherwise. Error-redirects preserve `next` so the form survives validation failures. `app/profile/page.tsx:69, 107` plumbs `next` into the form. `ProfileFormBody.tsx:68` renders a hidden `<input name="next">` and L117 wires the "Avbryt" link to honour `next`. `HandicapConfirmCard.tsx:48` links to `/profile?next=${encodeURIComponent('/games/' + gameId)}` — decodes to `/games/<uuid>`, passes `startsWith('/') && !startsWith('//')`.
- **K7** ✓ Full suite `npm test` — 979/979 passing in 84 files (matches contract's note of 947 → 979 = +32 tests).
- **K8** ✓ `npm run build` succeeds. `npm run lint` produces 5 errors, all in `e2e/sync/offline-sync.spec.ts` from commit `5866728` (2026-05-19) — pre-existing per the contract's note. No new lint errors introduced by this PR. 8 warnings exist but they are all unused-variable warnings in unrelated files, also pre-existing.
- **K9** ✓ `package.json` at `1.19.0` (bumped from 1.17.0 because main parallelized 1.18.0 to a different feature — see "Notes" below). CHANGELOG has new `## 1.19.y — Handicap-sjekk før runden` series open at top, and the previous `## 1.18.y — Lag-scorekort` series is wrapped in `<details><summary><strong>1.18.y — Lag-scorekort (1 oppføring) — klikk for å vise</strong></summary>`. Tagline ("Hvis handicapen din er eldre enn fire uker, spør appen nå før spillet starter om den fortsatt er riktig. Da slipper du å oppdage etter runden at slag-allokeringen ble feil.") reads naturally — no em-dash chains, no anglicisms, uses du-form, concrete benefit-framing.

## Gates

- `npm test` — 979 passing, 84 test files
- `npm run lint` — 5 errors + 8 warnings, all pre-existing (offline-sync.spec.ts unchanged since 2026-05-19)
- `npm run build` — Compiled successfully in 1967ms

## Findings

None blocking. See Notes below.

## Strengths

- **Safe-default failure modes:** When the slim `meUser` query fails, `showHandicapCard` defaults to `false` — never the dangerous state of showing the card without data. The card itself only renders when `showHandicapCard && meUser` (double-gated).
- **Self-scoped server action:** `confirmHandicap` updates only `user.id` (authenticated subject) — a malicious client crafting a different `gameId` cannot bump someone else's timestamp. `gameId` is used only for the revalidatePath target.
- **JS-off support preserved:** "Ja, stemmer" is a `<form action={confirmAction}>` server action (works without JS); "Oppdater" is a plain `<a>` link via `LinkButton`. Per the contract's edge-case list.
- **Cache-discipline reasoning documented inline:** Both the page comment (L294-296) and the action comment (L36-38) explain why the slim user-row fetch lives outside `getGameWithPlayers`'s tag cache and why path revalidation suffices. Future maintainers won't need to re-derive.
- **Test coverage is thorough on pure logic:** 10 staleness tests (including boundary at exactly `=` MS) and 11 safeNext tests (including the open-redirect attack vector `//evil.com/x`).
- **Atomic commits:** 5 commits cleanly mapped to the contract's commits-plan; version-bump commit (`acd4ca6`) is the user-visible one, satisfying the version-bump-hook.

## Notes

- **Version is 1.19.0, not 1.18.0 as the contract specified.** Contract said `1.17.0 → 1.18.0`, but a parallel PR landed `1.18.0 — Lag-scorekort` on main first, so this PR bumped to `1.19.0` and re-wrapped `1.18.y` in `<details>` per the "CHANGELOG/version conflict on rebase" memory. This is correct handling — flagged here for transparency, not as a failure.
- **No component test for `HandicapConfirmCard`** — contract marked this as "NY (valgfri)" so it isn't required. The behaviour is well-covered by the unit tests on `isHandicapStale` (gating logic) and the integration via the build succeeding. Worth adding later if the component grows complexity.
- **No snapshot tests exist on the scheduled-grenen UI**, so the new card couldn't have broken any. Verified by grep for `HandicapConfirmCard` / `handicap_updated_at` in test files — nothing else references them, and `npm test` is green.
- **Unusual import path:** `HandicapConfirmCard.tsx` imports `confirmHandicap` from `@/app/games/[id]/actions`. The square brackets are literal directory characters and TypeScript/Webpack resolves them correctly (the build proves it). This is the conventional Next.js App-Router-actions-in-route-segment pattern; no concern, just unusual to see in a component file outside the `app/` tree.
- **`hcpIndex` casting in the card** — page passes `Number(meUser.hcp_index)` because Supabase returns numeric columns as `number | string` in TS types. Safe because `users.hcp_index` has CHECK constraints in the DB and the value is rendered via `toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })`, which handles edge values (54 → "54,0", -2 → "-2,0").
- **`handicap_updated_at` is treated as non-null in the card** but typed as nullable in `isHandicapStale`. The migration sets the column `not null default now()`, so post-deploy the value is always present; the helper's null-tolerance is defence-in-depth, not a real branch in production.
