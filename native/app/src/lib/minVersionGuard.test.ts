// native/app/src/lib/minVersionGuard.test.ts
// Native #2619: Type A. Minstenivået serveren kunngjør (`lib/app/minVersion.ts`)
// kan aldri ligge over bygget vi selv sender. Ellers låser neste deploy ute
// nøyaktig den versjonen som ligger til godkjenning i butikken.
//
// Når et bygg bumpes i `app.config.ts`, trenger ingenting her å endres. Testen
// feiler bare hvis noen HEVER minstenivået forbi bygget som står i configen.
import { MIN_APP_VERSION } from '@/lib/app/minVersion';
import { STORE_ANDROID_VERSION_CODE, STORE_IOS_BUILD_NUMBER } from '../../app.config';

describe('MIN_APP_VERSION mot byggnummeret i app.config.ts', () => {
  it('ligger ikke over iOS-bygget', () => {
    expect(MIN_APP_VERSION.ios.minBuild).toBeLessThanOrEqual(Number(STORE_IOS_BUILD_NUMBER));
  });

  it('ligger ikke over Android-versionCode', () => {
    expect(MIN_APP_VERSION.android.minVersionCode).toBeLessThanOrEqual(
      STORE_ANDROID_VERSION_CODE,
    );
  });

  it('er positive heltall', () => {
    expect(Number.isInteger(MIN_APP_VERSION.ios.minBuild)).toBe(true);
    expect(Number.isInteger(MIN_APP_VERSION.android.minVersionCode)).toBe(true);
    expect(MIN_APP_VERSION.ios.minBuild).toBeGreaterThan(0);
    expect(MIN_APP_VERSION.android.minVersionCode).toBeGreaterThan(0);
  });
});
