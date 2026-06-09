-- 0092_rls_policy_perf.sql
-- #412 (auth_rls_initplan) + #414 (multiple_permissive_policies)
-- ═════════════════════════════════════════════════════════════════════════════
-- Ren ytelses-migrasjon på RLS-policyer. Endrer IKKE hvilke rader noen ser —
-- hver omskriving er beviselig semantikk-bevarende per konstruksjon.
--
-- DEL A — #412 auth_rls_initplan (mekanisk, beviselig trygt):
--   `auth.uid()`  → `(select auth.uid())`
--   `auth.role()` → `(select auth.role())`
--   `auth.jwt()`  → `(select auth.jwt())`
--   Subselecten gir Postgres et initplan: auth.*-skalaren evalueres ÉN gang per
--   spørring i stedet for per rad. `(select auth.uid())` returnerer nøyaktig
--   samme skalar som `auth.uid()`. SECURITY DEFINER-helpere (is_admin(),
--   is_in_game(), can_score_for(), same_flight_or_solo(), is_group_admin(),
--   is_group_member(), is_game_creator_or_admin(), league_group_id() m.fl.)
--   røres IKKE — de er ikke auth.*-kall og flagges ikke under denne klassen.
--
-- DEL B — #414 multiple_permissive_policies (KUN beviselig-ekvivalente merges):
--   Postgres OR-er permissive policyer for samme (tabell, cmd, rolle). Å slå
--   sammen N slike til én med USING (q1 OR … OR qN) + WITH CHECK (c1 OR … OR cN)
--   er identisk per konstruksjon. HARDE REGLER (jf. kontrakt):
--     • Kun merge policyer med SAMME rolle. public vs authenticated → IKKE merge.
--     • En ALL-policy ekspanderes til sine fire cmd-er før sammenligning. Der en
--       ALL-admin-policy (rolle public) overlapper en per-cmd self/participant-
--       policy med SAMME rolle, foldes admin-grenen inn (is_admin() OR <qual>).
--       For cmd-er uten same-role-søsken beholdes en målrettet admin-policy.
--     • Ingen rolle-normalisering, ingen droppet cmd-gren. Hvis ikke beviselig
--       ekvivalent → hopp over, dokumentér. Bedre å la en advarsel stå enn å
--       løsne tilgang.
--
-- ROLLE-MISMATCH SOM BEVISST STÅR IGJEN (advarsler vi IKKE rydder):
--   Advisoren rapporterer hver (tabell, cmd)-overlapp under HVER Postgres-rolle
--   (anon/authenticated/authenticator/dashboard_user/supabase_privileged_role)
--   fordi en {public}-policy treffer alle roller. Der admin-grenen er {public}
--   og søster-policyen er {authenticated} (skaper-policyer på games,
--   game_players, invitations, game_side_winners; INSERT-own på
--   courses/course_holes/tee_boxes) KAN vi ikke merge uten å endre rolle-settet.
--   De står igjen med vilje. Detaljert per-cmd nedenfor.
-- ═════════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ DEL A — #412: wrap auth.*() i (select …) for policyer som IKKE re-skapes    ║
-- ║ i Del B. (Policyer Del B dropper/re-skaper får wrappet form direkte der.)   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ── scores (hot) ──────────────────────────────────────────────────────────────
alter policy "scores insert by flight" on public.scores
  with check (
    is_admin() OR (
      (EXISTS ( SELECT 1 FROM games g
                 WHERE g.id = scores.game_id AND g.status = 'active'::game_status))
      AND (entered_by = (select auth.uid()))
      AND ((user_id = (select auth.uid())) OR can_score_for(game_id, user_id))
      AND (NOT EXISTS ( SELECT 1 FROM game_players gp
                         WHERE gp.game_id = scores.game_id
                           AND gp.user_id = scores.user_id
                           AND (gp.submitted_at IS NOT NULL OR gp.withdrawn_at IS NOT NULL)))
    )
  );

alter policy "scores update by flight" on public.scores
  using (
    is_admin() OR (
      (EXISTS ( SELECT 1 FROM games g
                 WHERE g.id = scores.game_id AND g.status = 'active'::game_status))
      AND ((user_id = (select auth.uid())) OR can_score_for(game_id, user_id))
      AND (NOT EXISTS ( SELECT 1 FROM game_players gp
                         WHERE gp.game_id = scores.game_id
                           AND gp.user_id = scores.user_id
                           AND (gp.submitted_at IS NOT NULL OR gp.withdrawn_at IS NOT NULL)))
    )
  )
  with check ((entered_by = (select auth.uid())) OR is_admin());

alter policy "scores select gating per mode" on public.scores
  using (
    is_admin()
    OR ((EXISTS ( SELECT 1 FROM games g
                   WHERE g.id = scores.game_id AND g.status = 'finished'::game_status))
        AND (EXISTS ( SELECT 1 FROM game_players gp
                       WHERE gp.game_id = scores.game_id AND gp.user_id = (select auth.uid()))))
    OR ((EXISTS ( SELECT 1 FROM games g
                   WHERE g.id = scores.game_id AND g.status = 'active'::game_status
                     AND g.score_visibility = 'reveal'::text))
        AND (EXISTS ( SELECT 1 FROM game_players gp
                       WHERE gp.game_id = scores.game_id AND gp.user_id = (select auth.uid()))))
    OR (user_id = (select auth.uid()))
    OR same_flight_or_solo(game_id, user_id)
  );

-- ── notifications ─────────────────────────────────────────────────────────────
alter policy "notifications_select_own" on public.notifications
  using (user_id = (select auth.uid()));

alter policy "notifications_update_own" on public.notifications
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── friendships ───────────────────────────────────────────────────────────────
alter policy "friendships view own" on public.friendships
  using ((requester_id = (select auth.uid())) OR (addressee_id = (select auth.uid())));

-- ── wolf_hole_choices ─────────────────────────────────────────────────────────
alter policy "wolf_choices_read" on public.wolf_hole_choices
  using (EXISTS ( SELECT 1 FROM game_players gp
                   WHERE gp.game_id = wolf_hole_choices.game_id
                     AND gp.user_id = (select auth.uid())));

alter policy "wolf_choices_insert" on public.wolf_hole_choices
  with check ((wolf_user_id = (select auth.uid())) OR is_admin());

alter policy "wolf_choices_update" on public.wolf_hole_choices
  using ((wolf_user_id = (select auth.uid())) OR is_admin())
  with check ((wolf_user_id = (select auth.uid())) OR is_admin());

alter policy "wolf_choices_delete" on public.wolf_hole_choices
  using ((wolf_user_id = (select auth.uid())) OR is_admin());

-- ── bingo_bango_bongo_holes ───────────────────────────────────────────────────
alter policy "bbb_holes_read" on public.bingo_bango_bongo_holes
  using (EXISTS ( SELECT 1 FROM game_players gp
                   WHERE gp.game_id = bingo_bango_bongo_holes.game_id
                     AND gp.user_id = (select auth.uid())));

alter policy "bbb_holes_write" on public.bingo_bango_bongo_holes
  using (is_admin() OR (EXISTS ( SELECT 1 FROM game_players gp
                                  WHERE gp.game_id = bingo_bango_bongo_holes.game_id
                                    AND gp.user_id = (select auth.uid()))))
  with check (is_admin() OR (EXISTS ( SELECT 1 FROM game_players gp
                                       WHERE gp.game_id = bingo_bango_bongo_holes.game_id
                                         AND gp.user_id = (select auth.uid()))));

-- ── patsome_tee_starters ──────────────────────────────────────────────────────
alter policy "patsome_tee_starters_read" on public.patsome_tee_starters
  using ((EXISTS ( SELECT 1 FROM game_players gp
                    WHERE gp.game_id = patsome_tee_starters.game_id
                      AND gp.user_id = (select auth.uid()))) OR is_admin());

alter policy "patsome_tee_starters_insert" on public.patsome_tee_starters
  with check ((EXISTS ( SELECT 1 FROM game_players gp
                         WHERE gp.game_id = patsome_tee_starters.game_id
                           AND gp.team_number = patsome_tee_starters.team_number
                           AND gp.user_id = (select auth.uid()))) OR is_admin());

alter policy "patsome_tee_starters_update" on public.patsome_tee_starters
  using ((EXISTS ( SELECT 1 FROM game_players gp
                    WHERE gp.game_id = patsome_tee_starters.game_id
                      AND gp.team_number = patsome_tee_starters.team_number
                      AND gp.user_id = (select auth.uid()))) OR is_admin())
  with check ((EXISTS ( SELECT 1 FROM game_players gp
                         WHERE gp.game_id = patsome_tee_starters.game_id
                           AND gp.team_number = patsome_tee_starters.team_number
                           AND gp.user_id = (select auth.uid()))) OR is_admin());

alter policy "patsome_tee_starters_delete" on public.patsome_tee_starters
  using ((EXISTS ( SELECT 1 FROM game_players gp
                    WHERE gp.game_id = patsome_tee_starters.game_id
                      AND gp.team_number = patsome_tee_starters.team_number
                      AND gp.user_id = (select auth.uid()))) OR is_admin());

-- ── courses / course_holes / tee_boxes: INSERT-own (authenticated) ────────────
-- Disse er authenticated-INSERT-policyer som overlapper {public} admin-ALL kun
-- på INSERT → rolle-mismatch, IKKE merget (se Del B). Her bare #412-wrap.
alter policy "courses authenticated insert own" on public.courses
  with check (created_by = (select auth.uid()));

alter policy "holes authenticated insert own" on public.course_holes
  with check (EXISTS ( SELECT 1 FROM courses c
                        WHERE c.id = course_holes.course_id
                          AND c.created_by = (select auth.uid())));

alter policy "tees authenticated insert own" on public.tee_boxes
  with check (EXISTS ( SELECT 1 FROM courses c
                        WHERE c.id = tee_boxes.course_id
                          AND c.created_by = (select auth.uid())));

-- ── users: SELECT + INSERT (UPDATE re-skapes i Del B) ─────────────────────────
alter policy "users select own or shared games" on public.users
  using (
    (id = (select auth.uid()))
    OR is_admin()
    OR (EXISTS ( SELECT 1 FROM game_players gp1
                   JOIN game_players gp2 ON gp1.game_id = gp2.game_id
                  WHERE gp1.user_id = (select auth.uid()) AND gp2.user_id = users.id))
  );

alter policy "users insert own" on public.users
  with check (id = (select auth.uid()));

-- ── games: creator INSERT/UPDATE/DELETE + own-created SELECT ──────────────────
-- (rolle authenticated; admin-ALL er {public} → mismatch, ikke merget i Del B)
alter policy "games creator insert" on public.games
  with check (created_by = (select auth.uid()));
alter policy "games creator update" on public.games
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
alter policy "games creator delete" on public.games
  using (created_by = (select auth.uid()));
alter policy "games select own created" on public.games
  using (created_by = (select auth.uid()));

-- ── game_players: creator + self-mark-accepted (authenticated) ────────────────
alter policy "game_players creator insert" on public.game_players
  with check (EXISTS ( SELECT 1 FROM games g
                        WHERE g.id = game_players.game_id
                          AND g.created_by = (select auth.uid())));
alter policy "game_players creator update" on public.game_players
  using (EXISTS ( SELECT 1 FROM games g
                   WHERE g.id = game_players.game_id
                     AND g.created_by = (select auth.uid())))
  with check (EXISTS ( SELECT 1 FROM games g
                        WHERE g.id = game_players.game_id
                          AND g.created_by = (select auth.uid())));
alter policy "game_players creator delete" on public.game_players
  using (EXISTS ( SELECT 1 FROM games g
                   WHERE g.id = game_players.game_id
                     AND g.created_by = (select auth.uid())));
alter policy "game_players self mark accepted" on public.game_players
  using ((user_id = (select auth.uid())) AND (accepted_at IS NULL))
  with check ((user_id = (select auth.uid())) AND (accepted_at IS NOT NULL));

-- ── invitations: creator game-invite (authenticated) ──────────────────────────
alter policy "invitations creator game-invite insert" on public.invitations
  with check ((invited_by = (select auth.uid())) AND (game_id IS NOT NULL)
              AND (EXISTS ( SELECT 1 FROM games g
                             WHERE g.id = invitations.game_id
                               AND g.created_by = (select auth.uid()))));
alter policy "invitations creator game-invite select" on public.invitations
  using ((invited_by = (select auth.uid())) AND (game_id IS NOT NULL)
         AND (EXISTS ( SELECT 1 FROM games g
                        WHERE g.id = invitations.game_id
                          AND g.created_by = (select auth.uid()))));
alter policy "invitations creator game-invite delete" on public.invitations
  using ((invited_by = (select auth.uid())) AND (game_id IS NOT NULL)
         AND (EXISTS ( SELECT 1 FROM games g
                        WHERE g.id = invitations.game_id
                          AND g.created_by = (select auth.uid()))));

-- ── game_registration_requests: self-insert + view (UPDATE re-skapes i Del B) ─
alter policy "game_reg_requests self insert pending" on public.game_registration_requests
  with check ((user_id = (select auth.uid()))
              AND (status = 'pending'::registration_request_status)
              AND (EXISTS ( SELECT 1 FROM games g
                             WHERE g.id = game_registration_requests.game_id
                               AND g.registration_mode = 'manual_approval'::registration_mode
                               AND g.status = ANY (ARRAY['draft'::game_status, 'scheduled'::game_status]))));
alter policy "game_reg_requests view own or admin" on public.game_registration_requests
  using ((user_id = (select auth.uid())) OR is_game_creator_or_admin(game_id));

-- ── group_join_requests: self-insert + view (UPDATE re-skapes i Del B) ────────
alter policy "group_join_requests self insert pending" on public.group_join_requests
  with check ((user_id = (select auth.uid()))
              AND (status = 'pending'::registration_request_status));
alter policy "group_join_requests view own or admin" on public.group_join_requests
  using ((user_id = (select auth.uid())) OR is_group_admin(group_id));

-- ── group_members + groups (authenticated, ingen #414-overlapp) ───────────────
alter policy "group_members delete admin or self" on public.group_members
  using (is_admin() OR is_group_admin(group_id) OR (user_id = (select auth.uid())));
alter policy "groups insert admin or self" on public.groups
  with check (is_admin() OR (created_by = (select auth.uid())));

-- ── game_side_winners creator (authenticated; re-fold ikke mulig pga rolle) ───
alter policy "game_side_winners creator all" on public.game_side_winners
  using (EXISTS ( SELECT 1 FROM games g
                   WHERE g.id = game_side_winners.game_id
                     AND g.created_by = (select auth.uid())))
  with check (EXISTS ( SELECT 1 FROM games g
                        WHERE g.id = game_side_winners.game_id
                          AND g.created_by = (select auth.uid())));

-- ── league_players self-mark-accepted (UPDATE folded i Del B? nei: behold) ────
-- league_players SELECT + UPDATE konsolideres i Del B (samme authenticated).
-- self mark accepted wrappes der.

-- ── tournaments creator write own personal (authenticated) ────────────────────
-- konsolideres i Del B (samme authenticated). Wrappes der.


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ DEL B — #414: konsolidér beviselig-ekvivalente same-role permissive merges  ║
-- ║ Hver DROP+CREATE skriver den endelige (wrappet + merget) formen direkte.    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- courses / course_holes / tee_boxes — SELECT (rolle public)
--   admin-ALL (is_admin()) overlapper "select all" (true). true OR is_admin() =
--   true → admin-grenen er ren redundans for lesing. Vi splitter admin-ALL til
--   målrettede skrive-cmd-er (INSERT/UPDATE/DELETE) og lar "select all" stå
--   alene på SELECT. INSERT-overlappet (admin {public} vs insert-own
--   {authenticated}) er rolle-mismatch → admin-INSERT-grenen MÅ beholdes; den
--   utvider ikke authenticated-insert-own, de OR-es lovlig (begge {public} hhv.
--   {authenticated} på samme cmd er nettopp det advisoren flagger, men å merge
--   ville kreve rolle-endring). Vi beholder derfor admin-skrive-policyen som ALL
--   minus SELECT via tre eksplisitte cmd-policyer.
-- ─────────────────────────────────────────────────────────────────────────────

-- courses
drop policy if exists "courses admin write" on public.courses;
create policy "courses admin insert" on public.courses for insert to public with check (is_admin());
create policy "courses admin update" on public.courses for update to public using (is_admin()) with check (is_admin());
create policy "courses admin delete" on public.courses for delete to public using (is_admin());
-- SELECT: "courses select all" (true) dekker alle; admin-SELECT var redundant. Fjernet.

-- course_holes
drop policy if exists "holes admin write" on public.course_holes;
create policy "holes admin insert" on public.course_holes for insert to public with check (is_admin());
create policy "holes admin update" on public.course_holes for update to public using (is_admin()) with check (is_admin());
create policy "holes admin delete" on public.course_holes for delete to public using (is_admin());

-- tee_boxes
drop policy if exists "tees admin write" on public.tee_boxes;
create policy "tees admin insert" on public.tee_boxes for insert to public with check (is_admin());
create policy "tees admin update" on public.tee_boxes for update to public using (is_admin()) with check (is_admin());
create policy "tees admin delete" on public.tee_boxes for delete to public using (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- formats / format_intent_mapping — SELECT (rolle public)
--   admin-ALL (is_admin()) overlapper read (auth.role()='authenticated'), begge
--   {public}. Merge SELECT → (is_admin() OR (select auth.role())='authenticated').
--   Admin-skrive (INSERT/UPDATE/DELETE) beholdes som målrettede cmd-policyer.
-- ─────────────────────────────────────────────────────────────────────────────

-- formats
drop policy if exists "formats_admin_write" on public.formats;
drop policy if exists "formats_read" on public.formats;
create policy "formats_read" on public.formats for select to public
  using (is_admin() OR ((select auth.role()) = 'authenticated'::text));
create policy "formats_admin_insert" on public.formats for insert to public with check (is_admin());
create policy "formats_admin_update" on public.formats for update to public using (is_admin()) with check (is_admin());
create policy "formats_admin_delete" on public.formats for delete to public using (is_admin());

-- format_intent_mapping
drop policy if exists "format_intent_mapping_admin_write" on public.format_intent_mapping;
drop policy if exists "format_intent_mapping_read" on public.format_intent_mapping;
create policy "format_intent_mapping_read" on public.format_intent_mapping for select to public
  using (is_admin() OR ((select auth.role()) = 'authenticated'::text));
create policy "format_intent_mapping_admin_insert" on public.format_intent_mapping for insert to public with check (is_admin());
create policy "format_intent_mapping_admin_update" on public.format_intent_mapping for update to public using (is_admin()) with check (is_admin());
create policy "format_intent_mapping_admin_delete" on public.format_intent_mapping for delete to public using (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- games — SELECT (rolle public)
--   "games admin write" (ALL, is_admin) ∩ SELECT overlapper
--   "games select if participant or admin" (is_admin OR participant), begge
--   {public}. Merge → (is_admin() OR participant) [admin-leddet er allerede med].
--   "games select own created" er {authenticated} → rolle-mismatch, BLIR STÅENDE
--   (wrappet i Del A). Admin-ALL splittes til skrive-cmd-er (INSERT/UPDATE/DELETE),
--   som overlapper creator-{authenticated} → mismatch, beholdes målrettet.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "games admin write" on public.games;
drop policy if exists "games select if participant or admin" on public.games;
create policy "games select if participant or admin" on public.games for select to public
  using (
    is_admin()
    OR (EXISTS ( SELECT 1 FROM game_players
                  WHERE game_players.game_id = games.id
                    AND game_players.user_id = (select auth.uid())))
  );
create policy "games admin insert" on public.games for insert to public with check (is_admin());
create policy "games admin update" on public.games for update to public using (is_admin()) with check (is_admin());
create policy "games admin delete" on public.games for delete to public using (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- game_players — per cmd (rolle public-grenene merges; authenticated står igjen)
--   admin-ALL ({public}) splittes; merges med de {public} self-policyene per cmd:
--     SELECT: admin ∪ "select shared game" (is_admin OR is_in_game) → samme.
--     INSERT: admin ∪ "self register open"            (begge {public})
--     UPDATE: admin ∪ "self submit"                   (begge {public})
--     DELETE: admin ∪ "self withdraw pre active"      (begge {public})
--   creator-* og "self mark accepted" er {authenticated} → BLIR STÅENDE
--   (wrappet i Del A). Disse OR-es lovlig av Postgres; advarselen for
--   {public}∩{authenticated}-overlapp står med vilje igjen (rolle-mismatch).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "game_players admin write" on public.game_players;
drop policy if exists "game_players select shared game" on public.game_players;
drop policy if exists "game_players self register open" on public.game_players;
drop policy if exists "game_players self submit" on public.game_players;
drop policy if exists "game_players self withdraw pre active" on public.game_players;

create policy "game_players select shared game" on public.game_players for select to public
  using (is_admin() OR is_in_game(game_id));

create policy "game_players self register open" on public.game_players for insert to public
  with check (
    is_admin() OR (
      (user_id = (select auth.uid()))
      AND (EXISTS ( SELECT 1 FROM games g
                     WHERE g.id = game_players.game_id
                       AND g.registration_mode = 'open'::registration_mode
                       AND g.status = ANY (ARRAY['draft'::game_status, 'scheduled'::game_status])))
    )
  );

create policy "game_players self submit" on public.game_players for update to public
  using (is_admin() OR (user_id = (select auth.uid())))
  with check (is_admin() OR (user_id = (select auth.uid())));

create policy "game_players self withdraw pre active" on public.game_players for delete to public
  using (
    is_admin() OR (
      (user_id = (select auth.uid()))
      AND (EXISTS ( SELECT 1 FROM games g
                     WHERE g.id = game_players.game_id
                       AND g.status = ANY (ARRAY['draft'::game_status, 'scheduled'::game_status])))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- game_side_winners — SELECT (rolle public)
--   admin_all (is_admin) ∩ SELECT overlapper _select (is_admin OR finished-
--   participant), begge {public}. Merge → (is_admin() OR finished-participant).
--   "creator all" er {authenticated} → mismatch, BLIR STÅENDE (wrappet i Del A).
--   admin_all splittes til skrive-cmd-er.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "game_side_winners_admin_all" on public.game_side_winners;
drop policy if exists "game_side_winners_select" on public.game_side_winners;
create policy "game_side_winners_select" on public.game_side_winners for select to public
  using (
    is_admin()
    OR (EXISTS ( SELECT 1 FROM games g
                   JOIN game_players gp ON gp.game_id = g.id
                  WHERE g.id = game_side_winners.game_id
                    AND g.status = 'finished'::game_status
                    AND gp.user_id = (select auth.uid())))
  );
create policy "game_side_winners_admin_insert" on public.game_side_winners for insert to public with check (is_admin());
create policy "game_side_winners_admin_update" on public.game_side_winners for update to public using (is_admin()) with check (is_admin());
create policy "game_side_winners_admin_delete" on public.game_side_winners for delete to public using (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- invitations — SELECT + INSERT + UPDATE (rolle public-grenene merges)
--   SELECT: admin write ∪ "select own incoming" ∪ "select own outgoing"
--           (alle tre {public}) → (is_admin() OR incoming OR outgoing).
--   INSERT: admin write ∪ "player friend-invite insert" (begge {public}).
--   UPDATE: admin write ∪ "self mark accepted"          (begge {public}).
--   DELETE: admin write {public} ∩ "creator game-invite delete" {authenticated}
--           → mismatch. Admin-DELETE beholdes målrettet; creator-DELETE står (Del A).
--   creator game-invite select/insert ({authenticated}) → mismatch, står (Del A).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "invitations admin write" on public.invitations;
drop policy if exists "invitations select own incoming" on public.invitations;
drop policy if exists "invitations select own outgoing" on public.invitations;
drop policy if exists "invitations player friend-invite insert" on public.invitations;
drop policy if exists "invitations self mark accepted" on public.invitations;

create policy "invitations select own incoming" on public.invitations for select to public
  using (
    is_admin()
    OR (lower(email) = lower(((select auth.jwt()) ->> 'email'::text)))
    OR ((invited_by = (select auth.uid())) AND (game_id IS NULL))
  );

create policy "invitations player friend-invite insert" on public.invitations for insert to public
  with check (
    is_admin()
    OR ((invited_by = (select auth.uid())) AND (game_id IS NULL))
  );

create policy "invitations self mark accepted" on public.invitations for update to public
  using (
    is_admin()
    OR ((lower(email) = lower(((select auth.jwt()) ->> 'email'::text))) AND (accepted_at IS NULL))
  )
  with check (
    is_admin()
    OR ((lower(email) = lower(((select auth.jwt()) ->> 'email'::text))) AND (accepted_at IS NOT NULL))
  );

create policy "invitations admin delete" on public.invitations for delete to public using (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- game_registration_requests — UPDATE (rolle public)
--   "admin update" (is_game_creator_or_admin) ∪ "self withdraw"
--   ((user_id=uid AND status='pending') → (status='withdrawn')), begge {public}.
--   Merge: USING = OR av USING-leddene, WITH CHECK = OR av WITH CHECK-leddene.
--   (admin-policyens with_check = is_game_creator_or_admin; self-withdraw sin
--   with_check = user_id=uid AND status='withdrawn'.)
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "game_reg_requests admin update" on public.game_registration_requests;
drop policy if exists "game_reg_requests self withdraw" on public.game_registration_requests;
create policy "game_reg_requests admin update" on public.game_registration_requests for update to public
  using (
    is_game_creator_or_admin(game_id)
    OR ((user_id = (select auth.uid())) AND (status = 'pending'::registration_request_status))
  )
  with check (
    is_game_creator_or_admin(game_id)
    OR ((user_id = (select auth.uid())) AND (status = 'withdrawn'::registration_request_status))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- group_join_requests — UPDATE (rolle authenticated)
--   "admin update" (is_group_admin) ∪ "self withdraw"
--   (pending → withdrawn), begge {authenticated}. Merge per USING/WITH CHECK.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "group_join_requests admin update" on public.group_join_requests;
drop policy if exists "group_join_requests self withdraw" on public.group_join_requests;
create policy "group_join_requests admin update" on public.group_join_requests for update to authenticated
  using (
    is_group_admin(group_id)
    OR ((user_id = (select auth.uid())) AND (status = 'pending'::registration_request_status))
  )
  with check (
    is_group_admin(group_id)
    OR ((user_id = (select auth.uid())) AND (status = 'withdrawn'::registration_request_status))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- users — UPDATE (rolle public)
--   "users admin update" (is_admin) ∪ "users update own" (id=uid), begge {public}.
--   Merge → (is_admin() OR id=(select auth.uid())). (SELECT/INSERT wrappet i Del A;
--   DELETE er admin-only, ingen overlapp.)
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "users admin update" on public.users;
drop policy if exists "users update own" on public.users;
create policy "users update own" on public.users for update to public
  using (is_admin() OR (id = (select auth.uid())))
  with check (is_admin() OR (id = (select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- league_players — SELECT + UPDATE (rolle authenticated)
--   "admin or club-admin write" (ALL) ∩ SELECT overlapper "select authenticated"
--   (true) → true OR x = true; admin-SELECT redundant. ∩ UPDATE overlapper
--   "self mark accepted". Begge {authenticated}. Merge SELECT → true; merge
--   UPDATE → (admin-club-write-qual OR self-mark-accepted). admin-ALL splittes
--   til INSERT/DELETE + merget UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "league_players admin or club-admin write" on public.league_players;
drop policy if exists "league_players self mark accepted" on public.league_players;
-- "league_players select authenticated" (true) blir alene på SELECT.
create policy "league_players admin or club-admin insert" on public.league_players for insert to authenticated
  with check (is_admin() OR ((league_group_id(league_id) IS NOT NULL) AND is_group_admin(league_group_id(league_id))));
create policy "league_players admin or club-admin delete" on public.league_players for delete to authenticated
  using (is_admin() OR ((league_group_id(league_id) IS NOT NULL) AND is_group_admin(league_group_id(league_id))));
create policy "league_players self mark accepted" on public.league_players for update to authenticated
  using (
    (is_admin() OR ((league_group_id(league_id) IS NOT NULL) AND is_group_admin(league_group_id(league_id))))
    OR ((user_id = (select auth.uid())) AND (accepted_at IS NULL))
  )
  with check (
    (is_admin() OR ((league_group_id(league_id) IS NOT NULL) AND is_group_admin(league_group_id(league_id))))
    OR ((user_id = (select auth.uid())) AND (accepted_at IS NOT NULL))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- league_rounds — SELECT (rolle authenticated)
--   "admin or club-admin write" (ALL) ∩ SELECT overlapper "select authenticated"
--   (true) → admin-SELECT redundant. admin-ALL splittes til INSERT/UPDATE/DELETE.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "league_rounds admin or club-admin write" on public.league_rounds;
create policy "league_rounds admin or club-admin insert" on public.league_rounds for insert to authenticated
  with check (is_admin() OR ((league_group_id(league_id) IS NOT NULL) AND is_group_admin(league_group_id(league_id))));
create policy "league_rounds admin or club-admin update" on public.league_rounds for update to authenticated
  using (is_admin() OR ((league_group_id(league_id) IS NOT NULL) AND is_group_admin(league_group_id(league_id))))
  with check (is_admin() OR ((league_group_id(league_id) IS NOT NULL) AND is_group_admin(league_group_id(league_id))));
create policy "league_rounds admin or club-admin delete" on public.league_rounds for delete to authenticated
  using (is_admin() OR ((league_group_id(league_id) IS NOT NULL) AND is_group_admin(league_group_id(league_id))));

-- ─────────────────────────────────────────────────────────────────────────────
-- leagues — SELECT (rolle authenticated)
--   "admin or club-admin write" (ALL) ∩ SELECT overlapper "select scoped",
--   begge {authenticated}. Merge SELECT → (write-qual OR select-scoped). admin-ALL
--   splittes til INSERT/UPDATE/DELETE + merget SELECT.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "leagues admin or club-admin write" on public.leagues;
drop policy if exists "leagues select scoped" on public.leagues;
create policy "leagues select scoped" on public.leagues for select to authenticated
  using (
    (is_admin() OR ((group_id IS NOT NULL) AND is_group_admin(group_id)))
    OR ((group_id IS NULL) OR is_admin() OR is_group_member(group_id))
  );
create policy "leagues admin or club-admin insert" on public.leagues for insert to authenticated
  with check (is_admin() OR ((group_id IS NOT NULL) AND is_group_admin(group_id)));
create policy "leagues admin or club-admin update" on public.leagues for update to authenticated
  using (is_admin() OR ((group_id IS NOT NULL) AND is_group_admin(group_id)))
  with check (is_admin() OR ((group_id IS NOT NULL) AND is_group_admin(group_id)));
create policy "leagues admin or club-admin delete" on public.leagues for delete to authenticated
  using (is_admin() OR ((group_id IS NOT NULL) AND is_group_admin(group_id)));

-- ─────────────────────────────────────────────────────────────────────────────
-- tournaments — SELECT + INSERT/UPDATE/DELETE (rolle authenticated)
--   Tre ALL/SELECT-policyer, alle {authenticated}:
--     "admin or club-admin write" (ALL), "creator write own personal" (ALL),
--     "select scoped" (SELECT).
--   SELECT: merge alle tre → (write1 OR write2 OR select-scoped).
--   INSERT/UPDATE/DELETE: merge de to ALL-policyene → (write1 OR write2).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "tournaments admin or club-admin write" on public.tournaments;
drop policy if exists "tournaments creator write own personal" on public.tournaments;
drop policy if exists "tournaments select scoped" on public.tournaments;
create policy "tournaments select scoped" on public.tournaments for select to authenticated
  using (
    (is_admin() OR ((group_id IS NOT NULL) AND is_group_admin(group_id)))
    OR ((group_id IS NULL) AND (created_by = (select auth.uid())))
    OR ((group_id IS NULL) OR is_admin() OR is_group_member(group_id))
  );
create policy "tournaments admin or club-admin insert" on public.tournaments for insert to authenticated
  with check (
    (is_admin() OR ((group_id IS NOT NULL) AND is_group_admin(group_id)))
    OR ((group_id IS NULL) AND (created_by = (select auth.uid())))
  );
create policy "tournaments admin or club-admin update" on public.tournaments for update to authenticated
  using (
    (is_admin() OR ((group_id IS NOT NULL) AND is_group_admin(group_id)))
    OR ((group_id IS NULL) AND (created_by = (select auth.uid())))
  )
  with check (
    (is_admin() OR ((group_id IS NOT NULL) AND is_group_admin(group_id)))
    OR ((group_id IS NULL) AND (created_by = (select auth.uid())))
  );
create policy "tournaments admin or club-admin delete" on public.tournaments for delete to authenticated
  using (
    (is_admin() OR ((group_id IS NOT NULL) AND is_group_admin(group_id)))
    OR ((group_id IS NULL) AND (created_by = (select auth.uid())))
  );
