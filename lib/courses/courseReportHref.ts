/**
 * Where «Stemmer ikke noe? Si fra» on a course page leads (#2277): the idea
 * box, which fills in the course's name from the slug — a message to the
 * admin. «Meld feil» in the course list (#2495) uses the same door.
 */
export function courseReportHref(slug: string): string {
  return `/foreslaa-ide?bane=${encodeURIComponent(slug)}`;
}
