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

/** Status callback the channel was subscribed with (#2093). */
let channelStatus: ((status: string) => void) | null = null;
/** Count queries issued so far, and answers a test wants to hold back. */
let countFetches = 0;
type CountAnswer =
  | { count: number; error: null }
  | { count: null; error: { message: string } };
let queuedCounts: Promise<CountAnswer>[] = [];

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
    // Mock-funksjoner trenger riktige type-signaturer for å matche
    // @supabase/supabase-js, men de fleste parametre brukes ikke i mock-body-en
    // (underscore-prefiks gjør at linteren ignorerer dem).
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
        subscribe(callback?: (status: string) => void) {
          channelStatus = callback ?? null;
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
          is: (_col2: string, _val2: null) => {
            countFetches += 1;
            return (
              queuedCounts.shift() ??
              Promise.resolve({ count: mockInitialCount, error: null })
            );
          },
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
  channelStatus = null;
  countFetches = 0;
  queuedCounts = [];
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

  // #2093: an event is a signal to count again, never a +1/-1. Realtime can
  // deliver the same event twice while the channel is rebuilt, and whatever
  // happened during an outage never arrives at all.
  it('teller på nytt når varsler kommer eller endres, også når samme hendelse leveres to ganger', async () => {
    mockInitialCount = 1;
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { result } = renderHook(() => useUnreadNotificationsCount('user-1'));
    await waitFor(() => expect(result.current.count).toBe(1));
    await flushPromises();
    const fetchesAfterMount = countFetches;

    mockInitialCount = 2;
    act(() => {
      realtimeHandlers.insert?.({ new: { read_at: null } });
      realtimeHandlers.insert?.({ new: { read_at: null } });
      realtimeHandlers.update?.({
        old: { read_at: null },
        new: { read_at: null },
      });
    });

    await waitFor(() => expect(result.current.count).toBe(2));
    // The burst collapses into one count query.
    expect(countFetches - fetchesAfterMount).toBe(1);
  });

  it('teller på nytt når kanalen er tilbake etter et brudd', async () => {
    mockInitialCount = 0;
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { result } = renderHook(() => useUnreadNotificationsCount('user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await flushPromises();

    // Committed while the channel was down: no event will ever say so.
    mockInitialCount = 4;
    act(() => {
      channelStatus?.('CHANNEL_ERROR');
      channelStatus?.('SUBSCRIBED');
    });

    await waitFor(() => expect(result.current.count).toBe(4));
  });

  it('lar prikken stå når en ny telling feiler', async () => {
    mockInitialCount = 2;
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { result } = renderHook(() => useUnreadNotificationsCount('user-1'));
    await waitFor(() => expect(result.current.count).toBe(2));
    await flushPromises();

    // Coverage is still patchy right after the rejoin: the count query fails.
    const fetchesBefore = countFetches;
    queuedCounts.push(
      Promise.resolve({ count: null, error: { message: 'Failed to fetch' } }),
    );
    act(() => {
      channelStatus?.('CHANNEL_ERROR');
      channelStatus?.('SUBSCRIBED');
    });
    await waitFor(() => expect(countFetches).toBe(fetchesBefore + 1));
    await act(async () => {
      await flushPromises();
    });

    // An error is not zero unread.
    expect(result.current.count).toBe(2);
  });

  it('lar ikke et eldre svar erstatte et nyere', async () => {
    let answerMount!: (count: number) => void;
    queuedCounts.push(
      new Promise((resolve) => {
        answerMount = (count) => resolve({ count, error: null });
      }),
    );
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { result } = renderHook(() => useUnreadNotificationsCount('user-1'));
    await flushPromises();

    // The mount query is still out when an event's query answers.
    mockInitialCount = 3;
    act(() => {
      realtimeHandlers.insert?.({ new: { read_at: null } });
    });
    await waitFor(() => expect(result.current.count).toBe(3));

    await act(async () => {
      answerMount(2);
      await flushPromises();
    });

    expect(result.current.count).toBe(3);
  });

  it('rydder opp realtime-kanalen ved unmount', async () => {
    const { useUnreadNotificationsCount } = await import(
      './useUnreadNotificationsCount'
    );
    const { unmount } = renderHook(() => useUnreadNotificationsCount('user-1'));

    await flushPromises();
    // #1366: hooken går via subscribeRealtimeChannel, som primer realtime-auth
    // med en argumentløs setAuth før kanalen bygges — med argument ville
    // biblioteket sluttet å fornye tokenet selv.
    expect(setAuthSpy).toHaveBeenCalledWith();
    unmount();
    await flushPromises();

    expect(removeChannelSpy).toHaveBeenCalled();
  });
});
