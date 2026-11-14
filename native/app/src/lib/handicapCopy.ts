// native/app/src/lib/handicapCopy.ts
// #2297: tekstene i kortet «Sjekk handicapet ditt» og arket «Oppdater handicap».
//
// Kortets ord er webbens (`messages/no.json → game.home.handicapCard`) tegn for
// tegn, og `handicapCopy.test.ts` leser den fila og sammenligner. Arkets ord har
// ingen fasit på nettet (nettet sender deg til profilskjemaet): de står på
// designlerretet, `Hcp-forslag-ark-B-*`.
//
// Den relative tiden («for 5 uker siden») bygges for hånd: Hermes mangler ICU, så
// `Intl.RelativeTimeFormat` er stengt for appen. Testen kjører den ved siden av
// `formatRelativeNb` på ti tidspunkter, som `formatHcpNb` er låst mot webben.
import { formatLongDateNb } from '../../../../lib/format/date';
import type { ProfileSaveFailure } from '../data/profile';
import type { HcpChange } from './hcpRuler';
import { describeProfileSaveFailure, formatHcpNb } from './profileCopy';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

/** «for 1 time siden», «i går», «for 5 uker siden». Samme tersklene som webben. */
export function formatRelativeAgoNb(iso: string, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const ago = (n: number, one: string, many: string) => `for ${n} ${n === 1 ? one : many} siden`;

  if (diff < MINUTE_MS) {
    const n = Math.round(diff / SECOND_MS);
    return n === 0 ? 'nå' : ago(n, 'sekund', 'sekunder');
  }
  if (diff < HOUR_MS) {
    const n = Math.round(diff / MINUTE_MS);
    return ago(n, 'minutt', 'minutter');
  }
  if (diff < DAY_MS) {
    const n = Math.round(diff / HOUR_MS);
    return ago(n, 'time', 'timer');
  }
  if (diff < WEEK_MS) {
    const n = Math.round(diff / DAY_MS);
    if (n === 1) return 'i går';
    if (n === 2) return 'i forgårs';
    return `for ${n} døgn siden`;
  }
  if (diff < MONTH_MS) {
    const n = Math.round(diff / WEEK_MS);
    return n === 1 ? 'forrige uke' : `for ${n} uker siden`;
  }
  const n = Math.round(diff / MONTH_MS);
  return n === 1 ? 'forrige måned' : `for ${n} måneder siden`;
}

/** Kortet før runden. Tittel, knapper og brødtekst er webbens ord. */
export const HANDICAP_CARD_TEXT = {
  title: 'Sjekk handicapet ditt',
  confirm: 'Ja, stemmer',
  pending: 'Lagrer …',
  update: 'Oppdater',
  /** Webbens `body` er «Handicapet ditt er <num>{hcp}</num>, …»; tallet står i halvfet. */
  bodyBefore: 'Handicapet ditt er ',
  /** Resten av setningen, etter tallet. */
  bodyAfter: (relative: string): string => `, sist oppdatert ${relative}. Stemmer det?`,
  /** Hele setningen i ren tekst, til skjermleseren og testene. */
  bodySpoken: (hcp: string, relative: string): string =>
    `Handicapet ditt er ${hcp}, sist oppdatert ${relative}. Stemmer det?`,
} as const;

/** Kvitteringen som står der kortet sto (`Hcp-forslag-oppdatert-*`). */
export const HANDICAP_RECEIPT_TEXT = 'Handicapet ditt er oppdatert.';

/** Arket (`Hcp-forslag-ark-B-*`). */
export const HANDICAP_SHEET_TEXT = {
  title: 'Oppdater handicap',
  close: 'Lukk',
  rulerLabel: 'Handicap',
  enter: 'Skriv inn tallet',
  fieldLabel: 'Nytt handicap',
  save: 'Lagre',
  saving: 'Lagrer …',
  offline: 'Du trenger nett for å lagre.',
  invalid: 'Skriv et tall mellom 0 og 54.',
  failed: 'Noe gikk galt. Prøv igjen.',
} as const;

/** «Sist oppdatert 22. august · 14,2». Uten dato står bare tallet bak ordene. */
export function handicapSheetSubline(updatedAt: string | null, stored: number): string {
  const value = formatHcpNb(stored);
  return updatedAt ? `Sist oppdatert ${formatLongDateNb(updatedAt)} · ${value}` : `Ikke oppdatert ennå · ${value}`;
}

/** «Lagre 13,8». Ugyldig tall gir bare «Lagre», og en pågående lagring «Lagrer …». */
export function handicapSaveLabel(value: number | null, pending: boolean): string {
  if (pending) return HANDICAP_SHEET_TEXT.saving;
  return value === null ? HANDICAP_SHEET_TEXT.save : `${HANDICAP_SHEET_TEXT.save} ${formatHcpNb(value)}`;
}

/** Linja under tallet: «0,4 fra sist». Uendret tall gir ingen linje. */
export function handicapSinceLast(change: HcpChange): string | null {
  return change.direction === 'none' ? null : `${formatHcpNb(change.amount)} fra sist`;
}

/** Det samme i ord for skjermleseren: «0,4 lavere enn sist». */
export function handicapSinceLastSpoken(change: HcpChange): string | null {
  if (change.direction === 'none') return null;
  return `${formatHcpNb(change.amount)} ${change.direction === 'down' ? 'lavere' : 'høyere'} enn sist`;
}

/** Tallet slik skjermleseren sier det: «13,8», og «pluss 0,6» for plusshandicap. */
export function handicapSpoken(signed: number): string {
  const text = formatHcpNb(signed);
  return text.startsWith('+') ? `pluss ${text.slice(1)}` : text;
}

/** Verdien linjalen melder: «13,8, 0,4 lavere enn sist». */
export function handicapRulerValueText(signed: number, change: HcpChange): string {
  const since = handicapSinceLastSpoken(change);
  return since ? `${handicapSpoken(signed)}, ${since}` : handicapSpoken(signed);
}

/** Linja under feltet når tallet ikke går: plusshandicap har sin egen grense. */
export function handicapFieldError(plusOverLimit: boolean, min: number): string {
  return plusOverLimit ? `Plusshandicap kan være opptil ${formatHcpNb(min)}.` : HANDICAP_SHEET_TEXT.invalid;
}

/**
 * Hvorfor lagringen ikke gikk, i arkets ord. Profilskjemaets setninger passer
 * ikke her («lagre profilen», «+-knappen»), så bare «ikke logget inn» lånes.
 */
export function describeHandicapSaveFailure(reason: ProfileSaveFailure): string {
  switch (reason) {
    case 'offline':
    case 'network':
      return HANDICAP_SHEET_TEXT.offline;
    case 'unauthorized':
      return describeProfileSaveFailure('unauthorized');
    default:
      return HANDICAP_SHEET_TEXT.failed;
  }
}
