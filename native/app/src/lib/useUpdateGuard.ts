// native/app/src/lib/useUpdateGuard.ts
// Native #2619: oppdateringsvakta. Ved oppstart og hver gang appen kommer i
// forgrunnen spør den serveren om minstenivået, og er bygget under det, vises
// en systemdialog med én knapp som åpner butikken.
//
// Dialogen kan ikke lukkes uten å oppdatere (`cancelable: false` på Android;
// iOS-varsler har bare knappene vi gir dem). Trykket på «Oppdater» åpner
// butikken og lukker varselet, og er bygget fortsatt for gammelt, kommer det
// igjen ved neste forgrunn. Produktvalg A fra #2619; B er en tegnet helskjerm.
import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { APP_STORE_URL, GOOGLE_PLAY_MARKET_URL, GOOGLE_PLAY_URL } from '@/lib/app/storeLinks';
import { fetchMinVersionBody } from '../data/updateCheck';
import { addForegroundListener } from '../data/syncTriggers';
import { readAppBuild } from './appBuild';
import { createUpdateCheck, type StorePlatform } from './updateGuard';
import { UPDATE_GUARD_TEXT } from './updateGuardCopy';

/** Butikklenkene i prøverekkefølge: appen først, nettsiden som reserve. */
const STORE_LINKS: Record<StorePlatform, string[]> = {
  ios: [APP_STORE_URL],
  android: [GOOGLE_PLAY_MARKET_URL, GOOGLE_PLAY_URL],
};

async function openStore(platform: StorePlatform): Promise<void> {
  for (const url of STORE_LINKS[platform]) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // `market://` finnes ikke uten Play-appen; neste lenke er https-reserven.
    }
  }
}

export function useUpdateGuard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const { platform, build } = readAppBuild();
    if (platform === null) return;

    const check = createUpdateCheck({ platform, build, fetchBody: fetchMinVersionBody, now: Date.now });
    let dialogOpen = false;
    let stopped = false;

    const run = async () => {
      const mustUpdate = await check();
      if (stopped || !mustUpdate || dialogOpen) return;
      dialogOpen = true;
      Alert.alert(
        UPDATE_GUARD_TEXT.title,
        UPDATE_GUARD_TEXT.body,
        [
          {
            text: UPDATE_GUARD_TEXT.button,
            onPress: () => {
              dialogOpen = false;
              void openStore(platform);
            },
          },
        ],
        { cancelable: false },
      );
    };

    void run();
    const stopListening = addForegroundListener(() => void run());
    return () => {
      stopped = true;
      stopListening();
    };
  }, [enabled]);
}
