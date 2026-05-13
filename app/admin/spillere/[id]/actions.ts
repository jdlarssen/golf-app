'use server';

const HCP_MIN = -10;
const HCP_MAX = 54;

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

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

  if (!id) redirect('/admin/spillere?error=unknown');
  if (!name) redirect(`/admin/spillere/${id}?error=name_required`);

  const hcp = Number.parseFloat(hcpRaw.replace(',', '.'));
  if (!Number.isFinite(hcp) || hcp < HCP_MIN || hcp > HCP_MAX) {
    redirect(`/admin/spillere/${id}?error=hcp_out_of_range`);
  }

  const supabase = await requireAdmin();

  const { error } = await supabase
    .from('users')
    .update({
      name,
      nickname: nickname || null,
      hcp_index: hcp,
    })
    .eq('id', id);

  if (error) {
    console.error('[admin/spillere] updateUser failed', error);
    redirect(`/admin/spillere/${id}?error=update_failed`);
  }

  redirect(`/admin/spillere/${id}?status=updated`);
}
