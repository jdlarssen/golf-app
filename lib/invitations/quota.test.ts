import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTimeUntil } from './quota';

describe('formatTimeUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "snart" when the target is now or past', () => {
    expect(formatTimeUntil(new Date('2026-05-11T10:00:00Z'))).toBe('snart');
    expect(formatTimeUntil(new Date('2026-05-11T09:00:00Z'))).toBe('snart');
  });

  it('returns minutes when under 1 hour away', () => {
    expect(formatTimeUntil(new Date('2026-05-11T10:30:00Z'))).toBe('30 min');
    expect(formatTimeUntil(new Date('2026-05-11T10:01:00Z'))).toBe('1 min');
  });

  it('returns hours (floored) when 1 hour or more away', () => {
    expect(formatTimeUntil(new Date('2026-05-11T15:00:00Z'))).toBe('5 t');
    expect(formatTimeUntil(new Date('2026-05-11T11:00:00Z'))).toBe('1 t');
    // 5h 59min still rounds down to 5 hours
    expect(formatTimeUntil(new Date('2026-05-11T15:59:00Z'))).toBe('5 t');
  });

  it('ceils minutes (so 30s remaining shows as 1 min, not 0)', () => {
    expect(formatTimeUntil(new Date('2026-05-11T10:00:30Z'))).toBe('1 min');
  });
});

import { getQuotaState, DAILY_INVITE_LIMIT, QUOTA_WINDOW_MS } from './quota';

type FakeSupabase = {
  from: ReturnType<typeof vi.fn>;
};

function makeMockClient(rows: { created_at: string }[]) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(builder),
  } as unknown as FakeSupabase;
}

describe('getQuotaState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('reports not-exhausted when under the limit', async () => {
    // 5 invites in last 24h
    const rows = Array.from({ length: 5 }, (_, i) => ({
      created_at: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
    }));
    const client = makeMockClient(rows);

    const state = await getQuotaState(client as never, 'user-1');

    expect(state.count).toBe(5);
    expect(state.limit).toBe(DAILY_INVITE_LIMIT);
    expect(state.isExhausted).toBe(false);
    expect(state.nextSlotAt).toBeNull();
  });

  it('reports exhausted with nextSlotAt = oldest + 24h when at limit', async () => {
    // 10 invites, oldest at 23h ago
    const oldest = new Date('2026-05-10T11:00:00Z');
    const rows = [
      { created_at: oldest.toISOString() },
      ...Array.from({ length: 9 }, (_, i) => ({
        created_at: new Date(
          Date.now() - (i + 1) * 30 * 60 * 1000,
        ).toISOString(),
      })),
    ];
    const client = makeMockClient(rows);

    const state = await getQuotaState(client as never, 'user-1');

    expect(state.count).toBe(10);
    expect(state.isExhausted).toBe(true);
    expect(state.nextSlotAt?.toISOString()).toBe(
      new Date(oldest.getTime() + QUOTA_WINDOW_MS).toISOString(),
    );
  });

  it('reports 0 when no invites in window', async () => {
    const client = makeMockClient([]);
    const state = await getQuotaState(client as never, 'user-1');
    expect(state.count).toBe(0);
    expect(state.isExhausted).toBe(false);
    expect(state.nextSlotAt).toBeNull();
  });

  it('throws if supabase returns an error', async () => {
    const errorBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'rls denied' },
      }),
    };
    const client = {
      from: vi.fn().mockReturnValue(errorBuilder),
    } as unknown as FakeSupabase;

    await expect(getQuotaState(client as never, 'user-1')).rejects.toThrow();
  });

  it('treats count === DAILY_INVITE_LIMIT - 1 as not exhausted', async () => {
    // 9 invites in last 24h — just under the limit
    const rows = Array.from({ length: DAILY_INVITE_LIMIT - 1 }, (_, i) => ({
      created_at: new Date(Date.now() - (i + 1) * 60 * 60 * 1000).toISOString(),
    }));
    const client = makeMockClient(rows);

    const state = await getQuotaState(client as never, 'user-1');

    expect(state.count).toBe(DAILY_INVITE_LIMIT - 1);
    expect(state.isExhausted).toBe(false);
    expect(state.nextSlotAt).toBeNull();
  });

  it('treats count above the limit as exhausted with nextSlotAt computed', async () => {
    // 11 invites — one over the limit; oldest sets the nextSlotAt
    const oldest = new Date('2026-05-10T11:30:00Z');
    const rows = [
      { created_at: oldest.toISOString() },
      ...Array.from({ length: DAILY_INVITE_LIMIT }, (_, i) => ({
        created_at: new Date(
          Date.now() - (i + 1) * 30 * 60 * 1000,
        ).toISOString(),
      })),
    ];
    const client = makeMockClient(rows);

    const state = await getQuotaState(client as never, 'user-1');

    expect(state.count).toBe(DAILY_INVITE_LIMIT + 1);
    expect(state.isExhausted).toBe(true);
    expect(state.nextSlotAt?.toISOString()).toBe(
      new Date(oldest.getTime() + QUOTA_WINDOW_MS).toISOString(),
    );
  });

  it('filters out game-scoped invites via the .is(game_id, null) clause', async () => {
    const rows = [
      { created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
    ];
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const client = {
      from: vi.fn().mockReturnValue(builder),
    } as unknown as FakeSupabase;

    await getQuotaState(client as never, 'user-1');

    expect(builder.is).toHaveBeenCalledWith('game_id', null);
  });
});
