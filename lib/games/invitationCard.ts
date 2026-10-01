import type { AppLocale } from '@/i18n/routing';
import {
  formatDate,
  formatShortDayMonthLocale,
  formatTeeOffTimeLocale,
} from '@/lib/i18n/format';

/**
 * The two fields on the invitation card (#2266): weekday over date, and the
 * tee-off time — «LØRDAG / 3. okt» beside «TEE-OFF / 09:20». All three parts
 * are pinned to Oslo, so the UTC server never shows 07:20 for a 09:20 round
 * (#2270). The card upper-cases the weekday itself.
 *
 * `null` for no tee-off or an unparseable one: the card then shows no fields.
 */
export function invitationWhen(
  iso: string | null,
  locale: AppLocale,
): { weekday: string; date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    weekday: formatDate(d, locale, { timeZone: 'Europe/Oslo', weekday: 'long' }),
    date: formatShortDayMonthLocale(d, locale),
    time: formatTeeOffTimeLocale(d, locale),
  };
}
