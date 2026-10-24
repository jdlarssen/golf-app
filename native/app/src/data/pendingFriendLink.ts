// native/app/src/data/pendingFriendLink.ts
// #2627: venne-koden fra lenka som åpnet appen, til navigatoren tar den.
//
// QR-koden på bag-taggen og venne-lenka åpner appen (`lib/friendLinkUrl.ts`).
// Lenka kan komme før noen er logget inn, og da finnes ingen navigator å åpne
// skjermen i. Koden står derfor her: `App.tsx` lytter fra første bilde,
// innloggingen viser en linje om den, og navigatoren tar den når den er
// montert (etter innloggingen, profilen og AI-spørsmålet) og åpner «Bli venn
// med …».
//
// **Bare i minnet.** Koden lagres ikke på telefonen. Avslutter iOS appen mens
// spilleren henter innloggingskoden i e-posten, er lenka borte og må åpnes på
// nytt. Til gjengjeld blir en gammel lenke aldri liggende og dukke opp ved en
// senere innlogging.
import { useSyncExternalStore } from 'react';
import { Linking } from 'react-native';
import { friendCodeFromUrl } from '../lib/friendLinkUrl';

let pending: string | null = null;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of [...listeners]) listener();
}

/** Koden som venter, eller `null`. */
export function pendingFriendCode(): string | null {
  return pending;
}

/** Koden som venter, og fjern den; den gis bare én gang. */
export function takePendingFriendCode(): string | null {
  const code = pending;
  if (code === null) return null;
  pending = null;
  changed();
  return code;
}

/** Si fra når en kode kommer eller tas. Gir tilbake avmeldingen. */
export function subscribePendingFriendCode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Koden som venter, for en skjerm som skal vise at den finnes (innloggingen). */
export function usePendingFriendCode(): string | null {
  return useSyncExternalStore(subscribePendingFriendCode, pendingFriendCode, () => null);
}

/**
 * En lenke som åpnet appen. En venne-lenke blir koden som venter (den siste
 * vinner); alt annet lar den stå. `true` når lenka var en venne-lenke.
 */
export function offerFriendLink(url: string | null | undefined): boolean {
  const code = friendCodeFromUrl(url);
  if (!code) return false;
  pending = code;
  changed();
  return true;
}

/** Det navigatoren skal gjøre med koden som venter (#2627). */
export type FriendLinkStep = 'wait' | 'skip' | 'push';

/**
 * Navigatorens avgjørelse, ren så den kan testes:
 *  - `wait`: navigatoren er ikke klar, eller ingen kode venter. Koden blir
 *    stående, og `onReady` eller neste kode prøver igjen.
 *  - `skip`: «Bli venn med …» står alt øverst med samme kode (lenka kom både
 *    som oppstarts-lenke og som hendelse). Koden brukes opp uten ny skjerm.
 *  - `push`: åpne skjermen med koden.
 */
export function friendLinkStep(
  isReady: boolean,
  currentRoute: { name: string; params?: object } | undefined,
  code: string | null,
): FriendLinkStep {
  if (!isReady || !code) return 'wait';
  const shownCode = (currentRoute?.params as { code?: unknown } | undefined)?.code;
  if (currentRoute?.name === 'FriendLink' && shownCode === code) return 'skip';
  return 'push';
}

/**
 * Lytt etter venne-lenker: lenka som startet appen, og de som kommer mens den
 * er åpen. Gir tilbake avslutningen. En feil i oppslaget velter aldri appen.
 */
export function listenForFriendLinks(): () => void {
  let active = true;
  Linking.getInitialURL()
    .then((url) => {
      if (active) offerFriendLink(url);
    })
    .catch(() => {});
  const subscription = Linking.addEventListener('url', ({ url }) => {
    offerFriendLink(url);
  });
  return () => {
    active = false;
    subscription.remove();
  };
}
