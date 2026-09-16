'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import {
  deleteOrAnonymizeUser,
  getDeleteBlockReason,
} from '@/lib/users/deleteAccount';
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

  // #1012: delt blokk-regel med selv-slett — deltakelse i eller arrangering av
  // noe pågående blokkerer (erstatter den gamle still_has_games-blokken;
  // spillhistorikk blokkerer ikke lenger, den anonymiseres).
  //
  // #1903: switch over hele utfallet — `null` er eneste vei videre til sletting.
  const outcome = await getDeleteBlockReason(id);
  switch (outcome) {
    case null:
      break;
    case 'admin_account':
      redirect({ href: `/admin/spillere/${id}?error=self_delete_forbidden`, locale });
      return;
    case 'active_engagements':
      redirect({ href: `/admin/spillere/${id}?error=target_active`, locale });
      return;
    // #1910: også admin må ordne eierskapet i klubben først — en omgåelse her
    // ville gjenskapt den eierløse klubben.
    case 'sole_club_owner':
      redirect({ href: `/admin/spillere/${id}?error=target_sole_club_owner`, locale });
      return;
    case 'check_failed':
      redirect({ href: `/admin/spillere/${id}?error=auth_delete_failed`, locale });
      return;
    default: {
      const unhandled: never = outcome;
      throw new Error(`unhandled delete check outcome: ${String(unhandled)}`);
    }
  }

  // Aldri spilt → hard delete (kaskaden rydder alt); har historikk →
  // anonymisering via anonymize_user()-RPC + GoTrue soft delete (#1012).
  const result = await deleteOrAnonymizeUser(id, '[admin/spillere]');
  if (!result.ok) {
    redirect({ href: `/admin/spillere/${id}?error=auth_delete_failed`, locale });
  }

  const qs = new URLSearchParams({ status: 'deleted', name: targetName });
  redirect({ href: `/admin/spillere?${qs.toString()}`, locale });
}
