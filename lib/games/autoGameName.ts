import type { AppLocale } from '@/i18n/routing';
import { intlLocaleTag } from '@/lib/i18n/format';

const NORWEGIAN_MONTHS = [
  'januar',
  'februar',
  'mars',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'desember',
] as const;

export interface SuggestGameNameInput {
  /** Bane-navn fra valgt course. `null` eller `''` returnerer tom streng. */
  courseName: string | null;
  /** `datetime-local`-format `'YYYY-MM-DDTHH:mm'`, eller `''` for ingen tee-off. */
  scheduledTeeOffAt: string;
  /**
   * Active app locale. Defaults to 'no' so existing call-sites compile and
   * behave identically until a later chunk passes the locale explicitly.
   * 'no' output is byte-identical to the pre-i18n behavior.
   */
  locale?: AppLocale;
}

/**
 * Bygger forslag til spillnavn ut fra valgt bane og tee-off-tid. Brukes av
 * GameWizard for å pre-fylle navn-feltet på steg 4 så admin slipper å skrive
 * det i hånd. Returnerer tom streng når bane ikke er valgt — wizard-en sikrer
 * at steg 4 ikke kan publisere før admin har skrevet inn et navn manuelt.
 *
 * Norske måneder lowercase (`mai`, ikke `Mai`) per norsk skriftspråk.
 *
 * @param locale - Active app locale ('no' | 'en'). Defaults to 'no'.
 *   'no': byte-identical to legacy output — "${courseName} ${day}. ${month}".
 *   'en': idiomatic en-GB style — "${courseName} ${day} ${Month}" (capitalised,
 *         no ordinal dot), month derived via Intl.DateTimeFormat.
 */
export function suggestGameName({
  courseName,
  scheduledTeeOffAt,
  locale = 'no',
}: SuggestGameNameInput): string {
  if (!courseName) return '';
  if (!scheduledTeeOffAt) return courseName;
  const date = new Date(scheduledTeeOffAt);
  if (Number.isNaN(date.getTime())) return courseName;
  const day = date.getDate();

  if (locale === 'no') {
    const month = NORWEGIAN_MONTHS[date.getMonth()];
    return `${courseName} ${day}. ${month}`;
  }

  // Non-Norwegian: derive capitalised month name via Intl (local-time month).
  // We probe with a fixed day to avoid any DST/timezone offset shifting the
  // month; the probe date uses the same local-time month as the parsed input.
  const probe = new Date(2000, date.getMonth(), 15);
  const month = new Intl.DateTimeFormat(intlLocaleTag(locale), {
    month: 'long',
  }).format(probe);
  // Capitalise first letter (en-GB Intl returns lowercase "may" on some engines).
  const monthCap = month.charAt(0).toUpperCase() + month.slice(1);
  return `${courseName} ${day} ${monthCap}`;
}

/**
 * Re-lokaliser et auto-generert spillnavn ved VISNING (#617).
 *
 * Auto-genererte navn fryses i opprettelses-språket (`suggestGameName` kjører
 * klient-side i veiviseren og lagres som ferdig streng i `games.name`). Et
 * norsk-opprettet «Byneset North 12. juni» viser derfor norsk måned også i
 * engelsk modus, mens datolinja rett under er korrekt lokalisert — en blandet
 * norsk/engelsk overflate. Denne helperen parser dag + måned UT AV den lagrede
 * norske strengen (forankret til banenavnet) og reformaterer for aktiv locale.
 *
 * Hvorfor parse strengen i stedet for å re-formatere fra `scheduled_tee_off_at`:
 * - **Tidssone-fri** — bruker dag/måned som ligger i strengen, ikke et nytt
 *   `Date.getDate()`-kall som kunne forskyve dagen mellom opprettelses-TZ
 *   (klient, Norge) og visnings-TZ (Vercel, UTC).
 * - **Ingen query-endring** — trenger bare `name` + `courseName`, som alle
 *   render-sites allerede har (den slanke `getFinishedGamesForUser`-projeksjonen
 *   henter ikke tee-off).
 * - **Presis** — forankret til spillets faktiske bane, så kun strenger på det
 *   eksakte auto-formatet «{bane} {dag}. {måned}» rør`es; egendefinerte navn
 *   passerer urørt.
 *
 * Norsk visning er byte-identisk: tidlig retur for 'no'.
 */
export function localizeGameName(
  name: string,
  courseName: string | null,
  locale: AppLocale,
): string {
  if (locale === 'no' || !courseName) return name;
  const prefix = `${courseName} `;
  if (!name.startsWith(prefix)) return name;
  const suffix = name.slice(prefix.length);
  // Auto-formatet er nøyaktig «{dag}. {norsk-måned}» (ingen ekstra suffiks).
  const match = new RegExp(String.raw`^(\d{1,2})\. (\p{L}+)$`, 'u').exec(suffix);
  if (!match) return name;
  const monthIndex = (NORWEGIAN_MONTHS as readonly string[]).indexOf(match[2]);
  if (monthIndex < 0) return name;
  const day = Number(match[1]);
  // Reformater via `suggestGameName` — gjenbruker en-grenens Intl-måned. En
  // syntetisk kl.12-dato unngår midnatt/DST-rollover i `.getDate()`/`.getMonth()`.
  const synthetic = `2000-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00`;
  return suggestGameName({ courseName, scheduledTeeOffAt: synthetic, locale });
}
