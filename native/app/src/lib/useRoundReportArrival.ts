// #2632: historien fra pressetribunen kommer ikke samtidig med resultatet.
// Runden avsluttes fra appen, og serveren skriver historien i sveipet
// (`finish-pipeline`) omtrent et minutt senere. Står spilleren på tavla da,
// skal sitatet og kortet dukke opp av seg selv.
//
// Kanalen er den samme som venterommets (`subscribeGameStatus`: UPDATE på
// spillraden). Hver abonnent får sitt eget kanalnavn (`realtime.ts` legger et
// løpenummer på), så den kolliderer ikke med venterommet. Den åpnes bare mens
// den trengs, og lukkes når historien er der, når skjermen mister fokus og
// ved unmount.
import { useEffect } from 'react';
import { subscribeGameStatus } from '../data/realtime';

export function useRoundReportArrival({
  gameId,
  waiting,
  refresh,
}: {
  gameId: string;
  /** Spillet er ferdig, skjermen er i fokus og historien finnes ikke ennå. */
  waiting: boolean;
  /** Henter bundelen på nytt (`useGameBundle`). */
  refresh: () => Promise<void>;
}): void {
  useEffect(() => {
    if (!waiting) return;
    // Postgres Changes spilles ikke av på nytt etter et brudd, så `refresh`
    // leser det bruddet tok.
    return subscribeGameStatus(gameId, {
      onUpdate: () => void refresh(),
      onResubscribed: () => void refresh(),
    });
  }, [gameId, waiting, refresh]);
}
