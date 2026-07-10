-- 0141_admin_onboarding_funnel.sql
-- #1192: onboarding-funnelen (invitert → ba om kode → logget inn → profil →
--        første slag) som aggregert `funnel`-objekt i admin_key_metrics().
--
-- ⚠️ Staging først (0107-mønsteret): påfør torny-staging, verifiser tallene mot
--    manuell kontroll-SQL + hostile probe med spiller-JWT, DERETTER prod.
--
-- Kroppen er 0128-versjonen pluss `funnel`. Ingen ny tabell, ingen nye
-- skriveveier — alt avledes fra eksisterende tidsstempler (eier-beslutning på
-- kontrakten):
--
--   funnel: { invited, opened, accepted, profile_completed, first_score }
--
-- Definisjoner (kontrakt #1192):
--   • Kohort = distinkte inviterte e-poster (lower(email)): dublett-invitasjoner
--     til samme adresse teller én gang per steg, så stegene er sammenlignbare.
--   • invited  = distinkte e-poster med ≥1 invitasjon (all-time; et Oslo-vindu
--     kan legges til senere hvis nylige ikke-konverterte drukner raten).
--   • opened   = … der minst én invitasjon har opened_at (ba om kode på /login).
--   • accepted = … der minst én har accepted_at (OTP verifisert — settes av
--     RLS-policy 0012 ved verify).
--   • profile_completed = kohort-e-poster som matcher en users-rad
--     (case-insensitivt) med profile_completed_at satt, deleted_at null og
--     not is_guest (gjester er ikke onboarding-kohort).
--   • first_score = de av disse brukerne som har ≥1 scores-rad (eksistens —
--     «tastet noe på et hull», uavhengig av profilsteget).
--   Kjent begrensning: en invitert som registrerer seg med en ANNEN e-post
--   matcher ikke steg 4–5 (steg 1–3 er fortsatt eksakte via invitasjonsraden).
--   Monotoni på tvers av user-joinen er derfor ikke garantert — payloaden er
--   rene antall per steg, ALDRI e-post/navn/per-invitasjon-rader
--   (personvern-guardrail).

create or replace function public.admin_key_metrics()
returns jsonb
  language plpgsql security definer stable
  set search_path = ''
  as $$
  declare
    v_result jsonb;
  begin
    if not public.is_admin() then
      raise exception 'not_authorized';
    end if;

    with finished_players as (
      -- Én rad per (spill, spiller): ikke-trukne deltakere i fullførte spill.
      select gp.game_id, gp.user_id
      from public.game_players gp
      join public.games g on g.id = gp.game_id
      where g.status = 'finished'
        and gp.withdrawn_at is null
        and gp.user_id is not null
    ),
    per_user as (
      -- #1009: gjester teller ikke som brukere (plassholder-kontoer), men
      -- fingerprints-CTE-en under bruker finished_players urørt så gjengen
      -- beholder gjesten.
      select fp.user_id, count(distinct fp.game_id) as n
      from finished_players fp
      join public.users u on u.id = fp.user_id
      where not u.is_guest
      group by fp.user_id
    ),
    fingerprints as (
      -- Gjeng-fingerprint: sortert spillersett per fullført spill med ≥2 spillere.
      select array_agg(user_id order by user_id) as fp
      from finished_players
      group by game_id
      having count(*) >= 2
    ),
    per_gjeng as (
      select fp, count(*) as n
      from fingerprints
      group by fp
    ),
    weeks as (
      -- Siste 8 Oslo-uker (mandagsstart), eldste først, inneværende sist.
      select (date_trunc('week', now() at time zone 'Europe/Oslo')::date
              - (i * 7))::date as week_start
      from generate_series(7, 0, -1) as i
    ),
    finished_per_week as (
      select date_trunc('week', g.ended_at at time zone 'Europe/Oslo')::date
               as week_start,
             count(*) as n
      from public.games g
      where g.status = 'finished'
        and g.ended_at is not null
      group by 1
    ),
    -- #1192 (0141): onboarding-funnelen. Én rad per distinkt invitert e-post.
    invite_emails as (
      select lower(i.email) as email,
             bool_or(i.opened_at is not null)   as opened,
             bool_or(i.accepted_at is not null) as accepted
      from public.invitations i
      group by lower(i.email)
    ),
    -- Kohort-brukere: inviterte e-poster matchet case-insensitivt mot aktive,
    -- ikke-gjest-brukere (steg 4–5).
    cohort_users as (
      select u.id, u.profile_completed_at
      from public.users u
      join invite_emails ie on lower(u.email) = ie.email
      where u.deleted_at is null
        and not u.is_guest
    )
    select jsonb_build_object(
      'users_ge1',   (select count(*) from per_user),
      'users_ge2',   (select count(*) from per_user where n >= 2),
      'gjenger_ge2', (select count(*) from per_gjeng where n >= 2),
      -- #1022 (0128): akkvisisjon via offentlige flater — teller påmeldinger
      -- (ikke fullføringer), derfor ingen finished-join.
      'public_signups', (
        select count(*)
        from public.game_players gp
        where gp.signup_source is not null
          and gp.withdrawn_at is null
      ),
      'weeks', (
        select jsonb_agg(
                 jsonb_build_object(
                   'week_start', to_char(w.week_start, 'YYYY-MM-DD'),
                   'finished',   coalesce(f.n, 0)
                 )
                 order by w.week_start
               )
        from weeks w
        left join finished_per_week f on f.week_start = w.week_start
      ),
      -- #1192 (0141): rene antall per steg — aldri persondata.
      'funnel', jsonb_build_object(
        'invited',  (select count(*) from invite_emails),
        'opened',   (select count(*) from invite_emails where opened),
        'accepted', (select count(*) from invite_emails where accepted),
        'profile_completed',
                    (select count(*) from cohort_users
                     where profile_completed_at is not null),
        'first_score',
                    (select count(*) from cohort_users cu
                     where exists (select 1 from public.scores s
                                   where s.user_id = cu.id))
      )
    ) into v_result;

    return v_result;
  end $$;

comment on function public.admin_key_metrics() is
  '#1010 (0126) + #1009 (0127) + #1022 (0128) + #1192 (0141): read-only '
  'Sekretariat-metrics — users/gjenger with >=2 finished games, 8-week '
  'Oslo-truncated trend, public_signups (acquisition via public page/poster), '
  'and the onboarding funnel (distinct invited emails per step: invited/opened/'
  'accepted, then profile_completed/first_score via case-insensitive email '
  'match to active non-guest users; aggregates only, never per-person data; '
  'known limit: signup under a different email misses steps 4-5). SECURITY '
  'DEFINER with in-body is_admin() gate; authenticated only.';

-- 0104-herdingen re-anvendt (create or replace beholder ACL-er, men vi er
-- eksplisitte som i 0126/0127/0128):
revoke all on function public.admin_key_metrics() from public;
revoke execute on function public.admin_key_metrics() from anon;
grant execute on function public.admin_key_metrics() to authenticated;
