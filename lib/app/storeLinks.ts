/**
 * Where the native app lives in the stores (#2562).
 *
 * Neither listing is public before release day, so these links cannot be
 * tried yet. The release runbooks (`docs/native/app-store-release.md`,
 * `play-store-release.md`) have the step that opens both before
 * `NEXT_PUBLIC_APP_LAUNCH` is switched on.
 */

/** App ID 6806675951 in App Store Connect; `/no/` is the Norwegian store. */
export const APP_STORE_URL = 'https://apps.apple.com/no/app/id6806675951';

/** `STORE_BUNDLE_ID` in `native/app/app.config.ts`. */
export const GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=no.tornygolf.app';

export type Store = 'appStore' | 'googlePlay';

export const STORE_URLS: Record<Store, string> = {
  appStore: APP_STORE_URL,
  googlePlay: GOOGLE_PLAY_URL,
};
