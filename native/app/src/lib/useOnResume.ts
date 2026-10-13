// #2228: «appen kom tilbake» — i forgrunnen etter en pause, eller med nett
// igjen. Ett hjem for begge lytterne, så ingen skjerm limer inn sin egen kopi.
//
// Lytterne registreres bare mens skjermen har fokus og ryddes ved blur. Da
// henter bare skjermen spilleren ser på: tre skjermer i stacken gir ikke tre
// nettkall når telefonen tas opp av lomma. Fokus i seg selv er kalleren sitt
// ansvar (de fleste henter alt ved fokus); denne hooken dekker det fokus ikke
// fanger, siden en app som kommer i forgrunnen ikke gir nytt fokus.
import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { addForegroundListener, addOnlineListener } from '../data/syncTriggers';

/**
 * Kall `callback` når appen kommer i forgrunnen og når nettet er tilbake,
 * så lenge skjermen har fokus. `callback` bør være stabil (`useCallback`),
 * ellers registreres lytterne på nytt ved hver render.
 */
export function useOnResume(callback: () => unknown): void {
  useFocusEffect(
    useCallback(() => {
      const run = () => {
        void callback();
      };
      const removeForeground = addForegroundListener(run);
      const removeOnline = addOnlineListener(run);
      return () => {
        removeForeground();
        removeOnline();
      };
    }, [callback]),
  );
}
