// native/app/src/data/pendingAppLink.ts
// #2627, #2748: lenka som åpnet appen, til navigatoren tar den.
//
// Venne-lenka, QR-koden på bag-taggen og ligalenka åpner appen
// (`lib/appLinkUrl.ts`). Lenka kan komme før noen er logget inn, og da finnes ingen
// navigator å åpne skjermen i. Den står derfor her: `App.tsx` lytter fra første
// bilde, innloggingen viser en linje om den, og navigatoren tar den når den er
// montert (etter innloggingen, profilen og AI-spørsmålet) og åpner skjermen.
//
// **Bare i minnet.** Lenka lagres ikke på telefonen. Avslutter iOS appen mens
// spilleren henter innloggingskoden i e-posten, er lenka borte og må åpnes på
// nytt. Til gjengjeld blir en gammel lenke aldri liggende og dukke opp ved en
// senere innlogging.
import { useSyncExternalStore } from 'react';
import { Linking } from 'react-native';
import { appLinkFromUrl, type AppLink } from '../lib/appLinkUrl';

let pending: AppLink | null = null;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of [...listeners]) listener();
}

/** Lenka som venter, eller `null`. */
export function pendingAppLink(): AppLink | null {
  return pending;
}

/** Lenka som venter, og fjern den; den gis bare én gang. */
export function takePendingAppLink(): AppLink | null {
  const link = pending;
  if (link === null) return null;
  pending = null;
  changed();
  return link;
}

/** Si fra når en lenke kommer eller tas. Gir tilbake avmeldingen. */
export function subscribePendingAppLink(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Lenka som venter, for en skjerm som skal vise at den finnes (innloggingen). */
export function usePendingAppLink(): AppLink | null {
  return useSyncExternalStore(subscribePendingAppLink, pendingAppLink, () => null);
}

/**
 * En lenke som åpnet appen. En av våre lenker blir den som venter (den siste
 * vinner); alt annet lar den stå. `true` når lenka var en av våre.
 */
export function offerAppLink(url: string | null | undefined): boolean {
  const link = appLinkFromUrl(url);
  if (!link) return false;
  pending = link;
  changed();
  return true;
}

/** Skjermen en lenke åpner. Uttømmende: en ny lenketype faller på `tsc`. */
export function appLinkScreen(link: AppLink): { name: 'FriendLink' | 'LeagueJoin'; params: { code: string } } {
  switch (link.kind) {
    case 'friend':
      return { name: 'FriendLink', params: { code: link.code } };
    case 'league':
      return { name: 'LeagueJoin', params: { code: link.code } };
  }
}

/** Det navigatoren skal gjøre med lenka som venter. */
export type AppLinkStep = 'wait' | 'skip' | 'push';

/**
 * Navigatorens avgjørelse, ren så den kan testes:
 *  - `wait`: navigatoren er ikke klar, eller ingen lenke venter. Lenka blir
 *    stående, og `onReady` eller neste lenke prøver igjen.
 *  - `skip`: skjermen står alt øverst med samme kode (lenka kom både som
 *    oppstarts-lenke og som hendelse). Lenka brukes opp uten ny skjerm.
 *  - `push`: åpne skjermen.
 */
export function appLinkStep(
  isReady: boolean,
  currentRoute: { name: string; params?: object } | undefined,
  link: AppLink | null,
): AppLinkStep {
  if (!isReady || !link) return 'wait';
  const screen = appLinkScreen(link);
  const shownCode = (currentRoute?.params as { code?: unknown } | undefined)?.code;
  if (currentRoute?.name === screen.name && shownCode === screen.params.code) return 'skip';
  return 'push';
}

/**
 * Lytt etter lenker: den som startet appen, og de som kommer mens den er åpen.
 * Gir tilbake avslutningen. En feil i oppslaget velter aldri appen.
 */
export function listenForAppLinks(): () => void {
  let active = true;
  Linking.getInitialURL()
    .then((url) => {
      if (active) offerAppLink(url);
    })
    .catch(() => {});
  const subscription = Linking.addEventListener('url', ({ url }) => {
    offerAppLink(url);
  });
  return () => {
    active = false;
    subscription.remove();
  };
}
