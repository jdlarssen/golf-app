'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { updateLeagueRound, overrideRoundWindow, type LeagueActionError } from '@/lib/league/actions';
import type { LeagueRoundView } from '@/lib/league/getLigaSnapshot';
import type { CourseOption } from '@/app/[locale]/admin/games/new/GameForm';

type Props = {
  round: LeagueRoundView;
  leagueId: string;
  courseScope: string;
  courses: CourseOption[];
};

const INITIAL: LeagueActionError = { error: '' };

/** Formats a timestamptz ISO string to 'YYYY-MM-DDTHH:mm' for datetime-local input. */
function toDatetimeLocal(iso: string): string {
  // Slice off the timezone offset — datetime-local inputs use local wall time.
  // The server stores UTC; we display it without conversion (admin context).
  return iso.slice(0, 16);
}

/** Short display: "14. mai, 14:30" */
function formatWindowDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
    'jul', 'aug', 'sep', 'okt', 'nov', 'des',
  ];
  const day = d.getUTCDate();
  const month = months[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}. ${month}, ${hh}:${mm}`;
}

export function LigaRoundRow({ round, leagueId, courseScope, courses }: Props) {
  const [updateState, updateAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      updateLeagueRound(formData) as Promise<LeagueActionError>,
    INITIAL,
  );
  const [overrideState, overrideAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      overrideRoundWindow(formData) as Promise<LeagueActionError>,
    INITIAL,
  );

  const selectedCourse = courses.find((c) => c.id === round.courseId);
  const tees = selectedCourse?.tee_boxes ?? [];

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      {/* Round header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Runde <span className="tabular-nums">{round.sequence}</span>
          </p>
          <p className="font-serif text-base text-text mt-0.5">{round.label}</p>
          <p className="font-sans text-[12px] text-muted mt-0.5">
            {formatWindowDate(round.opensAt)} – {formatWindowDate(round.closesAt)}
            {round.windowOverriddenAt && (
              <span className="ml-1.5 text-accent">· Vindu utvidet</span>
            )}
          </p>
          <p className="font-sans text-[11px] tabular-nums text-muted mt-0.5">
            <span className="tabular-nums">{round.flightCount}</span>{' '}
            {round.flightCount === 1 ? 'flight' : 'flights'}
          </p>
        </div>
        {round.flaggedFlights > 0 && (
          <div className="shrink-0 rounded-lg bg-warning/10 border border-warning/30 px-2.5 py-1.5 text-center">
            <p className="font-sans text-[11px] font-semibold text-warning">
              ⚠️ <span className="tabular-nums">{round.flaggedFlights}</span>{' '}
              {round.flaggedFlights === 1 ? 'flight' : 'flights'} utenfor vindu
            </p>
          </div>
        )}
      </div>

      {/* Tee / course update form */}
      <details className="group">
        <summary className="cursor-pointer font-sans text-[12px] font-medium text-primary list-none">
          Endre bane / tee
        </summary>
        <form action={updateAction} className="mt-3 space-y-2">
          <input type="hidden" name="round_id" value={round.id} />
          <input type="hidden" name="league_id" value={leagueId} />

          {courseScope === 'multi_course' && (
            <div>
              <label className="block font-sans text-[12px] font-medium text-text mb-1">
                Bane
              </label>
              <select
                name="course_id"
                defaultValue={round.courseId ?? ''}
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
              >
                <option value="">Ikke valgt</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(courseScope === 'multi_course' || courseScope === 'single_course') && (
            <div>
              <label className="block font-sans text-[12px] font-medium text-text mb-1">
                Tee
              </label>
              <select
                name="tee_box_id"
                defaultValue={round.teeBoxId ?? ''}
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
              >
                <option value="">Ikke valgt</option>
                {tees.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {updateState.error !== '' && (
            <p className="font-sans text-[12px] text-danger">{updateState.error}</p>
          )}
          <SubmitButton variant="secondary" className="text-sm px-4 py-2 min-h-[44px]" pendingLabel="Lagrer …">
            Lagre
          </SubmitButton>
        </form>
      </details>

      {/* Override window form */}
      <details className="group">
        <summary className="cursor-pointer font-sans text-[12px] font-medium text-primary list-none">
          Utvid vindu
        </summary>
        <form action={overrideAction} className="mt-3 space-y-2">
          <input type="hidden" name="round_id" value={round.id} />
          <input type="hidden" name="league_id" value={leagueId} />

          <div className="min-w-0">
            <label className="block font-sans text-[12px] font-medium text-text mb-1">
              Ny frist (stenger)
            </label>
            {/* iOS: native datetime-local strekker seg utenfor kortet uten
                appearance-none + min-w-0 (samme fiks som #453). */}
            <input
              type="datetime-local"
              name="closes_at"
              required
              defaultValue={toDatetimeLocal(round.closesAt)}
              className="w-full min-w-0 appearance-none rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
            />
          </div>

          {overrideState.error && overrideState.error !== '' && (
            <p className="font-sans text-[12px] text-danger">{overrideState.error}</p>
          )}
          <SubmitButton variant="secondary" className="text-sm px-4 py-2 min-h-[44px]" pendingLabel="Lagrer …">
            Lagre ny frist
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
