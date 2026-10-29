/**
 * #2485: the wizard's course parameters. `bane=<id>` chooses a course (the
 * public course pages, and «Bruk denne» or a saved course on /opprett-bane).
 * Once the wizard has used it, it leaves the address and `banevalg=1` stays:
 * a reload must not choose the course again over the draft, but «Som sist»
 * (#2446) must still see that a link chose the course.
 */
export const COURSE_PARAM = 'bane';
export const COURSE_CHOSEN_PARAM = 'banevalg';
