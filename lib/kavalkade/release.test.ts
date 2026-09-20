import { describe, it, expect } from 'vitest';
import { osloParts } from '@/lib/format/teeOff';
import {
  KAVALKADE_CUTOFF,
  KAVALKADE_LINK_END,
  KAVALKADE_TEASER_START,
  KAVALKADE_YEAR,
  isKavalkadeOpen,
  kavalkadeHomeSlot,
  kavalkadeLinkEndsAt,
  kavalkadeOpensAt,
  kavalkadeTeaserStartsAt,
} from './release';

/** Ett millisekund — grensen testes på begge sider av samme instant. */
const MS = 1;

describe('KAVALKADE_CUTOFF', () => {
  it('is midnight on 24 December 2026, read on the Oslo clock', () => {
    const parts = osloParts(KAVALKADE_CUTOFF);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(11); // 0-indeksert, som Date#getMonth
    expect(parts.day).toBe(24);
    expect(parts.hour).toBe(0);
    expect(parts.minute).toBe(0);
  });

  it('is the year the cavalcade tells about', () => {
    expect(KAVALKADE_YEAR).toBe(2026);
  });
});

describe('isKavalkadeOpen', () => {
  const noOverride = {};

  it('is closed one millisecond before the cutoff', () => {
    const justBefore = new Date(KAVALKADE_CUTOFF.getTime() - MS);
    expect(isKavalkadeOpen(justBefore, noOverride)).toBe(false);
  });

  it('is open exactly at the cutoff', () => {
    expect(isKavalkadeOpen(new Date(KAVALKADE_CUTOFF), noOverride)).toBe(true);
  });

  it('is open one millisecond after the cutoff', () => {
    const justAfter = new Date(KAVALKADE_CUTOFF.getTime() + MS);
    expect(isKavalkadeOpen(justAfter, noOverride)).toBe(true);
  });

  it('is still closed the evening before, Oslo time', () => {
    // 23.12.2026 kl. 23:59 i Oslo.
    const eveningBefore = new Date('2026-12-23T22:59:00Z');
    expect(isKavalkadeOpen(eveningBefore, noOverride)).toBe(false);
  });
});

describe('KAVALKADE_OPEN_AT', () => {
  const beforeCutoff = new Date('2026-11-15T12:00:00Z');

  it('opens the cavalcade early outside production', () => {
    const env = {
      KAVALKADE_OPEN_AT: '2026-11-01T00:00:00Z',
      VERCEL_ENV: 'preview',
    };
    expect(kavalkadeOpensAt(env).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(isKavalkadeOpen(beforeCutoff, env)).toBe(true);
  });

  it('is ignored in production, so real players never see it early', () => {
    const env = {
      KAVALKADE_OPEN_AT: '2026-11-01T00:00:00Z',
      VERCEL_ENV: 'production',
    };
    expect(kavalkadeOpensAt(env).getTime()).toBe(KAVALKADE_CUTOFF.getTime());
    expect(isKavalkadeOpen(beforeCutoff, env)).toBe(false);
  });

  it('falls back to the cutoff when the override is unreadable', () => {
    const env = { KAVALKADE_OPEN_AT: 'julaften', VERCEL_ENV: 'preview' };
    expect(kavalkadeOpensAt(env).getTime()).toBe(KAVALKADE_CUTOFF.getTime());
    expect(isKavalkadeOpen(beforeCutoff, env)).toBe(false);
  });

  it('can also push the opening later, for a staging run before the date', () => {
    const env = {
      KAVALKADE_OPEN_AT: '2027-01-01T00:00:00Z',
      VERCEL_ENV: 'preview',
    };
    expect(isKavalkadeOpen(new Date(KAVALKADE_CUTOFF), env)).toBe(false);
  });

  it('hands out a copy, so a caller cannot move the shared cutoff', () => {
    const opensAt = kavalkadeOpensAt({});
    opensAt.setFullYear(1999);
    expect(KAVALKADE_CUTOFF.toISOString()).toBe('2026-12-23T23:00:00.000Z');
  });
});

describe('forsidens vinduer (#2131)', () => {
  const noOverride = {};

  it('teases from midnight on 1 December 2026, read on the Oslo clock', () => {
    const parts = osloParts(KAVALKADE_TEASER_START);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(11); // 0-indeksert, som Date#getMonth
    expect(parts.day).toBe(1);
    expect(parts.hour).toBe(0);
    expect(parts.minute).toBe(0);
  });

  it('drops the link at midnight after 31 January 2027, Oslo time', () => {
    // Selve grensen er 1. februar kl. 00:00 — siste synlige øyeblikk er
    // millisekundet før, sent 31. januar.
    const end = osloParts(KAVALKADE_LINK_END);
    expect(end.year).toBe(2027);
    expect(end.month).toBe(1);
    expect(end.day).toBe(1);
    expect(end.hour).toBe(0);
    const lastMoment = osloParts(new Date(KAVALKADE_LINK_END.getTime() - MS));
    expect(lastMoment.day).toBe(31);
    expect(lastMoment.hour).toBe(23);
  });

  it.each([
    ['the day before the teaser opens', new Date('2026-11-29T12:00:00Z'), null],
    ['one millisecond before the teaser', new Date(KAVALKADE_TEASER_START.getTime() - MS), null],
    ['exactly at the teaser start', new Date(KAVALKADE_TEASER_START), 'teaser'],
    ['mid-December', new Date('2026-12-12T09:00:00Z'), 'teaser'],
    ['one millisecond before the cutoff', new Date(KAVALKADE_CUTOFF.getTime() - MS), 'teaser'],
    ['exactly at the cutoff', new Date(KAVALKADE_CUTOFF), 'link'],
    ['New Year', new Date('2027-01-01T12:00:00Z'), 'link'],
    ['the last moment of 31 January', new Date(KAVALKADE_LINK_END.getTime() - MS), 'link'],
    ['1 February', new Date(KAVALKADE_LINK_END), null],
    ['spring', new Date('2027-04-01T12:00:00Z'), null],
  ] as const)('shows %s → %s', (_label, now, expected) => {
    expect(kavalkadeHomeSlot(now, noOverride)).toBe(expected);
  });

  // Vinduene henger på åpningstidspunktet, ikke på to nye absolutte datoer. Det
  // er dette som gjør begge flatene synlige på staging før desember.
  it('follows KAVALKADE_OPEN_AT outside production', () => {
    const env = { KAVALKADE_OPEN_AT: '2026-09-20T12:00:00Z', VERCEL_ENV: 'preview' };
    expect(kavalkadeTeaserStartsAt(env).toISOString()).toBe('2026-08-28T12:00:00.000Z');
    expect(kavalkadeLinkEndsAt(env).toISOString()).toBe('2026-10-29T12:00:00.000Z');
    expect(kavalkadeHomeSlot(new Date('2026-09-20T11:00:00Z'), env)).toBe('teaser');
    expect(kavalkadeHomeSlot(new Date('2026-09-20T13:00:00Z'), env)).toBe('link');
  });

  it('ignores the override in production, so the teaser never comes early', () => {
    const env = { KAVALKADE_OPEN_AT: '2026-09-20T12:00:00Z', VERCEL_ENV: 'production' };
    expect(kavalkadeTeaserStartsAt(env).getTime()).toBe(KAVALKADE_TEASER_START.getTime());
    expect(kavalkadeHomeSlot(new Date('2026-09-20T11:00:00Z'), env)).toBeNull();
  });
});
