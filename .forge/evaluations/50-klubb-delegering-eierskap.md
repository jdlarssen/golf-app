# Evaluation: #50 — Klubb-eierskap, delegering & tilgangsstyring

**Verdict: ACCEPT**

Skeptical, independent verification of contract `.forge/contracts/50-klubb-delegering-eierskap.md` (C1–C7). All gates re-run green; all seven criteria verified by code + schema + gates. Function bodies read from `pg_proc` on prod (`glofubopddkjhymcbaph`) match the contract's stated guards. No authz holes found after a genuine adversarial trace of every mutation path. Live authed click-through is the only remaining residue (browser flows are session-gated) — listed at the bottom as the human follow-up.

---

## Gate results

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | **PASS** — exit 0, zero output. |
| `npx vitest run` | **PASS** — **219 files / 2668 tests passed** (matches contract claim; +1 vs #442 baseline = the new expiry test). |
| `npm run build` | **PASS** — exit 0, 34 routes. New routes present: `/admin/klubber`, `/admin/klubber/[id]`, `/admin/klubber/ny`, `/klubber/[id]/rolle/[userId]`. **`/klubber/ny` ABSENT** from route list (deleted). |

---

## Per-criterion

| # | Status | Evidence |
| --- | --- | --- |
| **C1** Schema + RPCs (0076) | **PASS** | `pg_proc`: `create_club` GONE (not in result set); `admin_create_club` + `set_club_member_role` exist, both `prosecdef=true`. Grants: anon `can_execute=false`, authenticated `=true` on both. `information_schema.columns`: `groups.member_cap` (int, nullable) + `valid_until` (timestamptz, nullable). CHECK `groups_member_cap_positive` = `((member_cap IS NULL) OR (member_cap >= 1))`. `notifications_kind_check` includes `'club_role_changed'`. Backfill: only group `Tørny` exists, `member_cap=null, valid_until=null` (grandfathered). `lib/database.types.ts` regenerated (+118 lines, `create_club` removed). **Function bodies (prosrc) match contract exactly** — see below. Migration file `0076` on disk = prod state. |
| **C2** Gating | **PASS** | `app/klubber/page.tsx:71-86` shows the `klubb@tornygolf.no` contact `Card`, no create door. `app/klubber/ny/` deleted (`git diff` shows -143 lines: page.tsx + actions.ts). `grep create_club app/ lib/` → only `admin_create_club` refs (correct); zero `create_club` calls. `create_club` dropped in DB (C1). No dangling refs to the deleted route/action (`grep` clean). |
| **C3** Admin create/transfer | **PASS** | `/admin/klubber{,/ny,/[id]}` all gated by `requireAdmin(supabase)` via cached context; `requireAdmin` redirects non-admins (`lib/admin/auth.ts:71-75`: `if (!ctx.isAdmin) redirect(...)`). `createClubForAdmin` (`actions.ts:54-67`) maps `owner_not_found` → friendly `?error=owner_not_found&email=…` (and all other RPC errors). RPC `admin_create_club` is the real gate (`is_admin()` first, raises `not_authorized`). `updateClubTerms` (`[id]/actions.ts:31-40`) gates `is_admin` in code (reads `users.is_admin`, redirects `/admin` if false) **before** the admin-client `groups` UPDATE — the defense-in-depth the contract required. Admin tile repointed to `/admin/klubber` inside `TilesGrid()` which only renders for `role.isAdmin` (non-admins get `PlayerKlubbhus` → `/klubber`). |
| **C4** Delegation + notify | **PASS** | `/klubber/[id]/rolle/[userId]/page.tsx:64` owner-only (`if (myRole !== 'owner') redirect`). `setMemberRole` (`actions.ts:46-93`) maps `last_owner`/`not_member`/`not_authorized`; notify is **awaited** — `await Promise.allSettled([notify({kind:'club_role_changed'})…])` at L79-89 **before** `redirect()` at L93 (not fire-and-forget — confirmed). «Endre rolle» link on club page (`[id]/page.tsx:238`) gated `myRole === 'owner' && member !== self`; admins see «Fjern» but not «Endre rolle». Notification kind fully wired: `NotificationKind` union + `clubRoleChangedSchema` (zod) registered in `schemas`; `NotificationCard` EMOJI `🔑` + `buildCardContent` case (3 role messages); `InboxClient` deeplink → `/klubber/[group_id]`. |
| **C5** Member cap | **PASS** | RPCs `add_club_member_by_email` + `decide_join_request` (prosrc) return `'club_full'` when `v_cap is not null and count(members) >= v_cap`, **before** the membership insert. `app/klubber/[id]/actions.ts:63` maps `club_full` → `?error=full`; page L94-96 → "Klubben er full (maks {n} medlemmer)."; decide branch → `decidedMessages.club_full` "…Forespørselen står fortsatt åpen." Member count shows `n / cap` (page L221-222, admin list L73, admin detail L93-94). `member_cap = null` = unlimited (guarded everywhere). |
| **C6** Expiry freeze | **PASS** | `lib/clubs/clubStatus.ts` `isClubExpired` = derived (`null→false`, else `valid_until < now`), no cron. Used in: `getDiscoverableGames` (filters expired club IDs **before** games query + **new test** asserting `clubGames===[]` AND `inArg` NOT called with `group_id`); `newGameFormData` (expired clubs excluded from picker); `createGameInternal` (drops `group_id→null` if expired); `app/klubber/[id]/page.tsx` (frozen banner L155 + freezes add-member/del-lenke L271 `!frozen` + «sett opp runde» L262 `!frozen`). Ongoing games NOT coupled to group status (no game-status path reads `valid_until`). RPCs also return `club_expired` before insert. End-of-day semantics sane (verified live: `valid_until = today T23:59:59Z` → not expired; yesterday → expired). |
| **C7** No regression + gates | **PASS** | 0076 grep for `create/alter/drop policy` + `enable/disable row` → **none** (additive only: columns, functions via CREATE OR REPLACE, 1 constraint, kind-CHECK drop/re-add). `group_members` RLS policies unchanged (SELECT/INSERT/UPDATE/DELETE all still `is_admin() OR is_group_*`). `docs/user-flows.md §0` updated with full gated-club model (admin-create, eneeier, cap, valid_until, delegation, last-owner, notify, freeze, ongoing-games-finish). `package.json` 1.79.4 → 1.80.3. CHANGELOG has three-layer 1.80.1/.2/.3 entries, all `#50`. All gates green (above). |

### Function-body checks (read from `pg_proc.prosrc` on prod)

- **`admin_create_club`**: `is_admin()` gate first (`raise not_authorized`); name validation (`name_required`, `name_too_long`); `owner_not_found` raised **before** any insert (no club created — rollback moot); inserts `groups(created_by=auth.uid()=admin, member_cap, valid_until)` then `group_members(owner, 'owner')`. **Admin is NOT added as member.** ✓
- **`set_club_member_role`**: requires auth (`not_authenticated`); caller `owner OR is_admin()` else `not_authorized`; target must be member else `not_member`; last-owner guard `v_target_role='owner' AND p_role<>'owner' AND owner_count<=1 → last_owner`; then UPDATE. ✓
- **`add_club_member_by_email` / `decide_join_request`**: both check `valid_until < now() → club_expired` and `member_cap not null AND count >= cap → club_full` **before** the membership insert, on the add/approve path only. Reject branch correctly skips checks; request stays `pending` on expired/full (status UPDATE only runs after). ✓

---

## Bugs / gaps / risks (genuine hunt — none blocking)

After tracing the authz on every mutation (RLS + RPC + code gate) and reading all new source, **no blocking defects found.** Observations, all low-severity / by-design:

1. **`valid_until` is end-of-day UTC, not Norwegian time** (`${date}T23:59:59Z`, `ny/actions.ts:44`, `[id]/actions.ts:52`). A club set to expire "5. juni" actually freezes at ~01:59/02:59 Norwegian time on 6. juni (UTC+1/+2). The grace is always **in the customer's favour** (club lives slightly longer, never shorter), and the admin UI labels it "Gjelder til og med midnatt denne dagen." For a soft, reversible, admin-managed freeze this is benign. Not a fix-blocker.
2. **Cap counts all members incl. owner** (RPCs count all `group_members` rows). `member_cap=10` means 10 total incl. the owner. Reasonable interpretation of "max members per avtale"; contract said `count(members) >= member_cap` and this is faithful. Worth confirming with the owner that "tak = total membership incl. eier" is the intended business semantics, but not a code defect.
3. **`getAllClubsForAdmin` / `getClubForAdmin` use admin-client (RLS bypass) with no internal auth gate** — they rely entirely on the `requireAdmin` page gate. Verified both are imported ONLY by the two `requireAdmin`-gated pages (`grep`). This mirrors the established `getGameWithPlayers` pattern (admin-client + call-site authz). Safe today; a future un-gated importer would leak all clubs, but that's a latent-pattern note, not a current hole.
4. **`set_club_member_role` page redirects a global `is_admin` who is not the owner** (`myRole !== 'owner'`), even though the RPC would let them through. This is deliberate per the contract (admins govern via `/admin/klubber/*`, not the member page). Not a bug.
5. **RLS `group_members UPDATE` policy is `is_admin() OR is_group_admin()`** — broader than the RPC's `owner OR is_admin` guard. A plain group-**admin** could in theory UPDATE a role row via a direct table write, bypassing the owner-only RPC guard. The app never exposes a direct table UPDATE (all role mutation goes through the `security definer` RPC, which ignores RLS), so there's no app-level path to exploit it. Flagging as a theoretical surface only; not introduced by #50 and not reachable from the UI.

**`create_club` drop safety** (cross-cutting check): the deleted `createClub` action (git history) had a catch-all `console.error → redirect('?error=unknown')` on any unmapped RPC error, so a `PGRST202 function-not-found` would degrade to a friendly "Noe gikk galt" rather than a 500 — but moot, since both the `/klubber/ny` page and its action are deleted. A bookmarked `/klubber/ny` now 404s (route gone). Drop is safe.

---

## Needs live authed verification (human, in prod)

These require a logged-in session + test data, not verifiable headlessly. Code + schema + gates already prove the logic; this is the click-through confirmation:

1. **Non-admin `/klubber`**: see the `klubb@tornygolf.no` contact card, no «Opprett klubb» door; `/klubber/ny` 404s.
2. **Admin create** (`/admin/klubber/ny`): create a club with an existing-user owner email + cap + end-date → owner becomes sole `owner`, admin is NOT a member; unknown email → friendly "Fant ingen Tørny-bruker…", club not created.
3. **Admin edit** (`/admin/klubber/[id]`): change cap / set or clear end-date → "Avtalen er oppdatert"; status badge flips Aktiv ↔ Utløper {dato} ↔ Utløpt.
4. **Owner delegation** (`/klubber/[id]/rolle/[userId]`): owner promotes a member to admin/owner and demotes; affected member receives the `club_role_changed` (🔑) inbox notification deeplinking to the club; sole-owner demotion blocked with the friendly banner; a non-owner member hitting the URL directly is redirected.
5. **Cap enforcement**: fill a club to its cap → add-by-email and approve-request both show "Klubben er full (maks {n} medlemmer)"; pending request stays pending.
6. **Expiry freeze**: set a club's end-date to the past → it disappears from «Finn turneringer», is absent from the wizard's club picker, add-member/del-lenke/«Sett opp en runde» are hidden behind the "utløpt" banner, and an **already-running** game in that club still works; extend the date → club reactivates.
