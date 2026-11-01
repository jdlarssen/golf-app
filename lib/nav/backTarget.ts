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
 * du gikk fra uten å sende. Det har en pris: gikk du fra et usendt skjema via en
 * side som ikke peker dit, hopper pila over det. Derfor står bare skjemaer her,
 * ikke invitasjoner (bli-med, venne-lenka), som du skal kunne gå tilbake til.
 * Mønstrene leser det `screenKey` gir.
 */
export const FORM_SCREENS: readonly RegExp[] = [
  /\/(submit|approve|slett|avslutt|avslutt-likevel|rediger|edit|new|ny|flytt|ta-med-gjest|forlat|meld-av|trekk|trekk-fra|trekk-tilbake)$/,
  /\/(fjern|rolle|trekk|trekk-spiller)\/[^/]+$/,
  /^\/liga\/[^/]+\/godkjenn\//,
  /^\/profile\/slett-konto$/,
  /^\/opprett-spill(\/|$)/,
  /^\/opprett-bane$/,
  /^\/complete-profile$/,
  /^\/foreslaa-ide$/,
  /^\/liga\/[^/]+\/runde\/[^/]+\/spill$/,
  /\/cup\/[^/]+\/(generer|oppsett)$/,
];

function isForm(key: string): boolean {
  return FORM_SCREENS.some((pattern) => pattern.test(key));
}

/** Ligger `key` under `current` i adressen, som hullene under et spill? */
function isBelow(key: string, current: string): boolean {
  return key.startsWith(`${current}/`);
}

/**
 * Peker pila på skjermen du står på? Da står du på en undervisning (`?vis=`,
 * `?del=`, `?tab=`) med forelderen som mål. «Samme skjerm» gjelder valg som
 * netto og brutto, men de har en annen skjerm som mål, så lista ville hoppet
 * over forelderen her. Pila skal gå dit den peker.
 */
export function namesSameScreen(currentUrl: string, href: string): boolean {
  return screenKey(currentUrl) === screenKey(href);
}

/**
 * Oppføringen pila skal til, eller `null` når lista ikke har noe å gå til. Da
 * tar reserven over (kald start, delt lenke). `href` er pilas eget mål: det er
 * aldri et gammelt skjema, selv om adressen står i `FORM_SCREENS` (veiviseren →
 * «Opprett ny bane» → pil skal tilbake til veiviseren, #2485).
 */
export function pickBackEntry(
  entries: readonly HistoryEntry[],
  currentIndex: number,
  href?: string,
): number | null {
  const url = entries[currentIndex]?.url;
  if (!url) return null;
  const current = screenKey(url);
  const target = href === undefined ? null : screenKey(href);

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
    if ((isForm(key) && key !== target) || isBelow(key, current)) continue;
    return i;
  }
  return null;
}
