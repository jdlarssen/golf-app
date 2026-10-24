// native/app/src/lib/friendLinkUrl.ts
// #2627: venne-koden i en lenke som åpnet appen.
//
// To slags lenker åpner appen på «Bli venn med …»:
//  - **Venne-lenka på nettet**, `https://tornygolf.no/venner/legg-til/<kode>`
//    (QR-koden på bag-taggen og «Del lenken din»). Butikkbygget claimer
//    domenet, og AASA-fila slipper bare denne stien gjennom. Verten må likevel
//    være web-adressen bygget peker på: en annen vert skal aldri leses som vår.
//  - **Appens eget skjema**, `<bundle-id>://venner/legg-til/<kode>` (prebuild
//    legger bundle-id-en som skjema på iOS; Android har ikke noe eget skjema i
//    dag, så der er det bare venne-lenka). React Native leverer bare skjemaer appen
//    har registrert, så skjemaet sjekkes ikke. Dev-bygget claimer ikke domenet,
//    og det er slik skjermen bevises der (`xcrun simctl openurl`). Lenka gir
//    ikke mer enn en delt venne-lenke gjør: skjermen spør fortsatt før dere
//    blir venner.
//
// Stien og locale-prefiksene har ett hjem (`lib/friends/friendLinkPath.ts`,
// testet mot nettsidens routing), som AASA-fila også bygger på.
// Koden blir små bokstaver, som RPC-en gjør. Bare bokstaver og tall: alt annet
// er ikke en venne-lenke, og appen åpner som vanlig.
import { FRIEND_LINK_LOCALE_PREFIXES, FRIEND_LINK_PREFIX } from '../../../../lib/friends/friendLinkPath';
import { webBaseUrl } from './webLink';

const ANY_URL = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i;
const AUTHORITY_AND_PATH = /^([^/?#]*)([^?#]*)/;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FRIEND_PATH = new RegExp(
  `^(?:${FRIEND_LINK_LOCALE_PREFIXES.map(escape).join('|')})${escape(FRIEND_LINK_PREFIX)}([0-9A-Za-z]{1,64})/?$`,
);

/** Vert og port i en http(s)-adresse, med små bokstaver, eller `null`. */
function authorityOf(url: string): string | null {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Venne-koden i `url`, eller `null` når lenka ikke er en venne-lenke.
 *
 * @param webBase web-adressen bygget peker på (`EXPO_PUBLIC_WEB_BASE_URL`).
 *   Uten den godtas bare appens eget skjema.
 */
export function friendCodeFromUrl(
  url: string | null | undefined,
  webBase: string | null = webBaseUrl(),
): string | null {
  const match = url ? ANY_URL.exec(url.trim()) : null;
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  let path: string;
  if (scheme === 'http' || scheme === 'https') {
    const [, authority, rest] = AUTHORITY_AND_PATH.exec(match[2]) ?? [];
    const ours = webBase ? authorityOf(webBase) : null;
    if (!ours || authority?.toLowerCase() !== ours) return null;
    path = rest ?? '';
  } else {
    // `skjema://venner/…` har «venner» som vert; stien er resten.
    path = `/${match[2].split(/[?#]/)[0].replace(/^\/+/, '')}`;
  }
  const found = FRIEND_PATH.exec(path);
  return found ? found[1].toLowerCase() : null;
}
