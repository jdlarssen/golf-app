-- 0086_league_self_service.sql
--
-- #452 Fase 3 — medlems-initiert «Bli med i ligaen» for klubb-ligaer.
--
-- To SECURITY DEFINER-RPC-er som lar et klubbmedlem melde seg på/av en klubb-liga
-- selv. I dag er `league_players`-skriving admin/klubb-admin-only (RLS-policyene i
-- 0083), så et vanlig medlem har ingen vei inn. Disse funksjonene er det eneste,
-- gatede skrive-vinduet en medlem får — RLS-policyene forblir uendret (forsvar i
-- dybden: selv om en funksjon skulle omgås, avviser policyen direkte INSERT/DELETE
-- fra en ikke-admin).
--
-- Speiler befriend_inviter (0084) / decide_join_request (0075): plpgsql, definer,
-- tom search_path, auth.uid()-gate, text-returkoder for myke utfall, og samme
-- grant-lockdown (anon må revokes eksplisitt — Supabase grant-er anon via ALTER
-- DEFAULT PRIVILEGES).
--
-- Eier-beslutninger (#452 Fase 3): self-join KUN på draft (før start, så ingen
-- retroaktive straffe-runder); self-leave KUN før spilt runde (ingen
-- dropp-en-dårlig-sesong). Begge KUN på klubb-ligaer (frittstående beholder
-- invitert-liste). Self-join = selv-bekreftet (accepted_at = now(), #463).

-- ── join_club_league ─────────────────────────────────────────────────────────
create or replace function public.join_club_league(p_league_id uuid) returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid    uuid := auth.uid();
    v_group  uuid;
    v_status text;
  begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    select group_id, status into v_group, v_status
      from public.leagues where id = p_league_id;
    if not found then raise exception 'league_not_found'; end if;
    if v_group is null then return 'not_club_league'; end if;   -- frittstående: ikke self-join
    if v_status <> 'draft' then return 'not_draft'; end if;     -- kun før start
    if not public.is_group_member(v_group) then return 'not_member'; end if;
    if exists (
      select 1 from public.league_players
       where league_id = p_league_id and user_id = v_uid
    ) then
      return 'already_member';                                  -- idempotent
    end if;
    insert into public.league_players (league_id, user_id, accepted_at)
    values (p_league_id, v_uid, now())                          -- self-join = selv-bekreftet
    on conflict (league_id, user_id) do nothing;
    return 'joined';
  end $$;

-- ── leave_club_league ────────────────────────────────────────────────────────
create or replace function public.leave_club_league(p_league_id uuid) returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid    uuid := auth.uid();
    v_group  uuid;
    v_status text;
  begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    select group_id, status into v_group, v_status
      from public.leagues where id = p_league_id;
    if not found then raise exception 'league_not_found'; end if;
    if v_group is null then return 'not_club_league'; end if;
    if v_status = 'finished' then return 'finished'; end if;
    if not exists (
      select 1 from public.league_players
       where league_id = p_league_id and user_id = v_uid
    ) then
      return 'not_member';
    end if;
    -- Sperre: har medlemmet levert et scorekort i en av ligaens flights?
    if exists (
      select 1
        from public.game_players gp
        join public.games g on g.id = gp.game_id
        join public.league_rounds lr on lr.id = g.league_round_id
       where lr.league_id = p_league_id
         and gp.user_id = v_uid
         and gp.submitted_at is not null
    ) then
      return 'already_played';
    end if;
    delete from public.league_players
      where league_id = p_league_id and user_id = v_uid;
    return 'left';
  end $$;

comment on function public.join_club_league(uuid) is
  '#452 Fase 3: et klubbmedlem melder seg selv på en draft klubb-liga. Returkoder: '
  'joined / already_member / not_club_league / not_draft / not_member.';
comment on function public.leave_club_league(uuid) is
  '#452 Fase 3: et klubbmedlem melder seg av en klubb-liga før de har spilt en runde. '
  'Returkoder: left / not_club_league / finished / not_member / already_played.';

-- Lås RPC-ene til innloggede (jf. 0084-mønsteret).
revoke all on function public.join_club_league(uuid) from public;
revoke execute on function public.join_club_league(uuid) from anon;
grant execute on function public.join_club_league(uuid) to authenticated;

revoke all on function public.leave_club_league(uuid) from public;
revoke execute on function public.leave_club_league(uuid) from anon;
grant execute on function public.leave_club_league(uuid) to authenticated;
