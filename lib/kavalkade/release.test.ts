import { describe, it, expect } from 'vitest';
import { osloParts } from '@/lib/format/teeOff';
import {
  KAVALKADE_CUTOFF,
  KAVALKADE_YEAR,
  isKavalkadeOpen,
  kavalkadeOpensAt,
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
