# Contract: #704 — make peer scorecard-approval actually work (expand RLS, safely)

## Decision (owner-ratified)
Peer-approval is a real, intended, golf-correct feature (#543/#360) that is silently broken
by an RLS gap. KEEP it; fix by EXPANDING RLS + hardening the column surface. Do NOT remove.

## Context / evidence
- `approveScorecard` / `rejectScorecard` (`app/[locale]/games/[id]/approve/actions.ts`) authorize a same-flight peer via `peersForApproval` (`lib/games/flightScope.ts`), reachable from `PendingApprovalsBanner` + `/games/[id]/approve` for any active flight member.
- The `game_players` UPDATE policies (`0002`, perf-rewritten `0092`) only allow `is_admin() OR user_id = auth.uid()` (self submit) or `created_by = auth.uid()` (creator). A peer writing `approved_at` on another's row matches none → 0 rows. Supabase returns `error == null` on a 0-row UPDATE, so the action falsely reports success + sends the approval notification while nothing is written. Game can't end (`not_all_approved`).
- `can_score_for(p_game_id, p_other_user)` (`0095`, SECURITY DEFINER STABLE) already encodes the exact #543 attestation rule (both active + same assigned flight OR ≤4-active OR wolf) — the SQL twin of `peersForApproval`.
- `guard_game_players_self_update` trigger (`0103`, #670) only restricts writes where `new.user_id = auth.uid()` (the actor's OWN row); a peer writing another's row currently sails through unrestricted.

## Success Criteria
- [ ] New migration adds a permissive `game_players` UPDATE policy for `authenticated` that lets a peer write a flight-mate's row, gated on `can_score_for(game_id, user_id)` (USING + WITH CHECK). Reuse the existing helper; do not duplicate flight logic.
- [ ] The same migration EXTENDS `guard_game_players_self_update` (or adds a sibling BEFORE UPDATE trigger) so that when a NON-admin actor updates a row where `new.user_id <> auth.uid()`, ONLY approval columns may change: `approved_at`, `approved_by_user_id`, `rejection_reason`, and clearing `submitted_at` on reject. Any change to `course_handicap`, `team_number`, `flight_number`, `tee_*`, `withdrawn_at`, `strokes`-adjacent or other columns by a peer is rejected. Admin/creator paths unaffected.
- [ ] `approveScorecard` AND `rejectScorecard` verify rows-affected: if the UPDATE affected 0 rows, return an error (do NOT redirect with success, do NOT send the approval/rejection notification). Use a returning-count or `.select()` to detect 0-row writes.
- [ ] pgTAP test (`supabase/tests/`) proving: (a) a same-flight peer CAN now set approved_at; (b) a peer CANNOT change course_handicap/team_number on another's row; (c) a non-flight player still cannot approve; (d) admin/creator unchanged.
- [ ] Migration APPLIED to prod via Supabase MCP only AFTER evaluation ACCEPT, verified in a rolled-back transaction against the live schema (behavioral checks), like #670/#671 did.
- [ ] `npm run build` + `tsc` clean; full vitest green.

## Out of scope
- Removing peer-approval. Touching the `not_all_approved` end-game gate (#360-owned). Realtime/other tables.

## Gates
- `npx tsc --noEmit`
- `npx vitest run` (relevant approve/submit tests)
- `npm run build`
- pgTAP locally is not runnable here (no local Postgres) — verify via MCP rolled-back-txn behavioral probes instead; state that explicitly.

## Notes
- Migration numbering: check `origin/main` for the latest applied number (0105 was last per memory) — use the next free number.
- Next.js 16 server-action conventions for the rows-affected guard.
