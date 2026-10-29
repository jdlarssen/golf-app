'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { COURSE_CHOSEN_PARAM, COURSE_PARAM } from '@/lib/wizard/courseParams';
import type { CourseOption } from './GameForm';

/**
 * #2485: `?bane=<id>` chooses the course in a game form, then leaves the
 * address. It comes from /opprett-bane («Bruk denne», or a course you just
 * saved there) and from the public course pages (#1023).
 *
 * Why a client effect and not the mount seed: Next 16 keeps a visited route
 * mounted (Activity), so coming back to the wizard often reuses the instance
 * that was there, and seeds that run once at mount never see the new course.
 * Reading the URL covers a fresh mount and a kept one alike.
 *
 * `ready` waits for the wizard's draft (`draftSettled`): a restored draft
 * remounts the wizard with its own course, and the URL's course goes over it.
 * Removing the parameter afterwards means a reload or Back starts from the
 * draft (what the organiser changed since), and the next trip back is a URL
 * change again, even with the same course. `markChosen` leaves `banevalg=1`
 * in its place, so «Som sist» (#2446) still sees that a link chose the course;
 * the wizard sets it, the edit form has no step 1 and does not.
 */
export function useCourseFromUrl({
  ready,
  courseId,
  setCourseId,
  courses,
  markChosen = false,
}: {
  ready: boolean;
  courseId: string;
  setCourseId: (next: string) => void;
  courses: readonly CourseOption[];
  markChosen?: boolean;
}) {
  const searchParams = useSearchParams();
  const urlCourseId = searchParams.get(COURSE_PARAM);
  const searchString = searchParams.toString();

  useEffect(() => {
    if (!ready || !urlCourseId) return;
    // A course the form does not list (deleted, or a hand-edited id) picks nothing.
    if (urlCourseId !== courseId && courses.some((c) => c.id === urlCourseId)) {
      setCourseId(urlCourseId);
    }
    // `null`, not `history.state`: Next's patched replaceState then moves the
    // router's URL along (#2201, PwaBoot). The patch is installed in the App
    // Router's own effect, so the call waits one task.
    const params = new URLSearchParams(searchString);
    params.delete(COURSE_PARAM);
    if (markChosen) params.set(COURSE_CHOSEN_PARAM, '1');
    const qs = params.toString();
    const timer = setTimeout(() => {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
      );
    }, 0);
    return () => clearTimeout(timer);
    // Runs per arrival of a `bane` value: the course list and the current
    // choice are read at that moment, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, urlCourseId]);
}
