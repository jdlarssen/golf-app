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
