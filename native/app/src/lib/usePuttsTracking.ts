// Putt-registrering opt-in (#939) i appen — appens motstykke til webbens
// `usePuttsTracking` i holeScreenState.ts.
//
// Bryteren er per SPILL og bor på ENHETEN. Webbens versjon leser
// `torny:putts:<gameId>` fra localStorage; her er det den samme nøkkelformen i
// AsyncStorage. Regelen om hvilke formater som i det hele tatt fanger putter
// er derimot delt kode (`formatCapturesPutts`) — den skal ikke kopieres.
//
// Konsekvensen av å dele nøkkelform, men ikke lager: slår du på putt-føring i
// appen, er den ikke på i nettleseren. Nøyaktig som to nettlesere oppfører seg
// mot hverandre i dag — bryteren har aldri ligget i databasen. Selve
// putte-tallene ligger i `scores.putts`; bryteren styrer bare synligheten.
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Nøkkelen bryteren bor under. `torny:`-prefikset holder den unna supabase-js
 * sine egne nøkler i det samme lageret (samme begrunnelse som `localOwner`).
 */
export function puttsTrackingKey(gameId: string): string {
  return `torny:putts:${gameId}`;
}

export type PuttsTracking = {
  enabled: boolean;
  toggle: () => void;
};

/**
 * Leser og skriver putt-bryteren for ett spill.
 *
 * Utgangspunktet er «av», og lesningen fra AsyncStorage slår den eventuelt på
 * etterpå — samme første-paint-oppførsel som webbens server-snapshot `false`.
 * Blinken går altså én vei: feltet dukker opp, det forsvinner aldri under
 * beina på noen.
 *
 * All lagertilgang er best-effort, som på web: en full disk skal ikke velte
 * hull-skjermen. Verste utfall er at valget ikke huskes til neste gang.
 */
export function usePuttsTracking(gameId: string): PuttsTracking {
  // Tilstanden bærer spillet sitt: da trenger ingen effekt å nullstille den
  // når man bytter spill — et stempel fra forrige spill teller bare ikke.
  const [tracked, setTracked] = useState<{
    gameId: string;
    enabled: boolean;
  } | null>(null);
  const enabled = tracked != null && tracked.gameId === gameId && tracked.enabled;

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(puttsTrackingKey(gameId))
      .then((stored) => {
        if (alive && stored === '1') setTracked({ gameId, enabled: true });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [gameId]);

  const toggle = useCallback(() => {
    const next = !enabled;
    // Tappet skal føles umiddelbart; skrivingen henger etter i bakgrunnen.
    setTracked({ gameId, enabled: next });
    AsyncStorage.setItem(puttsTrackingKey(gameId), next ? '1' : '0').catch(
      () => undefined,
    );
  }, [enabled, gameId]);

  return { enabled, toggle };
}
