-- #481: Auto-vennskap når en e-postinvitert blir med i et spill.
--
-- Når noen aksepterer en spill-invitasjon (ved å logge inn og bli med), blir de
-- automatisk venner med inviteren — så vennegrafen vokser organisk gjennom
-- invitasjoner i stedet for bare via manuelle forespørsler / venne-koder.
--
-- Speiler connect_via_friend_code (0077): inviteren «inviterte først», så de blir
-- requester; invitéen «aksepterte ved å bli med», så de blir addressee. Vennskap
-- er retnings-uavhengig (én accepted-rad = begge er venner), så én rad holder.
--
-- Idempotent: finnes allerede en accepted-rad (begge retninger), gjør den ingenting.
-- Et bevisst remove_friend hard-sletter raden (ingen tombstone), så en ny
-- invitasjon senere re-vennskaper — bevisst valg (#481): fersk invitasjon = fersk
-- samtykke.
--
-- Sikkerhetsgate: RPC-en lager KUN vennskap når det finnes en akseptert
-- invitasjon fra p_inviter til den innloggede brukerens e-post. Uten gaten kunne
-- en innlogget bruker «bli venn» med en hvilken som helst bruker-id.

create or replace function public.befriend_inviter(p_inviter uuid) returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid   uuid := auth.uid();
    v_email text;
  begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    if p_inviter is null or p_inviter = v_uid then
      return 'self';
    end if;

    -- Invitéens e-post (definer-kontekst, RLS-bypass).
    select email into v_email from public.users where id = v_uid;
    if v_email is null then return 'not_found'; end if;

    -- Gate: det MÅ finnes en akseptert invitasjon fra p_inviter til invitéen.
    if not exists (
      select 1 from public.invitations
      where invited_by = p_inviter
        and lower(email) = lower(v_email)
        and accepted_at is not null
    ) then
      return 'no_invitation';
    end if;

    -- Allerede venner (begge retninger)? Idempotent — ikke rør noe.
    if exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((requester_id = v_uid and addressee_id = p_inviter)
          or (requester_id = p_inviter and addressee_id = v_uid))
    ) then
      return 'already_friends';
    end if;

    -- Rydd evt. pending i begge retninger, sett accepted (inviter = requester).
    delete from public.friendships
      where status = 'pending'
        and ((requester_id = v_uid and addressee_id = p_inviter)
          or (requester_id = p_inviter and addressee_id = v_uid));
    insert into public.friendships (requester_id, addressee_id, status, responded_at)
    values (p_inviter, v_uid, 'accepted', now())
    on conflict (requester_id, addressee_id) do update
      set status = 'accepted', responded_at = now();
    return 'connected';
  end $$;

-- Lås RPC-en til innloggede (jf. 0077-mønsteret). Supabase grant-er anon
-- direkte via ALTER DEFAULT PRIVILEGES, så `revoke all from public` er ikke nok
-- alene — anon må revokes eksplisitt, som søsken-RPC-ene i 0077.
revoke all on function public.befriend_inviter(uuid) from public;
revoke execute on function public.befriend_inviter(uuid) from anon;
grant execute on function public.befriend_inviter(uuid) to authenticated;
