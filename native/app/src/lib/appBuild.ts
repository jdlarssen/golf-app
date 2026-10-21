// native/app/src/lib/appBuild.ts
// Native #2619: hvilket bygg som kjører. Brukes av oppdateringsvakta (er bygget
// under minstenivået?) og av `webApi.ts` (versjons-headerne på hvert kall).
//
// Tallene leses fra den oppløste configen i `expo-constants`: samme verdier som
// `STORE_VERSION`, `STORE_IOS_BUILD_NUMBER` og `STORE_ANDROID_VERSION_CODE` i
// `app.config.ts` setter inn ved bygging. Ukjent (dev uten byggnummer, Expo Go,
// web) er `null`, aldri et gjettet tall.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { StorePlatform } from './updateGuard';

export type AppBuild = {
  platform: StorePlatform | null;
  /** Semver, f.eks. `1.2.0`. */
  version: string | null;
  /** `CFBundleVersion` (iOS) eller `versionCode` (Android). */
  build: number | null;
};

/** Byggnummer som positivt heltall, ellers `null`. Tar både `"5"` og `5`. */
export function parseBuild(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    return parsed > 0 ? parsed : null;
  }
  return null;
}

export function readAppBuild(): AppBuild {
  const platform: StorePlatform | null =
    Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
  const config = Constants.expoConfig;
  const version = typeof config?.version === 'string' && config.version !== '' ? config.version : null;
  const build =
    platform === 'ios'
      ? parseBuild(config?.ios?.buildNumber)
      : platform === 'android'
        ? parseBuild(config?.android?.versionCode)
        : null;
  return { platform, version, build };
}

/**
 * Headerne som følger hvert kall mot web-deployen. Serveren leser dem ikke
 * ennå; de er for logging og for neste trinn. Det som er ukjent, utelates.
 */
export function appVersionHeaders(): Record<string, string> {
  const { version, build } = readAppBuild();
  return {
    ...(version !== null ? { 'X-Torny-App-Version': version } : {}),
    ...(build !== null ? { 'X-Torny-App-Build': String(build) } : {}),
  };
}
