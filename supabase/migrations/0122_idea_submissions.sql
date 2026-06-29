-- 0122_idea_submissions.sql
-- Lean «Foreslå en idé»-feedback-boks (issue #984, v0 av Ønskeliste-epic #979).
--
-- Golfere sender inn én fritekst-idé; admin får Resend-varsel, kan senere
-- markere idéen som bygd → innsenderen får et `idea_built` in-app-varsel
-- («Vi bygde det du foreslo»). Ingen stemming/tavle/kø ennå — parkert bak en
-- volum-trigger i #979.
--
-- RLS: innlogget setter inn + ser egne rader; admin ser/endrer/sletter alle.
-- Ikke-admin kan IKKE oppdatere (mark-built er admin-only), så ingen
-- kolonne-immutabilitets-trigger trengs.

create table public.idea_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 2000),
  status text check (status is null or status = 'bygd'),
  built_at timestamptz,
  created_at timestamptz not null default now()
);

-- Admin-listen henter nyeste først; partial index på ubygde for badge-tellingen.
create index idea_submissions_created
  on public.idea_submissions(created_at desc);
create index idea_submissions_unbuilt
  on public.idea_submissions(created_at desc)
  where status is null;

alter table public.idea_submissions enable row level security;

-- Innlogget setter inn egen rad (user_id tvinges til egen uid via with check).
create policy idea_submissions_insert_own
  on public.idea_submissions for insert
  with check (user_id = (select auth.uid()));

-- Innsender ser egne; admin ser alle.
create policy idea_submissions_select_own_or_admin
  on public.idea_submissions for select
  using (user_id = (select auth.uid()) or is_admin());

-- Kun admin kan markere som bygd (status/built_at). Ikke-admin har ingen
-- update-policy → PATCH fra ikke-admin matcher 0 rader.
create policy idea_submissions_update_admin
  on public.idea_submissions for update
  using (is_admin())
  with check (is_admin());

-- Kun admin kan slette.
create policy idea_submissions_delete_admin
  on public.idea_submissions for delete
  using (is_admin());

-- ── Ny notifikasjons-kind: idea_built ──────────────────────────────────────
-- «Vi bygde det du foreslo»-varsel til innsenderen. Samme atomiske
-- drop+add-mønster som 0118 (achievement_unlocked). Hele eksisterende
-- kind-settet bevart; kun den nye kind-en tilføyes.
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
    'cup_started',
    'club_join_request',
    'club_role_changed',
    'friend_request',
    'friend_accepted',
    'player_added',
    'game_started',
    'auto_start_blocked',
    'achievement_unlocked',
    -- New for #984:
    'idea_built'      -- «vi bygde det du foreslo»-varsel til innsender
  ));
