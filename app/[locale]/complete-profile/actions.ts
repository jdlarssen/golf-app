'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { toSignedHcp } from '@/lib/handicap/sign';
import { recomputeCourseHandicapForUser } from '@/lib/games/recomputeCourseHandicap';

const HCP_MIN = -10;
const HCP_MAX = 54.0;

export async function completeProfile(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  // Magnitude + plus-flagg (spilleren slipper å taste fortegn på mobil);
  // plusshandicap lagres internt negativt.
  const hcpRaw = String(formData.get('hcp_index') ?? '').trim();
  const hcpPlus = formData.get('hcp_plus') === 'on';

  // #356: post-onboarding destination carried from the login flow (e.g. a
  // game-scoped invitee's `/games/[id]`). Default home for everyone else.
  const nextRaw = String(formData.get('next') ?? '').trim();
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';

  // Bounce back to the form on a validation error, keeping `next` and the
  // already-entered field values so the user doesn't lose their input.
  const fail = (code: string): never => {
    const qs = new URLSearchParams({ error: code });
    if (next !== '/') qs.set('next', next);
    if (name) qs.set('name', name);
    if (hcpRaw) qs.set('hcp_index', hcpRaw);
    if (hcpPlus) qs.set('hcp_plus', 'on');
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

  // #1064: gender and level are no longer collected during onboarding.
  // gender stays NULL (GenderSoftPrompt on /profile picks it up later);
  // level falls to its DB default ('normal') by simply omitting it below.
  // nickname is likewise no longer collected here — it's optional and
  // already editable on /profile.

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
      hcp_index: hcpParsed,
      handicap_updated_at: now,
      profile_completed_at: now,
    })
    .eq('id', user.id);

  if (error) {
    fail('unknown');
  }

  // #1176: the soft profile gate lets an invitee reach a game before their HCP
  // is set. If they finish onboarding after the game already froze course
  // handicaps, the frozen value used a placeholder hcp_index — recompute it so
  // their net scoring is correct. Best-effort: never block the redirect.
  try {
    await recomputeCourseHandicapForUser(user.id, hcpParsed);
  } catch (err) {
    console.error('[completeProfile] course-handicap recompute threw', err);
  }

  redirect(next);
}
