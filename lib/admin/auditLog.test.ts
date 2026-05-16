import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockInsert: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: mockFrom,
  }),
}));

beforeEach(() => {
  mockInsert = vi.fn(async () => ({ error: null }));
  mockFrom = vi.fn(() => ({ insert: mockInsert }));
});

describe('logAdminEvent', () => {
  it('inserts a row with required fields + defaults for optionals', async () => {
    const { logAdminEvent } = await import('./auditLog');

    await logAdminEvent({
      actorId: 'admin-1',
      actorName: 'Jørgen',
      eventType: 'game.finished',
      targetType: 'game',
      targetId: 'g-1',
      payload: { gameName: 'Test' },
    });

    expect(mockFrom).toHaveBeenCalledWith('admin_audit_log');
    expect(mockInsert).toHaveBeenCalledWith({
      actor_user_id: 'admin-1',
      actor_name: 'Jørgen',
      event_type: 'game.finished',
      target_type: 'game',
      target_id: 'g-1',
      payload: { gameName: 'Test' },
    });
  });

  it('defaults optional fields to null/empty', async () => {
    const { logAdminEvent } = await import('./auditLog');

    await logAdminEvent({
      actorId: 'admin-1',
      actorName: 'Jørgen',
      eventType: 'game.reopened',
    });

    expect(mockInsert).toHaveBeenCalledWith({
      actor_user_id: 'admin-1',
      actor_name: 'Jørgen',
      event_type: 'game.reopened',
      target_type: null,
      target_id: null,
      payload: {},
    });
  });

  it('swallows DB errors so the caller can finish their action', async () => {
    mockInsert = vi.fn(async () => ({ error: { message: 'unique violation' } }));
    mockFrom = vi.fn(() => ({ insert: mockInsert }));
    const { logAdminEvent } = await import('./auditLog');

    // Should not throw.
    await expect(
      logAdminEvent({
        actorId: 'admin-1',
        actorName: 'Jørgen',
        eventType: 'scorecard.approved',
      }),
    ).resolves.toBeUndefined();
  });

  it('swallows thrown errors too (network failure, etc.)', async () => {
    mockInsert = vi.fn(async () => {
      throw new Error('network down');
    });
    mockFrom = vi.fn(() => ({ insert: mockInsert }));
    const { logAdminEvent } = await import('./auditLog');

    await expect(
      logAdminEvent({
        actorId: 'admin-1',
        actorName: 'Jørgen',
        eventType: 'scorecard.reopened',
      }),
    ).resolves.toBeUndefined();
  });
});
