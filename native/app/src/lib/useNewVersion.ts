// native/app/src/lib/useNewVersion.ts
// Native #2975: stripa «Ny versjon er klar.». Ved oppstart og hver gang appen
// kommer i forgrunnen spør den ruta om det nyeste bygget. Er det nyere enn
// bygget som kjører, og har spilleren ikke lukket stripa for det, vises den.
//
// **Stille ved feil.** Nettfeil, timeout og et svar uten tallet gir ingen
// stripe ved oppstart. Et svar vi alt har fått, står til et nytt kommer: en
// senere nettfeil gjør ikke et nytt bygg mindre nytt.
//
// **✕ gjelder ett bygg.** Lukket huskes på telefonen (AsyncStorage, som tema og
// sollys) som byggnummeret stripa ble lukket for. Kommer et enda nyere bygg,
// vises den igjen. «Oppdater» skjuler den ikke: kommer spilleren tilbake uten å
// ha oppdatert, står den der fortsatt, og etter oppdateringen er bygget nytt.
//
// Samme rute som oppdateringsvakta (`useUpdateGuard.ts`); den har sin egen
// takt, og svaret er offentlig og kan caches i fem minutter.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { NEW_VERSION_LINKS } from '@/lib/app/storeLinks';
import { fetchMinVersionBody } from '../data/updateCheck';
import { addForegroundListener } from '../data/syncTriggers';
import { readAppBuild } from './appBuild';
import {
  NEW_VERSION_DISMISSED_KEY,
  parseDismissedBuild,
  readLatestBuild,
  shouldShowNewVersion,
} from './newVersion';
import { openFirstLink } from './openFirstLink';

export type NewVersionState = {
  visible: boolean;
  /** Åpner TestFlight (iOS) eller Play (Android), se `NEW_VERSION_LINKS`. */
  update: () => void;
  /** Skjuler stripa for bygget som er ute nå. */
  dismiss: () => void;
};

export function useNewVersion(enabled: boolean): NewVersionState {
  const [latest, setLatest] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [{ platform, build }] = useState(readAppBuild);

  useEffect(() => {
    if (!enabled || platform === null || build === null) return;
    let stopped = false;

    void AsyncStorage.getItem(NEW_VERSION_DISMISSED_KEY)
      .then((raw) => {
        if (stopped) return;
        const stored = parseDismissedBuild(raw);
        // Et ✕ trykket mens lesingen pågikk, vinner over det lagrede.
        setDismissed((current) => current ?? stored);
      })
      .catch(() => {
        // Uleselig lager: stripa kan vises igjen, ingenting verre.
      });

    const check = async () => {
      const body = await fetchMinVersionBody();
      if (stopped || body === null) return;
      const next = readLatestBuild(body, platform);
      if (next !== null) setLatest(next);
    };

    void check();
    const stopListening = addForegroundListener(() => void check());
    return () => {
      stopped = true;
      stopListening();
    };
  }, [enabled, platform, build]);

  const update = useCallback(() => {
    if (platform === null) return;
    void openFirstLink(NEW_VERSION_LINKS[platform]);
  }, [platform]);

  const dismiss = useCallback(() => {
    if (latest === null) return;
    setDismissed(latest);
    void AsyncStorage.setItem(NEW_VERSION_DISMISSED_KEY, String(latest)).catch(() => {
      // Ikke lagret: stripa er borte nå, og kan komme igjen ved neste oppstart.
    });
  }, [latest]);

  return {
    visible: enabled && shouldShowNewVersion({ build, latest, dismissed }),
    update,
    dismiss,
  };
}
