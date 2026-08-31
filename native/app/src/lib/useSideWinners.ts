// Native sideturnering (#1850): LD/CTP-vinnerne inn i resultatskjermen.
//
// Søsteren til `useChoices`, men med to forskjeller som følger av dataene:
//
//  1. **Ingen polling.** Vinnerne skrives ÉN gang, i avslutt-flyten på
//     nettsiden (`endGameCore`-upserten før status-flippen), og står deretter
//     stille. Et intervall ville spurt om noe som ikke kan endre seg. Henting
//     ved fokus holder — og gir samtidig et nytt forsøk når spilleren kommer
//     tilbake til skjermen med nettet i orden.
//  2. **«Aldri lyktes» rapporteres oppover.** `fetchSideWinners` kaster ved
//     feil nettopp så en feilet henting ikke kan forveksles med «ingen ble
//     kåret». Skjermen må vite forskjellen: hver slot er verdt 2p, så en
//     poengtabell uten vinnerradene viser feil totaler med autoritativ mine.
//     Har ingen henting lyktes, sier seksjonen fra i stedet.
//
// Hooken fyrer ingenting når `enabled` er false — et aktivt spill skal ikke
// koste et nettkall for data det ikke får lov å vise uansett.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchSideWinners, type SideWinnerRow } from '../data/sideWinners';

export interface SideWinnersState {
  /** Kårede slots. Tom liste er et gyldig svar («ingen ble kåret»). */
  rows: SideWinnerRow[];
  /**
   * `true` til den FØRSTE hentingen har lyktes. Skilles fra en tom liste med
   * vilje — se fil-kommentaren.
   */
  neverLoaded: boolean;
}

/**
 * LD/CTP-vinnerne for spillet, hentet ved fokus.
 *
 * @param enabled Skal det hentes i det hele tatt? Kalleren setter den til
 *   «avsluttet spill med sideturnering på, format ikke gatet» — de samme tre
 *   betingelsene som avgjør om seksjonen vises.
 */
export function useSideWinners(
  gameId: string,
  enabled: boolean,
): SideWinnersState {
  const [state, setState] = useState<SideWinnersState>({
    rows: [],
    neverLoaded: true,
  });

  // Skjermen kan forsvinne mens spørringen er i lufta; da skal svaret falle på
  // gulvet i stedet for å lande i en avmontert komponent.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const rows = await fetchSideWinners(gameId);
      if (alive.current) setState({ rows, neverLoaded: false });
    } catch {
      // Lar forrige svar stå. Har vi aldri hatt noe, blir `neverLoaded`
      // stående true, og seksjonen viser den ærlige noten.
    }
  }, [enabled, gameId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return state;
}
