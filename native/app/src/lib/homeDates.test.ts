// #2254: datoene på startboden — datolinja øverst og stubben på billetten.
//
// Suiten kjører med `TZ=UTC` (jest.config.js), og funksjonene leser enhetens
// lokaltid. Tidene her bygges derfor med lokale konstruktører
// (`new Date(år, måned, dag, …)`), så «rundt midnatt» betyr midnatt i den
// sonen koden faktisk regner i.
import { formatShortDateNb } from '../../../../lib/format/date';
import {
  formatStubClock,
  formatStubDate,
  formatWeekdayDayMonth,
  teeOffProximityLocal,
} from './homeDates';

const at = (month0: number, day: number, hour = 12, minute = 0) =>
  new Date(2026, month0, day, hour, minute);

describe('formatWeekdayDayMonth', () => {
  it('gir ukedag med stor forbokstav, dag og hele månedsnavnet', () => {
    expect(formatWeekdayDayMonth(at(8, 29))).toBe('Tirsdag 29. september');
  });

  it('kjenner alle sju ukedagene', () => {
    // 28. september 2026 er en mandag.
    const days = [28, 29, 30].map((d) => formatWeekdayDayMonth(at(8, d)));
    const october = [1, 2, 3, 4].map((d) => formatWeekdayDayMonth(at(9, d)));
    expect([...days, ...october]).toEqual([
      'Mandag 28. september',
      'Tirsdag 29. september',
      'Onsdag 30. september',
      'Torsdag 1. oktober',
      'Fredag 2. oktober',
      'Lørdag 3. oktober',
      'Søndag 4. oktober',
    ]);
  });

  it('kjenner alle tolv månedene', () => {
    const months = Array.from({ length: 12 }, (_, m) =>
      formatWeekdayDayMonth(at(m, 15)).split(' ').pop(),
    );
    expect(months).toEqual([
      'januar',
      'februar',
      'mars',
      'april',
      'mai',
      'juni',
      'juli',
      'august',
      'september',
      'oktober',
      'november',
      'desember',
    ]);
  });

  it('bytter dag ved midnatt i lokaltid', () => {
    expect(formatWeekdayDayMonth(at(8, 29, 23, 59))).toBe('Tirsdag 29. september');
    expect(formatWeekdayDayMonth(at(8, 30, 0, 0))).toBe('Onsdag 30. september');
  });
});

describe('teeOffProximityLocal', () => {
  const now = at(8, 29, 23, 30);

  it('gir i dag, i morgen og antall dager fram til seks', () => {
    expect(teeOffProximityLocal(at(8, 29, 23, 45).toISOString(), now)).toEqual({
      kind: 'today',
    });
    // Et kvarter over midnatt er i morgen, selv om det er under en time unna.
    expect(teeOffProximityLocal(at(8, 30, 0, 15).toISOString(), now)).toEqual({
      kind: 'tomorrow',
    });
    expect(teeOffProximityLocal(at(9, 2, 9, 30).toISOString(), now)).toEqual({
      kind: 'days',
      days: 3,
    });
    expect(teeOffProximityLocal(at(9, 5, 9, 30).toISOString(), now)).toEqual({
      kind: 'days',
      days: 6,
    });
  });

  it('gir null for sju dager og mer, for en dag som er passert, og for manglende eller ugyldig tid', () => {
    expect(teeOffProximityLocal(at(9, 6, 9, 30).toISOString(), now)).toBeNull();
    expect(teeOffProximityLocal(at(8, 28, 9, 30).toISOString(), now)).toBeNull();
    expect(teeOffProximityLocal(null, now)).toBeNull();
    expect(teeOffProximityLocal('ikke en dato', now)).toBeNull();
  });

  it('teller kalenderdager over et årsskifte', () => {
    const newYearsEve = new Date(2026, 11, 31, 20, 0);
    expect(
      teeOffProximityLocal(new Date(2027, 0, 1, 10, 0).toISOString(), newYearsEve),
    ).toEqual({ kind: 'tomorrow' });
  });
});

describe('stubben på billetten', () => {
  it('gir kort ukedag foran den delte korte datoen', () => {
    const iso = at(9, 3, 9, 30).toISOString();
    expect(formatStubDate(iso)).toBe(`Lør ${formatShortDateNb(iso)}`);
    expect(formatStubDate(iso)).toBe('Lør 3. okt');
  });

  it('gir klokkeslettet med «kl.» foran', () => {
    expect(formatStubClock(at(9, 3, 9, 5).toISOString())).toBe('kl. 09:05');
  });

  it('gir null for manglende og ugyldig tid', () => {
    expect(formatStubDate(null)).toBeNull();
    expect(formatStubDate('ikke en dato')).toBeNull();
    expect(formatStubClock(null)).toBeNull();
    expect(formatStubClock('ikke en dato')).toBeNull();
  });
});
