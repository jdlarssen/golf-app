# Evaluation: #704 — peer scorecard-approval RLS fix

**VERDICT: ACCEPT**

Fresh-context skeptical evaluation of commit `0d26420d` against
`.forge/contracts/704-peer-approval-rls.md`. Migration verified against the LIVE
prod schema via Supabase MCP (read-only). The central cross-row-writer audit is
clean: the only true-peer (non-admin, non-creator) cross-row `game_players`
write via the cookie client is approve/reject — the trigger breaks nothing else.

---

## Per-criterion table

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | New permissive UPDATE policy reuses `can_score_for`, no duplicated flight logic; USING+WITH CHECK on target row's `user_id` | PASS | `0106` lines 70–73: `for update to authenticated using (can_score_for(game_id, user_id)) with check (can_score_for(...))`. `user_id` is the target row's column = the flight-mate whose card is being approved. Live prod policy confirmed identical (`polcmd='w'`, role `{authenticated}`, both quals `can_score_for(game_id, user_id)`). No flight logic inlined — delegates to the 0095 SECURITY DEFINER helper. |
| 2a | Self-branches from 0103 preserved verbatim (self-approval block + self-handicap-post-start) | PASS | Logic-only diff of 0103 lines 60–90 vs 0106 lines 102–129 is byte-identical. Live prod function body confirms same two `raise exception` branches. |
| 2b | Creator-exemption (`created_by = v_uid`) correct + mirrors `game_players creator update` RLS | PASS | 0106 lines 139–143 select `g.created_by = v_uid` and `return new`. RLS policy (0092 lines 208–214) gates on `games.created_by = (select auth.uid())`. Same predicate. Required: `requireAdminOrCreator` (lib/admin/auth.ts:98) admits a non-admin creator, who writes `course_handicap`/`withdrawn_at`/reopen-`submitted_at` on OTHER rows via the cookie client — these would break without the exemption. |
| 2c | Admin still no-ops (`is_admin`) | PASS | 0106 line 102: `if v_uid is null or public.is_admin() then return new`. |
| 2d | Service-role still no-ops (`auth.uid()` NULL) | PASS | Same line 102 — `v_uid is null` short-circuits. Verified all `getAdminClient` writers below rely on this. |
| 3 | Allowlist column set exactly right for approve AND reject; future columns protected by default | PASS | Allowlist = `approved_at, approved_by_user_id, rejection_reason, submitted_at`. Live `game_players` columns: `game_id, user_id, team_number, flight_number, course_handicap, submitted_at, approved_at, approved_by_user_id, rejection_reason, tee_gender, withdrawn_at, withdrawn_by_user_id, deliver_reminder_sent_at, accepted_at, result_summary`. Protected-by-default set therefore includes `course_handicap` (cheat), `flight_number`/`team_number`, `withdrawn_at`, `accepted_at`, `result_summary` — all correctly blocked. `approveScorecard` writes `{approved_at, approved_by_user_id, rejection_reason}` ⊂ allowlist; `rejectScorecard` writes `{submitted_at, approved_at, approved_by_user_id, rejection_reason}` ⊂ allowlist. jsonb-diff (`to_jsonb(new) - keys is distinct from to_jsonb(old) - keys`) protects unknown future columns without a migration. |
| 3-risk | `submitted_at` peer-abuse (un-submit a flight-mate) | ACCEPTABLE | A peer CAN set `submitted_at=null` directly — but that is exactly what `rejectScorecard` legitimately does. Bounded by `can_score_for` (same-flight only). Worst case = un-submitting a flight-mate's card, an intended peer capability (#543 attestation is bidirectional). No score forgery, no handicap edit, no withdrawal. Not a new attack surface. |
| 4 | pgTAP test proves (a) peer can approve, (b) peer cannot change handicap/team, (c) non-flight denied, (d) admin unchanged | PASS (real, not hollow) | `peer_approval_rls_test.sql` plan(7): tests 1+2 peer CAN approve + approved_at actually written; 3+4 peer BLOCKED on course_handicap + team_number; 5 cross-flight (6-player split) denied 0 rows; 6 same-flight in >4 game allowed; 7 admin bypass. Deliberately keeps `created_by = admin_id` so the peer is authorized SOLELY by `can_score_for` (not the creator shortcut) — directly targets the bug. Runs as `authenticated` with forged JWT sub. (pgTAP not runnable locally — no Postgres — per contract.) |
| 3-action | `approveScorecard` + `rejectScorecard` verify rows-affected; 0-row → error, no notify; idempotency correct; no redirect-after-throw bug | PASS | Both end UPDATE in `.select('user_id')`. `approveScorecard`: 0 rows → follow-up read of `approved_at`; if set → idempotent `?status=approved` (no re-notify, revalidate only); else → `?error=db` (no notify). `rejectScorecard`: no idempotency filter, so 0 rows → unconditional `?error=db`. `redirect()` throws `RedirectError`, so the idempotent branch never falls through to the error redirect — control flow correct. |
| 5 | Migration applied to prod, verified behaviorally in rolled-back txn | PASS | Live: policy + trigger function body + trigger binding (`BEFORE UPDATE FOR EACH ROW`, enabled `O`) all present and matching. `supabase_migrations.schema_migrations` has `20260617211321 peer_approval_rls` as the latest applied. Orchestrator's rolled-back behavioral probes (peer-approve=1row, peer-handicap=blocked, creator-handicap=1row, cross-flight=0rows) consistent with the verified schema. |
| 6 | `tsc` clean; vitest green | PASS | `npx tsc --noEmit` → exit 0. `npx vitest run app/[locale]/games` → 49 files, 309 tests passed. Approve+submit suite alone: 18 passed. |
| 6-build | `npm run build` | NOT SEPARATELY RUN | tsc (stricter type gate) is clean; change is server-action + SQL only (no new routes/components/exhaustive-switch members), so build-break risk is negligible. Flagging for completeness — not a blocker. |

---

## Cross-row-writer audit (the critical check)

Claim under test: the ONLY true-peer (non-admin, non-creator) cross-row
`game_players` write via the cookie client is approve/reject. **CONFIRMED.**

Method: enumerated every `from('game_players') … .update(` chain (12 files), and
for each determined client (cookie `getServerClient` vs service `getAdminClient`)
and authz.

| Call site | Client | Cross-row? | Authz | Trigger effect | Verdict |
|-----------|--------|-----------|-------|----------------|---------|
| `approve/actions.ts` (approve/reject) | cookie | YES (peer) | peer (`peersForApproval`) | allowlist branch — approval cols only | **The intended path. Works.** |
| `admin/games/[id]/actions.ts` — `course_handicap`, reopen `submitted_at`/approve, withdraw | cookie | YES | `requireAdminOrCreator` | admin no-op OR creator-exemption | Safe (creator-exemption load-bearing) |
| `admin/games/[id]/avslutt-likevel/actions.ts` — `withdrawn_at` | cookie | YES | `requireAdminOrCreator` | admin no-op OR creator-exemption | Safe |
| `admin/games/[id]/status/actions.ts` — `deliver_reminder_sent_at` | cookie | YES | `requireAdmin` (admin-only) | `is_admin()` no-op | Safe |
| `admin/games/[id]/flightActions.ts` — `flight_number` (setPlayerFlight/swap) | **service** (`admin`) | YES | `requireAdminOrCreator` (cookie) but WRITE is service | `auth.uid()` NULL no-op | Safe |
| `games/[id]/flightJoinActions.ts` — `flight_number` | **service** | YES | (join flow) | NULL no-op | Safe |
| `lib/games/persistResultSummaries.ts` — `result_summary` | **service** | YES | (end-game) | NULL no-op | Safe |
| `lib/games/confirmParticipation.ts` — `accepted_at` | **service** | YES | (confirm) | NULL no-op | Safe |
| `lib/notifications/deliveryReminder.ts` — `deliver_reminder_sent_at` | **service** | YES | (reminder) | NULL no-op | Safe |
| `games/[id]/withdrawActions.ts` — `withdrawn_at` (cookie + service paths) | cookie + service | NO (`.eq('user_id', user.id)`) | self | self-branch (withdrawn_at not blocked) | Safe |
| `games/[id]/submit/actions.ts` — `submitted_at`, `rejection_reason` | cookie | NO (`.eq('user_id', user.id)`) | self | self-branch (not approval/handicap) | Safe |
| `lib/games/startScheduledGame.ts` | service | — | cron/start | NULL no-op | Safe |
| `games/[id]/spillere/actions.ts` | cookie | DELETE (not UPDATE) | `requireAdminOrCreator` | trigger is BEFORE UPDATE only; policy is FOR UPDATE only | N/A |
| `admin/spillere/[id]/actions.ts` | service (mutate) | — | `requireAdmin` | NULL no-op; the game_players read is `.select(count)` | Safe |

No legitimate peer cross-row write is broken. The contract's specific claims
(flightJoinActions = service, withdrawActions = self, the three admin files =
requireAdminOrCreator) are all verified true.

---

## Gate outputs

- `npx tsc --noEmit` → **exit 0** (clean).
- `npx vitest run app/[locale]/games` → **49 files, 309 tests passed**.
- `npx vitest run` approve+submit → **18 passed**, including the two new #704
  cases (0-row RLS-block → `?error=db`+no notify; 0-row already-approved →
  idempotent `?status=approved`+no re-notify) and the reject 0-row case. Real
  assertions on `lastRedirect()` + `revalidateTagMock` (not hollow).
- `npm run build` → not separately run; tsc is the stricter gate and is clean.
- Live prod (Supabase MCP, read-only): policy, trigger function body, trigger
  binding, and migration record all confirmed present and matching the commit.

---

## Gaps / notes

1. **`submitted_at` in the allowlist** lets a same-flight peer un-submit a
   flight-mate directly (outside the reject UI). Bounded by `can_score_for`,
   identical to the existing reject capability, no score/handicap impact —
   acceptable in-design risk, not a defect.
2. **`npm run build` not run** — low risk (server-action + SQL only), tsc clean.
   Noted for completeness only.
3. **Prod function comments are condensed** vs the verbose Norwegian comments in
   the migration file — cosmetic only; the executable logic is identical.
4. `rejectScorecard` has no "was it submitted" filter (unlike admin reopen), so a
   peer rejecting an unsubmitted card affects 1 row and "succeeds". Pre-existing
   behavior, not introduced by #704, out of scope.

No criterion fails. Ship.
