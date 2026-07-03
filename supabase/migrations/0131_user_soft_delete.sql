-- 0131_user_soft_delete.sql
-- #1012: «Slett konto» feiler for alle som har spilt en runde — users.id har
-- FK → auth.users(id) ON DELETE CASCADE (0001), så auth.admin.deleteUser()
-- kaskader inn i public.users hvor NO ACTION-FK-ene (game_players.user_id,
-- scores.user_id/entered_by, invitations.invited_by, games.created_by m.fl.)
-- blokkerer hele slettingen med generisk delete_failed.
--
-- ⚠️ Staging først (0107-mønsteret): påfør torny-staging, verifiser med
--    anonymize-probe + hostile self-PATCH av deleted_at, DERETTER prod.
--
-- Løsningen er anonymisering (GDPR-sletting som bevarer spillhistorikk):
--
--   1. users.deleted_at — markør for anonymisert konto. App-laget filtrerer
--      slettede ut av spiller-pickere, kandidat-lister, venn-oppslag,
--      claim-flyten og mail-/push-gates (speiler is_guest-eksklusjonene).
--      Avsluttede spill/leaderboards beholder radene — der er «Slettet
--      bruker»-visningen poenget.
--   2. anonymize_user(uuid) — SECURITY DEFINER, kun service_role. Scrubber
--      users-raden og sletter personlige/sosiale rader atomisk. E-posten
--      randomiseres til slettet+<uuid>@deleted.tornygolf.no (gjeste-mønsteret
--      fra 0127: no-MX-subdomene, unik → 0014-triggerens on conflict (id)
--      dekker ikke email-unique, så gjenbrukt e-post ville ellers knekt
--      re-signup med unique_violation).
--   3. guard_users_self_update får deleted_at i denylisten (0107/0127-arven):
--      en innlogget bruker skal aldri kunne sette/nulle markøren via hostile
--      PATCH — den gates mail-/picker-eksklusjoner og slette-flytens
--      retry-shortcircuit.
--
-- Auth-siden håndteres i app-laget med auth.admin.deleteUser(id, true) (soft
-- delete): GoTrue obfuskerer email/phone irreversibelt (SHA-256), nuller
-- passord/tokens/metadata og trekker alle sesjoner — men beholder auth-raden,
-- så FK-kaskaden aldri fyrer og public.users-husken består.

alter table public.users
  add column deleted_at timestamptz;

comment on column public.users.deleted_at is
  '#1012 (0131): satt = kontoen er slettet og raden anonymisert via '
  'anonymize_user(). Ekskluderes fra spiller-pickere, kandidat-lister, '
  'venn-oppslag, claim og mail/push; beholdes på leaderboards/historikk som '
  '«Slettet bruker». Self-endring blokkeres av guard_users_self_update.';

-- ── Self-update-guard: deleted_at inn i denylisten (0107/0127-mønsteret) ──────
-- Erstatter funksjonen på plass; triggeren fra 0107 står urørt.

create or replace function public.guard_users_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    v_uid uuid := auth.uid();
  begin
    -- Service-role / internal writes (no JWT) and global admins may change anything.
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    -- A non-admin editing a users row (their own, per RLS) must never flip is_admin.
    if new.is_admin is distinct from old.is_admin then
      raise exception
        'is_admin can only be changed by an administrator (public.users.is_admin)'
        using errcode = 'insufficient_privilege';
    end if;

    -- #1009: is_guest gates stats/mail exclusions and the claim flow — only the
    -- service-role app paths (guest creation, first-login clearing) may flip it.
    if new.is_guest is distinct from old.is_guest then
      raise exception
        'is_guest can only be changed by an administrator (public.users.is_guest)'
        using errcode = 'insufficient_privilege';
    end if;

    -- #1012: deleted_at gates the deleted-account exclusions and the delete-flow
    -- retry shortcircuit — only anonymize_user() (service-role) may set it, and
    -- nothing un-deletes an account.
    if new.deleted_at is distinct from old.deleted_at then
      raise exception
        'deleted_at can only be changed by an administrator (public.users.deleted_at)'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
$$;

-- ── anonymize_user: GDPR-sletting som bevarer spillhistorikk ──────────────────
-- Atomisk (én transaksjon i én funksjon). Idempotent: re-kjøring scrubber en
-- allerede-scrubbet rad harmløst (e-post-oppslagene matcher ingenting, og
-- deleted_at/unsubscribed_at beholder første tidsstempel via coalesce).
--
-- Beholdes med vilje: game_players, scores, games/courses/leagues/
-- tournaments.created_by, wolf-/BBB-/patsome-rader, league_players, MOTTATTE
-- reaksjoner (target er anonymisert), admin_audit_log. is_guest beholdes som
-- den er (en slettet gjest forblir gjest — claim-flyten filtrerer på
-- deleted_at i app-laget). profile_completed_at beholdes (NULL ville gitt
-- «pending»-oppførsel i newGameFormData).

create or replace function public.anonymize_user(p_user_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    v_email text;
    v_is_admin boolean;
  begin
    select email, is_admin into v_email, v_is_admin
      from public.users where id = p_user_id for update;

    if not found then
      raise exception 'user not found (public.users.id = %)', p_user_id
        using errcode = 'no_data_found';
    end if;

    if v_is_admin then
      raise exception 'admin accounts cannot be anonymized (public.users.is_admin)'
        using errcode = 'insufficient_privilege';
    end if;

    update public.users set
      name = 'Slettet bruker',
      nickname = null,
      email = 'slettet+' || p_user_id || '@deleted.tornygolf.no',
      gender = null,
      locale = null,
      last_seen_at = null,
      hcp_index = 54.0,
      friend_code = public.generate_friend_code(),
      product_updates_unsubscribed_at = coalesce(product_updates_unsubscribed_at, now()),
      deleted_at = coalesce(deleted_at, now())
    where id = p_user_id;

    -- Personlige/sosiale rader: CASCADE-reglene deres fyrer aldri når
    -- users-raden består, så de må slettes eksplisitt her.
    delete from public.friendships
      where requester_id = p_user_id or addressee_id = p_user_id;
    delete from public.push_subscriptions where user_id = p_user_id;
    delete from public.notifications where user_id = p_user_id;
    delete from public.group_members where user_id = p_user_id;
    delete from public.group_join_requests where user_id = p_user_id;
    delete from public.game_registration_requests where user_id = p_user_id;
    delete from public.idea_submissions where user_id = p_user_id;
    delete from public.reactions where user_id = p_user_id;

    -- Invitasjons-rader med den ekte e-posten er PII og slettes. Ved re-kjøring
    -- er v_email allerede randomisert og matcher ingenting.
    delete from public.invitations where lower(email) = lower(v_email);
    delete from public.club_invitations where lower(email) = lower(v_email);
  end;
$$;

comment on function public.anonymize_user(uuid) is
  '#1012 (0131): GDPR-sletting for brukere med spillhistorikk — scrubber '
  'public.users-raden (navn → «Slettet bruker», e-post → slettet+<uuid>@'
  'deleted.tornygolf.no, deleted_at satt) og sletter personlige/sosiale rader '
  '(friendships, push, notifications, klubbmedlemskap, requests, ideer, gitte '
  'reaksjoner, invitasjoner på e-posten) atomisk. Spillhistorikk beholdes. '
  'Kun service_role; app-laget soft-sletter auth-raden separat '
  '(auth.admin.deleteUser(id, true)).';

revoke all on function public.anonymize_user(uuid) from public;
revoke execute on function public.anonymize_user(uuid) from anon, authenticated;
grant execute on function public.anonymize_user(uuid) to service_role;
