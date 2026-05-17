-- Tag tee-boxes med kjønn (mens/ladies/juniors) og tillat per-player override
-- av tee_box_id på game_players. Backfill av eksisterende tee_boxes til 'mens'
-- skjer via DEFAULT (alle eksisterende tees er herretees per dagens datasett).

create type tee_box_gender as enum ('mens', 'ladies', 'juniors');

alter table public.tee_boxes
  add column gender tee_box_gender not null default 'mens';

alter table public.game_players
  add column tee_box_id uuid references public.tee_boxes(id);

-- Ingen RLS-endringer:
-- - tee_boxes arver fra courses-policy
-- - game_players.tee_box_id leses/skrives som del av eksisterende game_players-policy
