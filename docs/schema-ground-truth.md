> **SNAPSHOT, NOT AUTHORITY. Verified 2026-06-18 via Supabase MCP.**
> The live DB is the source of truth — regenerate with `npm run gen:types` / query via MCP when in doubt.
> Facts here go stale (e.g. `team_number` was `1..4`, now `>=1`).

See also: [docs/bug-prevention.md](bug-prevention.md) · [docs/audits/2026-06-17-health-audit.md](audits/2026-06-17-health-audit.md)

---

# Schema Ground Truth

Non-obvious, runtime/CHECK/RLS facts the typed Supabase client **cannot** catch.
Typed clients (#672) make wrong column names a compile error — treat a red squiggle on a column as
"go check the live schema", not "cast it away".

---

## `course_holes`

- Columns: **`par_mens`**, **`par_ladies`**, **`par_juniors`** — all `NOT NULL`. There is **no `par` column** and **no `par_seniors`**.
- Per-gender par. `CHECK` on each: `3..6`.
- `hole_number` `CHECK 1..18`.
- `stroke_index` `CHECK 1..18`.

---

## `game_players`

- There is **no `status` column**. Lifecycle is encoded in timestamp columns:
  `accepted_at`, `submitted_at`, `approved_at`, `withdrawn_at`
  (plus `approved_by_user_id`, `withdrawn_by_user_id`, `rejection_reason`, `deliver_reminder_sent_at`).

- **`team_number`**: nullable `int`. `CHECK = (team_number IS NULL OR team_number >= 1)`.
  **No upper bound.** The audit-era `1..4` was widened to `>=1` by migration 0101 (#669).
  Any doc that says `1..4` is **stale**.

- **`flight_number`**: nullable `int`. `CHECK = (NULL OR >= 1)`. No upper bound.

- **`game_players_team_flight_consistency` CHECK**: `team_number NOT NULL` implies `flight_number NOT NULL`.

- **`course_handicap`**: nullable `int`. **`tee_gender`**: `NOT NULL` enum (`player_tee_gender`).

- **Guard trigger `guard_game_players_self_update`** (migrations 0103/0106, #670/#704):
  - A player cannot self-approve their own scorecard or change their own `course_handicap` post-start.
  - A peer may only touch approval columns on another player's row.
  - The game **creator** is explicitly exempted so roster editing still works.
  - A `BEFORE UPDATE` trigger enforcing column-level rules that RLS `USING`/`WITH CHECK` clauses can't express on their own (it inspects which columns changed).

---

## `scores`

- **`strokes`**: `NULLABLE int`. `CHECK (strokes >= 1 AND strokes <= 20)` applies when not null (null = hole not yet entered).
- `hole_number` `CHECK 1..18`.
- **`client_updated_at`** + **`updated_at`**: `NOT NULL`. Last-write-wins key = `client_updated_at`.
- Real write path: `SECURITY DEFINER` RPC **`upsert_score_if_newer`**, which has a graceful no-op guard when `withdrawn_at`/`submitted_at` is set (migration 0102, #668).

---

## Status type mismatch across entities

| Table | `status` type |
|-------|---------------|
| `games` | `enum game_status` (USER-DEFINED, `NOT NULL`) |
| `tournaments` | `TEXT` |
| `leagues` | `TEXT` |

Do **not** assume one shape across the three. `games.status` is a typed enum; the other two are free text.

---

## `games` — other CHECKs

- `score_visibility IN ('live', 'reveal')`
- `short_id ~ ^[0-9a-z]{8}$`

---

## RLS — the real authorization boundary

RLS is the enforcement layer; app-layer TypeScript guards are not sufficient. A direct PostgREST `PATCH`
bypasses every TS guard — only RLS + the guard trigger stop it.

**`game_players` per-actor policies:**

| Actor | Operation | Policy |
|-------|-----------|--------|
| creator | INSERT / UPDATE / DELETE | authenticated |
| self (open) | INSERT (register) | public |
| self (pre-active) | DELETE (withdraw) | public |
| self | UPDATE (mark accepted) | authenticated |
| self | UPDATE (submit scorecard) | public |
| peer (flightmate) | UPDATE (approve scorecard) | authenticated — added migration 0106 (#704) |

**`scores`:** INSERT / UPDATE / SELECT by flight (public).

---

## How to verify

1. **Typed types:** `npm run gen:types` regenerates `lib/database.types.ts` from the live schema.
   A column mismatch becomes a compile error immediately.

2. **Supabase MCP:** query the live DB directly — use `execute_sql` or `list_tables` against
   project `glofubopddkjhymcbaph` to inspect CHECK constraints, nullability, and RLS policies.

3. **CI schema-drift job (#673):** the pre-push gate runs type generation and flags drift before
   it reaches prod. See the health audit for status.

---

Cross-links: [docs/bug-prevention.md](bug-prevention.md) · [docs/audits/2026-06-17-health-audit.md](audits/2026-06-17-health-audit.md)

---

<!-- GENERERT-SEKSJON-START — ikke rediger for hånd. Regenereres av dok-avstemmeren
     (docs/loops/dok-avstemmeren.md, steg 1) fra prod via den kanoniske spørringen. -->

## Generert snapshot — RLS / CHECK / triggere / SECURITY DEFINER

**Kilde: prod (`glofubopddkjhymcbaph`), målt 2026-07-07.** Staging matcher på alt
under, med ETT avvik: funksjonen `rls_auto_enable` finnes kun i prod (eget issue).

**Totaler:** 34 tabeller · 83 CHECK-constraints · 14 triggere · 43 SECURITY DEFINER-funksjoner.

### RLS og policy-antall per tabell (alle 34 har RLS på)

| Tabell | Policies | | Tabell | Policies |
|---|---|---|---|---|
| admin_action_rate_limit | 0 ⛔ | | league_players | 4 |
| admin_audit_log | 0 ⛔ | | league_rounds | 4 |
| agent_findings | 0 ⛔ | | leagues | 4 |
| agent_runs | 0 ⛔ | | notifications | 2 |
| bingo_bango_bongo_holes | 2 | | patsome_tee_starters | 4 |
| club_invitations | 3 | | product_update_digests | 0 ⛔ |
| course_holes | 5 | | product_updates | 1 |
| courses | 5 | | push_subscriptions | 4 |
| format_intent_mapping | 4 | | reactions | 3 |
| formats | 4 | | scores | 3 |
| friendships | 1 | | tee_boxes | 5 |
| game_players | 9 | | tournaments | 4 |
| game_registration_requests | 3 | | users | 4 |
| game_side_winners | 5 | | wolf_hole_choices | 4 |
| games | 8 | | groups | 4 |
| group_join_requests | 3 | | idea_submissions | 4 |
| group_members | 3 | | invitations | 7 |

⛔ = RLS på uten policies → deny-all for anon/authenticated; kun service-role når
tabellen (bevisst lockdown for admin-/agent-tabeller).

### CHECK-constraints per tabell (83 totalt)

agent_findings 3 · agent_runs 1 · bingo_bango_bongo_holes 1 · course_holes 5 ·
format_intent_mapping 2 · friendships 2 · game_players 4 · game_registration_requests 3 ·
game_side_winners 2 · games 9 · group_join_requests 1 · groups 2 · idea_submissions 2 ·
league_rounds 1 · leagues 13 · notifications 1 · patsome_tee_starters 1 · reactions 1 ·
scores 3 · tee_boxes 11 · tournaments 11 · users 1 · wolf_hole_choices 3

Fulle definisjoner: kjør den kanoniske spørringen (docs/loops/dok-avstemmeren.md).
De domene-viktige CHECK-ene er beskrevet narrativt i seksjonene over.

### Triggere (14, ingen interne)

set_updated_at-familien: bingo_bango_bongo_holes, format_intent_mapping, formats,
patsome_tee_starters, wolf_hole_choices. courses_set_slug (INSERT). Guard-triggere
(kolonnenivå-vern, jf. 0107): game_players ×3 (invite_eligibility, score_differential,
self_update), group_join_requests, group_members (last_owner_delete), invitations,
scores, users.

### SECURITY DEFINER-funksjoner (43)

accept_club_invitations · add_club_member_by_email · admin_create_club ·
admin_key_metrics · anonymize_user · befriend_inviter · can_react_in_game ·
can_score_for · connect_via_friend_code · consume_admin_rate_limit ·
create_course_with_layout · decide_join_request · edit_product_update ·
email_is_in_auth_users · email_is_invited · email_is_registered ·
guard_game_players_invite_eligibility · guard_game_players_score_differential ·
guard_game_players_self_update · guard_group_join_requests_self_update ·
guard_group_members_last_owner_delete · guard_invitations_self_update ·
guard_scores_self_update · guard_users_self_update · handle_new_auth_user ·
incomplete_profiles_for_ids · is_admin · is_game_creator_or_admin · is_group_admin ·
is_group_member · is_in_game · is_invite_eligible · join_club_league ·
league_group_id · leave_club_league · remove_friend · respond_friend_request ·
rls_auto_enable (kun prod) · same_flight · same_flight_or_solo · send_friend_request ·
send_friend_request_by_email · set_club_member_role

<!-- GENERERT-SEKSJON-SLUTT -->
