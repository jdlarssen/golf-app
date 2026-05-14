-- Per-game score visibility. Default 'live' preserves existing behavior;
-- 'reveal' hides netto info during the round and unveils at status='finished'.
alter table public.games
  add column score_visibility text not null default 'live'
  check (score_visibility in ('live', 'reveal'));

comment on column public.games.score_visibility is
  'live = always show netto. reveal = hide netto during active, reveal at finished.';
