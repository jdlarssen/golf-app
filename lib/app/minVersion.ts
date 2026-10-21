/**
 * The oldest native build the server still promises to work with (#2619).
 *
 * One home for the number: `GET /api/app/min-version` serves it and the app's
 * update guard compares its own build against it. iOS counts in
 * `CFBundleVersion` (`STORE_IOS_BUILD_NUMBER`), Android in `versionCode`
 * (`STORE_ANDROID_VERSION_CODE`), both in `native/app/app.config.ts`.
 *
 * Raise a number ONLY when a server change breaks older builds (a route or RPC
 * the app calls changes shape). Raising it makes every build below it show an
 * "update" dialog it cannot close, so never raise it past a build that is not
 * live in the store yet. `native/app/src/lib/minVersionGuard.test.ts` keeps it
 * from passing the build in `app.config.ts`.
 */
export const MIN_APP_VERSION = {
  ios: { minBuild: 1 },
  android: { minVersionCode: 1 },
} as const;
