import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock-state må eksistere FØR komponenten importerer browser-klienten.
let mockInitialCount = 0;
let realtimeHandlers: {
  insert?: (payload: { new: { read_at: string | null } }) => void;
  update?: (payload: {
    old: { read_at: string | null };
    new: { read_at: string | null };
  }) => void;
} = {};

// Spies vi inspiserer på tvers av tester.
const setAuthSpy = vi.fn();
const removeChannelSpy = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'jwt-token' } },
      }),
    },
    realtime: {
      setAuth: setAuthSpy,
      getChannels: () => [],
    },
    channel: (_topic: string) => {
      const ch = {
        on(
          _kind: string,
          opts: { event: 'INSERT' | 'UPDATE' },
          handler: (payload: never) => void,
        ) {
          if (opts.event === 'INSERT') realtimeHandlers.insert = handler as never;
          if (opts.event === 'UPDATE') realtimeHandlers.update = handler as never;
          return ch;
        },
        subscribe() {
          return ch;
        },
      };
      return ch;
    },
    removeChannel: (...args: unknown[]) => {
      removeChannelSpy(...args);
      return Promise.resolve('ok' as const);
    },
    from: (_table: string) => ({
      select: (
        _cols: string,
        _opts?: { count: 'exact'; head: true },
      ) => ({
        eq: (_col: string, _val: string) => ({
          is: (_col2: string, _val2: null) =>
            Promise.resolve({ count: mockInitialCount, error: null }),
        }),
      }),
    }),
  }),
}));

async function flushPromises() {
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  mockInitialCount = 0;
  realtimeHandlers = {};
  setAuthSpy.mockClear();
  removeChannelSpy.mockClear();
});

describe('useUnreadNotificationsCount', () => {
  it('returnerer count=0 og loading=false når userId er null', async () => {
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { result } = renderHook(() => useUnreadNotificationsCount(null));

    expect(result.current.count).toBe(0);
    // Når userId mangler hopper vi over fetch og er ikke i loading-tilstand.
    expect(result.current.loading).toBe(false);
  });

  it('henter initial count fra Supabase og setter loading=false', async () => {
    mockInitialCount = 3;
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { result } = renderHook(() => useUnreadNotificationsCount('user-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.count).toBe(3);
  });

  it('inkrementer count på INSERT av ulest varsel', async () => {
    mockInitialCount = 1;
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { result } = renderHook(() => useUnreadNotificationsCount('user-1'));

    await waitFor(() => expect(result.current.count).toBe(1));
    await flushPromises(); // ensure realtime sub har koblet seg på

    act(() => {
      realtimeHandlers.insert?.({ new: { read_at: null } });
    });

    expect(result.current.count).toBe(2);
  });

  it('inkrementer IKKE på INSERT av allerede-lest varsel', async () => {
    mockInitialCount = 0;
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { result } = renderHook(() => useUnreadNotificationsCount('user-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await flushPromises();

    act(() => {
      realtimeHandlers.insert?.({ new: { read_at: '2026-05-24T10:00:00Z' } });
    });

    expect(result.current.count).toBe(0);
  });

  it('dekrementerer count på UPDATE der ulest blir lest', async () => {
    mockInitialCount = 2;
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { result } = renderHook(() => useUnreadNotificationsCount('user-1'));

    await waitFor(() => expect(result.current.count).toBe(2));
    await flushPromises();

    act(() => {
      realtimeHandlers.update?.({
        old: { read_at: null },
        new: { read_at: '2026-05-24T10:00:00Z' },
      });
    });

    expect(result.current.count).toBe(1);
  });

  it('inkrementerer på UPDATE der lest gjenåpnes som ulest', async () => {
    // Defensiv-test: vi støtter ikke un-read-flyt i UI, men hooken må håndtere
    // det riktig hvis DB-staten skifter via direkte SQL eller framtidig feature.
    mockInitialCount = 0;
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { result } = renderHook(() => useUnreadNotificationsCount('user-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await flushPromises();

    act(() => {
      realtimeHandlers.update?.({
        old: { read_at: '2026-05-24T10:00:00Z' },
        new: { read_at: null },
      });
    });

    expect(result.current.count).toBe(1);
  });

  it('floorer count på 0 selv om dekrement-events kommer for tidlig', async () => {
    mockInitialCount = 0;
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { result } = renderHook(() => useUnreadNotificationsCount('user-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await flushPromises();

    act(() => {
      realtimeHandlers.update?.({
        old: { read_at: null },
        new: { read_at: '2026-05-24T10:00:00Z' },
      });
    });

    // Negative tellere ville bryte badge-visningen (count > 0 ? prikk : ingen).
    expect(result.current.count).toBe(0);
  });

  it('rydder opp realtime-kanalen ved unmount', async () => {
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { unmount } = renderHook(() => useUnreadNotificationsCount('user-1'));

    await flushPromises();
    unmount();
    await flushPromises();

    expect(removeChannelSpy).toHaveBeenCalled();
  });
});
