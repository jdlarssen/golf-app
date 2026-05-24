import { describe, it, expect } from 'vitest';
import { buildMarkReadQuery } from './markRead';

describe('buildMarkReadQuery', () => {
  it('filtrerer kun på userId når ingen andre filter er gitt', () => {
    const filters = buildMarkReadQuery({ userId: 'u1' });
    expect(filters).toEqual({
      userId: 'u1',
      notificationId: null,
      kind: null,
      entityId: null,
    });
  });

  it('filtrerer på userId + kind', () => {
    const filters = buildMarkReadQuery({ userId: 'u1', kind: 'invite' });
    expect(filters).toEqual({
      userId: 'u1',
      notificationId: null,
      kind: 'invite',
      entityId: null,
    });
  });

  it('filtrerer på userId + kind + entityId (game-scoped)', () => {
    const filters = buildMarkReadQuery({
      userId: 'u1',
      kind: 'game_finished',
      entityId: 'game-uuid',
    });
    expect(filters).toEqual({
      userId: 'u1',
      notificationId: null,
      kind: 'game_finished',
      entityId: 'game-uuid',
    });
  });

  it('filtrerer på userId + notificationId (per-tap fra innboks)', () => {
    const filters = buildMarkReadQuery({
      userId: 'u1',
      notificationId: 'n-uuid',
    });
    expect(filters).toEqual({
      userId: 'u1',
      notificationId: 'n-uuid',
      kind: null,
      entityId: null,
    });
  });
});
