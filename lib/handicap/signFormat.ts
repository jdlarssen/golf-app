/**
 * Handicap-VISNING — den Intl-avhengige halvdelen av `./sign`.
 *
 * Skilt ut i #1906: native-appen importerer `fromSignedHcp` fra `./sign` for
 * redigeringsskjemaet, og en verdi-import av `lib/i18n/format` der ville dratt
 * hele Intl-grafen inn i app-bundelen. Hermes har ikke ICU-dataene, så appen
 * formaterer handicap lokalt (`native/app/src/lib/profileCopy.ts`) og låser seg
 * mot disse funksjonene i test i stedet.
 *
 * Fortegns-regelen har fortsatt ETT hjem, og det er `./sign` — funksjonene her
 * komponerer den, de gjentar den ikke.
 */
import type { AppLocale } from '@/i18n/routing';
import { formatNumber } from '@/lib/i18n/format';
import { fromSignedHcp } from './sign';

/**
 * Golfbox-stil visning for live «Lagres som …»-bekreftelsen: «+1,5» for
 * plusshandicap, «12,4» ellers.
 *
 * Echo av det brukeren taster akkurat nå — locale-bevisst desimalskille (norsk
 * «12,4», engelsk «12.4») men UTEN tvungen én-desimal: i motsetning til
 * `formatHcpDisplay` (som viser den kanoniske LAGREDE verdien) speiler denne
 * inputen tro, så «1,25» vises som «1,25», ikke avrundet. `locale` defaulter
 * til 'no' så eldre kall + norsk visning forblir byte-identiske.
 */
export function formatGolfboxHcp(
  magnitude: number,
  isPlus: boolean,
  locale: AppLocale = 'no',
): string {
  const nb = formatNumber(magnitude, locale);
  return isPlus && magnitude !== 0 ? `+${nb}` : nb;
}

/**
 * Locale-bevisst handicap-visning fra en lagret signert verdi (#615).
 *
 * Tar den lagrede signerte hcp-indexen og gir en display-streng med:
 * - locale-riktig desimalskille (norsk «12,2», engelsk «12.2»),
 * - alltid én desimal («8,0», ikke «8»),
 * - golf-konvensjonens «+» på plusshandicap (lagret negativt → «+8,0»),
 * - ingen fortegn på scratch (0 → «0,0»).
 *
 * Komponerer `fromSignedHcp` (fortegn/magnitude) + `formatNumber` (locale-tall).
 * I motsetning til `formatGolfboxHcp` er den både locale-bevisst og garanterer
 * én desimal, så admin-spillerlista matcher resten av appen.
 */
export function formatHcpDisplay(signed: number, locale: AppLocale): string {
  const { magnitude, isPlus } = fromSignedHcp(signed);
  const nb = formatNumber(magnitude, locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return isPlus && magnitude !== 0 ? `+${nb}` : nb;
}
