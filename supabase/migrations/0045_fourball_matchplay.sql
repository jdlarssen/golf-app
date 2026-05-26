-- 0045_fourball_matchplay.sql
-- Fase 2 av #47 — four-ball matchplay (2v2 best-ball-matchplay).
--
-- Issue: #217
--
-- 1. Utvider games_mode_check fra 5 til 6 verdier med 'fourball_matchplay'.
-- 2. Legger til tournaments.fourball_allowance_pct (default 85, range 0..100)
--    som styrer handicap-allowance for fourball-matches i cup-en. 0 = brutto
--    (gross-only matchplay), 1..100 = netto med den prosenten. Én kolonne
--    dekker begge tilstander — netto/brutto-toggle er ren UI-konstruksjon
--    over feltet.
--
-- Default 85 matcher WHS-standard for four-ball matchplay og NGF-anbefaling.
-- Eksisterende cuper fra fase 1 får 85 via default uten backfill.

alter table public.games
  drop constraint games_mode_check;

alter table public.games
  add constraint games_mode_check
    check (game_mode in (
      'best_ball_netto',
      'stableford',
      'singles_matchplay',
      'solo_strokeplay_netto',
      'texas_scramble',
      'fourball_matchplay'
    ));

alter table public.tournaments
  add column fourball_allowance_pct smallint not null default 85
    check (fourball_allowance_pct between 0 and 100);

comment on column public.tournaments.fourball_allowance_pct is
  'Handicap-allowance for fourball-matches i cup-en. 0 = brutto (gross-only), '
  '1..100 = netto med den prosenten. WHS-standard for four-ball matchplay er 85. '
  'Pre-fyller wizard ved fourball-match-create; admin kan overstyre per match.';
