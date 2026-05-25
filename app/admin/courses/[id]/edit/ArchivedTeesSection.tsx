import { restoreTee } from './actions';
import { formatShortDateNb } from '@/lib/format/date';

export type ArchivedTeeRow = {
  id: string;
  name: string;
  archived_at: string;
  length_meters: number | null;
  has_active_name_conflict: boolean;
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
 */
export function ArchivedTeesSection({
  courseId,
  archivedTees,
}: {
  courseId: string;
  archivedTees: ArchivedTeeRow[];
}) {
  if (archivedTees.length === 0) return null;

  return (
    <details className="rounded-lg border border-border bg-surface p-4">
      <summary className="cursor-pointer font-serif text-base font-medium">
        Arkiverte tees ({archivedTees.length})
      </summary>
      <p className="mt-3 text-sm text-muted">
        Disse tee-ene er fjernet fra aktiv visning, men beholdes for spillene
        som bruker dem. Gjenåpne en tee for å få den tilbake i edit-formen og
        i nytt-spill-velgeren.
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
                Arkivert {formatShortDateNb(tee.archived_at)}
                {tee.length_meters != null && ` · ${tee.length_meters} m`}
              </div>
              {tee.has_active_name_conflict && (
                <div className="mt-1.5 inline-block rounded border border-warning/40 bg-warning/[0.10] px-2 py-0.5 text-[11px] text-warning">
                  Navnekollisjon med aktiv tee. Endre navn etter gjenåpning
                </div>
              )}
            </div>
            <form action={restoreTee.bind(null, courseId, tee.id)}>
              <button
                type="submit"
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-bg shadow-sm hover:bg-primary-hover"
              >
                Gjenåpne
              </button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
