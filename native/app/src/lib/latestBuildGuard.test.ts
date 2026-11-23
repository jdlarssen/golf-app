// native/app/src/lib/latestBuildGuard.test.ts
// Native #2975: Type A. Det nyeste bygget serveren kunngjør
// (`lib/app/latestBuild.ts`) kan aldri ligge over bygget i `app.config.ts`.
// Et tall over det ville vise «Ny versjon er klar.» for et bygg som ikke finnes.
//
// Tallet heves etter at et bygg er ute hos testerne, i en egen PR. Denne testen
// feiler bare hvis noen hever det forbi bygget som står i configen, eller
// nyhetene blir lengre enn Play tar imot.
import { LATEST_APP_BUILD, RELEASE_NOTES_MAX_CHARS } from '@/lib/app/latestBuild';
import { MIN_APP_VERSION } from '@/lib/app/minVersion';
import { STORE_ANDROID_VERSION_CODE, STORE_IOS_BUILD_NUMBER, STORE_VERSION } from '../../app.config';

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

  it('har samme versjon som configen når tallet er bygget i configen', () => {
    if (LATEST_APP_BUILD.ios.latestBuild === Number(STORE_IOS_BUILD_NUMBER)) {
      expect(LATEST_APP_BUILD.ios.latestVersion).toBe(STORE_VERSION);
    }
    if (Number(LATEST_APP_BUILD.android.latestVersionCode) === Number(STORE_ANDROID_VERSION_CODE)) {
      expect(LATEST_APP_BUILD.android.latestVersion).toBe(STORE_VERSION);
    }
    expect(LATEST_APP_BUILD.ios.latestVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(LATEST_APP_BUILD.android.latestVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each([
    ['iOS', LATEST_APP_BUILD.ios.notes],
    ['Android', LATEST_APP_BUILD.android.notes],
  ])('har nyheter for %s på høyst 500 tegn, som Play tar imot, og ingen tomme linjer', (_platform, notes) => {
    expect(notes.join('\n').length).toBeLessThanOrEqual(RELEASE_NOTES_MAX_CHARS);
    for (const line of notes) expect(line.trim()).not.toBe('');
  });
});
