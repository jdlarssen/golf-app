import { describe, it, expect } from 'vitest';
import { buildMarkReadQuery } from './markRead';

describe('buildMarkReadQuery', () => {
  it('filtrerer kun på userId når kind+entityId ikke gitt', () => {
    const filters = buildMarkReadQuery({ userId: 'u1' });
    expect(filters).toEqual({ userId: 'u1', kind: null, entityId: null });
  });

  it('filtrerer på userId + kind', () => {
    const filters = buildMarkReadQuery({ userId: 'u1', kind: 'invite' });
    expect(filters).toEqual({ userId: 'u1', kind: 'invite', entityId: null });
  });

  it('filtrerer på userId + kind + entityId (game-scoped)', () => {
    const filters = buildMarkReadQuery({
      userId: 'u1',
      kind: 'game_finished',
      entityId: 'game-uuid',
    });
    expect(filters).toEqual({
      userId: 'u1',
      kind: 'game_finished',
      entityId: 'game-uuid',
    });
  });
});
