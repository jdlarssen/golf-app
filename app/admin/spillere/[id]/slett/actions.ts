'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function deleteUser(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/spillere?error=unknown');

  const supabase = await getServerClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) redirect('/login');

  const { data: actorProfile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', actor.id)
    .single();
  if (!actorProfile?.is_admin) redirect('/');

  // Self-protect
  if (id === actor.id) {
    redirect(`/admin/spillere/${id}?error=self_delete_forbidden`);
  }

  // Hent target for å få navn til banner-tekst
  const { data: target } = await supabase
    .from('users')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (!target) redirect('/admin/spillere?error=unknown');

  // Block hvis spilleren har spilt
  const { count: gpCount } = await supabase
    .from('game_players')
    .select('game_id', { count: 'exact', head: true })
    .eq('user_id', id);
  if ((gpCount ?? 0) > 0) {
    redirect(`/admin/spillere/${id}?error=still_has_games`);
  }

  // Slett via service-role. auth.users → public.users cascades (FK i 0001).
  try {
    const admin = getAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  } catch (err) {
    console.error('[admin/spillere] deleteUser failed', err);
    redirect(`/admin/spillere/${id}?error=auth_delete_failed`);
  }

  const qs = new URLSearchParams({ status: 'deleted', name: target.name });
  redirect(`/admin/spillere?${qs.toString()}`);
}
