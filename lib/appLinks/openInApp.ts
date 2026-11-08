import { routing } from '@/i18n/routing';
import type { StorePlatform } from '@/lib/app/appLaunch';
import { first } from '@/lib/url/searchParams';
import { APP_LINK_PATH_PREFIXES } from './appLinkPaths';

/**
 * «Åpne i appen» on the website (#2748), for someone a link left in a browser, as
 * the one inside Messenger or Gmail does. The paths in `appLinkPaths.ts` mark the
 * page with `fra=lenke`, so someone using the site day to day never sees the button.
 *
 * The button is a plain link to the same path on `www.tornygolf.no`. Safari keeps a
 * link to its own domain inside, and `www` counts as another one, so the tap can
 * open the app. Without the app the browser comes back through `www` to the page,
 * and `uten-app=1` makes it say what happened.
 */

export const FROM_LINK_PARAM = 'fra';
export const FROM_LINK_VALUE = 'lenke';
export const NO_APP_PARAM = 'uten-app';
export const NO_APP_VALUE = '1';

const PROD_HOST = 'tornygolf.no';
const WWW_ORIGIN = 'https://www.tornygolf.no';

/** The query a page reads to know how the visitor got there. */
export type AppLinkQuery = {
  fra?: string | string[];
  'uten-app'?: string | string[];
};

export function appLinkLanding(query: AppLinkQuery): { fromLink: boolean; noApp: boolean } {
  return {
    fromLink: first(query.fra) === FROM_LINK_VALUE,
    noApp: first(query['uten-app']) === NO_APP_VALUE,
  };
}

/**
 * Where the button goes, or `null` for a path the app has no claim on. On staging
 * and previews it stays on the same host, so a test lands on the notice and never
 * sends anyone to production.
 *
 * @param path a path from `appLinkPaths.ts`, without locale, with any query it needs
 *   to survive the trip when the app does not open
 * @param host the host the page is on
 */
export function openInAppHref(path: string, host: string, locale: string): string | null {
  const [pathname, search = ''] = path.split('?');
  const localized = locale === routing.defaultLocale ? pathname : `/${locale}${pathname}`;
  if (!APP_LINK_PATH_PREFIXES.some((prefix) => localized.startsWith(prefix))) return null;

  const query = new URLSearchParams(search);
  query.set(NO_APP_PARAM, NO_APP_VALUE);
  const target = `${localized}?${query.toString()}`;
  return host === PROD_HOST ? `${WWW_ORIGIN}${target}` : target;
}

/** What the page shows: the button on a phone that came from a link, the notice after a try. */
export function openInAppView({
  platform,
  standalone,
  fromLink,
  noApp,
}: {
  platform: StorePlatform;
  standalone: boolean;
  fromLink: boolean;
  noApp: boolean;
}): { button: boolean; notice: boolean } {
  const onPhone = platform === 'ios' || platform === 'android';
  return { button: fromLink && onPhone && !standalone, notice: noApp };
}
