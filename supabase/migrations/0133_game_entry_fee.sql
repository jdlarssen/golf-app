-- 0133_game_entry_fee.sql
-- #1049 (Penger i potten, del 1 av epic #1039): startkontingent med Vipps-sporing.
--
-- Arrangøren kan sette en startkontingent (beløp i kr) + betalingsmåte (Vipps-nr
-- eller betalingslenke) på et spill. Spillerne ser beløp + lenke i påmelding og
-- på spill-hjem; arrangøren huker av hvem som har betalt og purrer resten.
--
-- Avgrensning: SPORING + LENKE, ikke integrert betaling. Ingen Vipps-API, intet
-- betalingsbevis, ingen betalings-gate. `paid_at` settes manuelt av arrangøren.
--
-- Datamodell (følger app-konvensjon):
--   • games.entry_fee_kr   — game-nivå-valg som EGEN kolonne (ikke mode_config),
--                            som registration_mode/side_tournament_enabled m.fl.
--   • games.payment_link   — fritekst; appen tolker URL vs Vipps-nr ved visning.
--   • game_players.paid_at  — TIMESTAMP-livssyklus (null = ikke betalt), speiler
--                            accepted_at/approved_at. Ingen egen «betalt»-boolean.
--
-- Navngitt distinkt fra #937s veddemåls-`kr_per_unit` (mode_config) — to ulike
-- penge-konsepter (startkontingent vs oppgjør etter Skins/Wolf/Nassau).

-- ── 1. games: startkontingent + betalingsmåte ─────────────────────────────────
-- entry_fee_kr NOT NULL DEFAULT 0 → 0 betyr «ingen kontingent» (feature av). Har
-- default, så gen:types gjør den valgfri på Insert (ingen kode-bump nødvendig).
-- CHECK-øvre grense 100 000 kr fanger åpenbare taste-feil uten å begrense reell
-- bruk (klubb-arrangement ligger langt under).
alter table public.games
  add column if not exists entry_fee_kr integer not null default 0
    check (entry_fee_kr >= 0 and entry_fee_kr <= 100000),
  add column if not exists payment_link text;

comment on column public.games.entry_fee_kr is
  '#1049: startkontingent i hele kr per spiller. 0 = ingen kontingent (feature av). '
  'Flatt beløp per game_players-rad. Distinkt fra veddemåls-oppgjør (mode_config.kr_per_unit, #937).';
comment on column public.games.payment_link is
  '#1049: betalingsmåte, fritekst — Vipps-nummer ELLER betalingslenke (URL). '
  'Appen tolker http(s)-URL som klikkbar lenke, ellers som Vipps-nr. Kun informativ.';

-- ── 2. game_players: betalt-tidsstempel ───────────────────────────────────────
-- null = ikke betalt, satt = arrangøren har huket av betalt. Speiler accepted_at/
-- approved_at-konvensjonen (timestamp-livssyklus, ingen status-kolonne).
alter table public.game_players
  add column if not exists paid_at timestamptz;

comment on column public.game_players.paid_at is
  '#1049: satt av arrangør (admin/creator) når spilleren har betalt startkontingenten. '
  'null = ikke betalt. Spilleren selv kan ALDRI sette denne (guard-trigger, se 0133).';

-- ── 3. RLS: hvem kan sette paid_at ────────────────────────────────────────────
-- Row-nivå-tilgang finnes allerede:
--   • «games admin update» (is_admin) + «games creator update» (created_by =
--     auth.uid()) dekker skriving av games.entry_fee_kr/payment_link — uendret.
--   • «game_players self submit» (is_admin OR user_id = auth.uid()) og
--     «game_players creator update» (created_by = auth.uid()) gir admin/creator
--     row-tilgang til å skrive paid_at på en spillers rad.
--
-- Kolonne-vakta: togglePlayerPaid skriver via BRUKER-klienten (admin/creator).
-- For en admin no-op-er guard-triggeren (is_admin()); for spillets creator no-op-er
-- den «annens rad»-grenen (v_is_creator). Men «game_players self submit» lar en
-- vanlig spiller UPDATE-e SIN EGEN rad — og self-grenen i triggeren blokkerer i dag
-- kun approved_*/course_handicap. Uten vakt kunne en spiller PATCH-e egen paid_at
-- og selv-markere seg betalt. Vi utvider self-grenen til også å blokkere paid_at.
--
-- «Annens rad»-allowlisten (peer, #704) beskytter paid_at by default — den fjerner
-- bare de fire godkjennings-kolonnene og krever resten byte-identisk, så en ekte
-- peer (verken admin eller creator) kan ikke røre paid_at på en annens rad. Ingen
-- endring nødvendig der.
create or replace function public.guard_game_players_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''  -- hardened: every reference below is schema-qualified
  as $$
  declare
    v_uid uuid := auth.uid();
    v_status public.game_status;
    v_is_creator boolean;
  begin
    -- Service-rolla (admin-klienten: startGame, signup, flight-join) har ingen
    -- JWT-sub → auth.uid() er NULL. Slipp den gjennom uendret. Admin (is_admin)
    -- har full tilgang per RLS, så også her: no-op. Begge escapes først.
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    if new.user_id = v_uid then
      -- ── EGEN rad ──────────────────────────────────────────────────────────
      -- (a) Selv-godkjenning (0103, #670).
      if new.approved_at is distinct from old.approved_at
         or new.approved_by_user_id is distinct from old.approved_by_user_id then
        raise exception
          'A player cannot approve their own scorecard (game_players.approved_at/approved_by_user_id)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;

      -- (b) Selv-handicap etter start (0103, #670).
      if new.course_handicap is distinct from old.course_handicap then
        select g.status into v_status
          from public.games g
         where g.id = new.game_id;

        if v_status in ('active', 'finished') then
          raise exception
            'A player cannot change their own course_handicap after the game has started (game_players.course_handicap)'
            using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
        end if;
      end if;

      -- (c) Selv-betaling (0133, #1049): en ikke-admin spiller kan ikke SETTE/
      -- ENDRE paid_at på sin egen rad. Kun arrangøren (admin/creator) huker av.
      if new.paid_at is distinct from old.paid_at then
        raise exception
          'A player cannot mark their own payment status (game_players.paid_at)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
    else
      -- ── ANNENS rad ────────────────────────────────────────────────────────
      -- Admin allerede sluppet gjennom over. Spillets SKAPER har bred tilgang til
      -- sin egen roster (speiler «game_players creator update»-policyen) — inkl.
      -- å huke av paid_at via admin-cockpiten. Slipp creator gjennom.
      select (g.created_by = v_uid) into v_is_creator
        from public.games g where g.id = new.game_id;
      if coalesce(v_is_creator, false) then
        return new;
      end if;

      -- EKTE peer (verken admin eller skaper): allowlist for peer-godkjenning
      -- (#704). Fjerner de fire godkjennings-kolonnene og krever RESTEN identisk
      -- — så paid_at (og enhver framtidig kolonne) er beskyttet by default.
      if (to_jsonb(new) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at')
         is distinct from
         (to_jsonb(old) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at') then
        raise exception
          'A peer may only change approval columns (approved_at, approved_by_user_id, rejection_reason, submitted_at) on another player''s row'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
    end if;

    return new;
  end;
  $$;

comment on function public.guard_game_players_self_update() is
  '#670 + #704 + #1049: blocks a non-admin player from self-approving, editing '
  'their own course_handicap post-start, or marking their own paid_at (own row); '
  'and restricts a non-admin peer to ONLY the approval columns on ANOTHER '
  'player''s row. No-ops for admin (is_admin()), the game creator (another''s row), '
  'and the service role (auth.uid() IS NULL).';

-- Re-bind triggeren (idempotent — funksjonskroppen er byttet via create or replace).
drop trigger if exists guard_game_players_self_update on public.game_players;
create trigger guard_game_players_self_update
  before update on public.game_players
  for each row
  execute function public.guard_game_players_self_update();
