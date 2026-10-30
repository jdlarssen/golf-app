'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { formatHHMMOslo, formatRelativeDayLocale } from '@/lib/i18n/format';
import {
  listWizardDrafts,
  type ListedWizardDraft,
} from '@/app/[locale]/admin/games/new/wizardStatePersistence';

const TOTAL_STEPS = 5;
const OSLO_DAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' });

/**
 * «for 12 min siden» on the same Oslo day, «i går kl. 21:40» before that (the
 * artboard's line). Oslo-pinned like `formatRelativeDayLocale`, so the server and
 * the browser agree on the day.
 */
function touchedLabel(
  savedAt: number,
  locale: AppLocale,
  atTime: (v: { relative: string; time: string }) => string,
): string {
  const iso = new Date(savedAt).toISOString();
  const relative = formatRelativeDayLocale(iso, locale);
  if (OSLO_DAY.format(savedAt) === OSLO_DAY.format(Date.now())) return relative;
  return atTime({ relative, time: formatHHMMOslo(iso) });
}

/** The route of the confirmation page; the draft's key rides in `?utkast=`. */
export const DELETE_DRAFT_PATH = '/opprett-spill/slett-utkast';

/**
 * «Fortsett der du slapp» (#2459): the newest half-finished new-game setup on
 * this device, on Home. It lives in `localStorage` (see wizardStatePersistence),
 * so the card can only be known after mount. Server render and the first client
 * render give `null`, which keeps hydration clean; the card shows up a frame
 * later. A draft that never got past step 1 holds only the kind of event and is
 * not «something you left», so it is not shown.
 */
export function ResumeDraftCard({ userId }: { userId: string }) {
  const t = useTranslations('resumeDraft');
  const locale = useLocale() as AppLocale;
  const [draft, setDraft] = useState<ListedWizardDraft | null>(null);

  useEffect(() => {
    const newest = listWizardDrafts(userId).find((d) => d.resume.summary.step >= 2);
    // Reading browser storage after mount is the point: it does not exist on
    // the server, so it cannot be read during render without a hydration mismatch.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setDraft(newest ?? null);
  }, [userId]);

  if (!draft) return null;

  const { summary, href } = draft.resume;
  const players =
    summary.expectedCount !== null
      ? t('playersOfTotal', { count: summary.selectedCount, total: summary.expectedCount })
      : t('playersCount', { count: summary.selectedCount });
  const meta = [summary.formatLabel, summary.courseName, players].filter(Boolean).join(' · ');
  const stepTitle = t(`stepTitle.${summary.step}` as Parameters<typeof t>[0]);

  return (
    <section aria-labelledby="resume-draft-heading">
      <div className="mb-3 flex items-center gap-2">
        <h2
          id="resume-draft-heading"
          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-text"
        >
          {t('kicker')}
        </h2>
        <div className="h-px flex-1 bg-accent/30" />
      </div>
      {/* Not `Card`: its 24 px padding would win over the artboard's 14 px. */}
      <div
        data-testid="resume-draft-card"
        className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-[0_1px_2px_rgba(26,46,31,0.04),0_2px_8px_rgba(26,46,31,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate font-serif text-xl font-semibold leading-tight text-text">
            {summary.title ?? t('untitled')}
          </p>
          <p className="shrink-0 font-sans text-xs text-muted">
            {touchedLabel(draft.savedAt, locale, (v) => t('touchedAt', v))}
          </p>
        </div>
        {meta && <p className="font-sans text-[13px] text-muted tabular-nums">{meta}</p>}
        <div aria-hidden="true" className="h-1.5 rounded-full bg-hole-completed-bg">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(summary.step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
        <p className="font-sans text-xs text-muted">
          {t('stepLine', { step: summary.step, total: TOTAL_STEPS, title: stepTitle })}
        </p>
        <div className="flex gap-2">
          <Link
            href={href}
            data-testid="resume-draft-continue"
            className={`${buttonClasses('primary', 'medium')} flex-1`}
          >
            {t('continue')}
          </Link>
          <Link
            href={`${DELETE_DRAFT_PATH}?utkast=${encodeURIComponent(draft.key)}`}
            data-testid="resume-draft-delete"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface px-4 font-sans text-sm font-semibold text-text transition-colors hover:bg-primary-soft"
          >
            {t('delete')}
          </Link>
        </div>
      </div>
    </section>
  );
}
