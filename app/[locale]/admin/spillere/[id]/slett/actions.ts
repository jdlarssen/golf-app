'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin/auth';
import type { AppLocale } from '@/i18n/routing';

export async function deleteUser(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  const id = String(formData.get('id') ?? '');
  if (!id) redirect({ href: '/admin/spillere?error=unknown', locale });

  const supabase = await getServerClient();
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223). Replaces the
  // previously-inlined auth.getUser() + users.is_admin check.
  const actor = await requireAdmin(supabase);

  // Self-protect
  if (id === actor.userId) {
    redirect({ href: `/admin/spillere/${id}?error=self_delete_forbidden`, locale });
  }

  // Fetch target for banner copy. name can be NULL for pending invitees
  // (auto-created by 0014_pending_users trigger), so fall back to email.
  const { data: target } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('id', id)
    .maybeSingle();
  if (!target) redirect({ href: '/admin/spillere?error=unknown', locale });
  const targetName = target!.name?.trim() || target!.email;

  // Block hvis spilleren har spilt
  const { count: gpCount } = await supabase
    .from('game_players')
    .select('game_id', { count: 'exact', head: true })
    .eq('user_id', id);
  if ((gpCount ?? 0) > 0) {
    redirect({ href: `/admin/spillere/${id}?error=still_has_games`, locale });
  }

  // Slett via service-role. auth.users → public.users cascades (FK i 0001),
  // så public.users-raden fjernes automatisk.
  //
  // NB: Andre FK-er peker inn til public.users(id) uten cascade
  // (scores.entered_by, invitations.invited_by, courses.created_by,
  // games.created_by, game_players.approved_by_user_id). I dagens
  // admin-modell er disse trygt dekket: de peker enten til admin-brukere
  // (self-protected) eller forutsetter game_players-rad (covered av
  // has-played-sjekken over). Når arrangør-rolle lander må block-sjekken
  // utvides til å dekke disse FK-ene eksplisitt — ellers vil sletting
  // feile med generisk FK-violation som auth_delete_failed-banneret
  // peker på.
  try {
    const admin = getAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  } catch (err) {
    console.error('[admin/spillere] deleteUser failed', { id, err });
    redirect({ href: `/admin/spillere/${id}?error=auth_delete_failed`, locale });
  }

  const qs = new URLSearchParams({ status: 'deleted', name: targetName });
  redirect({ href: `/admin/spillere?${qs.toString()}`, locale });
}
