import { describe, it, expect } from 'vitest';
import { courseReportHref } from './courseReportHref';

// The one door for «Stemmer ikke noe? Si fra» on a course page (#2277) and
// «Meld feil» in the course list (#2495): the idea box, with the slug.
describe('courseReportHref', () => {
  it.each([
    ['stiklestad-golfbane', '/foreslaa-ide?bane=stiklestad-golfbane'],
    ['bane & co/å?', '/foreslaa-ide?bane=bane%20%26%20co%2F%C3%A5%3F'],
  ])('%s → %s', (slug, expected) => {
    expect(courseReportHref(slug)).toBe(expected);
  });
});
