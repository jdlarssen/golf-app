'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

const HCP_MIN = -10;
const HCP_MAX = 54.0;

const GENDERS = ['mens', 'ladies'] as const;
const LEVELS = ['junior', 'normal', 'senior'] as const;
type Gender = (typeof GENDERS)[number];
type Level = (typeof LEVELS)[number];

export async function completeProfile(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const nicknameRaw = String(formData.get('nickname') ?? '').trim();
  const nickname = nicknameRaw === '' ? null : nicknameRaw;
  const hcpRaw = String(formData.get('hcp_index') ?? '').trim();
  const genderRaw = String(formData.get('gender') ?? '').trim();
  const levelRaw = String(formData.get('level') ?? 'normal').trim();

  if (!name) {
    redirect('/complete-profile?error=name_required');
  }

  // Accept both comma and dot as decimal separator (Norwegian users).
  const hcpParsed = Number.parseFloat(hcpRaw.replace(',', '.'));
  if (!Number.isFinite(hcpParsed) || hcpParsed < HCP_MIN || hcpParsed > HCP_MAX) {
    redirect('/complete-profile?error=hcp_invalid');
  }

  if (!GENDERS.includes(genderRaw as Gender)) {
    redirect('/complete-profile?error=gender_required');
  }
  const gender = genderRaw as Gender;

  if (!LEVELS.includes(levelRaw as Level)) {
    redirect('/complete-profile?error=level_invalid');
  }
  const level = levelRaw as Level;

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // The trigger on auth.users pre-creates a placeholder public.users row
  // (name=NULL, profile_completed_at=NULL). We update that row here and
  // stamp profile_completed_at to mark onboarding done.
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('users')
    .update({
      name,
      nickname,
      hcp_index: hcpParsed,
      handicap_updated_at: now,
      profile_completed_at: now,
      gender,
      level,
    })
    .eq('id', user.id);

  if (error) {
    redirect('/complete-profile?error=unknown');
  }

  redirect('/');
}
