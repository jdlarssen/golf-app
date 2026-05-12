'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

const HCP_MIN = -10;
const HCP_MAX = 54.0;

export async function updateProfile(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const nicknameRaw = String(formData.get('nickname') ?? '').trim();
  const nickname = nicknameRaw === '' ? null : nicknameRaw;
  const hcpRaw = String(formData.get('hcp_index') ?? '').trim();

  if (!name) {
    redirect('/profile?error=name_required');
  }

  const hcpParsed = Number.parseFloat(hcpRaw.replace(',', '.'));
  if (!Number.isFinite(hcpParsed) || hcpParsed < HCP_MIN || hcpParsed > HCP_MAX) {
    redirect('/profile?error=hcp_invalid');
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { error } = await supabase
    .from('users')
    .update({
      name,
      nickname,
      hcp_index: hcpParsed,
    })
    .eq('id', user.id);

  if (error) {
    redirect('/profile?error=unknown');
  }

  redirect('/profile?profile=updated');
}
