// #2297: ordene på handicapkortet før runden og i arket «Oppdater handicap».
//
// Kortets tekst er webbens (`messages/no.json → game.home.handicapCard`), og
// testen leser fila og krever samme tekst tegn for tegn. Arkets tekst er
// tegningene på designlerretet (`Hcp-forslag-ark-B-*`).
//
// **Ingen Intl her.** Hermes har ikke ICU-dataene, så `Intl.RelativeTimeFormat`
// (som `lib/format/relativeTimeNb.ts` bruker på nettet) finnes ikke i appen.
// {@link formatRelativeAgoNb} skriver de samme ordene selv, og testen kjører
// begge i Node og krever samme svar.
import type { ProfileSaveFailure } from '../data/profile';
import { formatLongDateNb } from '../../../../lib/format/date';
import { HCP_MAX } from '../../../../lib/users/profileInput';
import type { HcpChange } from './hcpRuler';
import { describeProfileSaveFailure, formatHcpNb } from './profileCopy';

export const HANDICAP_TEXT = {
  // --- Kortet (webbens game.home.handicapCard) -----------------------------
  cardTitle: 'Sjekk handicapet ditt',
  confirm: 'Ja, stemmer',
  update: 'Oppdater',
  // --- Arket ---------------------------------------------------------------
  sheetTitle: 'Oppdater handicap',
  close: 'Lukk',
  rulerLabel: 'Handicap',
  typeNumber: 'Skriv inn tallet',
  fieldLabel: 'Nytt handicap',
  save: 'Lagre',
  saving: 'Lagrer …',
  invalidRange: `Skriv et tall mellom 0 og ${HCP_MAX}.`,
  needsNetwork: 'Du trenger nett for å lagre.',
  somethingWrong: 'Noe gikk galt. Prøv igjen.',
  // --- Kvitteringen der kortet sto ----------------------------------------
  receipt: 'Handicapet ditt er oppdatert.',
} as const;

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

function ago(count: number, one: string, many: string): string {
  return `for ${count} ${count === 1 ? one : many} siden`;
}

/**
 * «for 5 uker siden», med de samme tersklene og ordene som webbens
 * `formatRelativeNb` (`nb-NO`, `numeric: 'auto'`): «nå», «i går», «i forgårs»,
 * «forrige uke» og «forrige måned» der Intl gir dem.
 */
export function formatRelativeAgoNb(iso: string, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  if (diff < MINUTE_MS) {
    const seconds = Math.round(diff / SECOND_MS);
    return seconds === 0 ? 'nå' : ago(seconds, 'sekund', 'sekunder');
  }
  if (diff < HOUR_MS) return ago(Math.round(diff / MINUTE_MS), 'minutt', 'minutter');
  if (diff < DAY_MS) return ago(Math.round(diff / HOUR_MS), 'time', 'timer');
  if (diff < WEEK_MS) {
    const days = Math.round(diff / DAY_MS);
    if (days === 1) return 'i går';
    if (days === 2) return 'i forgårs';
    return ago(days, 'døgn', 'døgn');
  }
  if (diff < MONTH_MS) {
    const weeks = Math.round(diff / WEEK_MS);
    return weeks === 1 ? 'forrige uke' : ago(weeks, 'uke', 'uker');
  }
  const months = Math.round(diff / MONTH_MS);
  return months === 1 ? 'forrige måned' : ago(months, 'måned', 'måneder');
}

/**
 * Brødteksten på kortet i tre biter, så tallet kan stå i halvfet:
 * «Handicapet ditt er **14,2**, sist oppdatert for 5 uker siden. Stemmer det?»
 */
export function handicapCardBody(
  hcp: number,
  updatedAt: string,
  nowMs: number = Date.now(),
): { before: string; hcp: string; after: string } {
  return {
    before: 'Handicapet ditt er ',
    hcp: formatHcpNb(hcp),
    after: `, sist oppdatert ${formatRelativeAgoNb(updatedAt, nowMs)}. Stemmer det?`,
  };
}

/** «Sist oppdatert 22. august · 14,2» under arkets tittel. */
export function sheetSubtitle(updatedAt: string, stored: number): string {
  return `Sist oppdatert ${formatLongDateNb(updatedAt)} · ${formatHcpNb(stored)}`;
}

function tenthsNb(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

/** «0,4 fra sist» under tallet, eller `null` når tallet er uendret. */
export function fromLastLine(change: HcpChange): string | null {
  return change.direction === 'none' ? null : `${tenthsNb(change.amount)} fra sist`;
}

/** Tallet slik skjermleseren sier det: «pluss 0,6» for plusshandicap. */
export function spokenHcp(signed: number): string {
  return signed < 0 ? `pluss ${tenthsNb(Math.abs(signed))}` : tenthsNb(signed);
}

/** Linjalens verdi for skjermleseren: «13,8, 0,4 lavere enn sist». */
export function rulerA11yValue(signed: number, change: HcpChange): string {
  if (change.direction === 'none') return spokenHcp(signed);
  const which = change.direction === 'down' ? 'lavere' : 'høyere';
  return `${spokenHcp(signed)}, ${tenthsNb(change.amount)} ${which} enn sist`;
}

/** «Lagre 13,8», eller bare «Lagre» når feltet ikke kan leses. */
export function saveLabel(signed: number | null): string {
  return signed === null ? HANDICAP_TEXT.save : `${HANDICAP_TEXT.save} ${formatHcpNb(signed)}`;
}

/** Linja under feltet når et plusshandicap går forbi linjalens ende. */
export function plusBeyondMinLine(min: number): string {
  return `Plusshandicap kan være opptil ${formatHcpNb(min)}.`;
}

/**
 * Hvorfor lagringen fra kortet eller arket ikke gikk gjennom.
 *
 * Egne setninger, ikke `describeProfileSaveFailure`: den sier «lagre profilen»
 * og nevner +-knappen i profilskjemaet, og ingen av delene finnes her. Bare
 * «logget ut» er den samme, for der er det samme som må gjøres.
 *
 * Uttømmende uten `default`, som søsteren: en ny kode gir en tsc-feil her.
 */
export function describeHandicapSaveFailure(reason: ProfileSaveFailure): string {
  switch (reason) {
    case 'offline':
    case 'network':
      return HANDICAP_TEXT.needsNetwork;
    case 'unauthorized':
      return describeProfileSaveFailure('unauthorized');
    case 'no-web-base-url':
    case 'name_required':
    case 'hcp_invalid':
    case 'gender_required':
    case 'level_invalid':
    case 'update_failed':
      return HANDICAP_TEXT.somethingWrong;
  }
}
