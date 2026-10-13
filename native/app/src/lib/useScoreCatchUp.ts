// #2228: slagene hentes inn igjen der spilleren ser dem. Ett hjem for det fem
// skjermer før hadde hver sin kopi av (hull-siden, tavla, spill-hjem,
// godkjenningen og scorekortet).
//
// Seeden kjører ved fokus (som også dekker åpningen), når appen kommer i
// forgrunnen og når nettet er tilbake (`useOnResume`), som webbens `catchUp` på
// focus og online (#1980). Overlever realtime-sokkelen bakgrunnen, blir det
// ingen resubscribe, og det makkeren førte i mellomtiden kommer aldri som en
// hendelse. Uten seeden ved forgrunn ble hullene hans stående tomme.
//
// Egen fil, så `useGameData.ts` ikke drar inn `data/realtime` og
// `data/seedScores`.
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { subscribeGameScores } from '../data/realtime';
import { seedGameScores } from '../data/seedScores';
import { useOnResume } from './useOnResume';

/**
 * @param reload leser den lokale basen på nytt (`useLocalScores`).
 * @param opts.live abonner også på spillets realtime-kanal: hver merge leser
 *   basen på nytt, og en kanal som er tilbake etter et brudd seeder (#2093).
 *   Én kanal per spill, i en vanlig effekt og ikke per fokus (#1366).
 * @returns `seedFailed`: siste henting feilet (typisk uten nett). Tavla sier
 *   det med en linje, så et resultat fra bare telefonens slag ikke ser ferdig ut.
 */
export function useScoreCatchUp(
  gameId: string,
  reload: () => Promise<void>,
  opts: { live?: boolean } = {},
): { seedFailed: boolean } {
  const live = opts.live ?? false;
  const [seedFailed, setSeedFailed] = useState(false);

  // Kjeden avviser aldri: en feilet henting lar de lokale radene stå, og
  // basen leses uansett.
  const seed = useCallback(() => {
    void seedGameScores(gameId)
      .then(
        () => setSeedFailed(false),
        () => setSeedFailed(true),
      )
      .then(() => reload())
      .catch((err: unknown) => {
        console.error('[useScoreCatchUp] reload', err);
      });
  }, [gameId, reload]);

  // Kanalen først, så seeden, i samme rekkefølge som før: en rad som lander
  // mens seeden går, kommer da som en merge.
  useEffect(() => {
    if (!live) return;
    return subscribeGameScores(gameId, {
      onMerge: () => {
        void reload();
      },
      onResubscribed: seed,
    });
  }, [gameId, reload, seed, live]);

  useFocusEffect(seed);
  useOnResume(seed);

  return { seedFailed };
}
