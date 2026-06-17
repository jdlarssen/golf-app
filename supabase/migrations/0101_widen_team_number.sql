-- Widen game_players_team_number_check so team_number is no longer capped at 4.
--
-- Background: 0030 set `team_number between 1 and 4`. 0095 widened flight_number
-- to `>= 1` but explicitly left team_number at 1..4, on the (wrong) assumption
-- that team slots are a small fixed set per format. That broke:
--   #669 — 5-player Wolf emits team_number=5 (validateWolf allows 5) → CHECK
--          violation → "Klarte ikke å lagre spillerne" dead-end. Also club-scale
--          scramble/Patsome with >4 teams (those validators have no upper bound).
--   #667 — public team self-registration picks the lowest free slot (1..50); the
--          5th captain got team_number=5, the insert failed on this CHECK, and the
--          failure was silently swallowed (captain dropped from the roster).
--
-- Per-format validators still bound team_number where the format requires it
-- (bestBall >4, foursomes >2, roundRobin >4), so the app layer stays the real
-- limit; this just stops the DB from being a stricter, unintended cap.
--
-- game_players_team_flight_consistency (team_number IS NULL OR flight_number IS
-- NOT NULL) is unaffected: a team_number=5 row sets flight_number=5 (>= 1, valid).
-- Pure widening — no existing row is invalidated, no data migration needed.

alter table public.game_players
  drop constraint if exists game_players_team_number_check;

alter table public.game_players
  add constraint game_players_team_number_check
    check (team_number is null or team_number >= 1);
