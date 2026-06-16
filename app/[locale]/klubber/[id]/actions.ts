'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendClubInviteNotification } from '@/lib/mail/clubInviteNotification';

/**
 * addMember — server action for the «Legg til på e-post»-form on /klubber/[id].
 *
 * Calls the `add_club_member_by_email` SECURITY DEFINER RPC (migrasjon 0075).
 * The RPC requires the caller to be an owner/admin of the club.
 *
 * Result codes surface via ?added= / ?invited= / ?error= query params:
 *   added=<email>     — existing Tørny user added as member
 *   invited=<email>   — unregistered email got a pending invitation + mail (#644)
 *   error=already     — user is already a member
 *   error=not_auth    — caller is not an owner/admin
 *   error=email_req   — email was empty
 *   error=full        — club has reached its member_cap (#50)
 *   error=expired     — club's avtale has expired / is frozen (#50)
 *   error=unknown     — unexpected DB error
 *
 * #644: an unregistered email no longer dead-ends with not_found — the RPC
 * creates a pending club_invitation and returns 'invited'; we send a
 * notification mail (best-effort) so the person knows to log in. They become a
 * member automatically on first login (accept_club_invitations in verifyCode).
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export async function addMember(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
  if (!user) {
    redirect({ href: '/login', locale });
  }

  const groupId = String(formData.get('groupId') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();

  if (!groupId) redirect({ href: '/klubber', locale });
  if (!email) redirect({ href: `/klubber/${groupId}?error=email_req`, locale });

  const { data, error } = await supabase.rpc('add_club_member_by_email', {
    p_group_id: groupId,
    p_email: email,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('not_authorized')) {
      redirect({ href: `/klubber/${groupId}?error=not_auth`, locale });
    }
    if (msg.includes('email_required')) {
      redirect({ href: `/klubber/${groupId}?error=email_req`, locale });
    }
    console.error('[addMember]', error);
    redirect({ href: `/klubber/${groupId}?error=unknown&email=${encodeURIComponent(email)}`, locale });
  }

  if (data === 'not_found') {
    // #644: the RPC no longer returns this for unknown emails (it invites
    // instead). Kept as a defensive fallback in case an older RPC is still live.
    redirect({ href: `/klubber/${groupId}?error=not_found&email=${encodeURIComponent(email)}`, locale });
  }
  if (data === 'already_member') {
    redirect({ href: `/klubber/${groupId}?error=already&email=${encodeURIComponent(email)}`, locale });
  }
  if (data === 'club_full') {
    redirect({ href: `/klubber/${groupId}?error=full&email=${encodeURIComponent(email)}`, locale });
  }
  if (data === 'club_expired') {
    redirect({ href: `/klubber/${groupId}?error=expired&email=${encodeURIComponent(email)}`, locale });
  }

  // #644: data === 'invited' — an unregistered email got a pending invitation.
  // Send the notification mail best-effort (a mail failure must not abort: the
  // club_invitations row is the source of truth, admin can re-add to resend).
  // Look up the club name + inviter display name via the admin client (users +
  // groups RLS would block reading co-member/club rows otherwise).
  if (data === 'invited') {
    try {
      const admin = getAdminClient();
      const [{ data: clubRow }, { data: meRow }] = await Promise.all([
        admin.from('groups').select('name').eq('id', groupId).maybeSingle<{ name: string }>(),
        user
          ? admin.from('users').select('name, nickname').eq('id', user.id).maybeSingle<{ name: string | null; nickname: string | null }>()
          : Promise.resolve({ data: null }),
      ]);
      const invitedByName =
        meRow?.nickname?.trim() || meRow?.name?.trim() || 'En klubbvenn';
      const clubName = clubRow?.name?.trim() || 'klubben';
      await sendClubInviteNotification({ to: email, invitedByName, clubName });
    } catch (err) {
      // Mail failed — the invitation row still stands. Surface a softer code so
      // the organizer knows to follow up, but treat it as a non-blocking notice.
      console.error('[addMember] club invite mail failed', err);
      revalidatePath(`/klubber/${groupId}`);
      redirect({ href: `/klubber/${groupId}?invited=${encodeURIComponent(email)}&mail=failed`, locale });
    }
    revalidatePath(`/klubber/${groupId}`);
    redirect({ href: `/klubber/${groupId}?invited=${encodeURIComponent(email)}`, locale });
  }

  // data === 'added'
  revalidatePath(`/klubber/${groupId}`);
  redirect({ href: `/klubber/${groupId}?added=${encodeURIComponent(email)}`, locale });
}

/**
 * decideRequest — server action for the Godkjenn/Avslå-forms on /klubber/[id].
 *
 * Calls the `decide_join_request` SECURITY DEFINER RPC (migrasjon 0075).
 * The RPC requires the caller to be an owner/admin of the club, inserts a
 * group_members row on approval, and returns 'approved' | 'rejected'.
 *
 * Error codes surfaced via ?decided= query param:
 *   decided=approved     — request approved, member added
 *   decided=rejected     — request rejected
 *   decided=not_auth     — caller is not an owner/admin
 *   decided=already      — request was already decided
 *   decided=not_found    — request row not found
 *   decided=unknown      — unexpected DB error
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export async function decideRequest(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
  if (!user) {
    redirect({ href: '/login', locale });
  }

  const requestId = String(formData.get('requestId') ?? '').trim();
  const groupId = String(formData.get('groupId') ?? '').trim();
  const approveStr = String(formData.get('approve') ?? '').trim();

  if (!requestId || !groupId) redirect({ href: '/klubber', locale });

  const approve = approveStr === 'true';

  const { data, error } = await supabase.rpc('decide_join_request', {
    p_request_id: requestId,
    p_approve: approve,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('not_authorized')) {
      redirect({ href: `/klubber/${groupId}?decided=not_auth`, locale });
    }
    if (msg.includes('already_decided')) {
      redirect({ href: `/klubber/${groupId}?decided=already`, locale });
    }
    if (msg.includes('request_not_found')) {
      redirect({ href: `/klubber/${groupId}?decided=not_found`, locale });
    }
    console.error('[decideRequest]', error);
    redirect({ href: `/klubber/${groupId}?decided=unknown`, locale });
  }

  // Invalidate club path so pending-requests list and member list refresh.
  revalidatePath(`/klubber/${groupId}`);

  redirect({ href: `/klubber/${groupId}?decided=${data ?? (approve ? 'approved' : 'rejected')}`, locale });
}

/**
 * cancelInvitation — server action to withdraw a pending club invitation (#644).
 *
 * Deletes the club_invitations row directly via the request-scoped client. RLS
 * («club_invitations admin delete», migrasjon 0099) restricts deletes to group
 * admins for their own club, so authz is enforced in Postgres — a non-admin
 * delete simply affects 0 rows. Idempotent: cancelling an already-gone row is a
 * no-op. Result surfaces via the ?cancelled= query param.
 */
export async function cancelInvitation(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
  if (!user) {
    redirect({ href: '/login', locale });
  }

  const invitationId = String(formData.get('invitationId') ?? '').trim();
  const groupId = String(formData.get('groupId') ?? '').trim();

  if (!groupId) redirect({ href: '/klubber', locale });
  if (!invitationId) redirect({ href: `/klubber/${groupId}`, locale });

  const { error } = await supabase
    .from('club_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('group_id', groupId);

  if (error) {
    console.error('[cancelInvitation]', error);
    redirect({ href: `/klubber/${groupId}?cancelled=error`, locale });
  }

  revalidatePath(`/klubber/${groupId}`);
  redirect({ href: `/klubber/${groupId}?cancelled=ok`, locale });
}
