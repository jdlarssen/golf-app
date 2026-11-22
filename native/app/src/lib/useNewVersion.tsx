// native/app/src/lib/useNewVersion.tsx
// Native #2975: «ny versjon er klar». Leverandøren ligger rundt hele appen og
// eier logikken; visningene leser den med `useNewVersion()`:
//  - arket (`components/newVersion/NewVersionSheet.tsx`) når `mode` er `sheet`;
//  - prikken på profil-pillen på Hjem og raden «Oppdater appen» øverst på
//    Profil når `mode` er `reminder`.
// Skal visningen byttes (et kort på Hjem i stedet for arket, for eksempel), er
// det bare visningene som endres. Uten leverandør gir hooken `none`, så skjermer
// i test rendrer som før.
//
// **Når den spør.** Ved oppstart og hver gang appen kommer i forgrunnen. Svaret
// er offentlig og kan caches i fem minutter (samme rute som oppdateringsvakta,
// `useUpdateGuard.ts`, som har sin egen takt).
//
// **Stille ved feil.** Nettfeil, timeout og et svar uten byggnummer gir ingenting
// ved oppstart. Et svar vi alt har fått, står til et nytt kommer: en senere
// nettfeil gjør ikke et nytt bygg mindre nytt.
//
// **Arket vises én gang per bygg.** «Oppdater» og «Senere» lagrer begge bygget
// som sett (AsyncStorage, som tema og sollys). Deretter står påminnelsen til
// appen kjører bygget, og et enda nyere bygg viser arket igjen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NEW_VERSION_LINKS } from '@/lib/app/storeLinks';
import { fetchMinVersionBody } from '../data/updateCheck';
import { addForegroundListener } from '../data/syncTriggers';
import { readAppBuild } from './appBuild';
import {
  NEW_VERSION_SEEN_KEY,
  newVersionMode,
  parseSeenBuild,
  readLatestRelease,
  type LatestRelease,
  type NewVersionMode,
} from './newVersion';
import { openFirstLink } from './openFirstLink';

export type NewVersion = {
  mode: NewVersionMode;
  /** Det nyeste bygget, når serveren har svart. */
  release: LatestRelease | null;
  /** Åpner TestFlight (iOS) eller Play (Android), og lukker arket for bygget. */
  update: () => void;
  /** «Senere»: lukker arket for bygget. Påminnelsen står til appen er oppdatert. */
  later: () => void;
};

const NONE: NewVersion = { mode: 'none', release: null, update: () => {}, later: () => {} };

const NewVersionContext = createContext<NewVersion>(NONE);

export function useNewVersion(): NewVersion {
  return useContext(NewVersionContext);
}

export function NewVersionProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const [seen, setSeen] = useState<number | null>(null);
  const [{ platform, build }] = useState(readAppBuild);

  useEffect(() => {
    if (!enabled || platform === null || build === null) return;
    let stopped = false;

    void AsyncStorage.getItem(NEW_VERSION_SEEN_KEY)
      .then((raw) => {
        if (stopped) return;
        const stored = parseSeenBuild(raw);
        // Et trykk mens lesingen pågikk, vinner over det lagrede.
        setSeen((current) => current ?? stored);
      })
      .catch(() => {
        // Uleselig lager: arket kan vises igjen, ingenting verre.
      });

    const check = async () => {
      const body = await fetchMinVersionBody();
      if (stopped || body === null) return;
      const next = readLatestRelease(body, platform);
      if (next !== null) setRelease(next);
    };

    void check();
    const stopListening = addForegroundListener(() => void check());
    return () => {
      stopped = true;
      stopListening();
    };
  }, [enabled, platform, build]);

  const markSeen = useCallback(() => {
    if (release === null) return;
    setSeen((current) => Math.max(current ?? 0, release.build));
    void AsyncStorage.setItem(NEW_VERSION_SEEN_KEY, String(release.build)).catch(() => {
      // Ikke lagret: arket er borte nå, og kan komme igjen ved neste oppstart.
    });
  }, [release]);

  const update = useCallback(() => {
    if (platform === null) return;
    markSeen();
    void openFirstLink(NEW_VERSION_LINKS[platform]);
  }, [platform, markSeen]);

  const value = useMemo((): NewVersion => {
    const mode = enabled ? newVersionMode({ build, latest: release?.build ?? null, seen }) : 'none';
    return { mode, release, update, later: markSeen };
  }, [enabled, build, release, seen, update, markSeen]);

  return <NewVersionContext.Provider value={value}>{children}</NewVersionContext.Provider>;
}
