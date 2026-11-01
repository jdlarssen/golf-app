/**
 * The paths on tornygolf.no that open the app for someone who has it (#2748):
 * one home for the store build's filter (`native/app/app.config.ts`, tested
 * against this list), the Android proof and the app's parser
 * (`native/app/src/lib/appLinkUrl.ts`). Everything else stays in the browser,
 * where the session lives: login, sign-up, spectate and the pages the app's own
 * buttons open. That is why invitations and rounds have paths of their own instead
 * of `/login` and `/games/*`: without the app, those paths send you on to the page
 * (`app/[locale]/invitasjon`, `app/[locale]/runde`).
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

export const INVITATION_LINK_PREFIX = '/invitasjon/';

/** «/invitasjon/<token>». */
export function invitationLinkPath(token: string): string {
  return `${INVITATION_LINK_PREFIX}${token}`;
}

export const ROUND_LINK_PREFIX = '/runde/';

/** The pages under a round that mail links to: `holes/<1-18>`, `submit`, `avslutt`, `leaderboard`. */
const ROUND_SUBPAGE = /^(?:holes\/(?:[1-9]|1[0-8])|submit|avslutt|leaderboard)$/;

/**
 * May a round link go to this page? `''` is the round itself. One home for the web
 * route and the app's parser: anything else is a 404 on the web and no link in the
 * app, so `/runde/<id>/slett` can never open anything.
 */
export function isRoundLinkSubpage(subpage: string): boolean {
  return subpage === '' || ROUND_SUBPAGE.test(subpage);
}

/** «/runde/<id>» or «/runde/<id>/<subpage>». */
export function roundLinkPath(gameId: string, subpage = ''): string {
  return `${ROUND_LINK_PREFIX}${gameId}${subpage ? `/${subpage}` : ''}`;
}

/** One path per link and locale: «/venner/legg-til/», «/liga/bli-med/», … «/en/runde/». */
export const APP_LINK_PATH_PREFIXES: readonly string[] = FRIEND_LINK_LOCALE_PREFIXES.flatMap((locale) =>
  [FRIEND_LINK_PREFIX, LEAGUE_LINK_PREFIX, INVITATION_LINK_PREFIX, ROUND_LINK_PREFIX].map(
    (prefix) => `${locale}${prefix}`,
  ),
);
