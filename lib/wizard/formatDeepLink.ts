/**
 * The wizard's suggestion deep links on /opprett-spill, and which one wins.
 *
 * parseFormatDeepLink — reads `?format=<slug>&antall=<n>`, the link «Lag en
 * runde med dette» on /spillformater sends (#2328).
 *
 *  - `format` must be in the Kompis catalog (the slugs the caller passes from
 *    `getFormatsForIntent('kompis')`); anything else → `null`, a plain wizard.
 *  - `antall` counts only as a whole number from 1 to `TEAM_FORMAT_PLAYER_CAP`
 *    that the format fits (`fitsPlayerCount`). Anything else → `null`, the
 *    wizard without a count.
 *
 * resolveWizardDeepLink — the one home for the order between the two
 * suggestion links: `?format=` and `?oppsett=<audience>`, the «Bruk dette
 * oppsettet» button on the guides (#2331). See its doc comment.
 *
 * Pure logic, no server import.
 */

import type { GameMode } from '@/lib/scoring/modes/types';
import { fitsPlayerCount } from '@/lib/wizard/fitsPlayerCount';
import { TEAM_FORMAT_PLAYER_CAP } from '@/lib/games/teamFormatLimits';
import type { ArrangeAudience } from '@/lib/seo/arrangeAudiences';
import { ARRANGE_PRESETS, parseArrangePreset, type ArrangePreset } from '@/lib/seo/arrangePresets';

export type FormatDeepLink = { gameMode: GameMode; expectedPlayerCount: number | null };

export function parseFormatDeepLink(
  { format, antall }: { format: string | undefined; antall: string | undefined },
  kompisSlugs: readonly string[],
): FormatDeepLink | null {
  if (!format || !kompisSlugs.includes(format)) return null;
  const gameMode = format as GameMode;
  const n = antall !== undefined && /^\d+$/.test(antall) ? Number(antall) : NaN;
  const counts = n >= 1 && n <= TEAM_FORMAT_PLAYER_CAP && fitsPlayerCount(gameMode, n);
  return { gameMode, expectedPlayerCount: counts ? n : null };
}

export type WizardDeepLink =
  | ({ kind: 'preset'; audience: ArrangeAudience } & ArrangePreset)
  | ({ kind: 'format' } & FormatDeepLink);

export type WizardDeepLinkParams = {
  oppsett: string | undefined;
  format: string | undefined;
  antall: string | undefined;
  fra: string | undefined;
  klubb: string | undefined;
  intent: string | undefined;
};

/**
 * Both links are suggestions, so an explicit choice beats them:
 *
 *  1. `?fra=` or `?klubb=` set → `null`. Those prefill sources are the
 *     organiser's own choice, and the suggestion is ignored. `?bane=` is not
 *     one of them (#2485): it only picks the course, and it comes back with
 *     the suggestion link when you return from /opprett-bane, where turning
 *     the format off would drop the saved draft.
 *  2. `?oppsett=` names a guide's audience, no `?intent=` is set and the
 *     setup's format is in the Kompis catalog → the setup (format and team
 *     size). The guides never link with `?intent=`, so one there means the
 *     address was edited by hand, and the setup steps aside.
 *  3. `?format=` with no `?intent=` or `?intent=kompis` → the format link.
 *     An unknown `?oppsett=` falls through to here.
 *  4. Otherwise → `null`, a plain wizard.
 */
export function resolveWizardDeepLink(
  { oppsett, format, antall, fra, klubb, intent }: WizardDeepLinkParams,
  kompisSlugs: readonly string[],
): WizardDeepLink | null {
  if (fra || klubb) return null;
  const audience = parseArrangePreset(oppsett);
  if (audience && intent === undefined) {
    const preset = ARRANGE_PRESETS[audience];
    if (kompisSlugs.includes(preset.gameMode)) return { kind: 'preset', audience, ...preset };
  }
  if (intent !== undefined && intent !== 'kompis') return null;
  const formatLink = parseFormatDeepLink({ format, antall }, kompisSlugs);
  return formatLink ? { kind: 'format', ...formatLink } : null;
}
