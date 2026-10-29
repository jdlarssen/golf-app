import { describe, it, expect } from 'vitest';
import {
  addAnywayName,
  clipQuery,
  courseCreateHref,
  isDismissed,
  isSearchable,
  similarCourseHref,
  withCourseParam,
} from './similarCoursesPanel';

describe('clipQuery / isSearchable', () => {
  it('trims and clips at 80 characters', () => {
    expect(clipQuery('  Byneset  ')).toBe('Byneset');
    expect(clipQuery('a'.repeat(100))).toHaveLength(80);
  });

  it('searches from three characters, not two', () => {
    expect(isSearchable('')).toBe(false);
    expect(isSearchable('By')).toBe(false);
    expect(isSearchable('  By  ')).toBe(false);
    expect(isSearchable('Byn')).toBe(true);
  });
});

describe('isDismissed', () => {
  it('is false until something is turned down', () => {
    expect(isDismissed('Byneset', null)).toBe(false);
  });

  it('stays hidden while the name still starts with what was turned down', () => {
    expect(isDismissed('Byneset n', 'Byneset n')).toBe(true);
    expect(isDismissed('Byneset no', 'Byneset n')).toBe(true);
    expect(isDismissed('BYNESET N', 'Byneset n')).toBe(true);
  });

  it('comes back for a different name', () => {
    expect(isDismissed('Stiklestad', 'Byneset n')).toBe(false);
    expect(isDismissed('Byneset', 'Byneset n')).toBe(false);
  });
});

describe('addAnywayName', () => {
  it('keeps a name of twelve characters or fewer whole', () => {
    expect(addAnywayName('Byneset n')).toEqual({ name: 'Byneset n', clipped: false });
    expect(addAnywayName('Byneset Nort')).toEqual({ name: 'Byneset Nort', clipped: false });
  });

  it('cuts a longer name at twelve characters', () => {
    expect(addAnywayName('Byneset North')).toEqual({ name: 'Byneset Nort', clipped: true });
  });

  it('does not end the cut name with a space', () => {
    expect(addAnywayName('Stiklestad  Golfbane')).toEqual({ name: 'Stiklestad', clipped: true });
  });
});

describe('withCourseParam', () => {
  it('adds bane to an address with a query', () => {
    expect(withCourseParam('/opprett-spill?intent=kompis&step=3', 'c1')).toBe(
      '/opprett-spill?intent=kompis&step=3&bane=c1',
    );
  });

  it('adds bane to a bare path', () => {
    expect(withCourseParam('/opprett-spill', 'c1')).toBe('/opprett-spill?bane=c1');
  });

  it('replaces a bane that is already there', () => {
    expect(withCourseParam('/opprett-spill?bane=old&step=3', 'c1')).toBe(
      '/opprett-spill?bane=c1&step=3',
    );
  });
});

describe('similarCourseHref', () => {
  it('from the wizard: back to the wizard with the course chosen', () => {
    expect(
      similarCourseHref({ kind: 'wizard', next: '/opprett-spill?format=stableford&step=3' }, 'c1'),
    ).toBe('/opprett-spill?format=stableford&step=3&bane=c1');
  });

  it('without next: the wizard with the course chosen', () => {
    expect(similarCourseHref({ kind: 'wizard' }, 'c1')).toBe('/opprett-spill?bane=c1');
  });

  it('from the admin door: the course edit page', () => {
    expect(similarCourseHref({ kind: 'edit' }, 'c1')).toBe('/admin/courses/c1/edit');
  });
});

describe('courseCreateHref', () => {
  it('carries the wizard address back to step 3, other parameters kept', () => {
    expect(courseCreateHref('/opprett-spill', 'intent=kompis&format=stableford&step=3')).toBe(
      `/opprett-bane?next=${encodeURIComponent('/opprett-spill?intent=kompis&format=stableford&step=3')}`,
    );
  });

  it('sets step 3 when the address has none, and drops bane and skjerm', () => {
    expect(courseCreateHref('/admin/games/new', 'bane=old&skjerm=lag&klubb=k1')).toBe(
      `/opprett-bane?next=${encodeURIComponent('/admin/games/new?klubb=k1&step=3')}`,
    );
  });
});
