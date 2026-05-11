import { describe, it, expect } from 'vitest';
import { resolveConflict } from './conflict';

describe('resolveConflict', () => {
  it('returns local-wins when local is newer', () => {
    expect(
      resolveConflict({
        localClientUpdatedAt: '2026-05-11T10:00:01.000Z',
        serverClientUpdatedAt: '2026-05-11T10:00:00.000Z',
      }),
    ).toBe('local-wins');
  });
  it('returns server-wins when server is newer', () => {
    expect(
      resolveConflict({
        localClientUpdatedAt: '2026-05-11T10:00:00.000Z',
        serverClientUpdatedAt: '2026-05-11T10:00:01.000Z',
      }),
    ).toBe('server-wins');
  });
  it('returns equal when timestamps match', () => {
    expect(
      resolveConflict({
        localClientUpdatedAt: '2026-05-11T10:00:00.000Z',
        serverClientUpdatedAt: '2026-05-11T10:00:00.000Z',
      }),
    ).toBe('equal');
  });
});
