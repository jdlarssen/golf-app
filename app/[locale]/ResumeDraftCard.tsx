'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { Card } from '@/components/ui/Card';
import { buttonClasses } from '@/components/ui/Button';
import { formatRelativeDayLocale } from '@/lib/i18n/format';
import {
  listWizardDrafts,
  type ListedWizardDraft,
} from '@/app/[locale]/admin/games/new/wizardStatePersistence';

const TOTAL_STEPS = 5;

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
      <Card className="p-4 sm:p-4" data-testid="resume-draft-card">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate font-serif text-xl font-semibold leading-tight text-text">
            {summary.title ?? t('untitled')}
          </p>
          <p className="shrink-0 font-sans text-xs text-muted">
            {formatRelativeDayLocale(new Date(draft.savedAt).toISOString(), locale)}
          </p>
        </div>
        {meta && <p className="mt-1 font-sans text-[13px] text-muted tabular-nums">{meta}</p>}
        <div aria-hidden="true" className="mt-3 h-1.5 rounded-full bg-hole-completed-bg">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(summary.step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
        <p className="mt-2 font-sans text-xs text-muted">
          {t('stepLine', { step: summary.step, total: TOTAL_STEPS, title: stepTitle })}
        </p>
        <div className="mt-4 flex gap-2.5">
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
            className={`${buttonClasses('secondary', 'medium')} flex-1`}
          >
            {t('delete')}
          </Link>
        </div>
      </Card>
    </section>
  );
}
