/**
 * Hvor pila på nettet fører (#2746). Regelen står i `docs/user-flows.md` §Tilbake.
 *
 * Svaret kommer fra nettleserens egen liste over historikken (Navigation API),
 * ikke fra en gjetning. #117 prøvde `document.referrer`, som i hjemskjerm-appen
 * på iPhone er appens startadresse hele økta, så gjetningen sa alltid ja. Bruk
 * den aldri til dette. Sammen med lenker som la nye sider oppå ga det løkka som
 * fikk #120 revertert (#121): tavla → hull-oversikt → tavla → pil → hull-oversikt.
 * Lista gjenspeiler `replace`, og `traverseTo` flytter deg i historikken uten å
 * legge til noe. Det samme må gjelde reserven: en lenke som legger til en side,
 * gir løkka på nytt, så `useBackNavigation` klatrer med `replace` når svaret her
 * er `null`.
 *
 * Ren modul. `useBackNavigation.ts` kobler den til pila.
 */

export type HistoryEntry = { url: string | null };

const BASE = 'https://tornygolf.no';
const LOCALE_PREFIX = /^\/en(?=\/|$)/;
const HOLE = /^(\/games\/[^/]+\/holes)\/[^/]+$/;

/**
 * Skjermen en adresse viser. Språk og valg etter «?» (netto/brutto) er samme
 * skjerm, og å bla mellom hull er samme skjerm (regel 4).
 */
export function screenKey(url: string): string {
  const path = new URL(url, BASE).pathname.replace(LOCALE_PREFIX, '');
  const trimmed = path.length > 1 ? path.replace(/\/$/, '') : path;
  return (trimmed || '/').replace(HOLE, '$1');
}

const searchOf = (url: string) => new URL(url, BASE).search;

/**
 * Skjemaer som blir stående etter sending, med kvitteringen på samme side. Et
 * godkjent kort skal være borte fra tilbake-veien (regel 3), så de hoppes over.
 * Alle andre skjemaer er borte med `replace` når de sendes, og et du ikke har
 * sendt, er der du kom fra (regel 1). Derfor står bare disse her.
 */
export const STAYS_AFTER_SENDING: readonly RegExp[] = [
  /^\/games\/[^/]+\/approve$/,
  /^\/liga\/[^/]+\/godkjenn\//,
];

function staysAfterSending(key: string): boolean {
  return STAYS_AFTER_SENDING.some((pattern) => pattern.test(key));
}

/** Ligger `key` under `current` i adressen, som hullene under et spill? */
function isBelow(key: string, current: string): boolean {
  return key.startsWith(`${current}/`);
}

/**
 * Står du på en undervisning (`?vis=`, `?del=`, `?tab=`) med forelderen som mål?
 * «Samme skjerm» gjelder valg som netto og brutto, men de har en annen skjerm som
 * mål, så lista ville hoppet over forelderen her. Pila skal gå dit den peker. En
 * pil som peker på seg selv, er ingen undervisning.
 */
export function namesSubView(currentUrl: string, href: string): boolean {
  if (screenKey(currentUrl) !== screenKey(href)) return false;
  return searchOf(currentUrl) !== searchOf(href);
}

/**
 * Er oppføringen pilas egen skjerm, men uten et av valgene pila bærer? Lista skiller
 * ikke på `?`, men kvitteringen for ny bane peker på veiviseren med `bane=`, og den
 * gamle oppføringen mangler den (#2485). Da må pila følge lenka.
 */
export function lacksHrefChoices(entryUrl: string, href: string): boolean {
  if (screenKey(entryUrl) !== screenKey(href)) return false;
  const entry = new URL(entryUrl, BASE).searchParams;
  return [...new URL(href, BASE).searchParams].some(([key, value]) => entry.get(key) !== value);
}

/**
 * Oppføringen pila skal til, eller `null` når lista ikke har noe å gå til. Da
 * tar reserven over (kald start, delt lenke).
 */
export function pickBackEntry(entries: readonly HistoryEntry[], currentIndex: number): number | null {
  const url = entries[currentIndex]?.url;
  if (!url) return null;
  const current = screenKey(url);

  // Regel 4: tavla → hull-oversikt → tavla → pil hopper forbi begge kopiene.
  // Fra den tidligste kopien kan ingen oppføring bak den være samme skjerm.
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
    if (staysAfterSending(key) || isBelow(key, current)) continue;
    return i;
  }
  return null;
}
