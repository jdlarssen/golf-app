'use server';

const HCP_MIN = -10;
const HCP_MAX = 54;

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (error || !profile?.is_admin) redirect('/');
  return supabase;
}

export async function updateUser(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const nickname = String(formData.get('nickname') ?? '').trim();
  const hcpRaw = String(formData.get('hcp_index') ?? '').trim();
  const emailRaw = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!id) redirect('/admin/spillere?error=unknown');
  if (!name) redirect(`/admin/spillere/${id}?error=name_required`);

  const hcp = Number.parseFloat(hcpRaw.replace(',', '.'));
  if (!Number.isFinite(hcp) || hcp < HCP_MIN || hcp > HCP_MAX) {
    redirect(`/admin/spillere/${id}?error=hcp_out_of_range`);
  }

  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    redirect(`/admin/spillere/${id}?error=email_invalid`);
  }

  const supabase = await requireAdmin();

  // Fetch current email to detect whether it has changed.
  const { data: current } = await supabase
    .from('users')
    .select('email')
    .eq('id', id)
    .single();

  const emailChanged = current && current.email.toLowerCase() !== emailRaw;

  if (emailChanged) {
    // Block if the user is in any active game (same guard used for other
    // destructive flows).
    const { count: activeGameCount } = await supabase
      .from('game_players')
      .select('game_id', { count: 'exact', head: true })
      .eq('user_id', id)
      .in(
        'game_id',
        // Sub-select active games. We use a raw string for the column path
        // because Supabase JS v2 doesn't support subquery filters natively.
        (
          await supabase
            .from('games')
            .select('id')
            .eq('status', 'active')
        ).data?.map((g) => g.id) ?? [],
      );

    if ((activeGameCount ?? 0) > 0) {
      redirect(`/admin/spillere/${id}?error=email_change_blocked_active_game`);
    }

    // Check both public.users and auth.users for conflicts.
    const [{ data: inPublic }, { data: inAuth }] = await Promise.all([
      supabase.rpc('email_is_registered', { p_email: emailRaw }),
      supabase.rpc('email_is_in_auth_users', { email_to_check: emailRaw }),
    ]);

    if (inPublic || inAuth) {
      redirect(`/admin/spillere/${id}?error=email_in_use`);
    }

    // Update auth.users first (service-role). If this fails we abort before
    // touching public.users so the two tables stay consistent.
    const adminClient = getAdminClient();
    const { error: authError } = await adminClient.auth.admin.updateUserById(
      id,
      { email: emailRaw },
    );
    if (authError) {
      console.error('[admin/spillere] auth email update failed', authError);
      redirect(`/admin/spillere/${id}?error=email_update_failed`);
    }
  }

  // Update public.users (email included only when it changed).
  // Bump handicap_updated_at unconditionally — admin saving the form is
  // an endorsement of the current hcp_index, even if the value didn't
  // change. Spares the player a stale-handicap prompt right after admin
  // just fixed it for them.
  const updatePayload: Record<string, unknown> = {
    name,
    nickname: nickname || null,
    hcp_index: hcp,
    handicap_updated_at: new Date().toISOString(),
  };
  if (emailChanged) {
    updatePayload.email = emailRaw;
  }

  const { error } = await supabase
    .from('users')
    .update(updatePayload)
    .eq('id', id);

  if (error) {
    console.error('[admin/spillere] updateUser failed', error);
    redirect(`/admin/spillere/${id}?error=update_failed`);
  }

  redirect(`/admin/spillere/${id}?status=updated`);
}
