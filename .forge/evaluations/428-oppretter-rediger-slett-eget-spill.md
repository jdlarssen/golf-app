# Evaluation: #428 — Oppretter redigerer + sletter eget spill (ikke-admin-flater)

**Verdict: ACCEPT** (with one minor, non-blocking deviation noted under Skeptical Probes — see issue #1)

Branch `claude/exciting-brown-0967ac`, evaluated against `.forge/contracts/428-oppretter-rediger-slett-eget-spill.md`. All gates run independently and green; all six success criteria verified with direct evidence. One contract deviation found (a single un-branched redirect on a rare DB-error path) that does not break any success criterion and does not affect the admin flow — recorded but not blocking.

---

## Gates (run independently, not trusting reported output)

| Gate | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` | PASS | exit 0, no output |
| `npx vitest run app/admin/games app/games lib/admin lib/games` | PASS | 77 files, 835 tests passed |
| `npx vitest run` (full suite) | PASS | 218 files, 2648 tests passed |
| `npm run build` | PASS | "Compiled successfully"; `ƒ /games/[id]/rediger` + `ƒ /games/[id]/slett` registered |
| `npx eslint` (10 changed files) | PASS | exit 0 |
| edit + slett `.test.ts` (targeted) | PASS | 2 files, 14 tests passed (9 edit + 5 slett) |

---

## K1 — Ingen ny migrasjon, RLS allerede dekket — **PASS**

- `git diff --name-only origin/main...HEAD -- supabase/migrations/` → empty. No migration added.
- `supabase/migrations/0071_games_creator_rls.sql` (read in full) contains: `games creator update` (l.29–33, using+with-check `created_by = auth.uid()`), `games creator delete` (l.35–38), `games select own created` (l.19–22), `game_players creator insert/update/delete` (l.42–72, parent-`created_by`-subquery), and the `incomplete_profiles_for_ids(uuid[])` SECURITY DEFINER RPC (l.100–120, `authenticated`-only EXECUTE). Edit (games-update + game_players delete/insert) and delete (games-delete → FK CASCADE bypassing child-RLS) are fully covered by 0071.

## K2 — Rediger — **PASS**

- Route registered: build shows `ƒ /games/[id]/rediger`.
- `app/games/[id]/rediger/page.tsx`: gated `requireAdminOrCreator(supabase, id)` (l.72); status guard redirects active/finished → `/games/${id}?error=not_editable` (l.87–89); options via `getNewGameFormData()` (l.128); reuses `GameForm` with `edit-draft`/`edit-scheduled` modes (l.141–168) wired to the shared `saveDraftAction`/`publishFromDraftAction`/`updateScheduledAction` (imported from admin path, l.13–16); `buildEditInitialValues` from the shared helper (l.139). `GAME_SELECT` field list is byte-identical to the admin edit page's select (verified by diff).
- `app/admin/games/[id]/edit/actions.ts`: `updateGameInternal` now gates `requireAdminOrCreator` (l.47); branches `editBase`/`detailBase` on `ctx.isAdmin` (l.49–54); pending-gate via `supabase.rpc('incomplete_profiles_for_ids', …)` (l.101–104) replacing the prior direct users-read.
- **Admin byte-identical:** compared every redirect string against `origin/main:actions.ts`. For `ctx.isAdmin`, `editBase = /admin/games/${id}/edit` and `detailBase = /admin/games/${id}` — every redirect resolves to the exact pre-existing admin URL (payload-error, tee_off_required, side-error, db_roster, pending_players, not_editable, mode_locked_after_publish, db_players, success `?status=`). The RPC swap is behavior-preserving: `incomplete_profiles_for_ids` selects `profile_completed_at IS NULL` — identical predicate + `{id,email}` shape to `findPendingPlayers` (`lib/games/pendingPlayers.ts:16–20`). `findPendingPlayers` is NOT dead — still used by `app/admin/games/[id]/actions.ts` + `lib/games/startScheduledGame.ts` (startScheduled path).
- `edit/actions.test.ts`: 9/9 pass. Covers creator update_scheduled → `/games/game-1?status=updated` (l.315–343), creator publish w/ pending → `/games/game-1/rediger?error=pending_players` + zero writes (l.345–374), non-owner non-admin → `/` + zero writes (l.376–395), plus admin mode-lock (l.97–144) and notify-diff (l.176–280) unchanged.

## K3 — Slett — **PASS**

- Route registered: `ƒ /games/[id]/slett`.
- `app/games/[id]/slett/page.tsx`: gated `requireAdminOrCreator` (l.63); page-level status guard redirects active/finished → `/games/${id}` (l.78–80); dedicated confirmation page (no inline/`<details>`); child-counts via head-count queries (l.86–95); scheduled-only warning copy (l.105–108); submits the shared `deleteGame` action (l.161).
- `app/admin/games/[id]/slett/actions.ts`: `deleteGame` gates `requireAdminOrCreator` (l.17); **action self-gates** against direct POST — `if (!ctx.isAdmin && status ∉ {draft,scheduled}) redirect('/games/${id}?error=not_deletable')` (l.38–40), BEFORE any delete; success branches admin → `/admin/games?status=deleted&name=` (l.59–62) vs creator → `/?deleted=${encodeURIComponent(name)}` (l.66); error branches the slett path too (l.50–54).
- **Admin byte-identical:** diff against `origin/main` confirms — for `ctx.isAdmin` the status block is skipped (admin deletes any state), delete runs, error → `/admin/games/${id}/slett?error=delete_failed`, success → `/admin/games?status=deleted&name=…`. Unchanged behavior.
- `app/page.tsx`: `?deleted` param (l.27–31) → `<Banner tone="success">✓ «{name}» er slettet.</Banner>` (l.82–87).
- `slett/actions.test.ts`: 5/5 pass. admin deletes finished → Sekretariatet (l.63–84); creator deletes draft → `/?deleted=Sommer-runde` (l.88–107); creator blocked on finished — zero delete (l.109–127); creator blocked on active — zero delete (l.129–147); non-owner → `/` zero delete (l.149–163). Direct-POST bypass is provably blocked (the active/finished tests assert `deleteCalls()` length 0).

## K4 — Inngang (CreatorControls) — **PASS**

- `app/games/[id]/page.tsx`: `CreatorControls({gameId, status})` (l.1190–1230) self-gates `status === 'draft' || 'scheduled'` → returns `null` otherwise.
- Rendered in BOTH branches gated on `isCreator` (defined l.235): scheduled-waiting-room early-return at l.497–502 (the branch returns at l.516, before the main return), and main return at l.784. Hidden for non-creators (the `isCreator &&` guard) and for active/finished (the self-gate).
- Existing «Avslutt spillet» card (`isActive && isCreator`, l.764–780) is untouched — confirmed unchanged vs origin/main.
- «Slett spill» card uses `text-danger`/`hover:border-danger/40`; tap-target `min-h-[44px]`. `Card` accepts `className` (verified `components/ui/Card.tsx:5`).

## K5 — Suite grønn — **PASS**

All gates above green. See gate table.

## K6 — Versjon — **PASS**

- `package.json` = `1.76.1` (origin/main = `1.75.0`). MINOR-series bump.
- CHANGELOG: new open `## 1.76.y — Rediger og slett ditt eget spill` (l.20) with `[1.76.1]` (slett, l.24) + `[1.76.0]` (rediger, l.43); previous `## 1.75.y` wrapped in `<details>` (l.65–68).
- **Nesting well-formed:** in the top-of-file new section (first 100 lines) `<details>`/`</details>` balance is 4/4. Whole-file imbalance is 295/287 (8), but origin/main is already 292/284 (8) — pre-existing artifact of `<details>` strings inside summary/code text; this PR added 3+3 (net-zero balance change). Not a regression.

---

## Skeptical Probes — what I tried to break

1. **Admin redirects byte-identical when `ctx.isAdmin`?** — Compared every redirect in `edit/actions.ts` and `slett/actions.ts` against `git show origin/main:…`. All admin-branch URLs resolve to the exact pre-existing strings. RPC swap is behavior-preserving (same `profile_completed_at IS NULL` predicate). **PASS** — with one un-branched line, see finding #1 below.

2. **Non-creator non-admin reaching edit/delete?** — `requireAdminOrCreator` (`lib/admin/auth.ts:82–95`): unauthenticated → `/login` (in `loadRole`); authenticated non-admin whose `games.created_by !== userId` → `/`. Enforced at BOTH the page (rediger l.72 / slett l.63) AND the action (edit l.47 / slett l.17). RLS `games select own created` (0071) means a non-owner can't even read the row. **No path found.**

3. **Creator deletes active/finished via direct POST (page bypass)?** — `deleteGame` self-gates at l.38–40 before any delete, redirecting `not_deletable`. Two unit tests (`finished` + `active`) assert `deleteCalls().length === 0`. **Blocked.**

4. **Status guards on rediger/slett pages redirect active/finished?** — rediger l.87–89 → `?error=not_editable`; slett l.78–80 → `/games/${id}`. **Both redirect.**

5. **Non-playing-creator edge (game_players SELECT gates on is_in_game)?** — rediger throws only on `playersResult.error`; an empty roster is `data: []` → `buildEditInitialValues([])` loops/maps over empty arrays → no crash, empty player list. slett count queries return 0 → lines collapse. Matches the contract's accepted edge. **No crash.**

6. **TypeScript `any`/unsafe casts, unused imports, broken admin-edit refactor?** — Grep for `: any` / `as any` / `as unknown as` in all new/changed action+page+helper files → none. Admin edit page now imports `buildEditInitialValues` from the shared `lib/games/editGameInitialValues.ts` — `tsc --noEmit` clean, eslint clean, admin edit tests green. `GameForm` mode union (`edit-draft`/`edit-scheduled`) exactly matches what both pages pass; action signatures `(gameId, formData) => Promise<void>` match.

7. **GameForm hardcoded `/admin` nav leaking into creator flow?** — Only matches are an import path + a cup-detail comment; submit actions are passed in by the caller, back-nav is in the page's `TopBar` (→ `/games/[id]`). **Clean.**

8. **Norwegian copy quality (AI-tells, anglicisms)?** — New strings ("Endre bane, spillere, lag eller innstillinger", "Spillet er fortsatt et utkast, så bare du ser det…", "De får ingen melding om at det er avlyst, så si gjerne fra selv.", "Slettes permanent", "Handlingen kan ikke angres.", "Slett spillet for alltid", "ARRANGØR", "✓ «{name}» er slettet.") are idiomatic bokmål — action-oriented, no «vennligst», no «X-spillet» redundancy, no em-dash chains, no anglicisms. **Clean.**

---

## Findings (non-blocking)

1. **`app/admin/games/[id]/edit/actions.ts:220`** — the `game_players.delete`-error redirect is hardcoded `/admin/games/${gameId}/edit?error=db_players` instead of the branched `${editBase}`. Every other redirect in the file (incl. the *insert*-error at l.241, same `db_players` code) is branched. The contract section 2 explicitly says "Erstatt **alle** hardkodede `/admin/games/${gameId}/edit`-redirects med de forgrenede." Impact: a non-admin creator who hits a Postgres error during the wholesale roster *delete* (rare) would be bounced to `/admin/games/${gameId}/edit`, which `requireAdmin` then redirects to `/` — so the creator silently lands on home instead of seeing the error on their rediger page, and an `/admin/*` URL momentarily leaks into the creator flow. Admin behavior is unaffected. Expected: `redirect(\`${editBase}?error=db_players\`)`. **Severity: low** (rare DB-error edge, no data-integrity or security impact, no success-criterion failure) — recorded for a follow-up fix; does not block ACCEPT.

---

## Post-evaluation: finding addressed

The single non-blocking finding above (hardcoded `game_players.delete`-error
redirect at `edit/actions.ts:220`) was fixed in commit `9d00672` — the redirect
now branches on `isAdmin` via `${editBase}` like every other redirect in the
file. `grep '/admin/games' edit/actions.ts` now shows only the `editBase`/
`detailBase` ternary definitions; no bare admin redirects remain. tsc clean,
`edit/actions.test.ts` 9/9 green. Version bumped 1.76.1 → 1.76.2 with a CHANGELOG
patch entry. The verdict stands at **ACCEPT** with zero outstanding findings.
