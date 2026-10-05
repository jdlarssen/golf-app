// #2201 PR 2: det du åpner i appen, er lest, som på webben.
//
// Skjermen merker sine varsler hver gang den vises (fokus), samme takt som
// skjermenes egen henting fra serveren. Webben merker ved hvert besøk; her er
// et besøk at skjermen kommer øverst igjen, også når du går tilbake til den.
//
// Vakten: står et kall alt og venter (tregt nett), startes ikke et nytt når
// skjermen kommer øverst igjen; to like skrivinger på rad gjør ingenting mer.
// Neste visning etter at kallet er ferdig, merker igjen. Hva som merkes, står
// i `data/markRead.ts`.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef } from 'react';
import type { VisitSurface } from '../../../../lib/notifications/readOnVisit';
import { markVisitRead } from '../data/markRead';

export function useMarkVisitRead(surface: VisitSurface, entityId?: string): void {
  const running = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (running.current) return;
      running.current = true;
      void markVisitRead(surface, entityId).finally(() => {
        running.current = false;
      });
    }, [surface, entityId]),
  );
}
