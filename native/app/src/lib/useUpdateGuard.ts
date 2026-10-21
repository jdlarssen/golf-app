// native/app/src/lib/useUpdateGuard.ts
// Native #2619: oppdateringsvakta. Ved oppstart og hver gang appen kommer i
// forgrunnen spør den serveren om minstenivået, og er bygget under det, vises
// en systemdialog med én knapp som åpner butikken.
//
// Dialogen kan ikke lukkes uten å oppdatere (`cancelable: false` på Android;
// iOS-varsler har bare knappene vi gir dem). Trykket på «Oppdater» åpner
// butikken og lukker varselet, og er bygget fortsatt for gammelt, kommer det
// igjen ved neste forgrunn. Produktvalg A fra #2619; B er en tegnet helskjerm.
//
// To Android-tilfeller der varselet likevel kan forsvinne uten trykk:
//  - Kommer svaret mens appen ikke er i forgrunnen (telefonen ble låst), køer RN
//    varselet uten `cancelable`. Derfor vises det bare når appen er aktiv; ellers
//    viser forgrunnslytteren det fra det lagrede svaret.
//  - Et annet varsel kan erstatte det, eller Tilbake kan lukke det. `onDismiss`
//    åpner det på nytt.
import { useEffect } from 'react';
import { Alert, AppState, Linking } from 'react-native';
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

/** Sant når en av lenkene åpnet seg. */
async function openStore(platform: StorePlatform): Promise<boolean> {
  for (const url of STORE_LINKS[platform]) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // `market://` finnes ikke uten Play-appen; neste lenke er https-reserven.
    }
  }
  return false;
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
      if (AppState.currentState !== 'active') return;
      dialogOpen = true;
      Alert.alert(
        UPDATE_GUARD_TEXT.title,
        UPDATE_GUARD_TEXT.body,
        [
          {
            text: UPDATE_GUARD_TEXT.button,
            onPress: () => {
              dialogOpen = false;
              // Åpnet ingen av lenkene seg, er spilleren like langt: vis dialogen igjen.
              void openStore(platform).then((opened) => {
                if (!opened) void run();
              });
            },
          },
        ],
        {
          cancelable: false,
          onDismiss: () => {
            dialogOpen = false;
            void run();
          },
        },
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
