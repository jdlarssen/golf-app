# Evaluering: #526 — Personlig cup for alle (capped)

**Verdict: ACCEPT**

Independently verified against the contract `.forge/contracts/526-personlig-cup.md` with fresh eyes,
reading every cited file, reasoning through the RLS-policy composition, probing the live database for
the actual applied policy state, and running the gates myself. The work is correct, the security
boundary holds, the klubb-cup (#524) flow is untouched, and the caps are enforced server-side. One
non-blocking correctness nuance and one test-coverage gap are noted below; neither blocks acceptance.

## Per-criterion verification

| K | Met? | Evidence I personally confirmed |
|---|------|----------------------------------|
| **K1** Opprettelse åpnet | ✅ | `lib/cup/actions.ts:167-169` — `createTournamentDraft` null-gren calls `getRoleContext(supabase)` (any logged-in user); klubb-gren still `requireAdminOrClubAdmin`. Insert sets `created_by: userId` (`:180`). Entry point reachable for non-admins: `IntentSelector.tsx:115-119` does **not** gate the `cup` tile (only `solo`+`klubb` are gated), and `/opprett-spill` renders `GameWizard` with `cupEligibleFormats` for all logged-in users (`app/opprett-spill/page.tsx:184-210`). |
| **K2** Ny RLS-policy | ✅ | `supabase/migrations/0090_tournaments_creator_write.sql` — ALL policy, USING+CHECK `(group_id is null and created_by = auth.uid())`. **Confirmed live** via `pg_policy` probe on prod: `tournaments creator write own personal` (polcmd `*`) present with exactly that expr, OR-ing permissively with `tournaments admin or club-admin write`. Composition reasoned through (see "Tried to break it"). |
| **K3** Styringsgate slipper gjennom skaper | ✅ | `lib/admin/auth.ts:185-198` `requireAdminOrTournamentCreator` (admin → pass; else `tournaments.created_by === userId` via admin-client lookup; else `redirect('/')`). `requireAdminOrClubAdminOfCup` (`:215-228`) null-gren delegates here. |
| **K4** Generer-side-gate relaksert | ✅ | `app/admin/cup/[id]/generer/page.tsx:12` uses `requireAdminOrClubAdminOfCup(supabase, id)`. Matches the action's gate. |
| **K5** Cup-lista scopet | ✅ | `app/admin/cup/page.tsx:59,68-70` — `getRoleContext`; non-admin query `.eq('created_by', userId).is('group_id', null)`; admin sees all. |
| **K6** Caps (ren logikk, TDD) | ✅ | `lib/cup/limits.ts` — `MAX_PERSONAL_CUP_MATCHES=4`, `MAX_PERSONAL_CUP_PLAYERS=24`, `exceedsPersonalMatchCap`/`exceedsPersonalPlayerCap` with admin-bypass. `limits.test.ts` 13/13 green (ran it: part of the 43-pass targeted run). |
| **K7** Caps håndhevet i generering | ✅ | `app/admin/cup/[id]/generer/actions.ts:115-148` — `else if (!isAdmin)` branch: counts existing games (`tournament_id`) + new matches → `too_many_matches`; distinct existing∪new players → `too_many_players`. Klubb-gren (`groupId`) and admin both skip. `isAdmin` comes from the gate, not the client. |
| **K8** Cap synlig i UI | ✅ (code) / ⚠️ (test) | `GenerateMatchesWizard.tsx` — `matchCap` prop, step-3 info/warning Banner (`overCap`), `canAdvance` blocks «Neste» over cap, `too_many_*` → norske banner-meldinger. **Caveat:** `GenerateMatchesWizard.test.tsx` does NOT assert any cap behavior (no `matchCap`/`too_many`/banner assertion) — the contract cites it as evidence but it only passes because the prop is optional/backward-compatible. Logic itself covered by `limits.test.ts`. Non-blocking. |
| **K9** Pickeren bruker venner for ikke-admin | ✅ | `GenerateMatches.tsx:108-168` — `if (groupId)` → club members (unchanged); `else if (isAdmin)` → all profile-completed users (unchanged sekretariat); `else` → `getFriendPlayerOptions(userId)` + self (dedup, sorted). Whole users-table read is gated behind `isAdmin`. |
| **K10** Copy justert | ✅ (code) / ⚠️ (test) | `CupSetup.tsx:18-52` — `matchCap` prop → capped points default (`matchCap/2 + 0.5` = «2,5») + capped hint; admin/klubb keep «4,5»/«8 matches». `GameWizard.tsx:480` passes `isAdmin ? undefined : MAX_PERSONAL_CUP_MATCHES`. **Caveat:** `CupSetup.test.tsx` has no cap/copy assertion. Non-blocking. |
| **K11** Ingen admin-vegg i hele løkka | ⏳ pending (live) | Code path complete end-to-end: create (`getRoleContext`) → manage/generer/slett (`requireAdminOrClubAdminOfCup` → creator) → start/finish (same gate). No remaining `requireAdmin` wall on any cup-management route (grep confirmed: only `requireAdminOrClubAdminOfCup` in `app/admin/cup/`). Admin layout is auth-only (`app/admin/layout.tsx`), so a non-admin creator can reach `/admin/cup/[id]`. Live prod check per contract — treated as pending, not a blocker. |
| **K12** Versjon + CHANGELOG | ✅ | `package.json` → `1.108.1`. CHANGELOG has new `## 1.108.y — Cup · alle kan arrangere` series with 1.108.0 + 1.108.1; previous series wrapped. Taglines read naturally (action-oriented, no AI-tells). |

## Tried to break it

**RLS hole — non-admin writing someone else's cup / a klubb cup?** No.
Reasoned through the permissive-OR of all three live policies (probed from prod):
- INSERT/UPDATE/DELETE own personal cup (group_id null, created_by=self): satisfied by the 0090 disjunct → allowed. ✅
- Write someone else's personal cup: 0089 false (not admin, group_id null kills club branch), 0090 false (created_by≠uid) → blocked. ✅
- Write a klubb cup as non-club-admin: 0090 requires group_id null → false; 0089 requires admin/group-admin → false → blocked. ✅
- Club-admin writing their klubb cup, and global admin writing anything: unchanged (0089). ✅
The cup write actions use the **request-scoped** client (`getServerClient`), so RLS is the real boundary, not just the app gate. Confirmed `createTournamentDraft`, `updateTournament`, `start/finish/deleteTournament`, and `createCupMatchesFromPlan` all go through `getServerClient`; the admin-client is used only for the `group_id`/`created_by`/member *lookups* in the gates (authz decision), never for the mutations.

**Match-generation chain under RLS for a non-admin creator?** Works.
The games insert sets `created_by: userId` → `games creator insert` policy (`created_by = auth.uid()`, 0071) passes. `game_players` insert gates on parent game's `created_by = auth.uid()` (0071) → passes since the creator just inserted those games. So the non-participating creator can build matches between friends.

**Cap bypass via client manipulation?** No for the binding cap.
The cap branch in `createCupMatchesFromPlan` runs server-side with `isAdmin` from the gate (not the client). The match cap counts `existing games + new matches` from the DB and is enforced regardless of the wizard UI. A manipulated client payload cannot exceed 4 matches.

**Cap-counting accuracy nuance (non-blocking, real):** The player-cap's *existing-player* count uses `supabase.from('game_players').select('user_id').in('game_id', existingGameIds)` on the **request-scoped** client. The live `game_players` SELECT policy is `is_admin() OR is_in_game(game_id)`, and `is_in_game` (probed: SECURITY DEFINER) is true only if `auth.uid()` is a *player* in that game — **not** if they merely created it. So a non-admin creator who sets up matches among friends but is **not themselves a player** in a game reads **0 existing players** for that game under RLS. On re-generation this can **undercount** existing players → the *player* cap (`exceedsPersonalPlayerCap`) could be under-counted. Impact is small: the **match cap is unaffected** (it reads `games` via `games select own created`, which IS creator-visible and accurate), and match cap is the binding constraint (4×4 = ≤16 < 24), exactly as the contract's Risiko note states ("spiller-cap trigger sjelden"). The match cap — the real guard — cannot be bypassed. Filing-worthy as a hardening follow-up, not a blocker.

**Klubb-cup (#524) regression?** None found.
- `createTournamentDraft` klubb-gren unchanged (`requireAdminOrClubAdmin`, group_id persisted).
- `requireAdminOrClubAdminOfCup` klubb-gren still routes to `requireAdminOrClubAdmin`.
- `GenerateMatches.tsx` `if (groupId)` branch (club members only) unchanged; the new logic is entirely in the `else`/non-admin path.
- `createCupMatchesFromPlan` member-guardrail (`not_members`) for klubb unchanged; cap branch is `else if (!isAdmin)` so a club-admin generating a klubb-cup (groupId set) takes the `if (groupId)` branch and **never hits the cap** — verified the branch order prevents wrongly capping a non-global-admin club-admin.
- 213 tests across `lib/cup` + `app/admin/cup` + `app/admin/games/new` all green; the #524 klubb-cup test cases (member-bind, not_members, klubb redirect) still pass.

**Remaining admin walls?** None on cup management. `grep requireAdmin app/admin/cup/ lib/cup/` returns only `requireAdminOrClubAdminOfCup` / `requireAdminOrClubAdmin`. The `/admin/games/new` hard redirect (`if (!role.isAdmin) redirect('/opprett-spill')`) is unchanged and is NOT a wall for the cup flow — non-admins reach cup creation via `/opprett-spill` (same `GameWizard`, cup tile shown), which is the intended door.

## Gates (ran myself)

- `npx tsc --noEmit` → clean (exit 0, no output).
- `npx vitest run lib/cup/limits.test.ts "app/admin/cup/[id]/generer/actions.test.ts" "app/admin/cup/[id]/generer/GenerateMatchesWizard.test.tsx" app/admin/games/new/CupSetup.test.tsx app/admin/games/new/GameWizard.test.tsx` → **5 files, 43 tests passed.**
- Broader regression sweep `npx vitest run lib/cup app/admin/cup app/admin/games/new` → **24 files, 213 tests passed.**
- Live `pg_policy` probe confirmed 0090 applied to prod exactly as specified.
- `npm run build` not re-run (already verified passing; tsc clean + no exhaustive-switch additions found).

## Defects

**Non-blocking:**
1. **Player-cap existing-count is RLS-unreliable for a non-participating creator** (`createCupMatchesFromPlan` `game_players` read under `is_in_game` SELECT policy). Can undercount on re-generation; player cap could be bypassed. Match cap (the binding guard) is unaffected and accurate. Recommend a follow-up issue to count existing players via the admin client (like the gate lookups do) for cap accuracy.
2. **K8/K10 test evidence is overstated.** `GenerateMatchesWizard.test.tsx` and `CupSetup.test.tsx` do not actually assert the new cap UI / capped-copy behavior; they pass only because the new props are optional. The cap *logic* is covered by `limits.test.ts`, so this is a coverage gap, not a correctness defect. A `matchCap`-aware render assertion (one per component, per Type-C discipline) would close it.

Neither defect blocks the contract's success criteria. Verdict stands: **ACCEPT**.
