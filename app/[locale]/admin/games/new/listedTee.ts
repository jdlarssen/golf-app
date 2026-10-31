import type { CourseOption } from './GameForm';

/**
 * A stored tee counts only while its course lists it (#2448). A tee archived
 * since the game was made, or one from another course, is no tee: the form
 * starts without it and the save waits until one is picked. The one home for
 * the rule: `useGameFormState` seeds with it and `reconcileWizardDraft`
 * cleans a restored draft with it.
 */
export function listedTeeId(
  courses: readonly CourseOption[],
  courseId: string | undefined,
  teeBoxId: string | undefined,
): string {
  if (!teeBoxId) return '';
  const course = courses.find((c) => c.id === courseId);
  return course?.tee_boxes.some((t) => t.id === teeBoxId) ? teeBoxId : '';
}
