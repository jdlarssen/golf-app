import { describe, it, expect } from 'vitest';
import { formatRelativeNb } from './relativeTimeNb';

const NOW = new Date('2026-05-24T12:00:00.000Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

describe('formatRelativeNb', () => {
  it('0 sekunder → «nå» (numeric: auto)', () => {
    expect(formatRelativeNb(ago(0), NOW)).toBe('nå');
  });

  it('30 sekunder → «for 30 sekunder siden»', () => {
    expect(formatRelativeNb(ago(30 * SECOND), NOW)).toBe('for 30 sekunder siden');
  });

  it('5 minutter → «for 5 minutter siden»', () => {
    expect(formatRelativeNb(ago(5 * MINUTE), NOW)).toBe('for 5 minutter siden');
  });

  it('2 timer → «for 2 timer siden»', () => {
    expect(formatRelativeNb(ago(2 * HOUR), NOW)).toBe('for 2 timer siden');
  });

  it('24 timer (= 1 dag) → «i går» (numeric: auto)', () => {
    expect(formatRelativeNb(ago(DAY), NOW)).toBe('i går');
  });

  it('3 dager → «for 3 døgn siden» (Intl bruker «døgn», ikke «dager»)', () => {
    // Intl.RelativeTimeFormat('nb-NO') returnerer «døgn» for plural days
    // (formelt korrekt — et døgn er 24t). Locked-in via test så vi oppdager
    // hvis future Node-versjoner bytter til «dager».
    expect(formatRelativeNb(ago(3 * DAY), NOW)).toBe('for 3 døgn siden');
  });

  it('7 dager (= 1 uke) → «forrige uke» (numeric: auto natural-language)', () => {
    // numeric: 'auto' gir natural-language for ±1 av hver enhet — «forrige
    // uke» framfor «for 1 uke siden». Designvalg: holder feeden lett å lese.
    expect(formatRelativeNb(ago(WEEK), NOW)).toBe('forrige uke');
  });

  it('14 dager (= 2 uker) → «for 2 uker siden» (over ±1 → numeric)', () => {
    expect(formatRelativeNb(ago(2 * WEEK), NOW)).toBe('for 2 uker siden');
  });

  it('30 dager (= 1 måned) → «forrige måned» (numeric: auto natural-language)', () => {
    expect(formatRelativeNb(ago(MONTH), NOW)).toBe('forrige måned');
  });

  it('365 dager (~12 måneder) → «for 12 måneder siden»', () => {
    // Helperens øvre nivå er måneder — år dekkes ikke. 365 dager / 30 dager
    // = 12,166 → Math.round → 12 måneder. Bevisst valg for å holde copy
    // konsistent (innboks-historikk eldre enn ~1 år er edge-case).
    expect(formatRelativeNb(ago(365 * DAY), NOW)).toBe('for 12 måneder siden');
  });

  it('clock-skew (server-timestamp i fremtiden) → «nå» (Math.max-floor)', () => {
    const future = new Date(NOW + 3 * SECOND).toISOString();
    expect(formatRelativeNb(future, NOW)).toBe('nå');
  });

  it('grense-tilfelle: 59 sekunder → fortsatt sekunder, ikke minutter', () => {
    expect(formatRelativeNb(ago(59 * SECOND), NOW)).toBe('for 59 sekunder siden');
  });

  it('grense-tilfelle: 60 sekunder → «for 1 minutt siden» (minutt-grenen)', () => {
    expect(formatRelativeNb(ago(60 * SECOND), NOW)).toBe('for 1 minutt siden');
  });

  it('59,5 minutter → «for 1 time siden», ikke «60 minutter»', () => {
    expect(formatRelativeNb(ago(59.5 * MINUTE), NOW)).toBe('for 1 time siden');
  });

  it('59,5 sekunder → «for 1 minutt siden», ikke «60 sekunder»', () => {
    expect(formatRelativeNb(ago(59.5 * SECOND), NOW)).toBe('for 1 minutt siden');
  });

  it('23,5 timer ut i neste kalenderdag → «i går», ikke «24 timer»', () => {
    expect(formatRelativeNb(ago(23.5 * HOUR), NOW)).toBe('i går');
  });

  it('25 timer over to kalenderdager (man 23:30 → ons 00:30 Oslo) → «i forgårs»', () => {
    const now = new Date('2026-05-26T22:30:00.000Z').getTime(); // ons 27. mai 00:30 Oslo
    const then = new Date('2026-05-25T21:30:00.000Z').toISOString(); // man 25. mai 23:30 Oslo
    expect(formatRelativeNb(then, now)).toBe('i forgårs');
  });

  it('en uparsbar tidsstempel kaster ikke', () => {
    expect(formatRelativeNb('not-a-date', NOW)).toBe('');
  });
});
