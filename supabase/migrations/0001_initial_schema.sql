-- Users (extends Supabase auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  nickname text,
  hcp_index numeric(4,1) not null default 54.0,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Courses
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.course_holes (
  course_id uuid not null references public.courses(id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  par int not null check (par between 3 and 6),
  stroke_index int not null check (stroke_index between 1 and 18),
  primary key (course_id, hole_number),
  unique (course_id, stroke_index)
);

create table public.tee_boxes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,
  slope int not null check (slope between 55 and 155),
  course_rating numeric(4,1) not null,
  par_total int not null check (par_total between 60 and 80)
);

-- Games
create type game_status as enum ('draft', 'active', 'finished');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  course_id uuid not null references public.courses(id),
  tee_box_id uuid not null references public.tee_boxes(id),
  hcp_allowance_pct int not null default 100 check (hcp_allowance_pct between 0 and 100),
  require_peer_approval boolean not null default false,
  status game_status not null default 'draft',
  created_by uuid references public.users(id),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.users(id),
  team_number int not null check (team_number between 1 and 4),
  flight_number int not null check (flight_number between 1 and 4),
  course_handicap int,  -- frozen at game start
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by_user_id uuid references public.users(id),
  primary key (game_id, user_id)
);

-- Scores
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.users(id),
  hole_number int not null check (hole_number between 1 and 18),
  strokes int check (strokes between 1 and 20),
  entered_by uuid not null references public.users(id),
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (game_id, user_id, hole_number)
);

-- Invitations
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text not null unique,
  game_id uuid references public.games(id) on delete cascade,
  invited_by uuid not null references public.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes for common queries
create index scores_game_user_hole on public.scores(game_id, user_id, hole_number);
create index game_players_game on public.game_players(game_id);
create index invitations_token on public.invitations(token);
