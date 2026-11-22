// native/app/src/lib/openFirstLink.ts
// Native #2975: åpne den første lenka i lista som lar seg åpne. Delt av
// oppdateringsvakta (#2619) og «Oppdater» i arket og på Profil (#2975).
import { Linking } from 'react-native';

/**
 * Prøver lenkene i rekkefølge og stopper ved den første som åpner seg. Sant når
 * en åpnet seg. Kaster aldri: `market://` finnes ikke uten Play-appen, og
 * `itms-beta://` ikke uten TestFlight, så neste lenke er reserven.
 */
export async function openFirstLink(urls: readonly string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // Neste lenke.
    }
  }
  return false;
}
