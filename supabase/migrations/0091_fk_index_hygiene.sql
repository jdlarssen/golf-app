-- #413 FK-indeks-hygiene
-- Dekker 37 fremmednøkler uten dekkende indeks (flagget av Supabase performance advisor,
-- live-sjekk 2026-06-09). Plain CREATE INDEX (ikke CONCURRENTLY — kan ikke kjøre i tx).
-- Konvensjon: <table>_<column>_idx
--
-- Seksjoner (hot-tabeller først, øvrige alfabetisk):
--   1. scores            (hot — join på nesten alle leaderboard-spørringer)
--   2. game_players      (hot — join på spill-sider)
--   3. games             (hot — oppslag på bane, tee-boks, skaper)
--   4. invitations       (hot — sjekk ved innlogging + admin-side)
--   5. bingo_bango_bongo_holes
--   6. courses
--   7. game_registration_requests
--   8. game_side_winners
--   9. group_join_requests
--  10. groups
--  11. league_rounds
--  12. leagues
--  13. patsome_tee_starters
--  14. product_update_digests
--  15. product_updates
--  16. tee_boxes
--  17. tournaments
--  18. wolf_hole_choices
--  19. agent_findings

-- ─── 1. scores ───────────────────────────────────────────────────────────────

-- scores.user_id: FK til users; filtreres/joines i nesten alle leaderboard-spørringer
create index if not exists scores_user_id_idx on public.scores (user_id);

-- scores.entered_by: FK til users; brukes i revisjons-spørringer og scorekort-visning
create index if not exists scores_entered_by_idx on public.scores (entered_by);

-- ─── 2. game_players ─────────────────────────────────────────────────────────

-- game_players.user_id: FK til users; join-kolonne i alle spill-flate-spørringer
create index if not exists game_players_user_id_idx on public.game_players (user_id);

-- game_players.approved_by_user_id: FK til users; sjekkes ved peer-approval-spørringer
create index if not exists game_players_approved_by_user_id_idx on public.game_players (approved_by_user_id);

-- game_players.withdrawn_by_user_id: FK til users; sjekkes ved trekk-spiller-flyt
create index if not exists game_players_withdrawn_by_user_id_idx on public.game_players (withdrawn_by_user_id);

-- ─── 3. games ────────────────────────────────────────────────────────────────

-- games.course_id: FK til courses; join ved leaderboard, spill-oversikt, admin
create index if not exists games_course_id_idx on public.games (course_id);

-- games.created_by: FK til users; brukes i admin-filtrering og skapergaten
create index if not exists games_created_by_idx on public.games (created_by);

-- games.tee_box_id: FK til tee_boxes; join ved scorekort og handicap-beregning
create index if not exists games_tee_box_id_idx on public.games (tee_box_id);

-- games.foursomes_side1_tee_starter_user_id: FK til users; sjekkes i foursomes-oppsett
create index if not exists games_foursomes_side1_tee_starter_user_id_idx
  on public.games (foursomes_side1_tee_starter_user_id);

-- games.foursomes_side2_tee_starter_user_id: FK til users; speiler side1
create index if not exists games_foursomes_side2_tee_starter_user_id_idx
  on public.games (foursomes_side2_tee_starter_user_id);

-- ─── 4. invitations ──────────────────────────────────────────────────────────

-- invitations.game_id: FK til games; sjekkes ved innlogging (email_is_invited RPC)
create index if not exists invitations_game_id_idx on public.invitations (game_id);

-- invitations.invited_by: FK til users; brukes i admin-liste og notifikasjons-flyt
create index if not exists invitations_invited_by_idx on public.invitations (invited_by);

-- ─── 5. bingo_bango_bongo_holes ──────────────────────────────────────────────

-- bingo_bango_bongo_holes.bingo_user_id: FK til users
create index if not exists bingo_bango_bongo_holes_bingo_user_id_idx
  on public.bingo_bango_bongo_holes (bingo_user_id);

-- bingo_bango_bongo_holes.bango_user_id: FK til users
create index if not exists bingo_bango_bongo_holes_bango_user_id_idx
  on public.bingo_bango_bongo_holes (bango_user_id);

-- bingo_bango_bongo_holes.bongo_user_id: FK til users
create index if not exists bingo_bango_bongo_holes_bongo_user_id_idx
  on public.bingo_bango_bongo_holes (bongo_user_id);

-- bingo_bango_bongo_holes.entered_by: FK til users
create index if not exists bingo_bango_bongo_holes_entered_by_idx
  on public.bingo_bango_bongo_holes (entered_by);

-- ─── 6. courses ──────────────────────────────────────────────────────────────

-- courses.created_by: FK til users; brukes i admin-bane-liste og RLS-gater
create index if not exists courses_created_by_idx on public.courses (created_by);

-- courses.updated_by: FK til users; brukes i revisjons-spørringer
create index if not exists courses_updated_by_idx on public.courses (updated_by);

-- ─── 7. game_registration_requests ──────────────────────────────────────────

-- game_registration_requests.decided_by_user_id: FK til users; spørres ved admin-godkjenning
create index if not exists game_registration_requests_decided_by_user_id_idx
  on public.game_registration_requests (decided_by_user_id);

-- ─── 8. game_side_winners ────────────────────────────────────────────────────

-- game_side_winners.winner_user_id: FK til users; join i sideturnering-visning
create index if not exists game_side_winners_winner_user_id_idx
  on public.game_side_winners (winner_user_id);

-- ─── 9. group_join_requests ──────────────────────────────────────────────────

-- group_join_requests.decided_by_user_id: FK til users; sjekkes ved godkjenning
create index if not exists group_join_requests_decided_by_user_id_idx
  on public.group_join_requests (decided_by_user_id);

-- ─── 10. groups ──────────────────────────────────────────────────────────────

-- groups.created_by: FK til users; brukes i skapergate og admin-liste
create index if not exists groups_created_by_idx on public.groups (created_by);

-- ─── 11. league_rounds ───────────────────────────────────────────────────────

-- league_rounds.course_id: FK til courses; join i liga-runde-visning
create index if not exists league_rounds_course_id_idx on public.league_rounds (course_id);

-- league_rounds.tee_box_id: FK til tee_boxes; join i handicap-beregning per runde
create index if not exists league_rounds_tee_box_id_idx on public.league_rounds (tee_box_id);

-- league_rounds.window_overridden_by: FK til users; revisjons-spørring (sjelden brukt,
-- men indeksen koster lite og fjerner advisor-funnet)
create index if not exists league_rounds_window_overridden_by_idx
  on public.league_rounds (window_overridden_by);

-- ─── 12. leagues ─────────────────────────────────────────────────────────────

-- leagues.course_id: FK til courses; join ved liga-dashboard
create index if not exists leagues_course_id_idx on public.leagues (course_id);

-- leagues.created_by: FK til users; brukes i skapergate (requireAdminOrCreator)
create index if not exists leagues_created_by_idx on public.leagues (created_by);

-- leagues.tee_box_id: FK til tee_boxes; join ved liga-runde-handicap
create index if not exists leagues_tee_box_id_idx on public.leagues (tee_box_id);

-- ─── 13. patsome_tee_starters ────────────────────────────────────────────────

-- patsome_tee_starters.tee_starter_user_id: FK til users
create index if not exists patsome_tee_starters_tee_starter_user_id_idx
  on public.patsome_tee_starters (tee_starter_user_id);

-- ─── 14. product_update_digests ──────────────────────────────────────────────

-- product_update_digests.sent_by: FK til users; revisjons-spørring
create index if not exists product_update_digests_sent_by_idx
  on public.product_update_digests (sent_by);

-- ─── 15. product_updates ─────────────────────────────────────────────────────

-- product_updates.created_by: FK til users; brukes i admin-side for oppdateringer
create index if not exists product_updates_created_by_idx on public.product_updates (created_by);

-- ─── 16. tee_boxes ───────────────────────────────────────────────────────────

-- tee_boxes.course_id: FK til courses; join i bane-detalj og handicap-beregning
create index if not exists tee_boxes_course_id_idx on public.tee_boxes (course_id);

-- ─── 17. tournaments ─────────────────────────────────────────────────────────

-- tournaments.created_by: FK til users; brukes i skapergate (requireAdminOrTournamentCreator)
create index if not exists tournaments_created_by_idx on public.tournaments (created_by);

-- ─── 18. wolf_hole_choices ───────────────────────────────────────────────────

-- wolf_hole_choices.wolf_user_id: FK til users; join i Wolf hull-for-hull-visning
create index if not exists wolf_hole_choices_wolf_user_id_idx
  on public.wolf_hole_choices (wolf_user_id);

-- wolf_hole_choices.partner_user_id: FK til users; join i Wolf hull-for-hull-visning
create index if not exists wolf_hole_choices_partner_user_id_idx
  on public.wolf_hole_choices (partner_user_id);

-- wolf_hole_choices.entered_by: FK til users
create index if not exists wolf_hole_choices_entered_by_idx
  on public.wolf_hole_choices (entered_by);

-- ─── 19. agent_findings ──────────────────────────────────────────────────────

-- agent_findings.run_id: FK til agent_runs; join ved agent-monitoring-oppslag
create index if not exists agent_findings_run_id_idx on public.agent_findings (run_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- UBRUKTE INDEKSER — vurdering per index (ikke blind drop)
-- Kilde: Supabase performance advisor 2026-06-09 («unused_index», 16 treff)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Beslutningslogikk:
--   DROP   = åpenbart uten fremtidig bruk, eller duplikat av UNIQUE-constraint
--   BEHOLD = støtter aktiv kode-sti, indeks over mye-brukt kolonne, eller
--            «advisor sier ubrukt» men datavolum + spørre-mønster gjør det risikabelt
--
-- ┌─────────────────────────────────────────────────┬────────────┐
-- │ Index                                           │ Beslutning │
-- ├─────────────────────────────────────────────────┼────────────┤
-- │ invitations_token (0001)                        │ DROP       │
-- │ groups_short_id_idx (0075)                      │ DROP       │
-- │ users_friend_code_idx (0077)                    │ DROP       │
-- │ agent_findings_fingerprint_idx (0023)           │ BEHOLD     │
-- │ agent_runs_ran_at_idx (0023)                    │ BEHOLD     │
-- │ admin_audit_log_target_idx (0027)               │ BEHOLD     │
-- │ games_game_mode_idx (0030)                      │ BEHOLD     │
-- │ games_tournament_id (0039)                      │ BEHOLD     │
-- │ game_reg_requests_team_idx (0042)               │ BEHOLD     │
-- │ games_group_id_idx (0075)                       │ BEHOLD     │
-- │ group_join_requests_group_status_idx (0075)     │ BEHOLD     │
-- │ group_join_requests_user_idx (0075)             │ BEHOLD     │
-- │ league_players_user_id (0080)                   │ BEHOLD     │
-- │ games_league_round_id (0080)                    │ BEHOLD     │
-- │ leagues_group_id_idx (0083)                     │ BEHOLD     │
-- │ tournaments_group_id_idx (0089)                 │ BEHOLD     │
-- └─────────────────────────────────────────────────┴────────────┘

-- DROP: invitations_token
-- Kolonne `token` brukes bare ved magic-link-flyt som ble skrotet 2026-05-13 (OTP-flyt
-- overtok; se arkitektur-note i CLAUDE.md). Kode-søk viser ingen lesing av token via
-- WHERE-klausul lenger — kun skriving ved `insert`. Ingen spørringer drar nytte av indeksen.
drop index if exists public.invitations_token;

-- DROP: groups_short_id_idx
-- `groups.short_id` har allerede `groups_short_id_unique` UNIQUE CONSTRAINT (0075) — Postgres
-- lager automatisk en B-tree-indeks for UNIQUE constraints. Den manuelle indeksen
-- `groups_short_id_idx` er dermed en duplikat og gir dobbelt skrive-overhead uten ekstra
-- lese-gevinst.
drop index if exists public.groups_short_id_idx;

-- DROP: users_friend_code_idx
-- `users.friend_code` har allerede `users_friend_code_unique` UNIQUE CONSTRAINT (0077) — samme
-- logikk som groups_short_id_idx over: duplikat av auto-generert constraint-indeks.
drop index if exists public.users_friend_code_idx;

-- BEHOLD (ikke droppet) — begrunnelser:
--
-- agent_findings_fingerprint_idx: agent-monitoring er aktiv kode (0023); indeks på
--   (fingerprint, resolved_at) støtter duplikat-sjekk og åpne-funn-oppslag. «Ubrukt» skyldes
--   sannsynligvis lav trafikk mot agent_findings i daglig drift, ikke at koden mangler.
--
-- agent_runs_ran_at_idx: brukes i DESC-sortert oppslag av siste agent-kjøring; tidsserie-data
--   med klar bruksprofil, og datavolum er for lavt til at Postgres velger indeks over seq-scan.
--
-- admin_audit_log_target_idx: audit-log filtreres på target ved admin-gjennomgang; lav
--   daglig trafikk betyr at Postgres planner sjelden velger indeksen, men den er kritisk ved
--   sjeldne revisjons-søk. Beholder for sikkerhetshensyn.
--
-- games_game_mode_idx: game_mode filtreres i admin-listene og wizard-validering; advisor
--   rapporterer «ubrukt» fordi datasettet er lite — indeksen er riktig å ha ved klubb-skala.
--
-- games_tournament_id: games filtreres på tournament_id i cup-flater; advisor-funnene her
--   skyldes at cup er nytt (0089/0090) og trafikken ennå er lav.
--
-- game_reg_requests_team_idx: team_id er join-kolonne i lagpåmeldings-flyt; lav trafikk
--   nå, men nødvendig ved vekst.
--
-- games_group_id_idx: partial index (WHERE group_id IS NOT NULL) for klubb-spill; klubb-
--   funksjonalitet er ny og trafikken vokser — ingen grunn til å droppe.
--
-- group_join_requests_group_status_idx og _user_idx: brukes ved oppmelding og godkjenning i
--   grupper; aktivt støttet i koden, lavt trafikk-volum = adviser sier «ubrukt».
--
-- league_players_user_id og games_league_round_id: liga er ny (0080); begge kolonnene er
--   join-kolonner i liga-dashboard. For tidlig å droppe.
--
-- leagues_group_id_idx: partial index for klubb-liga; samme resonnement som games_group_id_idx.
--
-- tournaments_group_id_idx: partial index for klubb-cup (0089); er nettopp lagt til —
--   advisor-funnet er forventet (ingen trafikk ennå). Dropping ville angre 0089 umiddelbart.
