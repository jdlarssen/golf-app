'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { safeNextPath } from './safeNext';

const HCP_MIN = -10;
const HCP_MAX = 54.0;

export async function updateProfile(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const nicknameRaw = String(formData.get('nickname') ?? '').trim();
  const nickname = nicknameRaw === '' ? null : nicknameRaw;
  const hcpRaw = String(formData.get('hcp_index') ?? '').trim();
  // Optional ?next=-redirect target. Validation in safeNextPath rejects
  // anything that isn't a same-origin path (open-redirect vern).
  const nextRaw = formData.get('next');
  const nextSafe = safeNextPath(typeof nextRaw === 'string' ? nextRaw : null);
  const errorBackTo = nextSafe
    ? `/profile?next=${encodeURIComponent(nextSafe)}`
    : '/profile';

  if (!name) {
    redirect(`${errorBackTo}${errorBackTo.includes('?') ? '&' : '?'}error=name_required`);
  }

  const hcpParsed = Number.parseFloat(hcpRaw.replace(',', '.'));
  if (!Number.isFinite(hcpParsed) || hcpParsed < HCP_MIN || hcpParsed > HCP_MAX) {
    redirect(`${errorBackTo}${errorBackTo.includes('?') ? '&' : '?'}error=hcp_invalid`);
  }

  // Product-updates opt-in toggle (issue #202). Checkbox-feltet er bare med
  // i FormData når det er checked, så fravær = opt-out.
  const productUpdatesOptIn = formData.get('product_updates_opt_in') === 'on';

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
  // Bump handicap_updated_at on every save — even when hcp_index didn't
  // change, the player has been through the form and endorsed the value.
  // Drives the stale-handicap prompt in the scheduled-game waiting room
  // (see lib/handicap/staleness.ts).
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('users')
    .update({
      name,
      nickname,
      hcp_index: hcpParsed,
      handicap_updated_at: now,
      profile_completed_at: now,
      // null = opted in (default), timestamp = opted out at that moment.
      product_updates_unsubscribed_at: productUpdatesOptIn ? null : now,
    })
    .eq('id', user.id);

  if (error) {
    redirect(`${errorBackTo}${errorBackTo.includes('?') ? '&' : '?'}error=unknown`);
  }

  redirect(nextSafe ?? '/profile?profile=updated');
}
