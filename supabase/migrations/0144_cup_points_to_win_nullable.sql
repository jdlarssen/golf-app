-- #1142: points_to_win is derived at cup start, not guessed at creation.
--
-- The create form asked the admin for a points target before the match count
-- existed (matches are generated later, in /generer, while status='draft').
-- The default hardcoded "assume 8 matches". startTournament now derives the
-- target from the real match count, so a draft carries NULL until then.
--
-- NULL is the honest "not decided yet" value: 0 would make computeCupLeaderboard
-- declare a winner immediately (0 >= 0) and render "Først til 0 poeng".
--
-- tournaments_points_to_win_check CHECK (points_to_win > 0) is kept as-is: in
-- Postgres a CHECK passes when it evaluates to NULL, so it keeps rejecting 0 and
-- negatives while allowing the not-yet-decided NULL.
alter table public.tournaments alter column points_to_win drop not null;

comment on column public.tournaments.points_to_win is
  'Poeng et lag trenger for å vinne cupen. NULL i draft — utledes ved startTournament fra det reelle match-antallet (count/2 + 0,5).';
