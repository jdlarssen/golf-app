import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit 20.11 (p18): the realtime handlers fired the merge with `void` and no
// catch. A failed merge (session lookup, IndexedDB) became an unhandled
// rejection and the change was dropped in silence.

type Handler = (payload: { new: Record<string, unknown> | null; old?: unknown }) => void;
const handlers: Handler[] = [];

vi.mock('./realtimeChannel', () => ({
  subscribeRealtimeChannel: (
    _topic: string,
    build: (channel: { on: (...args: unknown[]) => unknown }) => unknown,
  ) => {
    const channel = {
      on: (_event: unknown, _filter: unknown, handler: Handler) => {
        handlers.push(handler);
        return channel;
      },
    };
    build(channel);
    return () => {};
  },
}));

const mergeServerScore = vi.fn();
vi.mock('./mergeServerScore', () => ({ mergeServerScore: (...a: unknown[]) => mergeServerScore(...a) }));
const mergeServerTeeShots = vi.fn();
vi.mock('./writeTeeShot', () => ({
  mergeServerTeeShots: (...a: unknown[]) => mergeServerTeeShots(...a),
  fromTeeShotRow: (row: unknown) => row,
}));
vi.mock('./currentUser', () => ({ currentDeviceUserId: async () => 'u1' }));

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  handlers.length = 0;
  vi.clearAllMocks();
});

describe('realtime merges — a failure is caught (p18)', () => {
  it('a failing score merge is logged, not an unhandled rejection', async () => {
    const boom = new Error('IndexedDB closed');
    mergeServerScore.mockRejectedValue(boom);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { subscribeGameScores } = await import('./realtime');
      subscribeGameScores('g1');
      handlers[0]!({
        new: {
          game_id: 'g1',
          user_id: 'u2',
          hole_number: 3,
          strokes: 4,
          putts: null,
          entered_by: 'u2',
          client_updated_at: '2026-11-20T10:00:00+00:00',
          updated_at: '2026-11-20T10:00:01+00:00',
        },
      });
      await flush();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('[realtime] score merge failed', boom);
    errorSpy.mockRestore();
  });

  it('a failing tee-shot merge is logged, not an unhandled rejection', async () => {
    const boom = new Error('IndexedDB closed');
    mergeServerTeeShots.mockRejectedValue(boom);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { subscribeGameTeeShots } = await import('./realtime');
      subscribeGameTeeShots('g1');
      handlers[0]!({
        new: {
          game_id: 'g1',
          team_number: 1,
          hole_number: 3,
          tee_shot_by: 'u2',
          entered_by: 'u2',
          client_updated_at: '2026-11-20T10:00:00+00:00',
          updated_at: '2026-11-20T10:00:01+00:00',
        },
      });
      await flush();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('[realtime] tee-shot merge failed', boom);
    errorSpy.mockRestore();
  });
});
