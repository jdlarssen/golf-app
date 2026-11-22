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

/**
 * Opens the Play Store app directly (the app's update guard, #2619). Falls back
 * to `GOOGLE_PLAY_URL` on phones without Play.
 */
export const GOOGLE_PLAY_MARKET_URL = 'market://details?id=no.tornygolf.app';

/**
 * Opens the TestFlight app on Tørny's page (#2975), where a tester taps
 * "Update". Apple does not document this link form, so a phone test is the
 * proof; with TestFlight installed the scheme opens the app either way. The
 * public join link is kept out of this public repo on purpose.
 */
export const TESTFLIGHT_APP_URL = 'itms-beta://beta.itunes.apple.com/v1/app/6806675951';

/**
 * Where "Oppdater" in the app's new-version strip goes (#2975), tried in order
 * until one opens. This is the one place to change at the store launch: set
 * `ios` to `[APP_STORE_URL]`. Android needs no change, since the Play listing
 * serves the test track and production alike. Each build carries the links it
 * was built with, so TestFlight builds keep pointing at TestFlight.
 */
export const NEW_VERSION_LINKS: Record<'ios' | 'android', readonly string[]> = {
  ios: [TESTFLIGHT_APP_URL],
  android: [GOOGLE_PLAY_MARKET_URL, GOOGLE_PLAY_URL],
};

export type Store = 'appStore' | 'googlePlay';

export const STORE_URLS: Record<Store, string> = {
  appStore: APP_STORE_URL,
  googlePlay: GOOGLE_PLAY_URL,
};
