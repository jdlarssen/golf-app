import { useLocale, useTranslations } from 'next-intl';
import { formatHHMMOslo, intlLocaleTag } from '@/lib/i18n/format';
import { osloDayNumber } from '@/lib/format/osloCalendar';
import type { AppLocale } from '@/i18n/routing';
import type { ActivityEntry, ActivityKind } from '@/lib/admin/activityLedger';
import { SmartLink } from '@/components/ui/SmartLink';

// ─── Activity ledger (presentational) ─────────────────────────────────────
//
// The «Siste 14 dager» list under the morning report's «Siste døgn» (#2345).
// The entries come from `getActivityEntries` (lib/admin/activityLedger.ts);
// this view only picks the words, so it renders in tests without Supabase.

const ACTION_KEY = {
  submitted: 'actionsSubmitted',
  approved: 'actionsApproved',
  started: 'actionsStarted',
  signed: 'actionsSigned',
  newCourse: 'actionsNewCourse',
  acceptedInvite: 'actionsAcceptedInvite',
} as const satisfies Record<ActivityKind, string>;

/** Starts, ends and courses without a creator are the Sekretariat's own. */
const SECRETARY_KINDS: ReadonlySet<ActivityKind> = new Set(['started', 'signed', 'newCourse']);

/**
 * The day of an entry that is not from today: «i går» for the day before, else
 * «12. nov.». `null` on the same Oslo day, so today's rows keep just the clock.
 * Oslo-pinned, so the server and the browser agree on the day (#648).
 */
export function ledgerDayLabel(iso: string, locale: AppLocale, nowMs: number = Date.now()): string | null {
  const thenMs = new Date(iso).getTime();
  if (!Number.isFinite(thenMs)) return null;
  const days = osloDayNumber(nowMs) - osloDayNumber(thenMs);
  if (days <= 0) return null;
  const tag = intlLocaleTag(locale);
  if (days === 1) return new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }).format(-1, 'day');
  return new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' }).format(thenMs);
}

export function ActivityLedgerList({ rows }: { rows: ActivityEntry[] }) {
  const t = useTranslations('admin.dashboard');
  const locale = useLocale() as AppLocale;

  const who = (row: ActivityEntry) =>
    row.who ?? (SECRETARY_KINDS.has(row.kind) ? t('actionsSecretary') : t('ledgerUnknown'));
  const ref = (row: ActivityEntry) =>
    row.ref ?? (row.kind === 'acceptedInvite' ? t('ledgerClubInvite') : t('ledgerGameFallback'));

  // data-focus-inset: radene er full-bleed, så `overflow-hidden` klipper en
  // outline med positiv offset helt bort (#1402).
  return (
    <div
      data-focus-inset
      className="overflow-hidden rounded-2xl border border-border bg-surface"
    >
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-muted">
          {t('noActivity')}
        </p>
      ) : (
        rows.map((row, i) => {
          const style = {
            borderTop: i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
          };
          const baseClass =
            'grid grid-cols-[52px_1fr] items-baseline gap-2.5 px-3.5 py-2.5';
          const dayLabel = ledgerDayLabel(row.ts, locale);
          const inner = (
            <>
              <span className="font-serif text-xs font-medium tabular-nums text-muted">
                {formatHHMMOslo(row.ts)}
                {dayLabel && (
                  <span className="block text-[10px] font-normal leading-tight">
                    {dayLabel}
                  </span>
                )}
              </span>
              <div>
                <p className="text-[13px] text-text">
                  <b className="font-semibold">{who(row)}</b> {t(ACTION_KEY[row.kind])}
                </p>
                <p className="mt-0.5 font-serif text-[11px] italic text-muted">
                  {ref(row)}
                </p>
              </div>
            </>
          );
          // #864: rader med en href blir trykkbare SmartLink-er (submitted/
          // approved → spillets status-side, lifecycle → spill-detalj, ny bane
          // → /admin/courses). Klubbinvitasjon uten game forblir en `<div>`.
          return row.href ? (
            <SmartLink
              key={`${row.ts}-${i}`}
              href={row.href}
              className={`${baseClass} transition-colors hover:bg-bg/50`}
              style={style}
            >
              {inner}
            </SmartLink>
          ) : (
            <div key={`${row.ts}-${i}`} className={baseClass} style={style}>
              {inner}
            </div>
          );
        })
      )}
    </div>
  );
}
