-- 0257_cup_weights_one_decimal.sql
--
-- Cup point weights (win_points, tie_points, 0153) carry at most one decimal.
-- The cup table shows points with one decimal, so a weight like 0.25 would
-- show sums that do not add up. The form parsers (lib/cup/pointsToWin.ts,
-- parseWinPoints/parseTiePoints) refuse the same values; this CHECK is the
-- same rule in the database, so a direct write cannot store one either
-- (trap #4: one rule, every layer).
--
-- Pre-check before prod: this must return 0, or ADD CONSTRAINT fails.
--   select count(*) from public.tournaments
--   where win_points <> round(win_points, 1) or tie_points <> round(tie_points, 1);

-- Idempotent: safe to run again, and safe in either order against deploy
-- (the parser already refuses these values).
alter table public.tournaments
  drop constraint if exists tournaments_win_points_one_decimal,
  drop constraint if exists tournaments_tie_points_one_decimal;

alter table public.tournaments
  add constraint tournaments_win_points_one_decimal
    check (win_points = round(win_points, 1)),
  add constraint tournaments_tie_points_one_decimal
    check (tie_points = round(tie_points, 1));
