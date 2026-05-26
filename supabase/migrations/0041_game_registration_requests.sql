-- 0040_game_registration_requests.sql
-- Pending-request-tabell for manual_approval-modus (issue #199).
--
-- Separat fra game_players: pending-requests forurenser ikke "spillere i spillet"-
-- semantikken; godkjenning kopierer rad over via admin-action.
--
-- Lag-formasjon: kapteinens request-rad har is_team_captain=true og team_name set;
-- medspillere har team_request_id som peker til kapteinens rad. Hele lag-gruppen
-- avgjøres typisk samlet av admin.

create type public.registration_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'withdrawn'
);

create table public.game_registration_requests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status public.registration_request_status not null default 'pending',

  -- Lag-felter (NULL ved solo-påmelding)
  team_name text,
  is_team_captain boolean not null default false,
  team_request_id uuid references public.game_registration_requests(id) on delete cascade,

  -- Søker-melding + admin-avgjørelses-felter
  message text,
  rejection_reason text,
  decided_at timestamptz,
  decided_by_user_id uuid references public.users(id),

  created_at timestamptz not null default now(),

  -- En bruker kan kun ha én rad per spill (på tvers av alle status-verdier).
  -- Withdrawn-rader blokkerer ny pending — bruker må be admin om å slette
  -- den gamle hvis de vil prøve igjen.
  unique (game_id, user_id),

  -- Hvis is_team_captain=true så må team_name være satt.
  constraint team_captain_has_name check (
    (is_team_captain = false) or (team_name is not null and length(team_name) between 3 and 40)
  ),

  -- Message-lengde: 0-200 tegn (matcher CLAUDE.md/guard fra issue body).
  constraint message_length check (message is null or length(message) <= 200),
  constraint rejection_reason_length check (rejection_reason is null or length(rejection_reason) <= 200)
);

create index game_reg_requests_game_status_idx
  on public.game_registration_requests(game_id, status);

create index game_reg_requests_user_idx
  on public.game_registration_requests(user_id);

create index game_reg_requests_team_idx
  on public.game_registration_requests(team_request_id)
  where team_request_id is not null;

-- SECURITY DEFINER-helper for å unngå RLS-rekursjon ved policy-check.
-- Returnerer true hvis kalleren er global admin, eller spillets opprinnelige
-- created_by (gjenbruker mønsteret fra #198 trusted creators).
create or replace function public.is_game_creator_or_admin(p_game_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id
      and (g.created_by = auth.uid() or public.is_admin())
  )
$$;

alter table public.game_registration_requests enable row level security;

-- SELECT: bruker ser egne; admin/creator ser alle for spillet.
create policy "game_reg_requests view own or admin"
  on public.game_registration_requests for select
  using (user_id = auth.uid() or public.is_game_creator_or_admin(game_id));

-- INSERT: authenticated bruker kan opprette egen pending-rad,
-- gated på at spillet faktisk har manual_approval-modus og er pre-start.
create policy "game_reg_requests self insert pending"
  on public.game_registration_requests for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.games g
      where g.id = game_id
        and g.registration_mode = 'manual_approval'
        and g.status in ('draft', 'scheduled')
    )
  );

-- UPDATE: admin/creator kan fritt godkjenne/avslå.
create policy "game_reg_requests admin update"
  on public.game_registration_requests for update
  using (public.is_game_creator_or_admin(game_id))
  with check (public.is_game_creator_or_admin(game_id));

-- UPDATE: bruker kan kun sette egen rad til 'withdrawn' (ingen andre status-mutasjoner).
create policy "game_reg_requests self withdraw"
  on public.game_registration_requests for update
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'withdrawn');

comment on table public.game_registration_requests is
  'Ventende/avgjorte påmeldings-forespørsler for manual_approval-spill. '
  'Approval-action lager game_players-rad via admin-client og oppdaterer status her.';
