// #2255 (eierens svar b): Del-knappen øverst til høyre på startbilletten.
//
// Den deler «følg live»-lenka, samme lenke arrangøren deler fra nettsiden
// (`LiveFollowControl`: `/{locale}/spectate/{token}`), med telefonens eget
// delingsark (`Share` i react-native, ingen ny modul). Knappen vises bare når
// arrangøren har slått på live-følging, altså når spillet har et
// `spectate_token`. Spillere har lesetilgang til kolonnen (RLS + kolonnegrant),
// så ingen serverrute trengs.
import { Platform, Share } from 'react-native';
import { TICKET_TEXT } from './ticketCopy';
import { webUrl } from './webLink';

/** Webbens «følg live»-sti for tokenet. Appen er norsk, så locale er `no`. */
export function liveFollowPath(token: string): string {
  return `/no/spectate/${encodeURIComponent(token)}`;
}

export type ShareLiveResult = { ok: true } | { ok: false; reason: 'no-web-base-url' | 'failed' };

/**
 * Kan knappen dele noe? Mangler bygget nettadressen, ville hvert trykk feilet,
 * og da skal knappen ikke stå (aldri en knapp som gjør ingenting, `webLink.ts`).
 */
export function canShareLiveFollow(token: string | null): token is string {
  return token !== null && webUrl(liveFollowPath(token)).ok;
}

/**
 * Åpne delingsarket med lenka. iOS tar teksten og lenka hver for seg; Android
 * har bare `message`, så lenka står i teksten der. Å lukke arket er ikke en feil.
 */
export async function shareLiveFollow(token: string): Promise<ShareLiveResult> {
  const target = webUrl(liveFollowPath(token));
  if (!target.ok) return { ok: false, reason: 'no-web-base-url' };
  try {
    await Share.share(
      Platform.OS === 'ios'
        ? { message: TICKET_TEXT.shareText, url: target.url }
        : { message: `${TICKET_TEXT.shareText} ${target.url}` },
    );
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
