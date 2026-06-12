import type { AppLocale } from '@/i18n/routing';
import { formatShortDateLocale, formatShortDateWithYearLocale } from '@/lib/i18n/format';

/**
 * Labels for the two relative-day buckets («I dag» / «I går»).
 * Passed by the call-site (InboxClient) once it has access to the catalog.
 * Defaults to Norwegian when omitted so the lib stays pure-locale-agnostic.
 */
export type DayLabels = {
  today: string;
  yesterday: string;
};

const DEFAULT_LABELS_NO: DayLabels = { today: 'I dag', yesterday: 'I går' };

/**
 * Returnerer dato-stempel som passer for grupperings-bucket. Tre nivåer:
 *  - todayLabel / yesterdayLabel for de to ferskeste dagene
 *  - «14. mai» (no) / «14 May» (en) for andre datoer fra inneværende år
 *  - «10. des 2025» (no) / «10 Dec 2025» (en) for datoer fra tidligere år
 *
 * Bruker browser/server-lokal tid via Date#getDate/getMonth/getFullYear.
 * Konsistent med eksisterende `lib/format/date.ts`-helpers — dato regnes
 * som «i dag» basert på Europe/Oslo-clock når koden kjører på server-en
 * og på brukerens lokale klokke i client. For varsler er det god nok
 * presisjon — vi viser når noe skjedde, ikke en eksakt grense-deteksjon.
 *
 * @param d        - Date to format
 * @param locale   - App locale ('no' | 'en'); defaults to 'no' (byte-identical Norwegian output)
 * @param labels   - Translated today/yesterday labels; defaults to Norwegian literals
 */
export function formatDayLabel(
  d: Date,
  locale: AppLocale = 'no',
  labels: DayLabels = DEFAULT_LABELS_NO,
): string {
  const now = new Date();
  if (isSameYmd(d, now)) return labels.today;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameYmd(d, yesterday)) return labels.yesterday;

  if (d.getFullYear() === now.getFullYear()) {
    return formatShortDateLocale(d, locale);
  }
  return formatShortDateWithYearLocale(d, locale);
}

function isSameYmd(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Gruppe-bucket for innboks-listen. `label` er bruker-rettet («I dag»,
 * «10. des 2025»), `items` beholder rekkefølgen fra input.
 */
export type DayGroup<T> = {
  /** YYYY-MM-DD-nøkkel for sortering / nøkling. */
  key: string;
  /** Bruker-rettet etikett. */
  label: string;
  items: T[];
};

/**
 * Options for groupNotificationsByDay.
 */
export type GroupByDayOptions = {
  locale?: AppLocale;
  labels?: DayLabels;
};

/**
 * Bucketer en liste varsler per dag (lokal tid), beholder relativ rekkefølge.
 * Caller skal allerede ha sortert nyeste-først; vi reverserer ikke her.
 *
 * Itererer én gang gjennom listen: sjekker om current item hører til samme
 * dag som forrige bucket, ellers åpner ny bucket. Bevisst enkelt (vi viser
 * sjelden mer enn ~50 varsler per side i v1).
 *
 * @param items    - List of items with created_at ISO strings
 * @param options  - Optional locale + translated labels (defaults: 'no', Norwegian literals)
 */
export function groupNotificationsByDay<T extends { created_at: string }>(
  items: T[],
  options: GroupByDayOptions = {},
): DayGroup<T>[] {
  if (items.length === 0) return [];

  const { locale = 'no', labels } = options;

  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const d = new Date(item.created_at);
    const key = ymdKey(d);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: formatDayLabel(d, locale, labels), items: [item] });
    }
  }
  return groups;
}

function ymdKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
