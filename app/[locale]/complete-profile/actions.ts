'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { toSignedHcp } from '@/lib/handicap/sign';

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
  // Magnitude + plus-flagg (spilleren slipper å taste fortegn på mobil);
  // plusshandicap lagres internt negativt.
  const hcpRaw = String(formData.get('hcp_index') ?? '').trim();
  const hcpPlus = formData.get('hcp_plus') === 'on';
  const genderRaw = String(formData.get('gender') ?? '').trim();
  const levelRaw = String(formData.get('level') ?? 'normal').trim();

  // #356: post-onboarding destination carried from the login flow (e.g. a
  // game-scoped invitee's `/games/[id]`). Default home for everyone else.
  const nextRaw = String(formData.get('next') ?? '').trim();
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';

  // Bounce back to the form on a validation error, keeping `next` so the
  // destination survives the round-trip.
  const fail = (code: string): never => {
    const qs = new URLSearchParams({ error: code });
    if (next !== '/') qs.set('next', next);
    redirect(`/complete-profile?${qs.toString()}`);
  };

  if (!name) {
    fail('name_required');
  }

  // Accept both comma and dot as decimal separator (Norwegian users).
  const hcpMagnitude = Number.parseFloat(hcpRaw.replace(',', '.'));
  if (!Number.isFinite(hcpMagnitude) || hcpMagnitude < 0 || hcpMagnitude > HCP_MAX) {
    fail('hcp_invalid');
  }
  const hcpParsed = toSignedHcp(hcpMagnitude, hcpPlus);
  if (hcpParsed < HCP_MIN || hcpParsed > HCP_MAX) {
    fail('hcp_invalid');
  }

  if (!GENDERS.includes(genderRaw as Gender)) {
    fail('gender_required');
  }
  const gender = genderRaw as Gender;

  if (!LEVELS.includes(levelRaw as Level)) {
    fail('level_invalid');
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
    fail('unknown');
  }

  redirect(next);
}
