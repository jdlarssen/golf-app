-- Cleanup for the quick-win-5 demo data.
-- Run this in Supabase SQL Editor (or via MCP) when you no longer need the
-- demo tournaments and players.
--
-- Removes:
--  • Two demo games + their game_players rows + their scores
--  • Seven demo users (Lars Berg, Henrik Solli, Magnus Riise, Sigurd Holm,
--    Trond Engdal, Olav Aursand, Espen Furu) — both public.users and auth.users
--
-- Jørgen and Even (real users) are NOT touched.

BEGIN;

-- 1. Delete scores for the two demo games (FK cascade would handle this
-- via game_id, but being explicit is safer).
DELETE FROM public.scores
WHERE game_id IN (
  'aaaaaaaa-1111-4111-1111-aaaaaaaaaaaa',
  'aaaaaaaa-2222-4222-2222-aaaaaaaaaaaa'
);

-- 2. Delete game_players rows.
DELETE FROM public.game_players
WHERE game_id IN (
  'aaaaaaaa-1111-4111-1111-aaaaaaaaaaaa',
  'aaaaaaaa-2222-4222-2222-aaaaaaaaaaaa'
);

-- 3. Delete the games themselves.
DELETE FROM public.games
WHERE id IN (
  'aaaaaaaa-1111-4111-1111-aaaaaaaaaaaa',
  'aaaaaaaa-2222-4222-2222-aaaaaaaaaaaa'
);

-- 4. Delete public.users rows for the seven demo players.
DELETE FROM public.users
WHERE id IN (
  '11111111-aaaa-4aaa-aaaa-111111111111',
  '22222222-aaaa-4aaa-aaaa-222222222222',
  '33333333-aaaa-4aaa-aaaa-333333333333',
  '44444444-aaaa-4aaa-aaaa-444444444444',
  '55555555-aaaa-4aaa-aaaa-555555555555',
  '66666666-aaaa-4aaa-aaaa-666666666666',
  '77777777-aaaa-4aaa-aaaa-777777777777'
);

-- 5. Delete auth.users rows for the seven demo players.
DELETE FROM auth.users
WHERE id IN (
  '11111111-aaaa-4aaa-aaaa-111111111111',
  '22222222-aaaa-4aaa-aaaa-222222222222',
  '33333333-aaaa-4aaa-aaaa-333333333333',
  '44444444-aaaa-4aaa-aaaa-444444444444',
  '55555555-aaaa-4aaa-aaaa-555555555555',
  '66666666-aaaa-4aaa-aaaa-666666666666',
  '77777777-aaaa-4aaa-aaaa-777777777777'
);

COMMIT;

-- Sanity check after running:
SELECT
  (SELECT count(*) FROM public.users) AS users_remaining,
  (SELECT count(*) FROM public.games) AS games_remaining,
  (SELECT count(*) FROM public.scores) AS scores_remaining;
