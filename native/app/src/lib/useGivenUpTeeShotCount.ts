// #2580: hvor mange utslag for spillet som er gitt opp i køen (karantene etter
// et avslag eller etter taket), speil av webbens `useGivenUpTeeShotCount`.
// Hullsiden følger antallet og henter bundelen på nytt når det øker, uansett
// hvilken drain som fant det: serveren vet da noe siden ikke vet, typisk at et
// kort på laget er levert, og leveringslåsen må stemme.
import { useEffect, useState } from 'react';
import { belongsToGame } from '../../../../lib/sync/queueScope';
import { getDb, listTeeShotQueue } from '../data/db';

/** `undefined` til køen er lest, eller når spillet ikke har innstillingen. */
export function useGivenUpTeeShotCount(
  gameId: string,
  opts: { enabled: boolean; pollMs?: number },
): number | undefined {
  const { enabled, pollMs } = opts;
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // En feilet lesing lar forrige tall stå: et hull i lesingen er ikke en økning.
    const tick = async () => {
      try {
        const items = await listTeeShotQueue(await getDb());
        if (!cancelled) {
          setCount(items.filter((item) => item.abandonedAt != null && belongsToGame(item.teeShotId, gameId)).length);
        }
      } catch (err: unknown) {
        console.error('[useGivenUpTeeShotCount] lesing feilet', err);
      }
    };
    void tick();
    const interval = pollMs ? setInterval(() => void tick(), pollMs) : null;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [enabled, pollMs, gameId]);

  return enabled ? count : undefined;
}
