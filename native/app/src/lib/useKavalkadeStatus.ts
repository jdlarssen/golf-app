// #2265 PR 2: dørene inn i Kavalkaden (Rundedagboka og Hjem) spør serveren om
// status hver gang skjermen kommer i fokus, så banneret bytter fra teaser til
// lenke når datoen passeres uten at appen må startes på nytt. Feil eller ingen
// nett gir `null`, og da vises ingen dør (`fetchKavalkadeStatus`).
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { fetchKavalkadeStatus, type KavalkadeStatus } from '../data/kavalkade';

export function useKavalkadeStatus(): KavalkadeStatus | null {
  const [status, setStatus] = useState<KavalkadeStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchKavalkadeStatus().then((next) => {
        if (!cancelled) setStatus(next);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return status;
}
