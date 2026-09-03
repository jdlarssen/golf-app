'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { safeNextPath } from './safeNext';
import { parseProfileInput } from '@/lib/users/profileInput';
import { recomputeCourseHandicapForUser } from '@/lib/games/recomputeCourseHandicap';
import { expectOne } from '@/lib/supabase/affectedRows';
import type { AppLocale } from '@/i18n/routing';

export async function updateProfile(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  // Optional ?next=-redirect target. Validation in safeNextPath rejects
  // anything that isn't a same-origin path (open-redirect vern).
  const nextRaw = formData.get('next');
  const nextSafe = safeNextPath(typeof nextRaw === 'string' ? nextRaw : null);
  const errorBackTo = nextSafe
    ? `/profile?next=${encodeURIComponent(nextSafe)}`
    : '/profile';

  // Selve regelen bor i `lib/users/profileInput.ts` — den deles nå med ruta
  // native-appen kaller (#1906), så begge dørene godtar og avviser NØYAKTIG
  // det samme (AGENTS trap 4: én regel, ett hjem). Denne actionen oversetter
  // bare feilkoden til redirecten skjemaets feilbanner allerede leser.
  //
  // Hcp-feltet sender en positiv magnitude + et plus-flagg (spilleren slipper
  // å taste fortegn på mobil). Plusshandicap lagres internt negativt.
  //
  // `level` sendes videre som `null` når feltet mangler helt — parseren
  // defaulter da til «normal», mens et felt som ER sendt tomt fortsatt er en
  // valideringsfeil.
  const levelEntry = formData.get('level');
  const parsed = parseProfileInput({
    name: String(formData.get('name') ?? ''),
    nickname: String(formData.get('nickname') ?? ''),
    hcpIndex: String(formData.get('hcp_index') ?? ''),
    hcpPlus: formData.get('hcp_plus') === 'on',
    gender: String(formData.get('gender') ?? ''),
    level: levelEntry === null ? null : String(levelEntry),
  });
  if (!parsed.ok) {
    redirect({
      href: `${errorBackTo}${errorBackTo.includes('?') ? '&' : '?'}error=${parsed.error}`,
      locale,
    });
    return; // unreachable — i18n redirect throws but isn't typed `never`
  }
  const { name, nickname, hcpIndex: hcpParsed, gender, level } = parsed.value;

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
  try {
    expectOne(
      await supabase
        .from('users')
        .update({
          name,
          nickname,
          hcp_index: hcpParsed,
          handicap_updated_at: now,
          profile_completed_at: now,
          // Omit `gender` entirely when the form submitted it empty, so an
          // already-set value on the row is preserved rather than nulled.
          ...(gender !== undefined ? { gender } : {}),
          level,
        })
        .eq('id', user.id)
        .select(),
      'updateProfile',
    );
  } catch (err) {
    // Catches both DB errors (Error) and silent 0-row writes (NoRowsAffectedError)
    // — trap #2 from AGENTS.md. Keep the same redirect-on-error behaviour so
    // the user sees the existing error banner rather than a raw 500.
    if (err instanceof Error) {
      redirect({ href: `${errorBackTo}${errorBackTo.includes('?') ? '&' : '?'}error=unknown`, locale });
    }
    throw err; // rethrow unexpected non-Error throws (should never happen)
  }

  // Samme recompute som `completeProfile` (#1176) — retting av handicapet MENS
  // en runde er i gang må skrive om de frosne banehandicapene, ellers spilles
  // resten av runden på den gamle verdien. Dette hullet traff Ryder Cup 2026:
  // en spiller rettet et glemt plusshandicap-fortegn her, spillene beholdt den
  // gamle CH-en, og han fikk fem slag for mye i tre aktive kamper.
  // Best-effort: en feilet recompute må aldri blokkere profil-lagringen.
  try {
    await recomputeCourseHandicapForUser(user.id, hcpParsed);
  } catch (err) {
    console.error('[updateProfile] course-handicap recompute threw', err);
  }

  redirect({ href: nextSafe ?? '/profile?profile=updated', locale });
}
