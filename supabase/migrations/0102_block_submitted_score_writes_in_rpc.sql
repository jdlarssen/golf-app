-- 0102_block_submitted_score_writes_in_rpc.sql
-- #668: offline-scores strandet ved levering før synk.
--
-- 0073 ga withdrawn-spilleren en graceful no-op i upsert_score_if_newer slik at
-- en køet write mot en frosset spiller drenerer rent (was_applied = false, error
-- = null → sync-worker sletter kø-elementet) i stedet for å treffe RLS WITH CHECK
-- og loope evig. Den SAMME RLS-frysingen gjelder `submitted_at is not null`
-- (0002), men submitted-caset fikk aldri no-op-en — så en spiller som taster
-- slag offline og leverer FØR Dexie-køen synker får den køede write-en avvist
-- som hard error, og slagene looper for alltid uten å nå serveren.
--
-- Denne migrasjonen utvider RPC-guarden fra `withdrawn_at is not null` til
-- `(withdrawn_at is not null OR submitted_at is not null)`. Begge frosne tilstander
-- gir nå samme graceful no-op. RLS-policyene (0002/0073) er allerede korrekte for
-- begge tilstander og endres IKKE her — kun RPC-funksjonen.
--
-- Merk: dette stopper retry-loopen, men gjenoppretter ikke et slag som allerede
-- ble levert blankt. Den faktiske datatap-fiksen ligger klient-side (#668 Del 1b/2):
-- drain av køen FØR levering, så slagene når Postgres mens kortet ennå er ufrosset.
-- RPC-no-op-en her dekker kun det sub-sekund-race-vinduet etter drain.
--
-- Eksisterende rader bevares (no-op rører ingen lagret rad). Bakoverkompatibel:
-- bare frosne spillere påvirkes, og klienten skriver alltid via RPC-en — trygt å
-- applikere før eller etter kode-deploy. Mirror av 0073 verbatim aside fra det
-- utvidede guard-predikatet og v_withdrawn → v_frozen.
create or replace function public.upsert_score_if_newer(
  p_game_id uuid,
  p_user_id uuid,
  p_hole_number int,
  p_strokes int,
  p_entered_by uuid,
  p_client_updated_at timestamptz
) returns table(
  game_id uuid,
  user_id uuid,
  hole_number int,
  strokes int,
  entered_by uuid,
  client_updated_at timestamptz,
  updated_at timestamptz,
  was_applied boolean
)
language plpgsql
security invoker  -- still gated by RLS on the underlying scores table
as $$
declare
  v_existing public.scores%rowtype;
  v_has_existing boolean;
  v_frozen boolean;
begin
  select * into v_existing
    from public.scores
   where scores.game_id = p_game_id
     and scores.user_id = p_user_id
     and scores.hole_number = p_hole_number;
  -- Capture existence now: the frozen EXISTS below would otherwise clobber
  -- the implicit `found` flag the original insert-branch relied on.
  v_has_existing := found;

  -- Frozen guard (#387 withdrawn + #668 submitted): a withdrawn OR submitted
  -- player's scores are frozen by RLS. Return a graceful no-op so the offline
  -- sync queue drains cleanly instead of looping on the RLS reject.
  select exists(
    select 1 from public.game_players gp
     where gp.game_id = p_game_id
       and gp.user_id = p_user_id
       and (gp.withdrawn_at is not null or gp.submitted_at is not null)
  ) into v_frozen;

  if v_frozen then
    if v_has_existing then
      game_id := v_existing.game_id;
      user_id := v_existing.user_id;
      hole_number := v_existing.hole_number;
      strokes := v_existing.strokes;
      entered_by := v_existing.entered_by;
      client_updated_at := v_existing.client_updated_at;
      updated_at := v_existing.updated_at;
    else
      game_id := p_game_id;
      user_id := p_user_id;
      hole_number := p_hole_number;
      strokes := p_strokes;
      entered_by := p_entered_by;
      client_updated_at := p_client_updated_at;
      updated_at := null;
    end if;
    was_applied := false;
    return next;
    return;
  end if;

  if not v_has_existing then
    insert into public.scores(
      game_id, user_id, hole_number, strokes, entered_by, client_updated_at
    ) values (
      p_game_id, p_user_id, p_hole_number, p_strokes, p_entered_by, p_client_updated_at
    )
    returning scores.game_id, scores.user_id, scores.hole_number, scores.strokes,
              scores.entered_by, scores.client_updated_at, scores.updated_at, true
    into game_id, user_id, hole_number, strokes, entered_by,
         client_updated_at, updated_at, was_applied;
    return next;
    return;
  end if;

  if p_client_updated_at > v_existing.client_updated_at then
    update public.scores
       set strokes = p_strokes,
           entered_by = p_entered_by,
           client_updated_at = p_client_updated_at,
           updated_at = now()
     where scores.game_id = p_game_id
       and scores.user_id = p_user_id
       and scores.hole_number = p_hole_number
    returning scores.game_id, scores.user_id, scores.hole_number, scores.strokes,
              scores.entered_by, scores.client_updated_at, scores.updated_at, true
    into game_id, user_id, hole_number, strokes, entered_by,
         client_updated_at, updated_at, was_applied;
    return next;
    return;
  end if;

  -- Existing row is newer or equal — return it untouched.
  game_id := v_existing.game_id;
  user_id := v_existing.user_id;
  hole_number := v_existing.hole_number;
  strokes := v_existing.strokes;
  entered_by := v_existing.entered_by;
  client_updated_at := v_existing.client_updated_at;
  updated_at := v_existing.updated_at;
  was_applied := false;
  return next;
end;
$$;
