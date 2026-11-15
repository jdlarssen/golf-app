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
//
// Hver henting får et løpenummer når den går ut. `snapshotSeq` er nummeret på
// hentingen som står på skjermen, og `startedSeq()` nummeret på den siste som
// har gått ut. Kortene bruker dem til å holde et lagret trykk til det kommer et
// svar fra en henting som startet etter lagringen (eierens valg B, 15.11):
// serveren er fasit, men et trykk flimrer ikke tilbake fordi én henting feilet.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchGirClaims, fetchSideClaims, type GirClaim, type SideClaim } from '../data/sideClaims';
import { CHOICES_POLL_MS } from './useChoices';

export interface SideClaimsState {
  /** `undefined` = ikke hentet for dette hullet ennå. Tom liste er et svar. */
  side: SideClaim[] | undefined;
  gir: GirClaim[] | undefined;
  /** Siste henting feilet, og ingen har lyktes for hullet. Raden sier fra. */
  failed: boolean;
  refresh: () => Promise<void>;
  /** Løpenummeret til hentingen som står nå; 0 før noen har lyktes for hullet. */
  snapshotSeq: number;
  /** Løpenummeret til den siste hentingen som har gått ut. */
  startedSeq: () => number;
}

interface Fetched {
  hole: number;
  seq: number;
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

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const mySeq = ++seq.current;
    const hole = holeNumber;
    try {
      const [side, gir] = await Promise.all([
        need.side ? fetchSideClaims(gameId, hole) : Promise.resolve(undefined),
        need.gir ? fetchGirClaims(gameId, hole) : Promise.resolve(undefined),
      ]);
      if (!alive.current || mySeq <= appliedSeq.current) return;
      appliedSeq.current = mySeq;
      succeededHole.current = hole;
      setFetched({ hole, seq: mySeq, side, gir });
      setFailedHole(null);
    } catch {
      // Forrige svar for hullet står. Har ingen henting lyktes for hullet,
      // sier raden «Fikk ikke hentet».
      if (alive.current && succeededHole.current !== hole) setFailedHole(hole);
    }
  }, [enabled, gameId, holeNumber, need.gir, need.side]);

  const startedSeq = useCallback(() => seq.current, []);

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
    snapshotSeq: current?.seq ?? 0,
    startedSeq,
  };
}
