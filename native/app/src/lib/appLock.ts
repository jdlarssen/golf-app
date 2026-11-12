// #2841: låsen på appen — valget, lagret på telefonen, og spørsmålet til Face ID.
//
// Valget er én nøkkel i AsyncStorage: `'1'` betyr på, og ingen nøkkel betyr av.
// Det bor på telefonen som sollys (#2252) og temaet (#2256), ikke på serveren,
// og overlever utlogging: låsen hører til telefonen, ikke til kontoen. Uten
// sesjon finnes ingen lås, for Login viser ingen data.
//
// Verdien bor i et lite lager i minnet, så alle som leser den får samme svar
// med én gang. `App.tsx` venter på `loadAppLock()` før splashen slippes, og
// porten (`AppLockGate`) leser lageret ved kaldstart.
//
// ASSUMPTION (kontrakten, 12.11): feiler lesingen, er låsen av. En AsyncStorage
// som ikke svarer er så sjelden at å slippe inn er bedre enn å låse spilleren ute
// av en runde, og ingen utenforstående kan få den til å feile. Skrivingen er
// best-effort, som sollys.
//
// Appen får bare et ja eller nei fra telefonen, aldri ansiktet eller fingeren.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  authenticateAsync,
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync,
  type LocalAuthenticationResult,
} from 'expo-local-authentication';
import { APP_LOCK_TEXT } from './appLockCopy';

export const APP_LOCK_STORAGE_KEY = 'torny-app-lock';

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
export function getAppLock(): boolean {
  return current;
}

/** Leser valget fra telefonen inn i lageret. Kaster aldri. */
export async function loadAppLock(): Promise<boolean> {
  let next = false;
  try {
    next = (await AsyncStorage.getItem(APP_LOCK_STORAGE_KEY)) === '1';
  } catch {
    next = false;
  }
  if (next !== current) {
    current = next;
    emit();
  }
  return current;
}

/** Slår låsen på eller av. Skjermen følger med en gang, skrivingen etterpå. */
export function setAppLock(on: boolean): void {
  if (on !== current) {
    current = on;
    emit();
  }
  const write = on
    ? AsyncStorage.setItem(APP_LOCK_STORAGE_KEY, '1')
    : AsyncStorage.removeItem(APP_LOCK_STORAGE_KEY);
  write.catch(() => undefined);
}

/** Låsen på eller av, og en ny render når valget endres. */
export function useAppLock(): boolean {
  return useSyncExternalStore(subscribe, getAppLock, () => false);
}

/**
 * Svaret fra telefonen:
 *  - `success`: ansiktet, fingeren eller telefonens kode ble godkjent.
 *  - `unavailable`: telefonen har ingenting å spørre med (Face ID og kode er
 *    fjernet etter at låsen ble slått på). En telefon uten kode beskytter ingenting
 *    uansett, så spilleren slippes inn.
 *  - `denied`: avbrutt, ikke gjenkjent eller sperret. Spilleren blir stående på
 *    låseskjermen, og «Lås opp» spør på nytt. Ingen løkke som spør av seg selv.
 */
export type AppLockAnswer = 'success' | 'unavailable' | 'denied';

const UNAVAILABLE_ERRORS: readonly string[] = ['not_enrolled', 'passcode_not_set', 'not_available'];

/** Ren oversettelse av svaret fra `authenticateAsync`. */
export function answerFromResult(result: LocalAuthenticationResult): AppLockAnswer {
  if (result.success) return 'success';
  return UNAVAILABLE_ERRORS.includes(result.error) ? 'unavailable' : 'denied';
}

/**
 * Spør telefonen. `disableDeviceFallback: false` lar telefonens egen kode virke
 * når ansiktet ikke blir kjent igjen eller Face ID er sperret.
 *
 * ASSUMPTION: kaster det native laget, slippes spilleren inn (`unavailable`).
 * Et unntak betyr at telefonen ikke kan spørre, ikke at noen svarte nei, og en
 * knapp som aldri kan lykkes ville låst spilleren ute for godt.
 */
export async function askForUnlock(): Promise<AppLockAnswer> {
  try {
    const result = await authenticateAsync({
      promptMessage: APP_LOCK_TEXT.promptMessage,
      cancelLabel: APP_LOCK_TEXT.cancelLabel,
      disableDeviceFallback: false,
    });
    return answerFromResult(result);
  } catch (err) {
    console.error('[appLock] spørsmålet kunne ikke stilles', err);
    return 'unavailable';
  }
}

/** Hva telefonen kan, og om noe er registrert. */
export type AppLockSupport = {
  types: number[];
  enrolled: boolean;
};

/** `null` når telefonen ikke har maskinvare (raden skjules) eller ikke svarer. Kaster aldri. */
export async function readAppLockSupport(): Promise<AppLockSupport | null> {
  try {
    if (!(await hasHardwareAsync())) return null;
    const [types, enrolled] = await Promise.all([
      supportedAuthenticationTypesAsync(),
      isEnrolledAsync(),
    ]);
    return { types, enrolled };
  } catch {
    return null;
  }
}
