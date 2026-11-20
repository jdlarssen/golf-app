import { describe, it, expect } from 'vitest';
import { isConfirmedLock } from './lockedCard';

describe('isConfirmedLock (p18)', () => {
  const active = { status: 'active' };
  it.each([
    ['delivered card', { submitted_at: 'x', withdrawn_at: null, games: active }, true],
    ['withdrawn player', { submitted_at: null, withdrawn_at: 'x', games: active }, true],
    ['round finished', { submitted_at: null, withdrawn_at: null, games: { status: 'finished' } }, true],
    ['still playing', { submitted_at: null, withdrawn_at: null, games: active }, false],
    ['game unreadable', { submitted_at: null, withdrawn_at: null, games: null }, false],
    ['no player row', null, false],
  ])('%s → %s', (_label, row, expected) => {
    expect(isConfirmedLock(row)).toBe(expected);
  });
});
