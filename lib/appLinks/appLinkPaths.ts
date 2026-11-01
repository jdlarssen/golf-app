/**
 * The paths on tornygolf.no that open the app for someone who has it (#2748):
 * one home for the store build's filter (`native/app/app.config.ts`, tested
 * against this list), the Android proof and the app's parser
 * (`native/app/src/lib/appLinkUrl.ts`). Everything else stays in the browser,
 * where the session lives: login, invitations until their own path exists,
 * sign-up, spectate and the pages the app's own buttons open.
 *
 * iOS reads its list from the AASA file, which still has only the friend link
 * (`app/.well-known/apple-app-site-association/route.ts`): AASA applies to
 * every installed build that claims the domain, and older builds understand
 * only the friend link. It moves to this list when a build with the parser is
 * out.
 *
 * Pure and free of server modules, so the app can read it without dragging
 * them into the bundle (same approach as `friendLinkPath.ts`).
 */
import { FRIEND_LINK_LOCALE_PREFIXES, FRIEND_LINK_PREFIX } from '../friends/friendLinkPath';

export const LEAGUE_LINK_PREFIX = '/liga/bli-med/';

/** «/liga/bli-med/<kode>». */
export function leagueLinkPath(code: string): string {
  return `${LEAGUE_LINK_PREFIX}${code}`;
}

/** One path per link and locale: «/venner/legg-til/», «/liga/bli-med/», «/en/venner/legg-til/» … */
export const APP_LINK_PATH_PREFIXES: readonly string[] = FRIEND_LINK_LOCALE_PREFIXES.flatMap((locale) =>
  [FRIEND_LINK_PREFIX, LEAGUE_LINK_PREFIX].map((prefix) => `${locale}${prefix}`),
);
