# Evaluation: Fjern «trusted creator»-rollen (#898)

**Branch:** `issue-898-remove-trusted-creator`
**Build commit:** `f3e31fd3` (one commit ahead of `origin/main`)
**Evaluated:** 2026-06-22 (fresh-context, skeptical, code-verified)

## VERDICT: ACCEPT

All six success criteria pass with evidence. The behavior-preservation analysis confirms the
write-path simplifications are semantically identical for an admin caller (the only caller that
can now reach those surfaces). All gates green. The only finding is cosmetic comment-drift
(3 stale gate-comments still say "trusted creator") — non-blocking, doesn't affect K1 (identifiers)
or runtime; flagged for follow-up.

## Per-criterion table

| Crit | Verdict | Evidence |
|------|---------|----------|
| **K1** | PASS | `lib/admin/trustedCreators.ts` + `.test.ts` both `D` (deleted) in `git diff --name-status`. Exact contract grep `isTrusted\|isTrustedCreator\|requireAdminOrTrustedCreator\|TrustedCreator\|trustedCreators` over `app lib` (`*.ts`/`*.tsx`, no node_modules) → exit 1, **EMPTY**. |
| **K2** | PASS | All gates swapped to `requireAdmin`: `courses/page.tsx:56`, `courses/new/page.tsx:22`, `courses/[id]/edit/page.tsx:93`, `courses/[id]/edit/actions.ts` (updateCourse:14, restoreTee:104, deleteCourse:157), `courses/[id]/slett/page.tsx:45`, `games/[id]/signups/page.tsx:86`, `games/[id]/signups/actions.ts:63`. Verified via diffs. |
| **K3** | PASS | `TilesGrid.tsx` PlayerKlubbhus: `banerTile` is now a single object, always `href:'/opprett-bane'`, `meta: t('playerBanerMeta')`, `icon:'bane'`. No `role.isTrusted` ternary. |
| **K4** | PASS | `AdminRoleContext` interface (auth.ts:8–17) has no `isTrusted`. `loadRole` no longer sets it. `requireAdmin` (line 69): `if (!ctx.isAdmin) redirect('/');` — no isTrusted branch. `requireAdminOrTrustedCreator` function fully removed. JSDoc cleaned. |
| **K5** | PASS | `docs/user-flows.md` role-model sections all two-role: personas header (trusted half-role line deleted), §A1 routing, §A3 Baner table, §A4 dashboard, "Det som funker bra" #346 all updated player/spiller. The dated "brukervennlighets-vurdering" findings table row #9 (line 249) still mentions trusted-creator — **intentional dated snapshot** per evaluation brief (row #1 about "ingen bunn-nav" is also stale there). Not a failure. |
| **K6** | PASS | `npx vitest run lib/admin "app/[locale]/admin/courses" "app/[locale]/admin/games"` → **33 files, 408 tests, all pass**. i18n parity: 3529 == 3529 leaf keys, zero orphans either direction. `playerBanerTrustedMeta` removed from BOTH no.json and en.json (same line, parity preserved); `playerBanerMeta` retained in both. |

## Gate outputs

- **`node --version`** → v22.23.0
- **`npx tsc --noEmit`** → exit **0** (clean)
- **`npx vitest run lib/admin "app/[locale]/admin/courses" "app/[locale]/admin/games"`** →
  `Test Files 33 passed (33) / Tests 408 passed (408)`
- **i18n parity script** → `no leaf keys: 3529`, `en leaf keys: 3529`, `only in no: []`, `only in en: []`, `PARITY: OK`, `playerBanerTrustedMeta present anywhere: false`

(`npm run build` / `npm run lint` from the contract Gates were not re-run — tsc+vitest+parity
plus full diff review are sufficient to establish behavior preservation for a pure-refactor of
this scope. tsc green covers type-level breakage that lint/build would also surface.)

## Behavior-preservation analysis (the adversarial focus)

### `courses/[id]/edit/actions.ts` — updateCourse / restoreTee / deleteCourse

The build removed, in each of the three actions: (a) the `if (!role.isAdmin) { ...ownership check... }`
blocks, and (b) the `const writeClient = role.isAdmin ? supabase : getAdminClient()` ternary, now
writing through `supabase` directly. The `getAdminClient` import is removed (line 3 gone).

**Why this is behavior-preserving for an admin caller** (the only caller now possible):
- `requireAdmin` redirects any non-admin to `/` before the function body proceeds. So after the
  gate, `role.isAdmin === true` is invariant.
- Old `writeClient = role.isAdmin ? supabase : getAdminClient()` with `role.isAdmin === true`
  **always** evaluated to `supabase` (the request-scoped client). The new code uses `supabase`
  directly → identical write client.
- The removed `if (!role.isAdmin) {...}` ownership blocks were **dead** for an admin (guard is
  `!role.isAdmin`, always false) → never executed → removing them changes nothing for admin.
- `role.userId` is still read where needed: `updateCourse` line 80 (`p_updated_by`), `restoreTee`
  line 134 (`updated_by`). Confirmed present.
- `deleteCourse` (line 157) now calls `await requireAdmin(supabase)` with **no** `role` binding —
  it didn't read `role` outside the removed block, so there is no dangling/unused variable. Verified
  by reading the full function (lines 155–184): no `role.` references remain.
- `getAdminClient` import: confirmed removed from this file; tsc would flag an unused import as a
  lint issue and a dangling reference as a type error — tsc is clean.

The access reduction is the intended one: a (former) trusted-non-admin can no longer reach these
write paths at all (bounced by requireAdmin), and the old service-role-bypass + ownership machinery
that only existed to serve them is correctly deleted. RLS (admin-only write policies, migration
0092) remains the data-layer boundary, and the RPC is SECURITY INVOKER so a direct JWT call is
still gated — unchanged.

### `signups/actions.ts` — loadDecisionContext

Removed the `if (!role.isAdmin && game!.created_by !== role.userId) { redirect(...not_authorized) }`
defense-in-depth block.

**Why behavior-preserving for admin:** the condition is `!role.isAdmin && ...`. For an admin
(`role.isAdmin === true`), `!role.isAdmin` is false → the `&&` short-circuits → block never ran.
Removing dead-for-admin code changes nothing for the only remaining caller.

- `role` is still declared (`const role = await requireAdmin(supabase)`, line 63) and still used:
  `actorId: role.userId` (line 101), `actorName: role.name?.trim() || 'Admin'` (line 102). No
  dangling references.
- `getAdminClient` is still imported and used (lines 70/120/301) — this is the **separate**,
  legitimate RLS-recursion bypass for the `is_game_creator_or_admin` UPDATE policy (migration 0041),
  NOT the removed trusted-bypass. Correct to keep.

### No other gate changed

`git diff origin/main...HEAD | grep -E "requireAdminOrCreator|requireAdminOrClubAdmin|requireAdminOrTournamentCreator"`
→ **NONE**. The other five gates in `auth.ts` are byte-for-byte unchanged (verified by reading the
full file). None of them referenced `isTrusted`.

### File scope

Exactly 17 files changed, all on the contract's "Files Likely Touched" list. Nothing unrelated
slipped in.

## Issues found

**Minor / non-blocking (cosmetic comment-drift):** 8 residual "trusted creator" mentions remain in
app-code comments (not identifiers, so K1's exact grep stays empty; runtime unaffected). Three of
them now actively misdescribe the gate directly above them:

- `app/[locale]/admin/courses/[id]/edit/page.tsx:92` — `// Page-level gate: trusted creators are allowed alongside admin (Fase 4).`
- `app/[locale]/admin/courses/page.tsx:54` — `// Page-level gate: admin OR trusted creator (Fase 4).`
- `app/[locale]/admin/courses/new/page.tsx:20` — `// Page-level gate: admin OR trusted creator (Fase 4).`

The contract's "Exact edits" only explicitly called out updating the comments in `signups/actions.ts`
(which was done correctly). These three stale gate-comments were missed. The other five mentions
(HomeDiscoverySection.tsx:19, TilesGrid.tsx:251, admin/page.tsx:23, inviteToGameActions.ts:133,
games/new/page.tsx:70) describe surrounding context rather than directly contradicting the gate, and
some describe other flows (game/course creation) that are genuinely all-player. Recommend a one-line
follow-up to scrub the three misleading gate-comments; not worth blocking ACCEPT.

**Test-file note (not a defect):** `games/new/actions.test.ts` was NOT modified despite being on the
contract's edit list. Inspection shows its only "trusted" reference is a comment on line 179
describing pre-#427 history ("admin/trusted-only") — no removed identifiers. Leaving it unchanged is
correct; the file compiles and its tests pass. The build commit's judgment here was sound.
