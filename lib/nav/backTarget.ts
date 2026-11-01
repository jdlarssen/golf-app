/**
 * Hvor pila på nettet fører (#2746). Regelen står i `docs/user-flows.md` §Tilbake.
 *
 * Svaret kommer fra nettleserens egen liste over historikken (Navigation API),
 * ikke fra en gjetning. #117 prøvde `document.referrer`, som i hjemskjerm-appen
 * på iPhone er appens startadresse hele økta, så gjetningen sa alltid ja. Bruk
 * den aldri til dette. Sammen med lenker som la nye sider oppå ga det løkka som
 * fikk #120 revertert (#121): tavla → hull-oversikt → tavla → pil → hull-oversikt.
 * Lista er trygg fordi den gjenspeiler `replace`, og fordi `traverseTo` flytter
 * deg i historikken uten å legge til noe.
 *
 * Ren modul. `useBackNavigation.ts` kobler den til pila.
 */

export type HistoryEntry = { url: string | null };

const LOCALE_PREFIX = /^\/en(?=\/|$)/;
const HOLE = /^(\/games\/[^/]+\/holes)\/[^/]+$/;

/**
 * Skjermen en adresse viser. Språk og valg etter «?» (netto/brutto) er samme
 * skjerm, og å bla mellom hull er samme skjerm (regel 4).
 */
export function screenKey(url: string): string {
  const path = new URL(url, 'https://tornygolf.no').pathname.replace(LOCALE_PREFIX, '');
  const trimmed = path.length > 1 ? path.replace(/\/$/, '') : path;
  return (trimmed || '/').replace(HOLE, '$1');
}

/**
 * Skjema-sidene: et skjema du har sendt, er borte fra tilbake-veien (regel 3).
 * `redirect` erstatter skjemaet når det sendes, så denne lista gjelder et skjema
 * du gikk fra uten å sende. Mønstrene leser det `screenKey` gir.
 */
export const FORM_SCREENS: readonly RegExp[] = [
  /\/(submit|approve|slett|avslutt|avslutt-likevel|rediger|edit|new|ny|flytt|ta-med-gjest|forlat|meld-av|trekk|trekk-fra|trekk-tilbake)$/,
  /\/(fjern|rolle|trekk|trekk-spiller)\/[^/]+$/,
  /^\/liga\/[^/]+\/godkjenn\//,
  /^\/profile\/slett-konto$/,
  /^\/opprett-spill(\/|$)/,
  /^\/opprett-bane$/,
  /^\/complete-profile$/,
  /^\/klubber\/bli-med\//,
  /^\/venner\/legg-til\//,
];

function isForm(key: string): boolean {
  return FORM_SCREENS.some((pattern) => pattern.test(key));
}

/** Ligger `key` under `current` i adressen, som hullene under et spill? */
function isBelow(key: string, current: string): boolean {
  return key.startsWith(`${current}/`);
}

/**
 * Oppføringen pila skal til, eller `null` når lista ikke har noe å gå til. Da
 * tar lenka over (kald start, varsel, delt lenke).
 */
export function pickBackEntry(entries: readonly HistoryEntry[], currentIndex: number): number | null {
  const url = entries[currentIndex]?.url;
  if (!url) return null;
  const current = screenKey(url);

  // Regel 4: tavla → hull-oversikt → tavla → pil hopper forbi begge kopiene.
  let start = currentIndex;
  for (let i = 0; i < currentIndex; i++) {
    const other = entries[i]?.url;
    if (other && screenKey(other) === current) {
      start = i;
      break;
    }
  }

  for (let i = start - 1; i >= 0; i--) {
    const other = entries[i]?.url;
    if (!other) continue;
    const key = screenKey(other);
    if (key === current || isForm(key) || isBelow(key, current)) continue;
    return i;
  }
  return null;
}
