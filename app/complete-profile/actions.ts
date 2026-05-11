'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

const HCP_MIN = -10;
const HCP_MAX = 54.0;

export async function completeProfile(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const nicknameRaw = String(formData.get('nickname') ?? '').trim();
  const nickname = nicknameRaw === '' ? null : nicknameRaw;
  const hcpRaw = String(formData.get('hcp_index') ?? '').trim();

  if (!name) {
    redirect('/complete-profile?error=name_required');
  }

  // Accept both comma and dot as decimal separator (Norwegian users).
  const hcpParsed = Number.parseFloat(hcpRaw.replace(',', '.'));
  if (!Number.isFinite(hcpParsed) || hcpParsed < HCP_MIN || hcpParsed > HCP_MAX) {
    redirect('/complete-profile?error=hcp_invalid');
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { error } = await supabase.from('users').insert({
    id: user.id,
    email: user.email!,
    name,
    nickname,
    hcp_index: hcpParsed,
    is_admin: false,
  });

  if (error) {
    // 23505 = unique_violation (duplicate row). Anything else surfaces as
    // a generic error so the user can try again.
    const code = error.code === '23505' ? 'already_exists' : 'unknown';
    redirect(`/complete-profile?error=${code}`);
  }

  redirect('/');
}
