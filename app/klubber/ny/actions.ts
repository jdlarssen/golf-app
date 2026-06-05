'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';

/**
 * createClub — server action for the /klubber/ny form.
 *
 * Calls the `create_club` SECURITY DEFINER RPC (migrasjon 0075). The RPC
 * handles owner-bootstrap atomically (INSERT into groups + group_members
 * with role='owner') and enforces the 2-clubs-created cap server-side.
 *
 * Error codes surfaced via ?error= query param (mapped to Norwegian in the
 * page component):
 *   name_required — empty name (caught both here and by RPC)
 *   too_long      — name exceeds 60 characters
 *   cap           — caller has already created 2 clubs
 *   unknown       — unexpected DB error (logged server-side)
 *
 * On success: revalidates /klubber and redirects to /klubber/[newId].
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export async function createClub(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/klubber/ny');
  }

  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    redirect('/klubber/ny?error=name_required');
  }

  const { data, error } = await supabase.rpc('create_club', { p_name: name });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('club_cap_reached')) {
      redirect('/klubber/ny?error=cap');
    }
    if (msg.includes('name_too_long')) {
      redirect('/klubber/ny?error=too_long');
    }
    if (msg.includes('name_required')) {
      redirect('/klubber/ny?error=name_required');
    }
    console.error('[createClub]', error);
    redirect('/klubber/ny?error=unknown');
  }

  revalidatePath('/klubber');
  redirect(`/klubber/${data}`);
}
