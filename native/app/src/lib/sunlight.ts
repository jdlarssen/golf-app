// #2252: sollysmodus på hullsiden — valget, lagret på telefonen.
//
// Én nøkkel i AsyncStorage: `'1'` betyr på, og ingen nøkkel betyr av. Valget
// gjelder alle runder til du slår det av, og bare hullsiden leser det.
//
// Verdien bor i et lite lager i minnet, så alle som leser den får samme svar
// med én gang, og `useSunlight()` gir riktig verdi fra første bilde. `App.tsx`
// venter på `loadSunlight()` før splashen slippes, så et hull åpnet senere i
// økta aldri blinker fra mørk til hvit.
//
// All lagring er best-effort, som putt-bryteren: en full disk skal ikke velte
// hullsiden. Feiler lesingen, er sollys av.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUNLIGHT_STORAGE_KEY = 'torny-sunlight';

let current = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Verdien i minnet nå. */
export function getSunlight(): boolean {
  return current;
}

/** Leser valget fra telefonen inn i lageret. Kaster aldri. */
export async function loadSunlight(): Promise<boolean> {
  let next = false;
  try {
    next = (await AsyncStorage.getItem(SUNLIGHT_STORAGE_KEY)) === '1';
  } catch {
    next = false;
  }
  if (next !== current) {
    current = next;
    emit();
  }
  return current;
}

/** Slår sollys på eller av. Skjermen følger med en gang, skrivingen etterpå. */
export function setSunlight(on: boolean): void {
  if (on !== current) {
    current = on;
    emit();
  }
  const write = on
    ? AsyncStorage.setItem(SUNLIGHT_STORAGE_KEY, '1')
    : AsyncStorage.removeItem(SUNLIGHT_STORAGE_KEY);
  write.catch(() => undefined);
}

/** Sollys på eller av, og en ny render når valget endres. */
export function useSunlight(): boolean {
  return useSyncExternalStore(subscribe, getSunlight, () => false);
}
