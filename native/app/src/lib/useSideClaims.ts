// #2283: det flighten har meldt inn på dette hullet, hentet ved fokus, på
// intervall og rett etter egen lagring. Samme modell som wolf- og BBB-valgene
// (`useChoices.ts`): bare server, polling i stedet for realtime, og siste
// vellykkede henting blir stående når en senere feiler.
//
// To ting er annerledes:
//
//  1. **Bare på et konkurransehull.** Uten kortet på hullet fyrer hooken ingen
//     spørring, så en vanlig runde koster ingen nettkall.
//  2. **Svaret hører til hullet.** Spilleren blar mellom hull på samme skjerm;
//     et svar for hull 7 skal aldri vises på hull 8. Hver henting merkes med
//     hullet, og et svar for et annet hull enn det som står nå, regnes som
//     «ikke hentet».
//
// Flightnøkkelen kan bytte midt i runden (#2891, arrangøren flytter deg). Kortet
// kaller derfor `refresh` hver gang arket åpnes, ikke bare når skjermen lastes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchGirClaims, fetchSideClaims, type GirClaim, type SideClaim } from '../data/sideClaims';
import { CHOICES_POLL_MS } from './useChoices';

/** Det én henting fant. Kortene bruker den til å vite hva serveren har etter egen lagring. */
export interface SideClaimsSnapshot {
  side?: SideClaim[];
  gir?: GirClaim[];
}

export interface SideClaimsState {
  /** `undefined` = ikke hentet for dette hullet ennå. Tom liste er et svar. */
  side: SideClaim[] | undefined;
  gir: GirClaim[] | undefined;
  /** Siste henting feilet, og ingen har lyktes for hullet. Raden sier fra. */
  failed: boolean;
  /** Henter på nytt og gir tilbake det som ble hentet, eller `null` når hentingen feilet. */
  refresh: () => Promise<SideClaimsSnapshot | null>;
}

interface Fetched {
  hole: number;
  side: SideClaim[] | undefined;
  gir: GirClaim[] | undefined;
}

export function useSideClaims(
  gameId: string,
  holeNumber: number,
  /** Hvilke tabeller hullet trenger. Begge `false` = ingen henting. */
  need: { side: boolean; gir: boolean },
  pollMs: number = CHOICES_POLL_MS,
): SideClaimsState {
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [failedHole, setFailedHole] = useState<number | null>(null);
  const enabled = need.side || need.gir;

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Nyeste henting vinner (#2094): en poll som gikk ut før lagringen, skal
  // ikke lande over hentingen lagringen utløste.
  const seq = useRef(0);
  const appliedSeq = useRef(0);
  const succeededHole = useRef<number | null>(null);

  const refresh = useCallback(async (): Promise<SideClaimsSnapshot | null> => {
    if (!enabled) return null;
    const mySeq = ++seq.current;
    const hole = holeNumber;
    try {
      const [side, gir] = await Promise.all([
        need.side ? fetchSideClaims(gameId, hole) : Promise.resolve(undefined),
        need.gir ? fetchGirClaims(gameId, hole) : Promise.resolve(undefined),
      ]);
      if (alive.current && mySeq > appliedSeq.current) {
        appliedSeq.current = mySeq;
        succeededHole.current = hole;
        setFetched({ hole, side, gir });
        setFailedHole(null);
      }
      return { side, gir };
    } catch {
      // Forrige svar for hullet står. Har ingen henting lyktes for hullet,
      // sier raden «Fikk ikke hentet».
      if (alive.current && succeededHole.current !== hole) setFailedHole(hole);
      return null;
    }
  }, [enabled, gameId, holeNumber, need.gir, need.side]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      void refresh();
      const interval = setInterval(() => void refresh(), pollMs);
      return () => clearInterval(interval);
    }, [enabled, pollMs, refresh]),
  );

  const current = fetched?.hole === holeNumber ? fetched : null;
  return {
    side: current?.side,
    gir: current?.gir,
    failed: current == null && failedHole === holeNumber,
    refresh,
  };
}
