# Evaluation: #524 — Klubb-scopet CUP (Fase 2 av epos #480)

**Verdict: ACCEPT**

Branch `claude/wizardly-williams-94c855`, 7 commits, base `main`. Evaluated independently against
`.forge/contracts/524-klubb-cup.md`. All gates pass, all success criteria verified with concrete
evidence (live RLS probes, build output, file inspection). No blockers, no should-fix items.

---

## Gate results (run by evaluator, not trusted from builder)

| Gate | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` | PASS | Exit 0, no output |
| `npx vitest run lib/cup "app/admin/cup/[id]" "app/klubber/[id]"` | PASS | 8 files, 69 tests passed |
| `npm run lint` | PASS | 0 errors, 23 warnings (all pre-existing, e.g. `app/games/[id]/page.tsx` unused `Button`) |
| `npm run build` | PASS | Compiled successfully in 3.3s; all 8 cup routes register (4 admin + 4 klubb) |
| Migration applied to prod | PASS | `list_migrations` shows `20260608205034 tournaments_group_scoping` as latest |
| Live RLS write probes (rolled back) | PASS | 4/4 probes match contract expectation (see below) |
| Live RLS SELECT probe (rolled back) | PASS | member sees / non-member blocked / frittstående visible |
| `get_advisors` (security) | PASS | 0 findings reference `tournaments`; 57 lints all pre-existing project-wide patterns |
| Humanizer pass on new Norwegian copy | PASS | No AI-tells in new user-facing strings |
| Prod table clean after probes | PASS | `tournaments_count = 0` before and after all probes |

---

## Success criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Migration 0089 (group_id + scoped SELECT + admin/club-admin WRITE) added + applied; types updated | PASS | `0089_tournaments_group_scoping.sql` matches contract verbatim. Live DB: `group_id uuid` nullable; policies `tournaments select scoped` (`group_id IS NULL OR is_admin() OR is_group_member(group_id)`) + `tournaments admin or club-admin write` (`is_admin() OR (group_id IS NOT NULL AND is_group_admin(group_id))`) for both USING and WITH CHECK. Old `tournaments_select_authenticated` dropped. `database.types.ts` has `group_id` in Row/Insert/Update + FK to groups (`git diff` lines 1431/1450/1469 + relationship). |
| 2 | Write-bug fixed: global admin can insert frittstående cup (was 42501) | PASS | Probe 1 (authenticated, sub=Jørgen global admin, group_id=null insert) = **ALLOWED**. Self-aborting DO block; no row persisted. |
| 3 | Club owner/admin creates klubb-cup from `/klubber/[id]`; cup gets `group_id`; lands on `/klubber/[id]/cup/[cupId]` | PASS | `ClubCupsSection` «Ny cup» → `/klubber/{clubId}/cup/ny`. `createTournamentDraft` reads `group_id` from hidden field, gates via `requireAdminOrClubAdmin`, inserts with `group_id`, redirects to `/klubber/${groupId}/cup/${data.id}` (actions.ts:165-195). Probe 2 (club owner non-global, own-club insert) = **ALLOWED**. |
| 4 | Generation picker shows ONLY club members; server filter rejects non-members | PASS | `GenerateMatches.tsx:102-111` sources from `getClubMemberOptionsForClub(groupId)` when `group_id` set. `createCupMatchesFromPlan` (generer/actions.ts:96-107) fetches `group_members` via admin client and rejects (`{error:'not_members'}`) if any `side1`/`side2` uid is not a member — before any insert. Unit-tested (actions.test.ts:327, "B3 mangler" → not_members, no inserts). |
| 5 | Club admin (is_admin=false) runs full chain (generate→start→finish→delete) from klubb-flater without admin-chrome | PASS | All 4 klubb routes gate with `requireAdminOrClubAdminOfCup` and pass `variant="club"`. CupManagement/GenerateMatches/CupDeleteConfirm switch to `AppShell` (not AdminShell) for club. Write actions (`start/finish/update/deleteTournament`, `createCupMatchesFromPlan`) all use `requireAdminOrClubAdminOfCup`. Probe 2 confirms non-global club owner can write. |
| 6 | Shared CupManagement/GenerateMatches/CupDeleteConfirm; both admin + klubb routes render them (no duplicated markup) | PASS | Styling/management JSX lives only in the 3 shared components in `app/admin/cup/[id]/`. Admin pages are thin (`page.tsx` 31 lines, `generer/page.tsx` 12, `slett/page.tsx` 30). Klubb routes import from `@/app/admin/cup/[id]/...`. Cross-route imports resolve (build PASS). |
| 7 | Members see «Klubbens cuper» on `/klubber/[id]`; «Ny cup»/«Styr» only owner/admin | PASS | `klubber/[id]/page.tsx:83-87` fetches `tournaments where group_id=id`; renders `ClubCupsSection` with `canCreate={isAdmin && !frozen}`, `canManage={isAdmin}`. Type-C test (ClubCupsSection.test.tsx, 4 cases) verifies cup→`/cup/[id]` links, «Ny cup» gated on canCreate, «Styr» gated on canManage, empty-state. |
| 8 | RLS enforced: member SELECTs club cup, non-member doesn't; club-admin INSERTs, member rejected; frittstående unchanged. Non-member on `/cup/[id]` → notFound() | PASS | SELECT probe: member sees club cup=1, non-member=0, frittstående=1 (all expected). Probe 3 (club owner → frittstående insert) = **DENIED**. Probe 4 (non-member → club cup insert) = **DENIED**. App-layer gate in `app/cup/[id]/page.tsx:26-57`: club-scoped cup → `notFound()` unless participant, group member, or global admin (admin-client snapshot bypasses RLS so this gate is the real boundary on the shareable page). |
| 9 | MINOR bump 1.106.0 + CHANGELOG series | PASS | `package.json` = `1.106.0`. CHANGELOG: `## 1.106.y — Klubb-cup` series with theme heading + tagline blockquote + `[1.106.0]` entry; prior `1.105.y` series wrapped in `<details>`. |

---

## Live RLS probe detail (all wrapped in self-aborting DO blocks; prod table verified empty before + after)

Fixtures: global admin Jørgen `069cda6e...`, Lilleby club `e41770a7...` owned by non-global
`6a351800...` (confirmed `is_admin=false`, role=`owner`), non-member non-admin `7008ef5e...`.

| Probe | Actor | Action | Expected | Actual |
|-------|-------|--------|----------|--------|
| 1 | global admin | INSERT frittstående cup (group_id null) | ALLOWED | **ALLOWED** (write-bug fixed) |
| 2 | club owner (non-global) | INSERT own-club cup | ALLOWED | **ALLOWED** |
| 3 | club owner (non-global) | INSERT frittstående cup | DENIED | **DENIED** |
| 4 | non-member non-admin | INSERT club cup for Lilleby | DENIED | **DENIED** |
| 5a | club member | SELECT club cup | sees (1) | **1** |
| 5b | non-member | SELECT club cup | blocked (0) | **0** |
| 5c | non-member | SELECT frittstående cup | sees (1) | **1** |

These exercise the actual RLS policy (`auth.uid()` resolved from `request.jwt.claims`, `is_admin()` /
`is_group_admin()` / `is_group_member()` SECURITY DEFINER helpers). The gate (`requireAdminOrClubAdminOfCup`)
is UX; the RLS WITH CHECK is the security backstop — both verified.

---

## Adversarial checks (gaps the builder might have missed)

- **Admin-chrome leak in club variant:** Verified hidden. Club variant uses `AppShell`, hides the
  manual `+ Singles/Fourball/... match` links (which point at `/admin/games/new`), and renders matches
  as info-cards (no `SmartLink` to `/admin/games/[id]` drill-in). `CupManagement.tsx:246, 315-323`.
- **Member guardrail field names:** `m.side1`/`m.side2` match `PlannedMatch` type (cupPairing.ts:33,35). Correct.
- **`group_id` propagated to match-`games`:** `createCupMatchesFromPlan` sets `group_id: groupId` on each
  game insert (generer/actions.ts:148); unit-tested (firstGame.group_id === 'club-1').
- **Existing frittstående admin flow unchanged:** `createTournamentDraft` with empty group_id still uses
  `requireAdmin` and redirects to `/admin/cup/[id]?status=created`. Admin `generer/page.tsx` keeps
  `requireAdmin` (global-admin-only, admin-chrome route — correct; club-admin reaches generation via the
  klubb route). Probe 1 confirms frittstående creation works for global admin (it was broken before, now fixed).
- **`/admin/cup` LIST stays global-admin-only:** not touched; club-admin reaches their cup via «Styr». Per contract.
- **Stale routes:** the two `/admin/cup/new` hits are both in comments documenting the route's removal. No live references.
- **Redirect targets:** all point at routes that exist (verified against the 8 registered routes).
- **Cross-route imports:** 3 klubb pages import shared components from the admin tree; all resolve (build PASS).
- **Copy quality:** humanizer pass on the new user-facing strings — no anglicisms, no særskriving, no
  «vennligst», no em-dash chains, imperative sporty-kompis voice. «matches/matcher» loan is consistent with
  the existing shipped cup vocabulary, not a new tell. The one «match-spillet» hit is in a code comment, not UI.
- **Test discipline:** ClubCupsSection has one Type-C render test (4 assertions of structure/gating, no
  number re-assertion). createCupMatchesFromPlan unit tests extended with 2 klubb-cup cases (group_id +
  member guardrail). Within discipline.

---

## Issues found

None of blocker or should-fix severity.

**Nits (non-blocking, no action required):**
- `GenerateMatches.tsx:143` `kicker = variant === 'club' ? (clubName ?? 'Klubbhuset') : 'Klubbhuset'` — the
  ternary is redundant (both branches can be folded), but it's harmless and reads fine. Not worth a change.
- The `cupRedirectBase` helper re-reads `group_id` via the request-scoped client after the gate already
  resolved it via admin client; a marginal extra round-trip per management action. Acceptable (the gate's
  read is admin-scoped; the helper's read needs request scope for revalidation context). Not a correctness issue.

## Conclusion

The work faithfully mirrors the shipped klubb-LIGA pattern, fixes the latent global-admin write-bug as a
clean side effect, and the security boundary holds at both gate and RLS layers (verified live, not assumed).
The full create→generate→start→finish→delete chain is reachable end-to-end in klubb-chrome with no
admin-chrome leakage. Frittstående admin flow behavior is unchanged for global admin (and now actually works).
**ACCEPT.**
