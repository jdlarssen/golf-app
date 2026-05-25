import { describe, it, expect } from 'vitest';
import { suggestGameName } from './autoGameName';

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
});
