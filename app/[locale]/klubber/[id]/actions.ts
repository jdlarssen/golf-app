'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';

/**
 * addMember — server action for the «Legg til på e-post»-form on /klubber/[id].
 *
 * Calls the `add_club_member_by_email` SECURITY DEFINER RPC (migrasjon 0075).
 * The RPC requires the caller to be an owner/admin of the club.
 *
 * Result codes surface via ?added= / ?error= query params:
 *   added=<email>     — member added successfully
 *   error=not_found   — no Tørny user with that email
 *   error=already     — user is already a member
 *   error=not_auth    — caller is not an owner/admin
 *   error=email_req   — email was empty
 *   error=full        — club has reached its member_cap (#50)
 *   error=expired     — club's avtale has expired / is frozen (#50)
 *   error=unknown     — unexpected DB error
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
    redirect({ href: `/klubber/${groupId}?error=unknown`, locale });
  }

  if (data === 'not_found') {
    redirect({ href: `/klubber/${groupId}?error=not_found&email=${encodeURIComponent(email)}`, locale });
  }
  if (data === 'already_member') {
    redirect({ href: `/klubber/${groupId}?error=already&email=${encodeURIComponent(email)}`, locale });
  }
  if (data === 'club_full') {
    redirect({ href: `/klubber/${groupId}?error=full`, locale });
  }
  if (data === 'club_expired') {
    redirect({ href: `/klubber/${groupId}?error=expired`, locale });
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
