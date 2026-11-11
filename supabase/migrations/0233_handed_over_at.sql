-- 0233: game_players.handed_over_at (#2814)
--
-- In a simulator league the one who keeps the flight's cards hands them over:
-- they become the marker for the cards they kept, and each flightmate looks
-- the card over and delivers it. Delivered unchanged, the card is approved
-- in the marker's name. Until now «handed over» was guessed from the marker
-- being a flightmate, and a card that was later sent back or reopened looked
-- the same. The owner, 11.11: «Ja, legg til feltet».
--
--   handed_over_at  set by the server (service role) in the handover;
--                   cleared when a delivered card goes back to not delivered
--                   (the marker sends it back, the organiser reopens it), so a
--                   card is handed over only until its first delivery is
--                   undone. Such a card is never approved on delivery.
--
-- Additive and nullable. The app and web read it in the delivery, so apply it
-- BEFORE the code that reads it is deployed.
--
-- Guard (same shape as 0220's marker_user_id): a signed-in non-admin may not
-- set it. Clearing it is allowed, since that only removes the automatic
-- approval.

alter table public.game_players
  add column if not exists handed_over_at timestamptz;

comment on column public.game_players.handed_over_at is
  '#2814: when a flightmate who kept this card in a simulator league handed it over and became its marker. Set by the server; cleared when the delivered card goes back to not delivered (sent back or reopened). Null elsewhere.';

create or replace function public.guard_game_players_handed_over()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  begin
    -- A delivered card that goes back to not delivered (the marker sends it
    -- back, the organiser reopens it) is no longer a handed-over card.
    if tg_op = 'UPDATE' and old.submitted_at is not null and new.submitted_at is null then
      new.handed_over_at := null;
    end if;

    if new.handed_over_at is null or auth.uid() is null or public.is_admin() then
      return new;
    end if;

    if tg_op = 'INSERT' then
      raise exception
        'handed_over_at is set by the server in the handover (game_players.handed_over_at)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    elsif new.handed_over_at is distinct from old.handed_over_at then
      raise exception
        'handed_over_at is set by the server in the handover (game_players.handed_over_at)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    return new;
  end;
  $$;

comment on function public.guard_game_players_handed_over() is
  '#2814: BEFORE INSERT/UPDATE on game_players. Clears handed_over_at when a delivered card goes back to not delivered; only the service role and a global admin set it.';

revoke execute on function public.guard_game_players_handed_over() from public, anon, authenticated;

drop trigger if exists guard_game_players_handed_over on public.game_players;
create trigger guard_game_players_handed_over
  before insert or update on public.game_players
  for each row execute function public.guard_game_players_handed_over();
