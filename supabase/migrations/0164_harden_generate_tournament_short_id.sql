-- 0164_harden_generate_tournament_short_id.sql
-- Prod-vakt #1752: function_search_path_mutable advisory on
-- generate_tournament_short_id() (added in 0162, after the 0137 hardening
-- sweep, so it never got the treatment). Same fix as 0137 applied to its
-- sibling generate_game_short_id() — lock search_path, no behavior change
-- (every reference in the body is already schema-qualified: public.tournaments).

alter function public.generate_tournament_short_id() set search_path = '';
