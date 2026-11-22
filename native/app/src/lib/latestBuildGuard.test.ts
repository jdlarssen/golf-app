// native/app/src/lib/latestBuildGuard.test.ts
// Native #2975: Type A. Det nyeste bygget serveren kunngjør
// (`lib/app/latestBuild.ts`) kan aldri ligge over bygget i `app.config.ts`.
// Et tall over det ville vise «Ny versjon er klar.» for et bygg som ikke finnes.
//
// Tallet heves etter at et bygg er ute hos testerne, i en egen PR. Denne testen
// feiler bare hvis noen hever det forbi bygget som står i configen.
import { LATEST_APP_BUILD } from '@/lib/app/latestBuild';
import { MIN_APP_VERSION } from '@/lib/app/minVersion';
import { STORE_ANDROID_VERSION_CODE, STORE_IOS_BUILD_NUMBER } from '../../app.config';

describe('LATEST_APP_BUILD mot byggnummeret i app.config.ts', () => {
  it('ligger ikke over iOS-bygget', () => {
    expect(LATEST_APP_BUILD.ios.latestBuild).toBeLessThanOrEqual(Number(STORE_IOS_BUILD_NUMBER));
  });

  it('ligger ikke over Android-versionCode', () => {
    expect(LATEST_APP_BUILD.android.latestVersionCode).toBeLessThanOrEqual(STORE_ANDROID_VERSION_CODE);
  });

  it('ligger ikke under minstenivået', () => {
    expect(LATEST_APP_BUILD.ios.latestBuild).toBeGreaterThanOrEqual(MIN_APP_VERSION.ios.minBuild);
    expect(LATEST_APP_BUILD.android.latestVersionCode).toBeGreaterThanOrEqual(
      MIN_APP_VERSION.android.minVersionCode,
    );
  });

  it('er positive heltall', () => {
    expect(Number.isInteger(LATEST_APP_BUILD.ios.latestBuild)).toBe(true);
    expect(Number.isInteger(LATEST_APP_BUILD.android.latestVersionCode)).toBe(true);
    expect(LATEST_APP_BUILD.ios.latestBuild).toBeGreaterThan(0);
    expect(LATEST_APP_BUILD.android.latestVersionCode).toBeGreaterThan(0);
  });
});
