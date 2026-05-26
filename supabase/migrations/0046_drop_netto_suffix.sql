-- Issue #266 — drop the `_netto` suffix from `best_ball_netto` and
-- `solo_strokeplay_netto`. The new netto/brutto-toggle makes the suffix
-- semantically incorrect (these modes can now be either netto or brutto
-- depending on `hcp_allowance_pct`).
--
-- Rename mode-keys in `games` rows, then recreate the check constraint with
-- the new set. Atomic transaction; single-writer (Jørgen) means we tolerate
-- the brief window between this migration and the Vercel code deploy.
--
-- Backfill: any `best_ball_netto` row becomes `best_ball`; same for
-- `solo_strokeplay_netto` → `solo_strokeplay`. No data loss; pure key rename.

begin;

alter table public.games drop constraint games_mode_check;

update public.games set game_mode = 'best_ball'
  where game_mode = 'best_ball_netto';

update public.games set game_mode = 'solo_strokeplay'
  where game_mode = 'solo_strokeplay_netto';

alter table public.games add constraint games_mode_check check (
  game_mode in (
    'best_ball',
    'stableford',
    'singles_matchplay',
    'solo_strokeplay',
    'texas_scramble',
    'fourball_matchplay'
  )
);

commit;
