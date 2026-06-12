import { restoreTee } from './actions';
import { formatShortDateLocale } from '@/lib/i18n/format';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';

export type ArchivedTeeRow = {
  id: string;
  name: string;
  archived_at: string;
  length_meters: number | null;
  has_active_name_conflict: boolean;
};

export type ArchivedTeesSectionStrings = {
  summaryLabel: (count: number) => string;
  body: string;
  archivedDate: (date: string) => string;
  nameConflict: string;
  reopenButton: string;
  reopeningBusy: string;
};

/**
 * Inline panel under CourseForm listing tees that were soft-archived by
 * updateCourse (in-use tees admin removed from the form). Each row gets a
 * Gjenåpne-button bound to restoreTee, which clears archived_at and bumps
 * the course's audit fields. Hidden when nothing is archived (caller
 * conditional-renders on archivedTees.length > 0).
 *
 * Server-component — no client state, no 'use client' boundary. The
 * Gjenåpne-button submits a server-action form, then redirects back to
 * the same edit page where the now-active tee appears in CourseForm.
 * Translation strings are passed from the parent server page.
 */
export function ArchivedTeesSection({
  courseId,
  archivedTees,
  strings,
  locale,
}: {
  courseId: string;
  archivedTees: ArchivedTeeRow[];
  strings: ArchivedTeesSectionStrings;
  locale: AppLocale;
}) {
  if (archivedTees.length === 0) return null;

  return (
    <details className="rounded-lg border border-border bg-surface p-4">
      <summary className="cursor-pointer font-serif text-base font-medium">
        {strings.summaryLabel(archivedTees.length)}
      </summary>
      <p className="mt-3 text-sm text-muted">
        {strings.body}
      </p>
      <ul className="mt-4 space-y-2">
        {archivedTees.map((tee) => (
          <li
            key={tee.id}
            className="flex items-center justify-between gap-3 rounded border border-border bg-bg p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{tee.name}</div>
              <div className="text-xs text-muted">
                {strings.archivedDate(formatShortDateLocale(tee.archived_at, locale))}
                {tee.length_meters != null && ` · ${tee.length_meters} m`}
              </div>
              {tee.has_active_name_conflict && (
                <div className="mt-1.5 inline-block rounded border border-warning/40 bg-warning/[0.10] px-2 py-0.5 text-[11px] text-warning">
                  {strings.nameConflict}
                </div>
              )}
            </div>
            <form action={restoreTee.bind(null, courseId, tee.id)}>
              <SubmitButton
                className="rounded-full px-3 py-2 text-sm"
                pendingLabel={strings.reopeningBusy}
              >
                {strings.reopenButton}
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
