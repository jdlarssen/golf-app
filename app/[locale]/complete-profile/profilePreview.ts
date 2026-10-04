import type { AppLocale } from '@/i18n/routing';
import { toSignedHcp } from '@/lib/handicap/sign';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import { HCP_MAX, HCP_MIN, parseHcpMagnitude } from '@/lib/users/profileInput';

/**
 * The handicap in «Slik ser de andre deg» (#2350): «18,4», «+2,5», or `null`
 * while the typed value is one the save would refuse (the view shows «HCP –»).
 *
 * Valid is what the server accepts — `parseHcpMagnitude` and `HCP_MIN`/
 * `HCP_MAX` from `lib/users/profileInput.ts`, the same check as
 * `parseProfileInput` and the app's `onboardingPreviewHcp` — so the preview
 * never shows a number the save will reject. The form is `formatHcpDisplay`,
 * as others see it everywhere else.
 */
export function previewHcp(typed: string, isPlus: boolean, locale: AppLocale): string | null {
  const magnitude = parseHcpMagnitude(typed.trim());
  if (magnitude === null) return null;
  const signed = toSignedHcp(magnitude, isPlus);
  if (signed < HCP_MIN || signed > HCP_MAX) return null;
  return formatHcpDisplay(signed, locale);
}
