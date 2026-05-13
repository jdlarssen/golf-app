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

  // Defence-in-depth: if a user somehow reaches /profile without
  // profile_completed_at set (e.g. the Karl-case from 2026-05-13's deploy
  // window where /profile was hit before the new onboarding gate was live),
  // stamp it here so they don't get stuck as "Venter" in the player picker.
  // For already-onboarded users this just bumps the timestamp to the latest
  // edit, which is fine — the field's role is "has the user ever completed
  // onboarding," not "when did they first onboard."
  const { error } = await supabase
    .from('users')
    .update({
      name,
      nickname,
      hcp_index: hcpParsed,
      profile_completed_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    redirect('/profile?error=unknown');
  }

  redirect('/profile?profile=updated');
}
