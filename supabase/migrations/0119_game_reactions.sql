-- 0119_game_reactions.sql
-- #943 (epic #951, banter-lag MVP): emoji-reactions on leaderboard rows.
-- A participant drops one of a fixed 6-emoji palette onto another player's row
-- (or their own). Slack-style toggle: one row per (game, reactor, target, emoji);
-- tapping the same emoji again deletes it. Insert/delete-only — rows are immutable
-- once created, so there is no UPDATE policy and no column-immutability trigger.
-- The palette is locked here (the DB is the outer guard against a hostile PATCH)
-- AND mirrored in lib/games/reactions/palette.ts — one rule, two homes: change
-- both layers in the same commit (AGENTS.md trap #4).

create table public.reactions (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references public.games(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  target_user_id  uuid not null references public.users(id) on delete cascade,
  emoji           text not null,
  created_at      timestamptz not null default now(),
  constraint reactions_emoji_palette check (emoji in ('👏','🔥','😂','💪','⛳','🐦')),
  unique (game_id, user_id, target_user_id, emoji)
);

create index reactions_game_idx on public.reactions (game_id);
create index reactions_game_target_idx on public.reactions (game_id, target_user_id);

comment on table public.reactions is
  'Emoji-reactions on leaderboard rows (#943). One row per (game, reactor, target, '
  'emoji); insert/delete-only toggle. Palette CHECK mirrors lib/games/reactions/palette.ts.';

alter table public.reactions enable row level security;

-- Participant check: is the caller a non-withdrawn player in this game?
create or replace function public.can_react_in_game(p_game_id uuid)
  returns boolean
  language sql security definer stable
  set search_path = public, pg_catalog
  as $$
    select exists(
      select 1 from public.game_players
      where game_id = p_game_id
        and user_id = auth.uid()
        and withdrawn_at is null
    );
  $$;

comment on function public.can_react_in_game(uuid) is
  'True if auth.uid() is a non-withdrawn participant of the game. Backs the reactions '
  'insert RLS (#943). SECURITY DEFINER + pinned search_path per the 0104 hardening.';

-- SELECT: any participant of the game sees the game's reactions. A reaction leaks no
-- score (just "X reacted 🔥 to Y"), so this mirrors leaderboard participation rather
-- than the stricter same-flight score gate.
create policy "reactions select if participant"
  on public.reactions for select to authenticated
  using (
    public.is_admin()
    or exists(
      select 1 from public.game_players gp
      where gp.game_id = reactions.game_id
        and gp.user_id = auth.uid()
    )
  );

-- INSERT: only your own reaction, only as a participant, only onto a real
-- participant of the same game.
create policy "reactions insert own"
  on public.reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_react_in_game(game_id)
    and exists(
      select 1 from public.game_players gp
      where gp.game_id = reactions.game_id
        and gp.user_id = reactions.target_user_id
    )
  );

-- DELETE: only your own reactions (the other half of the toggle).
create policy "reactions delete own"
  on public.reactions for delete to authenticated
  using (user_id = auth.uid());
-- No UPDATE policy: rows are immutable after insert.
