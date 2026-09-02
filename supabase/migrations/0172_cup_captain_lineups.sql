-- 0172_cup_captain_lineups.sql
-- Issue #1884 (etappe 2) — kapteinsrolle med hemmelig uttak per økt.
--
-- Etappe 1 (#1883) hevet takene så et Ryder Cup-oppsett får plass. Denne
-- etappen gir kapteinene selve uttaket: arrangøren utnevner én kaptein per lag,
-- kapteinene leverer ordnede oppstillinger per økt, og cupen avdekker matchene
-- først når BEGGE har levert.
--
-- Tre deler:
--
--  1. `tournament_participants` får varig lagtilhørighet + kapteinsflagg. Lag
--     ble tidligere utelukkende DERIVERT fra matchene (getCupSnapshot), som
--     ikke finnes ennå når uttaket skal gjøres — kapteinen må vite hvem som er
--     i stallen hennes FØR første match eksisterer. Rader med varig rolle er
--     også unntatt deltaker-synkens fjerningsregel (lib/cup/participantRosterSync),
--     slik at benkede spillere og ikke-spillende kapteiner ikke faller av lista.
--
--  2. `cup_lineup_sessions` — én rad per økt arrangøren åpner for uttak
--     (rekkefølge, format, antall plasser, leverings-stempler per lag,
--     avdekkings-stempel).
--
--  3. `cup_lineup_slots` — de ordnede plassene per økt×lag. Slot i på lag 1
--     møter slot i på lag 2 ved avdekking; rekkefølgen ER uttaket, det finnes
--     ingen egen paringslogikk.
--
-- ⚠️ Hemmelighold: begge nye tabeller er deny-by-default (RLS på, INGEN
-- policyer, `revoke all` fra anon+authenticated) — 0026-mønsteret. Personlige
-- cup-sider er world-read (`canViewCupPage` → `!groupId` = alltid), så en
-- sidegate ville ikke skjult noe som helst. All lesing og skriving går gjennom
-- gatede server-actions med service-role-klienten (#1542-mønsteret): gaten i
-- koden ER håndhevelsen for hvem som ser hva, og RLS-en her sørger for at det
-- ikke finnes noen vei utenom den.
--
-- ⚠⚠ DENNE MÅ PÅ PROD **FØR** KODEN DEPLOYES — IKKE ETTER. ⚠⚠
--
-- Migrasjonen er additiv og helt trygg å påføre mens bare den GAMLE koden
-- kjører: ingenting som er deployet i dag leser eller skriver noe av dette.
-- Motsatt rekkefølge er derimot et driftsavbrudd. Den nye koden leser
-- `team_number, is_captain` i to flater som allerede er i bruk og som feiler
-- LUKKET på en ukjent kolonne (PostgREST 42703):
--
--   * Spillere-rommet (CupParticipants.tsx) kaster og viser feilsiden — for
--     ALLE utkast-cuper, med eller uten kapteiner.
--   * Spillerbyttet (lib/cup/actions.ts) svarer `swap_failed` på hver eneste
--     personlige cup.
--
-- Rekkefølgen er altså: staging → verifiser → PROD (bak eier-luka, #1074) →
-- merge → deploy. Samme lærdom som 0169 (#1074-runden): «Safe to apply at any
-- time» betyr trygg å påføre TIDLIG, ikke trygg å utsette.

-- ---------------------------------------------------------------------------
-- 1. Varig lag + kapteinsrolle på deltakerlista
-- ---------------------------------------------------------------------------

alter table public.tournament_participants
  add column if not exists team_number smallint,
  add column if not exists is_captain boolean not null default false;

-- NOT NULL med default på `is_captain`: gen:types ville ellers gjort feltet
-- required i Insert-typen for hver eksisterende skrivevei (deltaker-fella fra
-- #1704). `team_number` er bevisst nullable — NULL = utildelt, som er
-- start-tilstanden for enhver deltaker og hele tilstanden for cuper uten
-- kapteiner.
alter table public.tournament_participants
  drop constraint if exists tournament_participants_team_number_check;
alter table public.tournament_participants
  add constraint tournament_participants_team_number_check
  check (team_number is null or team_number in (1, 2));

-- En kaptein må stå på et lag. Uten dette kunne en utildelt deltaker bli
-- markert som kaptein for «ingen lag» og aldri få et uttak å levere.
alter table public.tournament_participants
  drop constraint if exists tournament_participants_captain_needs_team;
alter table public.tournament_participants
  add constraint tournament_participants_captain_needs_team
  check (not is_captain or team_number is not null);

-- Maks én kaptein per lag per cup. Partiell unik indeks framfor CHECK: regelen
-- er på tvers av rader.
create unique index if not exists tournament_participants_one_captain_per_team
  on public.tournament_participants (tournament_id, team_number)
  where is_captain;

comment on column public.tournament_participants.team_number is
  'Varig lagtilhørighet (1/2), NULL = utildelt. Settes av arrangøren i Spillere-rommet for kaptein-cuper; matchene deriverer fortsatt sitt eget lag fra game_players. Refs #1884.';
comment on column public.tournament_participants.is_captain is
  'True for lagets kaptein — hen leverer laguttaket per økt. Maks én per lag (partiell unik indeks). Refs #1884.';

-- ---------------------------------------------------------------------------
-- 2. Åpnede uttaks-økter
-- ---------------------------------------------------------------------------

create table if not exists public.cup_lineup_sessions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  -- 0-basert plass i cupens uttaks-rekkefølge. Unik per cup, så «økt 2» peker
  -- på én rad uansett hvor mange ganger arrangøren åpner og lukker.
  session_index integer not null,
  -- Speiler CupSessionFormat (lib/cup/cupTemplates.ts). `best_ball` er bevisst
  -- utelatt — det er ikke medlem av unionen, se cupPairing.ts.
  format text not null check (format in (
    'foursomes_matchplay',
    'fourball_matchplay',
    'singles_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay'
  )),
  -- Antall matcher økta skal ha. Taket håndheves i koden mot cupens match-tak
  -- (lib/cup/limits) — her holder en fornuftig ytre grense mot tullverdier.
  slot_count integer not null check (slot_count between 1 and 36),
  team_1_submitted_at timestamptz,
  team_1_submitted_by uuid references public.users(id) on delete set null,
  team_2_submitted_at timestamptz,
  team_2_submitted_by uuid references public.users(id) on delete set null,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  unique (tournament_id, session_index)
);

create index if not exists cup_lineup_sessions_tournament_idx
  on public.cup_lineup_sessions (tournament_id, session_index);

alter table public.cup_lineup_sessions enable row level security;
revoke all on public.cup_lineup_sessions from anon, authenticated;

comment on table public.cup_lineup_sessions is
  'En økt arrangøren har åpnet for kaptein-uttak (#1884). Deny-by-default: ingen RLS-policyer — all tilgang går via gatede server-actions med service-role.';
comment on column public.cup_lineup_sessions.revealed_at is
  'Satt når begge lags uttak er levert og matchene er opprettet. NULL = ikke avdekket, og motstanderens plasser er da hemmelige. Refs #1884.';

-- ---------------------------------------------------------------------------
-- 3. Ordnede plasser per økt × lag
-- ---------------------------------------------------------------------------

create table if not exists public.cup_lineup_slots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cup_lineup_sessions(id) on delete cascade,
  team_number smallint not null check (team_number in (1, 2)),
  -- 0-basert match-plass. Slot i på lag 1 møter slot i på lag 2.
  slot_index integer not null,
  -- Setet i plassen: 1 for singel, 1/2 for 2v2-format.
  seat smallint not null check (seat in (1, 2)),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, team_number, slot_index, seat),
  -- Ingen spiller to ganger i samme økt for samme lag. Valideringen i
  -- lib/cup/lineupValidation gir den norske feilmeldingen; denne er backstop
  -- mot en manipulert payload (AGENTS.md-felle 4: samme regel, begge lag).
  unique (session_id, team_number, user_id)
);

create index if not exists cup_lineup_slots_session_team_idx
  on public.cup_lineup_slots (session_id, team_number, slot_index, seat);

alter table public.cup_lineup_slots enable row level security;
revoke all on public.cup_lineup_slots from anon, authenticated;

comment on table public.cup_lineup_slots is
  'Kapteinens ordnede uttak for én økt (#1884). Deny-by-default — hemmeligholdet før avdekking håndheves i lesingen (lib/cup/lineupData), aldri av en sidegate.';

-- ---------------------------------------------------------------------------
-- 4. Varsel-kind for avdekkingen
-- ---------------------------------------------------------------------------

-- Samme drop/re-add-mønster som 0163. Payload-shape valideres i TS-laget
-- (lib/notifications/types.ts, cupLineupRevealedSchema).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'scorecard_rejected',
    'scorecard_reopened',
    'game_finished',
    'game_reopened',
    'product_update',
    'team_invite',
    'registration_request',
    'registration_approved',
    'registration_rejected',
    'registration_expired',
    'team_member_withdrew',
    'deliver_reminder',
    'cup_finished',
    'cup_started',
    'club_join_request',
    'club_role_changed',
    'friend_request',
    'friend_accepted',
    'player_added',
    'game_started',
    'auto_start_blocked',
    'achievement_unlocked',
    'idea_built',
    'payment_reminder',
    'cup_signup',
    'cup_lineup_revealed'
  ));
