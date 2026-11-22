/**
 * The newest native build testers (later: users) can install right now (#2975).
 *
 * `GET /api/app/min-version` serves it next to the minimum, and the app shows
 * the sheet «Versjon … er klar» when its own build is lower. iOS counts in
 * `CFBundleVersion` (`STORE_IOS_BUILD_NUMBER`), Android in `versionCode`
 * (`STORE_ANDROID_VERSION_CODE`), both in `native/app/app.config.ts`.
 *
 * Raise a number ONLY after that build is live for testers on that platform:
 * TestFlight has processed it and the group has it, or Play has published it on
 * the test track. Not when the bump PR merges — review can lag for days, and a
 * sheet that sends testers to a store without the build is worse than none.
 * The two platforms are raised separately for the same reason. The release
 * runbooks (`docs/native/app-store-release.md`, `play-store-release.md`) have
 * the step. `native/app/src/lib/latestBuildGuard.test.ts` keeps each number at
 * or below the build in `app.config.ts`, and the notes within Play's limit.
 */

/** Play caps release notes at 500 characters; the sheet shows the same text. */
export const RELEASE_NOTES_MAX_CHARS = 500;

/**
 * What is new in the latest build, one bullet per line, in Norwegian: the same
 * text testers get in TestFlight and Play. Shown as a list in the app's sheet;
 * an empty list shows the sheet without it. Replace it when the number is
 * raised. Build 14 ships before the sheet exists, so no app shows these.
 */
export const RELEASE_NOTES: readonly string[] = [];

export const LATEST_APP_BUILD = {
  ios: { latestBuild: 14, latestVersion: '1.2.0', notes: RELEASE_NOTES },
  android: { latestVersionCode: 14, latestVersion: '1.2.0', notes: RELEASE_NOTES },
} as const;
