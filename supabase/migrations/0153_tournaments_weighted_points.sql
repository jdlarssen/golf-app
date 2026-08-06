-- 0153_tournaments_weighted_points.sql
--
-- Vektbare cup-poeng (#1441, D8): arrangøren av splittet cup-dag gir 5 poeng
-- for seier og 2 til hvert lag ved delt match — dagens hardkodede 1/½ i
-- computeCupLeaderboard flyttes til to kolonner med dagens verdier som
-- default, så eksisterende cuper oppfører seg uendret.
--
-- Merk: med egendefinerte vekter settes points_to_win = NULL ved start
-- (delt match betaler mindre enn seier, så «halvparten av totalen» gir ikke
-- mening som mål) — kolonnen er allerede nullable (#1142).

alter table public.tournaments
  add column win_points numeric not null default 1
    check (win_points > 0),
  add column tie_points numeric not null default 0.5
    check (tie_points >= 0);
