'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
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
 *   error=unknown     — unexpected DB error
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export async function addMember(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const groupId = String(formData.get('groupId') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();

  if (!groupId) redirect('/klubber');
  if (!email) redirect(`/klubber/${groupId}?error=email_req`);

  const { data, error } = await supabase.rpc('add_club_member_by_email', {
    p_group_id: groupId,
    p_email: email,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('not_authorized')) {
      redirect(`/klubber/${groupId}?error=not_auth`);
    }
    if (msg.includes('email_required')) {
      redirect(`/klubber/${groupId}?error=email_req`);
    }
    console.error('[addMember]', error);
    redirect(`/klubber/${groupId}?error=unknown`);
  }

  if (data === 'not_found') {
    redirect(`/klubber/${groupId}?error=not_found&email=${encodeURIComponent(email)}`);
  }
  if (data === 'already_member') {
    redirect(`/klubber/${groupId}?error=already&email=${encodeURIComponent(email)}`);
  }

  // data === 'added'
  revalidatePath(`/klubber/${groupId}`);
  redirect(`/klubber/${groupId}?added=${encodeURIComponent(email)}`);
}
