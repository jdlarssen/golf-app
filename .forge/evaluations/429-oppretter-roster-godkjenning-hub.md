# Evaluation: #429 — Oppretter styrer roster + godkjenning + Klubbhus-hub

## Verdict: ACCEPT

Independently verified against the contract `.forge/contracts/429-oppretter-roster-godkjenning-hub.md`. All nine success criteria (K1–K9) hold up under inspection. The RLS claim (K1) was re-run from scratch in a rollback transaction with a real non-admin `auth.uid()` and produces exactly the claimed results. All gates (lint/tsc/2657-test suite/build) pass on my own runs. Admin behavior is genuinely preserved (the opened actions self-gate via `requireAdminOrCreator`, which returns immediately for admins, and redirects branch on `isAdmin`).

The only thing not independently verifiable is logged-in form rendering — login is OTP-by-mail and this worktree has no Supabase env, so a local dev server throws in the proxy before it can evaluate auth. This is the exact limitation the contract flagged; route registration + proxy-matcher + page-gate code reading cover it.

---

## Per-criterion findings

### K1 (migration + RLS mot ekte auth) — PASS

- `list_migrations` shows `20260604220737 invitations_creator_game_invite` applied (after 0071 `games_creator_rls`).
- `pg_policies` on `public.invitations` shows exactly the 3 new policies, all `to authenticated`, with the ownership-anchor predicate `invited_by = auth.uid() AND game_id IS NOT NULL AND EXISTS(... g.created_by = auth.uid())`:
  - `invitations creator game-invite insert` (with_check)
  - `invitations creator game-invite select` (using)
  - `invitations creator game-invite delete` (using)
- The 5 pre-existing policies are **untouched**: `invitations admin write` (ALL, is_admin), `player friend-invite insert` (game_id IS NULL), `select own incoming`, `select own outgoing` (game_id IS NULL), `self mark accepted`. The friend-invite SELECT requiring `game_id IS NULL` confirms the research claim that a non-admin creator could NOT see game-scoped invites without the new policy.
- **Rollback RLS test** (real non-admin `1f016c6a-f824-481e-9de6-3e79ba7b8b06`, complete profile, owns 0 games; other game `d6258d40…` owned by `069cda6e…`). Seeded an own-game + an other-game invite, then under `role=authenticated` + `request.jwt.claims.sub` = test user:
  - `T1ins=1` — own-game invite INSERT allowed
  - `T2blocked=t` — other-game INSERT raised `insufficient_privilege` (42501)
  - `T3sel=1` — own invite visible via SELECT
  - `T4othersel=0` — other game's seeded invite NOT leaked to creator
  - `T5del=1` — own invite deletable
  - DO block raised an exception → full rollback. Post-check: `leftover_invites=0, leftover_games=0, test_user_games_now=0`. No pollution.
- `get_advisors security` returns only the pre-existing baseline (rls_enabled_no_policy on admin/agent tables; function_search_path_mutable; SECURITY DEFINER executable; leaked-password-protection). **No new advisor mentions the `invitations` table or the creator policies.**

### K2 (roster-actions) — PASS

- `app/admin/games/[id]/inviteToGameActions.ts`: both `addExistingPlayerToGame` and `inviteEmailToGame` gate `requireAdminOrCreator(supabase, gameId)` (lines 37, 115). `detailPath` branches on `ctx.isAdmin` → `/admin/games/[id]` vs `/games/[id]/spillere` (lines 38–40, 116–118). Auth happens **before** form-validation.
- Disposable-guard is non-admin-only: `if (!ctx.isAdmin && isDisposableEmailDomain(rawEmail))` (line 130), bounces to `?error=disposable_email`. Admin/trusted intentionally unguarded.
- `invitedByName` fallback is `inviterName?.trim() || (ctx.isAdmin ? 'Admin' : 'En arrangør')` (line 214–215) — not "Admin" when a creator invites. `notifyInvitedToGame` uses `ctx.userId` as inviter. Best-ball max-8 + `game_locked` (active/finished) guards unchanged for both roles.
- Tests (`inviteToGameActions.test.ts` diff) cover all four claimed branches: creator add → `/games/[id]/spillere?status=invite_added`; creator unknown-email → invitations-insert + mail; creator disposable blocked (mail NOT sent); admin disposable NOT blocked.

### K3 (withdraw) — PASS

- New `loadAdminOrCreatorContext(gameId)` helper in `actions.ts` (lines 54–66) wraps `requireAdminOrCreator`, returns `detailPath` branched on `isAdmin`, `actorName = ctx.name?.trim() || (ctx.isAdmin ? 'Admin' : 'En arrangør')`.
- `adminWithdrawPlayer` + `adminUndoWithdraw` (lines 480, 527) both use it; `supportsWithdrawal` guard, `active`-status guard, optimistic write of `withdrawn_at`/`withdrawn_by_user_id`, `logAdminEvent`, redirect-to-`detailPath` all intact. Same helper + code path for admin and creator.
- Tests cover creator-withdraws-own-game → `/games/game-1/spillere?status=player_withdrawn` and not-admin-not-creator → `/`.

### K4 (godkjennings-overstyring) — PASS

- `adminApproveScorecard` (line 196) gates `loadAdminOrCreatorContext`; redirect branches via `detailPath`. `active` guard, idempotent update (`.not('submitted_at','is',null).is('approved_at',null)`), `rejection_reason: null`, `scorecard_approved` notify, `logAdminEvent`, `revalidateTag` all preserved.
- **Deviation (per contract discretion):** reuses status key `admin_approved` rather than `approved`; the spillere page renders it as "Scorekortet er godkjent." (page.tsx STATUS_MESSAGES line 34). Documented in K4. Not a defect.
- Tests: admin → `/admin/games/game-1?status=admin_approved`; creator → `/games/game-1/spillere?status=admin_approved`; not_active bounce; not-admin-not-creator → `/`.

### K5 (management-flate) — PASS

- Build registers `ƒ /games/[id]/spillere`. Page gates `requireAdminOrCreator` (page.tsx:85); roster read via `getGameWithPlayers` (admin-client cache), confirmed to expose all needed fields (submitted_at/approved_at/withdrawn_at/rejection_reason/require_peer_approval/game_mode/created_by + name/nickname).
- draft/scheduled: "Med i spillet" roster with Fjern (`removePlayerFromGame`), `CreatorRosterClient` (getTeamCandidates picker minus current roster + e-post invite), and pending-invite list with Trekk (`cancelGameInvitation`). Best-ball full-state banner.
- active: roster with Trekk/Angre (gated `supportsWithdrawal && isActive`), and "Venter på godkjenning" (only when `require_peer_approval`) listing **all flights'** non-withdrawn submitted-but-unapproved players, each with `ApprovePlayerButton`.
- finished: read-only roster (no action buttons render). Ikke-eier-ikke-admin → `/` via gate.
- `removePlayerFromGame` correctly guards active/finished (actions.ts:49–52 → `?error=roster_locked`), delete on request-scoped client (RLS 0071 creator-delete).

### K6 (game-home-inngang) — PASS

- `CreatorControls` (page.tsx diff): "Styr spillere" → `/games/[id]/spillere` rendered when `status === 'scheduled' || 'active'` (`showRoster`); Rediger/Slett remain pre-start only (`preStart`). Logic correctly returns null only when neither applies (finished). `CreatorControls` is dropped into both the scheduled waiting-room branch and the main return.

### K7 (hub) — PASS

- Build registers `ƒ /klubbhuset`. Lists `created_by = user.id` games (request-scoped, RLS 0071) ordered by created_at desc, each row → `/games/[id]`, with `StatusChip` (utkast/påmelding/aktiv/signert), course name + tee-off date. Empty state → `/opprett-spill`. Unauthenticated → `/login` via `getUser()` guard.
- Home (`app/page.tsx`): "Klubbhuset" link gated to `profile?.is_admin !== true && createdCount > 0` (cheap head-count added to the existing Promise.all). Profil (`app/profile/page.tsx`): unconditional "Klubbhuset" SettingRow.

### K8 (suite grønn) — PASS

See Gates below. Full suite 2657 passed; lint 0 errors; tsc clean; build clean with both new routes.

### K9 (versjon + epic) — PASS

- `package.json` 1.76.2 → 1.77.1. CHANGELOG has new `## 1.77.y — Styr ditt eget spill` with 1.77.0 (cockpit) + 1.77.1 (hub) entries (three-layer structure, taglines, Teknisk details); the prior `1.76.y` series is re-wrapped in `<details>`.
- README capability line updated to describe roster management, mid-round withdrawal, scorecard approval, and the Klubbhuset hub.
- Norwegian copy in new strings is clean: action-verbs, "Trykk" (not "Tap"-anglism), no "Vennligst" overuse, no "X-spillet" redundancy, no em-dash chains, "spillere" not "roster". Humanizer-consistent.
- Epic-close + closing-comment + #392 comment are "gjenstår ved merge" — outside this branch's code, not blocking the build verdict.

---

## Gaps / concerns (none blocking; possible follow-ups)

1. **Withdraw/remove are inline buttons, no dedicated confirm page.** The admin surface uses `/admin/games/[id]/trekk-spiller/[userId]/` (a dedicated confirm route, per the project's "destructive actions use dedicated confirm pages" convention). The new creator `/games/[id]/spillere` does inline form-submit withdraw (page.tsx:192) and inline remove (page.tsx:180). This is **per the contract's explicit Design §5** (inline buttons), and withdraw is reversible (Angre) so it's borderline-destructive — but it's a UX-consistency divergence from the admin pattern worth noting. Not a defect against the spec.

2. **Profil "Klubbhuset" row is unconditional (shown to admins too).** Home gates the link to non-admins-with-≥1-game; Profil shows it to everyone including admins. For an admin who created 0 games normally, `/klubbhuset` simply renders the empty state. Harmless, and the contract left hub-entry visibility to discretion. Minor inconsistency only.

3. **No live UI proof of logged-in rendering.** OTP-by-mail login + no local Supabase env means form rendering and the actual redirect-to-login could not be exercised end-to-end locally (the dev server 500s in the proxy on missing env, returning 500 not 307 for unauth hits). Gating is nonetheless proven by: (a) proxy matcher excludes both routes from the public allowlist → all unauth requests redirect to `/login`; (b) page-level `getUser()`/`requireAdminOrCreator` gates. Owner should spot-check the rendered cockpit on prod at deploy (already noted in the contract).

4. **`cancelGameInvitation` / pending-invite list rely on the new 0072 SELECT/DELETE policy** — verified at the DB level (T3/T5), but the action's DELETE filters only on `id` + `game_id` (not `invited_by`), leaning on RLS to scope a creator to their own invites. That is correct (RLS enforces `invited_by = auth.uid()`), and admins can cancel any via admin-write. Defense-in-depth is fine as-is.

---

## Gates (observed)

| Gate | Result |
|------|--------|
| `npm run lint` | **0 errors, 23 warnings** — all warnings pre-existing in untouched files (`leaderboard/*View.tsx` unused `_gameId`/`_gameStatus`, `profile/statistikk/page.tsx` unused `userId`). |
| `npx tsc --noEmit` | **clean** (exit 0). |
| `npx vitest run app/admin/games/[id] app/games/[id]` | **328 passed (40 files)**. |
| `npx vitest run` (full) | **2657 passed (218 files)**, 0 failures. |
| `npm run build` | **Compiled successfully**; route table contains `ƒ /games/[id]/spillere` and `ƒ /klubbhuset`. |
| RLS rollback test (Supabase MCP) | T1ins=1, T2blocked=t, T3sel=1, T4othersel=0, T5del=1; leftover_invites=0, leftover_games=0. |
| `get_advisors security` | No new warnings vs pre-existing baseline. |

Branch commits match the contract's per-K SHA claims: dde3c81 (RLS), 9b29609 (invite actions), dbe80ff (withdraw+approve), 6a669ab (cockpit+game-home entry), 2470864 (hub).
