# Evaluation: #442 — Opprett klubb (eierskap + klubb-scoped oppdagbarhet)

## Verdict: ACCEPT

All seven success criteria (C1–C7) are met with independently-gathered evidence. The three quality
gates are green. The DB schema, RLS, RPCs and authz were verified behaviorally against the live
Supabase project (`glofubopddkjhymcbaph`) inside rolled-back transactions, and the security-critical
server-side authz paths were confirmed by code review. No blocking bugs, security gaps, or
regressions found.

Branch: `claude/zealous-dirac-be94d4` · range `f840f52..HEAD` (commits `b5cda84`…`e0b8564`).
Working tree clean.

---

## Gate results

| Gate | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` | ✅ PASS | exit 0, zero output |
| `npm run build` | ✅ PASS | exit 0; all 6 new `/klubber/*` routes present in route table (`/klubber`, `/klubber/[id]`, `/klubber/[id]/fjern/[userId]`, `/klubber/[id]/forlat`, `/klubber/bli-med/[shortId]`, `/klubber/ny`) |
| `npx vitest run` | ✅ PASS | **219 files / 2667 tests passed (0 failed)** |
| Supabase security advisors | ✅ no new holes | only pre-existing INFO/WARN patterns; club RPCs do **not** appear in the anon-executable list; the `authenticated`-can-execute WARN on the 3 club RPCs is expected (they enforce authz internally) |

---

## Per-criterion verdict

### C1 — Schema applied ✅
Verified directly via `execute_sql` against `glofubopddkjhymcbaph`:
- `games.group_id` — uuid, nullable; FK `games_group_id_fkey → groups`, **`ON DELETE SET NULL`**; partial index present.
- `groups.short_id` — `NOT NULL`, default `generate_group_short_id()`, `CHECK (short_id ~ '^[0-9a-z]{8}$')`, `UNIQUE`. **0 groups** without short_id (all backfilled; total_groups=1).
- `group_join_requests` — exists, **RLS enabled**, columns match the spec (`id, group_id, user_id, status, message, decided_at, decided_by_user_id, created_at`), `UNIQUE(group_id,user_id)`, `CHECK message length ≤ 200`. **4 RLS policies** confirmed and matching the contract verbatim: SELECT `user_id=auth.uid() OR is_group_admin`, INSERT with_check `user_id=auth.uid() AND status='pending'`, UPDATE(admin) `is_group_admin`, UPDATE(self-withdraw) pending→withdrawn.
- 3 RPCs `create_club`/`add_club_member_by_email`/`decide_join_request` — all `prosecdef=true`, `search_path=""`, correct signatures/returns. `anon=false`, `public=false`, `authenticated=true` for all three (anon revoked, per spec).
- `notifications_kind_check` includes `'club_join_request'`.
- `lib/database.types.ts` diff = +78 lines additive (group_id, group_join_requests, RPC signatures).

### C2 — Opprett klubb + owner-bootstrap + cap ✅
Behavioral SQL test inside a rolled-back `DO $$ … RAISE EXCEPTION 'RESULT …'` block, calling
`create_club` as a real user (`set_config('request.jwt.claims', …, true)`):
```
c1=t c2=t owner_role=owner c1_members=1 cap_raise=club_cap_reached
```
Creator becomes `owner`, the 1st club has exactly 1 member (the owner), and the **3rd** creation
raises `club_cap_reached` — cap=2 enforced server-side. UI: `app/klubber/ny/actions.ts` maps the
error to a friendly Norwegian message (`?error=cap`); `app/klubber/page.tsx` cap-gates the
"Opprett klubb" door; "Klubber"-tile in both Klubbhuset branches (`app/admin/page.tsx`). Migration
0075 lines 130–158 show the RPC does the group-insert + owner-membership atomically.

### C3 — Klubb-side + medlemsstyring ✅
- `lib/clubs/getClubDetail.ts:70` — `if (!myMembership) return null;` gates membership **before** the
  admin client touches member names / join requests. A non-member gets `null` → no leak. Pending
  requests fetched only for owner/admin (`isAdmin` branch, lines 90–97); members get `[]`.
- `add_club_member_by_email` behavioral test (rolled back):
  `added=added already=already_member notfound=not_found sondre_member=t nonadmin_blocked=not_authorized`
  — existing email added (membership row created), repeat → `already_member`, unknown email →
  `not_found` (no leak), and a **non-admin caller is blocked** with `not_authorized`.
- Dedicated confirm routes `…/fjern/[userId]` + `…/forlat`. Last-owner guards verified by code review:
  `fjern/[userId]/actions.ts:56–67` blocks removing the sole owner (`ownerCount <= 1` → `?error=sole_owner`);
  `forlat/actions.ts:47–51` blocks the sole owner from leaving. Both require admin/owner and use the
  request-scoped client for the DELETE (RLS double-check).

### C4 — Bli-med-lenke ✅
- `app/klubber/bli-med/[shortId]/actions.ts` — `requestToJoin`: admin-resolves `short_id` → `group`,
  short-circuits if already a member, then **RLS self-insert** of a `pending` row via the
  request-scoped client (policy `self insert pending`), duplicate → friendly "already sent", then
  best-effort `notify({kind:'club_join_request'})` to **all** owners/admins via `Promise.allSettled`.
- New `club_join_request` notification kind handled in all three exhaustive sites:
  `lib/notifications/types.ts` (union + zod schema + schemas map), `components/notifications/NotificationCard.tsx`
  (EMOJI Record + buildCardContent switch case), `app/innboks/InboxClient.tsx` (buildDeeplink → `/klubber/[group_id]`).
  Build passing confirms no missing exhaustive case.
- `decide_join_request(approve)` behavioral test (rolled back):
  `nonadmin_blocked=not_authorized approve_status=approved membership_created=t` — a non-admin is
  blocked, owner-approve returns `approved` and **creates the membership row**.

### C5 — Spill knyttes til klubb ✅
- `app/admin/games/new/actions.ts:147–161` — `createGameInternal` reads `group_id` from the form,
  then **verifies the user is a member** of that club (request-scoped `group_members` lookup); a
  manipulated/non-member value is silently dropped to `null` (not honored). `group_id: groupId` set
  on the insert (line 192). A user **cannot** scope a game to a club they're not a member of.
- `lib/games/newGameFormData.ts` returns `clubs` from the user's own `group_members` rows
  (request-scoped, RLS-gated — no cross-user leak); GameWizard offers only those clubs.
  `?klubb=<id>` preselect + hidden `group_id` field, mirroring the `registration_mode` plumbing.

### C6 — Klubb-scoped oppdagbarhet + join ✅ (core value)
- `lib/games/getDiscoverableGames.ts` — `clubGames` is **only queried when the user has ≥1 club
  membership** (`if (myClubIds.length > 0)`, line 98). The club query has **no `registration_mode`
  filter** → invite_only club games appear for members; it excludes own-created and
  joined/requested games. A **non-member never triggers the club query**, so they never see an
  invite_only club game. The global open list still filters to `open`/`manual_approval`, so
  invite_only-without-group_id stays private (#357 unchanged).
- **Dedup** (lines 131–136): `openExcludedIds` includes every `clubGames` id, so a club game that is
  also `open` is removed from the global list — club section wins, no double-show.
- The 3 new tests in `getDiscoverableGames.test.ts` assert exactly these behaviors (member sees
  invite_only with group_name; non-member → no `group_id` query / empty; dedup adds club id to
  open-list exclusion) — all green in the 2667-pass run.
- Direct-join (server-side, client untrusted): `app/signup/[shortId]/actions.ts:145–158` —
  `canDirectJoin = mode==='open' OR (game.group_id && server-side group_members lookup)`; a non-member
  of a club invite_only game gets `wrong_mode`. `getGameByShortId` now selects `group_id`.
  `app/signup/[shortId]/page.tsx` mirrors the rule to show "Meld meg på" to a club member on an
  invite_only club game. `app/HomeDiscoverySection.tsx` renders the "I dine klubber" section above
  the global open games with a "Meld meg på" CTA → `/signup/[shortId]`.

### C7 — Ingen regresjon + gates grønne ✅
- Build green; full vitest 2667/2667; tsc clean.
- Migration 0075 is purely additive: the only existing object touched is `notifications_kind_check`
  (drop + re-add with one extra value, established 0044/0069 pattern). No existing RLS policy,
  column, or function was altered. The #357 open/manual_approval discovery, the signup flow, and the
  #49 RLS substrate are unchanged in behavior (the discovery change is the additive `clubGames`
  key + dedup; existing `openGames`/`pendingRequests` paths preserved, and the "no clubs" default in
  the test mock makes the pre-existing #357 tests behave identically).
- New Norwegian copy reads naturally (action-oriented taglines, no obvious AI-tells); version bumped
  to `1.79.4` with a full three-layer CHANGELOG series for #442 (`1.79.0`…`1.79.4`).

---

## UI note — auth constraint (explicit)
Tørny uses OTP email login that cannot be automated, so the authenticated club UI flows cannot be
driven end-to-end via a browser. I started the dev preview server and probed the new routes
unauthenticated: **all** SSR routes (including the new `/klubber/*` AND pre-existing `/`, `/profile`,
`/admin`, `/finn-turneringer`, `/innboks`) returned HTTP 500, while `/login` returned 200. The
preview server logs show the cause is uniform: `proxy.ts:9 → createMiddlewareClient` throws because
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set in the preview environment.
This is a **preview-env limitation, not a #442 defect** — the new routes behave identically to every
existing SSR route and are present in the green production build. Authenticated logic was therefore
verified via code review + the gates + the behavioral SQL (above), as instructed.

---

## Bugs / security gaps / regressions found
None blocking. After genuinely probing the authz boundaries, I found no way for a non-member to read
a club's member names or join requests (getClubDetail gates first), no way to scope a game to a
non-member club (createGameInternal re-checks membership), no way for a non-member to direct-join a
club invite_only game (registerForOpenGame re-checks server-side), and no way to orphan a club (both
last-owner guards block). All three RPCs reject non-admin callers behaviorally.

### Minor, non-blocking observations
1. **Last-owner TOCTOU**: the `fjern`/`forlat` last-owner guards read `ownerCount` then DELETE in
   separate statements (not atomic). Two simultaneous owner-removals could in theory both pass the
   `<= 1` check before either DELETE commits. Practically negligible (2-club-cap solo-dev app, single
   owner today) and ownership/delegation is explicitly scoped to #50. Worth a hardening note, not a
   blocker.
2. **`generate_group_short_id()` mutable search_path** (advisor WARN): the function lacks
   `set search_path = ''`. It mirrors the existing `generate_game_short_id()` (same WARN) and only
   references the fully-qualified `public.groups`, so it is not a practical injection vector. Pattern
   parity is acceptable; could be tightened opportunistically.
3. **`requestToJoin` silently truncates** an over-200-char message to `null` rather than erroring
   (actions.ts:61–63). The DB CHECK is the real backstop; this is a cosmetic UX choice, not a bug.

These are observations, not defects against the contract.

---

## Skeptical checks that came back clean
- Confirmed anon **cannot** execute any of the 3 club RPCs (`has_function_privilege('anon', …)` = false for all).
- Confirmed `add_club_member_by_email` and `decide_join_request` **reject a non-admin caller** with `not_authorized` (behavioral, rolled back).
- Confirmed `getClubDetail` returns `null` for a non-member before any admin-client read (member-name leak path closed).
- Confirmed `createGameInternal` drops a manipulated `group_id` for a non-member club to `null` (no cross-club scoping).
- Confirmed `registerForOpenGame` `canDirectJoin` is computed **server-side** from a live `group_members` lookup, not from any client field.
- Confirmed both last-owner guards (`fjern`, `forlat`) block sole-owner removal/leave.
- Confirmed the discovery dedup excludes club-game ids from the global open list (test + code).
- Confirmed a non-member triggers **no** `group_id` discovery query (clubGames stays `[]`).
- Confirmed all 3 exhaustive `club_join_request` handler sites are present (build would have failed otherwise).
- Confirmed Supabase security advisors surface **no new** RLS-without-policy or anon-executable-secdef issue from migration 0075.
- Confirmed migration 0075 alters no existing policy/column/function except the additive notifications kind CHECK.
