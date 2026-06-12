'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { safeNextPath } from './safeNext';
import { toSignedHcp } from '@/lib/handicap/sign';
import type { AppLocale } from '@/i18n/routing';

const HCP_MIN = -10;
const HCP_MAX = 54.0;
const GENDERS = ['mens', 'ladies'] as const;
const LEVELS = ['junior', 'normal', 'senior'] as const;
type Gender = (typeof GENDERS)[number];
type Level = (typeof LEVELS)[number];

export async function updateProfile(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  const name = String(formData.get('name') ?? '').trim();
  const nicknameRaw = String(formData.get('nickname') ?? '').trim();
  const nickname = nicknameRaw === '' ? null : nicknameRaw;
  // Hcp-feltet sender en positiv magnitude + et plus-flagg (spilleren slipper
  // å taste fortegn på mobil). Plusshandicap lagres internt negativt.
  const hcpRaw = String(formData.get('hcp_index') ?? '').trim();
  const hcpPlus = formData.get('hcp_plus') === 'on';
  const genderRaw = String(formData.get('gender') ?? '').trim();
  const levelRaw = String(formData.get('level') ?? 'normal').trim();
  // Optional ?next=-redirect target. Validation in safeNextPath rejects
  // anything that isn't a same-origin path (open-redirect vern).
  const nextRaw = formData.get('next');
  const nextSafe = safeNextPath(typeof nextRaw === 'string' ? nextRaw : null);
  const errorBackTo = nextSafe
    ? `/profile?next=${encodeURIComponent(nextSafe)}`
    : '/profile';

  if (!name) {
    redirect({ href: `${errorBackTo}${errorBackTo.includes('?') ? '&' : '?'}error=name_required`, locale });
  }

  const hcpMagnitude = Number.parseFloat(hcpRaw.replace(',', '.'));
  if (!Number.isFinite(hcpMagnitude) || hcpMagnitude < 0 || hcpMagnitude > HCP_MAX) {
    redirect({ href: `${errorBackTo}${errorBackTo.includes('?') ? '&' : '?'}error=hcp_invalid`, locale });
  }
  const hcpParsed = toSignedHcp(hcpMagnitude, hcpPlus);
  if (hcpParsed < HCP_MIN || hcpParsed > HCP_MAX) {
    redirect({ href: `${errorBackTo}${errorBackTo.includes('?') ? '&' : '?'}error=hcp_invalid`, locale });
  }

  if (!GENDERS.includes(genderRaw as Gender)) {
    redirect({ href: `${errorBackTo}${errorBackTo.includes('?') ? '&' : '?'}error=gender_required`, locale });
  }
  const gender = genderRaw as Gender;

  if (!LEVELS.includes(levelRaw as Level)) {
    redirect({ href: `${errorBackTo}${errorBackTo.includes('?') ? '&' : '?'}error=level_invalid`, locale });
  }
  const level = levelRaw as Level;

  // Månedsbrev-opt-in (#202) eies nå av Innboks-flaten (toggleProductUpdates),
  // ikke dette skjemaet — så updateProfile rører ikke
  // product_updates_unsubscribed_at lenger.
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: '/login', locale });
    return; // unreachable — i18n redirect throws but isn't typed `never`
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
      gender,
      level,
    })
    .eq('id', user.id);

  if (error) {
    redirect({ href: `${errorBackTo}${errorBackTo.includes('?') ? '&' : '?'}error=unknown`, locale });
  }

  redirect({ href: nextSafe ?? '/profile?profile=updated', locale });
}
