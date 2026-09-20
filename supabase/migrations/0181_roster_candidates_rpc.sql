-- 0181_roster_candidates_rpc.sql
-- #1919 del B: navnelista i appen. Arrangøren skal velge fra navn, ikke taste adresser.
--
-- **Problemet.** Appen leser kandidatene rett fra `users` under RLS, og SELECT-policyen
-- (0092) gir egen rad ∨ admin ∨ delt spill. En venn du aldri har spilt med er dermed ikke
-- navnlesbar fra telefonen, mens nettsiden viser hele unionen (venner ∪ medspillere ∪
-- klubbmedlemmer) fordi den leser server-side med service-role. Grensen har vært bokført
-- i `docs/native/app-spike.md` siden spiken, med denne RPC-en som den navngitte veien ut.
--
-- **Regelen får ikke et nytt hjem.** Unionen står allerede i `public.is_invite_eligible`
-- (0115), som er den samme funksjonen BEFORE INSERT-triggeren håndhever med. Lista under
-- KALLER den. Det er hele poenget: en kandidat lista viser, er per konstruksjon en
-- kandidat triggeren slipper gjennom. Skrev vi unionen av her, ville de to kunne drive
-- fra hverandre, og symptomet ville vært at appen tilbyr en spiller innlegget avviser
-- (AGENTS.md felle #4).
--
-- ⚠️ **Hvorfor dette er trygt å eksponere.**
--   • Kalleren er `auth.uid()` og ALDRI en parameter. Det finnes altså ingen id å bytte
--     ut: du kan bare be om ditt eget nettverk, uansett hva du sender inn.
--   • `p_game_id` er valgfri og brukes kun til klubb-grenen. Den slås opp KUN når spillet
--     er ditt eget (`created_by = auth.uid()`). Uten den betingelsen kunne hvem som helst
--     høste medlemslista til en fremmed klubb ved å sende inn en tilfeldig spill-id.
--   • Returen bærer navn, kallenavn og det appen trenger for å regne banehandicap.
--     **Ingen e-postadresse.** Webbens egen kandidat-resolver returnerer e-post; den er
--     bevisst utelatt her, fordi appen ikke har en autocomplete som trenger den.
--   • Gjester, slettede kontoer og deg selv er filtrert bort, som i dagens app-spørring.
--
-- **Admin-escapen er ikke ny.** `users`-lesepolicyen gir en admin alle rader i dag, så en
-- funksjon som bare ga «mitt nettverk» ville KRYMPET admin-lista i appen — en regresjon
-- forkledd som en forbedring. Escapen speiler kurator-modellen (#422) og 0115-triggerens
-- egen admin-gren.
--
-- Kjørerekkefølge: staging først (0107-mønsteret), prod kun etter eier-ja (#1074).
-- Fram til prod er påført svarer appen som før — den faller tilbake til RLS-spørringen.

create or replace function public.roster_candidates(p_game_id uuid default null)
  returns table (
    id uuid,
    name text,
    nickname text,
    hcp_index numeric,
    -- Enum-typene, ikke `text`: `users.gender` er `public.user_gender` og `users.level`
    -- er `public.player_level`. Deklarert som de er, så et framtidig typebytte faller
    -- høyt her i stedet for å bli en stille kolonne-mismatch.
    gender public.user_gender,
    level public.player_level,
    profile_completed_at timestamptz
  )
  language sql
  security definer
  stable
  set search_path = ''  -- hardened: every reference below is schema-qualified
  as $$
    with ctx as (
      select
        auth.uid() as uid,
        -- Klubb-grenen, men bare for en runde du selv har opprettet.
        (
          select g.group_id
            from public.games g
           where g.id = p_game_id
             and g.created_by = auth.uid()
        ) as group_id,
        public.is_admin() as caller_is_admin
    )
    select
      u.id,
      u.name,
      u.nickname,
      u.hcp_index,
      u.gender,
      u.level,
      u.profile_completed_at
    from public.users u
    cross join ctx
    where ctx.uid is not null
      and u.id <> ctx.uid
      and u.deleted_at is null
      and not u.is_guest
      and (
        ctx.caller_is_admin
        or public.is_invite_eligible(ctx.uid, u.id, ctx.group_id)
      )
    order by u.name nulls last;
  $$;

comment on function public.roster_candidates(uuid) is
  '#1919 (0181): SECURITY DEFINER. Kandidatlista native-appen tegner «Legg til spiller» '
  'fra. Kalleren er auth.uid() og aldri en parameter. Settet er public.is_invite_eligible '
  '(venner ∪ medspillere ∪ klubbmedlemmer) — samme funksjon 0115-triggeren håndhever med, '
  'ikke en kopi. p_game_id gir klubb-grenen, og slås kun opp for en runde kalleren selv '
  'har opprettet. Admin ser alle ikke-slettede ikke-gjester, som users-RLS gir dem i dag. '
  'Returen har ingen e-postadresse. authenticated-only (anon revoked).';

-- 0104-herdingen re-anvendt (create or replace beholder ACL-er, men vi er eksplisitte
-- som i 0126/0127/0128/0141/0180):
revoke all on function public.roster_candidates(uuid) from public;
revoke execute on function public.roster_candidates(uuid) from anon;
grant execute on function public.roster_candidates(uuid) to authenticated;
