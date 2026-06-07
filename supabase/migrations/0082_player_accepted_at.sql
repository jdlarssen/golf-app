-- 0082_player_accepted_at.sql
-- Issue #463 — «Ikke bekreftet»: lagt-til spillere må godta deltakelse.
--
-- Når en arrangør legger til en ANNEN bruker (picker-add, kaptein-add av
-- medspiller, liga-add) settes raden `accepted_at = null` (pending). Når
-- brukeren legger til seg selv (selv-påmelding, OTP-aksept, oppretters egen
-- rad) settes `accepted_at = now()`. En `null` betyr KUN en «Ikke bekreftet»-
-- badge + et dytt-varsel — spilleren er fullt med, scorene teller, ingenting
-- blokkeres («merkelapp + dytt», eier-beslutning).
--
-- Additivt + backfill = trygt å applye før kode-deploy: eksisterende kode
-- ignorerer den nye kolonnen, og alle historiske rader settes til now() så
-- ingen allerede-med-spiller plutselig markeres ubekreftet.

-- ── game_players.accepted_at ────────────────────────────────────────────────
alter table public.game_players
  add column if not exists accepted_at timestamptz;

update public.game_players set accepted_at = now() where accepted_at is null;

comment on column public.game_players.accepted_at is
  '#463: tidspunkt spilleren bekreftet deltakelse. null = lagt til av arrangør, ikke bekreftet ennå (badge + dytt, ikke en sperre). Settes ved «Bekreft»-knapp, auto-bekreft ved aktivitet, eller med-en-gang for self/OTP/selv-påmelding.';

-- ── league_players.accepted_at ──────────────────────────────────────────────
alter table public.league_players
  add column if not exists accepted_at timestamptz;

update public.league_players set accepted_at = now() where accepted_at is null;

comment on column public.league_players.accepted_at is
  '#463: tidspunkt deltakeren bekreftet liga-deltakelse. null = lagt til av arrangør, ikke bekreftet ennå. Speiler game_players.accepted_at.';

-- ── RLS: bruker kan markere EGEN rad som bekreftet ──────────────────────────
-- Speiler 0012_mark_invitations_accepted, men matcher på auth.uid() i stedet
-- for e-post. USING gater til egen, fortsatt-pending rad; WITH CHECK sikrer at
-- mutasjonen setter accepted_at til en non-null verdi. Permissive → OR-es med
-- eksisterende self-submit/self-withdraw/admin-write-policyer, ingen konflikt.
create policy "game_players self mark accepted" on public.game_players
  for update to authenticated
  using (user_id = auth.uid() and accepted_at is null)
  with check (user_id = auth.uid() and accepted_at is not null);

create policy "league_players self mark accepted" on public.league_players
  for update to authenticated
  using (user_id = auth.uid() and accepted_at is null)
  with check (user_id = auth.uid() and accepted_at is not null);

-- ── notifications.kind: 'player_added' ──────────────────────────────────────
-- Varsel når en arrangør legger til en annen bruker: «{navn} la deg til i {X}.
-- Bekreft deltakelse.» Samme atomære drop+add-mønster som 0068/0079; hele
-- gjeldende kind-settet (0079) bevares, kun 'player_added' legges til.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'game_finished',
    'product_update',
    'team_invite',
    'registration_request',
    'registration_approved',
    'registration_rejected',
    'team_member_withdrew',
    'deliver_reminder',
    'cup_finished',
    'club_join_request',
    'club_role_changed',
    'friend_request',
    'friend_accepted',
    'cup_started',
    -- Ny for #463:
    'player_added'              -- «X la deg til — bekreft deltakelse»-varsel
  ));
