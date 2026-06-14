import { describe, it, expect } from 'vitest';
import { suggestGameName, localizeGameName } from './autoGameName';

describe('suggestGameName', () => {
  it('returnerer tom streng når courseName er null', () => {
    expect(
      suggestGameName({ courseName: null, scheduledTeeOffAt: '' }),
    ).toBe('');
  });

  it('returnerer tom streng når courseName er tom streng', () => {
    expect(
      suggestGameName({ courseName: '', scheduledTeeOffAt: '' }),
    ).toBe('');
  });

  it('returnerer kun bane-navn når tee-off er tom', () => {
    expect(
      suggestGameName({ courseName: 'Stiklestad', scheduledTeeOffAt: '' }),
    ).toBe('Stiklestad');
  });

  it('kombinerer bane-navn og norsk lowercase månedsnavn ved gyldig dato', () => {
    expect(
      suggestGameName({
        courseName: 'Stiklestad',
        scheduledTeeOffAt: '2026-05-25T14:30',
      }),
    ).toBe('Stiklestad 25. mai');
  });

  it('bruker lowercase månedsnavn også for januar', () => {
    expect(
      suggestGameName({
        courseName: 'Hauger',
        scheduledTeeOffAt: '2026-01-03T10:00',
      }),
    ).toBe('Hauger 3. januar');
  });

  it('bruker lowercase månedsnavn også for desember', () => {
    expect(
      suggestGameName({
        courseName: 'Asker',
        scheduledTeeOffAt: '2026-12-08T08:15',
      }),
    ).toBe('Asker 8. desember');
  });

  it('returnerer kun bane-navn når dato er ugyldig', () => {
    expect(
      suggestGameName({
        courseName: 'Stiklestad',
        scheduledTeeOffAt: 'ikke-en-dato',
      }),
    ).toBe('Stiklestad');
  });

  it('beholder bane-navn med spesialtegn uendret', () => {
    expect(
      suggestGameName({
        courseName: 'Tønsberg Golfklubb',
        scheduledTeeOffAt: '2026-07-17T09:00',
      }),
    ).toBe('Tønsberg Golfklubb 17. juli');
  });

  // ------------------------------------------------------------------
  // Locale: 'no' path is byte-identical to legacy for all 12 months
  // ------------------------------------------------------------------

  it.each([
    ['2026-01-15T09:00', 'X 15. januar'],
    ['2026-02-15T09:00', 'X 15. februar'],
    ['2026-03-15T09:00', 'X 15. mars'],
    ['2026-04-15T09:00', 'X 15. april'],
    ['2026-05-15T09:00', 'X 15. mai'],
    ['2026-06-15T09:00', 'X 15. juni'],
    ['2026-07-15T09:00', 'X 15. juli'],
    ['2026-08-15T09:00', 'X 15. august'],
    ['2026-09-15T09:00', 'X 15. september'],
    ['2026-10-15T09:00', 'X 15. oktober'],
    ['2026-11-15T09:00', 'X 15. november'],
    ['2026-12-15T09:00', 'X 15. desember'],
  ] as const)(
    "'no' locale byte-identical for %s → %s",
    (teeOffAt, expected) => {
      expect(
        suggestGameName({ courseName: 'X', scheduledTeeOffAt: teeOffAt, locale: 'no' }),
      ).toBe(expected);
    },
  );

  it("omitted locale behaves as 'no'", () => {
    expect(
      suggestGameName({ courseName: 'X', scheduledTeeOffAt: '2026-05-15T09:00' }),
    ).toBe('X 15. mai');
  });

  // ------------------------------------------------------------------
  // Locale: 'en' path uses Intl month names, no ordinal dot
  // ------------------------------------------------------------------

  it.each([
    ['2026-05-15T09:00', 'X 15 May'],
    ['2026-10-15T09:00', 'X 15 October'],
    ['2026-01-15T09:00', 'X 15 January'],
    ['2026-12-15T09:00', 'X 15 December'],
  ] as const)(
    "'en' locale: %s → %s",
    (teeOffAt, expected) => {
      expect(
        suggestGameName({ courseName: 'X', scheduledTeeOffAt: teeOffAt, locale: 'en' }),
      ).toBe(expected);
    },
  );
});

describe('localizeGameName', () => {
  it("returnerer navnet byte-identisk i 'no' (ingen re-lokalisering)", () => {
    expect(localizeGameName('Byneset North 12. juni', 'Byneset North', 'no')).toBe(
      'Byneset North 12. juni',
    );
  });

  it("re-lokaliserer norsk auto-format til engelsk i 'en'", () => {
    expect(localizeGameName('Byneset North 12. juni', 'Byneset North', 'en')).toBe(
      'Byneset North 12 June',
    );
  });

  it('lar et egendefinert navn (ikke auto-format) stå urørt', () => {
    expect(localizeGameName('Sommerfest', 'Byneset North', 'en')).toBe('Sommerfest');
  });

  it('lar et navn med ekstra suffiks etter måneden stå urørt', () => {
    expect(localizeGameName('Byneset North 12. juni cup', 'Byneset North', 'en')).toBe(
      'Byneset North 12. juni cup',
    );
  });

  it('rører ikke navn der bane-prefikset ikke matcher', () => {
    expect(localizeGameName('Annen bane 5. mai', 'Byneset North', 'en')).toBe(
      'Annen bane 5. mai',
    );
  });

  it('rører ikke navn når månedsordet ikke er en kjent norsk måned', () => {
    expect(localizeGameName('Byneset North 12. blah', 'Byneset North', 'en')).toBe(
      'Byneset North 12. blah',
    );
  });

  it('returnerer navnet uendret når courseName er null', () => {
    expect(localizeGameName('Byneset North 12. juni', null, 'en')).toBe(
      'Byneset North 12. juni',
    );
  });

  it('returnerer navnet uendret når navnet kun er bane-navn (ingen tee-off)', () => {
    expect(localizeGameName('Stiklestad', 'Stiklestad', 'en')).toBe('Stiklestad');
  });

  it('håndterer bane-navn med regex-spesialtegn (escaping)', () => {
    expect(localizeGameName('A.B (Golf) 3. mars', 'A.B (Golf)', 'en')).toBe(
      'A.B (Golf) 3 March',
    );
  });

  // Round-trip: et navn generert på norsk og re-lokalisert til engelsk skal
  // matche det engelske auto-formatet direkte, for alle 12 måneder.
  it.each([
    '2026-01-15T09:00',
    '2026-02-15T09:00',
    '2026-03-15T09:00',
    '2026-04-15T09:00',
    '2026-05-15T09:00',
    '2026-06-15T09:00',
    '2026-07-15T09:00',
    '2026-08-15T09:00',
    '2026-09-15T09:00',
    '2026-10-15T09:00',
    '2026-11-15T09:00',
    '2026-12-15T09:00',
  ] as const)('round-trip no→en for %s', (teeOffAt) => {
    const no = suggestGameName({ courseName: 'X', scheduledTeeOffAt: teeOffAt, locale: 'no' });
    const en = suggestGameName({ courseName: 'X', scheduledTeeOffAt: teeOffAt, locale: 'en' });
    expect(localizeGameName(no, 'X', 'en')).toBe(en);
  });
});
