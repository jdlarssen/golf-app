// native/app/src/lib/appLinkUrl.ts
// #2627, #2748: hva en lenke som åpnet appen, peker på.
//
// To slags lenker åpner appen:
//  - **Lenkene på nettet**, `https://tornygolf.no/venner/legg-til/<kode>` (QR-koden
//    på bag-taggen og «Del lenken din») og `https://tornygolf.no/liga/bli-med/<kode>`
//    («Del lenka» på ligasiden). Butikkbygget gjør krav på domenet, og lista over
//    stier står i `lib/appLinks/appLinkPaths.ts`. Verten må likevel være web-adressen
//    bygget peker på: en annen vert skal aldri leses som vår. Unntaket er `www` i
//    bygget som peker på prod. Knappen «Åpne i appen» på nettsiden lenker dit, fordi
//    Safari holder lenker til samme domene inne.
//  - **Appens eget skjema**, `<bundle-id>://venner/legg-til/<kode>` (prebuild
//    legger bundle-id-en som skjema på iOS; Android har ikke noe eget skjema i
//    dag, så der er det bare lenkene på nettet). React Native leverer bare skjemaer
//    appen har registrert, så skjemaet sjekkes ikke. Dev-bygget gjør ikke krav på
//    domenet, og det er slik skjermene bevises der (`xcrun simctl openurl`). Lenka
//    gir ikke mer enn en delt lenke gjør: skjermen spør fortsatt før noe skjer.
//
// Alt annet er ikke en av våre lenker, og appen åpner som vanlig. Venne-koden blir
// små bokstaver, som RPC-en gjør. Ligakoden har én form (`isJoinCode`), og nettsiden
// svarer 404 på alt annet.
import { LEAGUE_LINK_PREFIX } from '../../../../lib/appLinks/appLinkPaths';
import { FRIEND_LINK_LOCALE_PREFIXES, FRIEND_LINK_PREFIX } from '../../../../lib/friends/friendLinkPath';
import { isJoinCode } from '../../../../lib/league/joinCode';
import { webBaseUrl } from './webLink';

/** Det en lenke peker på. */
export type AppLink = { kind: 'friend'; code: string } | { kind: 'league'; code: string };

/** `STORE_WEB_BASE_URL` og `www`-verten i `app.config.ts`; testen holder dem like. */
const STORE_WEB_BASE = 'https://tornygolf.no';
const STORE_WWW_AUTHORITY = 'www.tornygolf.no';

const ANY_URL = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i;
const AUTHORITY_AND_PATH = /^([^/?#]*)([^?#]*)/;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LOCALES = FRIEND_LINK_LOCALE_PREFIXES.map(escape).join('|');
const FRIEND_PATH = new RegExp(`^(?:${LOCALES})${escape(FRIEND_LINK_PREFIX)}([0-9A-Za-z]{1,64})/?$`);
const LEAGUE_PATH = new RegExp(`^(?:${LOCALES})${escape(LEAGUE_LINK_PREFIX)}([^/]+)/?$`);

/** Vert og port i en http(s)-adresse, med små bokstaver, eller `null`. */
function authorityOf(url: string): string | null {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

/** Vertene som regnes som våre i dette bygget. */
function ourAuthorities(webBase: string | null): readonly string[] {
  const own = webBase ? authorityOf(webBase) : null;
  if (!own) return [];
  return webBase === STORE_WEB_BASE ? [own, STORE_WWW_AUTHORITY] : [own];
}

/**
 * Det `url` peker på, eller `null` når den ikke er en av våre lenker.
 *
 * @param webBase web-adressen bygget peker på (`EXPO_PUBLIC_WEB_BASE_URL`).
 *   Uten den godtas bare appens eget skjema.
 */
export function appLinkFromUrl(
  url: string | null | undefined,
  webBase: string | null = webBaseUrl(),
): AppLink | null {
  const match = url ? ANY_URL.exec(url.trim()) : null;
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  let path: string;
  if (scheme === 'http' || scheme === 'https') {
    const [, authority, rest] = AUTHORITY_AND_PATH.exec(match[2]) ?? [];
    if (!authority || !ourAuthorities(webBase).includes(authority.toLowerCase())) return null;
    path = rest ?? '';
  } else {
    // `skjema://venner/…` har «venner» som vert; stien er resten.
    path = `/${match[2].split(/[?#]/)[0].replace(/^\/+/, '')}`;
  }
  const friend = FRIEND_PATH.exec(path);
  if (friend) return { kind: 'friend', code: friend[1].toLowerCase() };
  const league = LEAGUE_PATH.exec(path);
  return league && isJoinCode(league[1]) ? { kind: 'league', code: league[1] } : null;
}
