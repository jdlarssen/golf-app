-- supabase/tests/users_anonymize_fk_coverage_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Guard test: every FK column that points at public.users has a decided fate
-- in anonymize_user() (#1899, migration 0184).
--
-- Background: the anonymization path scrubs the users row instead of deleting
-- it, so no ON DELETE CASCADE ever fires. A new table with a FK to users is
-- therefore silently left behind unless someone adds it to anonymize_user().
-- That happened three times (green_pins → 0142, apns_tokens → 0184,
-- kavalkades/kavalkade_shares → 0184).
--
-- The guard forces a decision; it does not make it. wolf_hole_choices has a
-- CASCADE FK but is game history that must survive, so "every cascade table
-- must be deleted" would be the wrong rule. Instead the list below classifies
-- every (table, column):
--
--   deleted                personal row, anonymize_user deletes it
--   nulled                 row is kept, the user reference is set to null
--   handled_by_withdrawal  unfinished participation removed/marked (#1909)
--   kept_history           game history, shown as «Slettet bruker» (#1012)
--   kept_no_pii            points at the scrubbed row, no PII in the column
--
--   1. the list equals the FK columns in pg_constraint — a new FK column not in
--      the list (Extra records) or a listed column that no longer exists
--      (Missing records) is RED
--   2. every `deleted` column has a `delete from public.<table> … <column> =
--      p_user_id` in the function body
--   3. every `nulled` column has an `update public.<table> set <column> = null`
--   4. every `handled_by_withdrawal` column is matched on p_user_id in a
--      statement on its table
--
-- Red here? Decide what anonymize_user() should do with the new column, change
-- the function in a new migration if needed, and add the column to the list.
-- See supabase/tests/README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

create temporary table fk_coverage (
  tbl      text not null,
  col      text not null,
  handling text not null check (handling in (
    'deleted', 'nulled', 'handled_by_withdrawal', 'kept_history', 'kept_no_pii'
  )),
  primary key (tbl, col)
);

insert into fk_coverage (tbl, col, handling) values
  -- Personal/social rows
  ('apns_tokens',                'user_id',                             'deleted'),
  ('friendships',                'addressee_id',                        'deleted'),
  ('friendships',                'requester_id',                        'deleted'),
  ('game_registration_requests', 'user_id',                             'deleted'),
  ('group_join_requests',        'user_id',                             'deleted'),
  ('group_members',              'user_id',                             'deleted'),
  ('idea_submissions',           'user_id',                             'deleted'),
  ('kavalkade_shares',           'user_id',                             'deleted'),
  ('kavalkades',                 'user_id',                             'deleted'),
  ('notifications',              'user_id',                             'deleted'),
  ('push_subscriptions',         'user_id',                             'deleted'),
  ('reactions',                  'user_id',                             'deleted'),
  -- Crowd-sourced data kept, attribution removed (0142)
  ('green_pins',                 'user_id',                             'nulled'),
  -- Unfinished participation (#1909, 0174)
  ('cup_lineup_slots',           'user_id',                             'handled_by_withdrawal'),
  ('game_players',               'user_id',                             'handled_by_withdrawal'),
  ('league_players',             'user_id',                             'handled_by_withdrawal'),
  ('tournament_participants',    'user_id',                             'handled_by_withdrawal'),
  -- Game history (#1012)
  ('bingo_bango_bongo_holes',    'bango_user_id',                       'kept_history'),
  ('bingo_bango_bongo_holes',    'bingo_user_id',                       'kept_history'),
  ('bingo_bango_bongo_holes',    'bongo_user_id',                       'kept_history'),
  ('bingo_bango_bongo_holes',    'entered_by',                          'kept_history'),
  ('game_players',               'approved_by_user_id',                 'kept_history'),
  ('game_side_winners',          'winner_user_id',                      'kept_history'),
  ('games',                      'foursomes_side1_tee_starter_user_id', 'kept_history'),
  ('games',                      'foursomes_side2_tee_starter_user_id', 'kept_history'),
  ('patsome_tee_starters',       'tee_starter_user_id',                 'kept_history'),
  ('reactions',                  'target_user_id',                      'kept_history'),
  ('scores',                     'entered_by',                          'kept_history'),
  ('scores',                     'user_id',                             'kept_history'),
  ('tournament_side_awards',     'winner_user_id',                      'kept_history'),
  ('wolf_hole_choices',          'entered_by',                          'kept_history'),
  ('wolf_hole_choices',          'partner_user_id',                     'kept_history'),
  ('wolf_hole_choices',          'wolf_user_id',                        'kept_history'),
  -- Authorship/audit pointers to the scrubbed row
  ('admin_audit_log',            'actor_user_id',                       'kept_no_pii'),
  ('club_invitations',           'invited_by',                          'kept_no_pii'),
  ('courses',                    'created_by',                          'kept_no_pii'),
  ('courses',                    'updated_by',                          'kept_no_pii'),
  ('cup_lineup_sessions',        'created_by',                          'kept_no_pii'),
  ('cup_lineup_sessions',        'team_1_submitted_by',                 'kept_no_pii'),
  ('cup_lineup_sessions',        'team_2_submitted_by',                 'kept_no_pii'),
  ('game_players',               'withdrawn_by_user_id',                'kept_no_pii'),
  ('game_registration_requests', 'decided_by_user_id',                  'kept_no_pii'),
  ('games',                      'created_by',                          'kept_no_pii'),
  ('group_join_requests',        'decided_by_user_id',                  'kept_no_pii'),
  ('groups',                     'created_by',                          'kept_no_pii'),
  ('invitations',                'invited_by',                          'kept_no_pii'),
  ('league_rounds',              'window_overridden_by',                'kept_no_pii'),
  ('leagues',                    'created_by',                          'kept_no_pii'),
  ('product_update_digests',     'sent_by',                             'kept_no_pii'),
  ('product_updates',            'created_by',                          'kept_no_pii'),
  ('tournaments',                'created_by',                          'kept_no_pii');

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. The list is exactly the FK columns pointing at public.users
-- ═════════════════════════════════════════════════════════════════════════════
select set_eq(
  $$
    select c.conrelid::regclass::text, a.attname::text
      from pg_constraint c
      cross join lateral unnest(c.conkey) as k(attnum)
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f'
       and c.confrelid = 'public.users'::regclass
  $$,
  $$ select tbl, col from fk_coverage $$,
  'every FK column to public.users is classified in this file '
  '(Extra = new FK: decide its fate in anonymize_user and list it here; '
  'Missing = listed column no longer exists)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2–4. The classification matches the function body
-- ═════════════════════════════════════════════════════════════════════════════
select is_empty(
  $$
    select f.tbl, f.col from fk_coverage f
     where f.handling = 'deleted'
       and pg_get_functiondef('public.anonymize_user(uuid)'::regprocedure)
           !~ ('delete from public\.' || f.tbl || '\s[^;]*\m' || f.col || '\s*=\s*p_user_id')
  $$,
  'every column classified deleted is deleted on p_user_id in anonymize_user'
);

select is_empty(
  $$
    select f.tbl, f.col from fk_coverage f
     where f.handling = 'nulled'
       and pg_get_functiondef('public.anonymize_user(uuid)'::regprocedure)
           !~ ('update public\.' || f.tbl || '\s+set\s+' || f.col || '\s*=\s*null\s+where\s+'
               || f.col || '\s*=\s*p_user_id')
  $$,
  'every column classified nulled is set to null on p_user_id in anonymize_user'
);

select is_empty(
  $$
    select f.tbl, f.col from fk_coverage f
     where f.handling = 'handled_by_withdrawal'
       and pg_get_functiondef('public.anonymize_user(uuid)'::regprocedure)
           !~ ('public\.' || f.tbl || '\s[^;]*\m' || f.col || '\s*=\s*p_user_id')
  $$,
  'every column classified handled_by_withdrawal is matched on p_user_id in anonymize_user'
);

select * from finish();
rollback;
