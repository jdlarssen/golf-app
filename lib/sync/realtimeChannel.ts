import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/supabase/client';

let nextSubscriptionId = 0;

/**
 * Consecutive `CHANNEL_ERROR`/`TIMED_OUT` statuses tolerated before we rebuild
 * the channel. Phoenix already re-joins on its own (RECONNECT_INTERVALS
 * `[1s, 2s, 5s, 10s]` in realtime-js) and fires the status callback on every
 * failed attempt, so anything lower would fight the library's own retry.
 */
const REBUILD_AFTER_CONSECUTIVE_FAILURES = 3;

/**
 * Backoff before each rebuild attempt, indexed by rebuilds since the last
 * `SUBSCRIBED`. Deliberately one step slower than phoenix' own rejoin ladder;
 * the last value repeats for every further attempt.
 */
const REBUILD_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000];

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Typed wrapper rundt `channel.on('postgres_changes', ...)`.
 *
 * Isolerer Supabase-JS sin svake typing for `postgres_changes`-events ett
 * sted (3 × `as never` per call-site) slik at hook-ene over kan kalle inn
 * uten å lekke any-typer. `TRow` er row-shape-en for både `payload.new` og
 * `payload.old`. For INSERT-events er `old` tomt objekt; for DELETE er
 * `new` tomt — caller velger hvilke som er løftet ut basert på event-typen.
 */
export type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export function onPostgresChange<TRow>(
  channel: RealtimeChannel,
  opts: {
    event: PostgresChangeEvent;
    schema: string;
    table: string;
    filter?: string;
  },
  handler: (payload: { new: TRow; old: TRow }) => void,
): RealtimeChannel {
  return channel.on('postgres_changes' as never, opts as never, handler as never);
}

/**
 * Subscribe to a Supabase realtime channel with leak-resistant cleanup and a
 * self-healing resubscribe loop.
 *
 * Each call gets a unique topic suffix (`${topic}#${n}`) so rapid re-mounts
 * cannot collide with a stale channel that's still completing its leave round-
 * trip. Without this, `supabase.channel(topic)` falls through to the existing
 * channel object whenever a previous unsubscribe is still in flight (or
 * silently failed with status `'error'`, in which case the channel stays in
 * `realtime.getChannels()` indefinitely) — which would accumulate listeners
 * and prevent proper teardown.
 *
 * **Token lifecycle is the library's, not ours (#1366).** We deliberately do
 * NOT call `realtime.setAuth(token)` here. Passing an explicit token flips
 * `_manuallySetToken` in realtime-js, which switches OFF the client's own token
 * upkeep: `_setAuthSafely` no-ops on connect and on every heartbeat, and the
 * join-ok handler skips `socket.setAuth()`. supabase-js already listens for
 * `TOKEN_REFRESHED`/`SIGNED_IN` and pushes the fresh token to every joined
 * channel (it does so as long as no `accessToken` option is passed to
 * `createClient` — ours isn't). A round lasts 4–5 hours and an access token
 * about one, so blocking that upkeep is what used to kill the channel
 * mid-round. `getSession()` is still awaited before subscribing: it refreshes
 * an expired token so the socket opens with a valid one.
 *
 * **Resubscribe.** `.subscribe()` gets a status callback. `CHANNEL_ERROR` and
 * `TIMED_OUT` only count; a rebuild (fresh channel from the same `configure`,
 * on a new unique topic) happens after
 * {@link REBUILD_AFTER_CONSECUTIVE_FAILURES} consecutive failures, with
 * {@link REBUILD_BACKOFF_MS} backoff — transient blips stay with phoenix'
 * rejoin. `SUBSCRIBED` resets both counters. `CLOSED` never rebuilds: it is
 * fired by our own cleanup, and rebuilding there would spawn a zombie channel
 * on unmount. Retries are parked while `navigator.onLine === false` (offline
 * guarantees an error loop) and resume on the `online` event. The new channel
 * is subscribed BEFORE the old one is removed, because `removeChannel` on the
 * last remaining channel tears down the whole socket.
 *
 * Cleanup is synchronous so it composes with React's `useEffect` return
 * contract; the underlying `removeChannel` is fire-and-forget (its Promise
 * resolves once the server acks the leave or the timeout elapses).
 */
export function subscribeRealtimeChannel(
  topic: string,
  configure: (channel: RealtimeChannel) => RealtimeChannel,
): () => void {
  const supabase = getBrowserClient();
  let unsubscribed = false;
  let channelRef: RealtimeChannel | null = null;
  /** Failed statuses since the last `SUBSCRIBED` (or the last rebuild). */
  let consecutiveFailures = 0;
  /** Rebuilds since the last `SUBSCRIBED` — indexes the backoff ladder. */
  let rebuildAttempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let parkedUntilOnline = false;

  function openChannel(): void {
    const channel = configure(
      supabase.channel(`${topic}#${++nextSubscriptionId}`),
    ).subscribe(handleStatus);
    const previous = channelRef;
    channelRef = channel;
    if (previous) {
      // Only now — removing the last channel first would disconnect the socket
      // the new one is about to join on.
      void supabase.removeChannel(previous);
    }
    if (unsubscribed) {
      channelRef = null;
      void supabase.removeChannel(channel);
    }
  }

  function scheduleRebuild(): void {
    if (unsubscribed || retryTimer) return;
    if (!isOnline()) {
      // No point burning backoff steps while the device is offline; the
      // `online` listener picks this up again.
      parkedUntilOnline = true;
      return;
    }
    const delay =
      REBUILD_BACKOFF_MS[
        Math.min(rebuildAttempts, REBUILD_BACKOFF_MS.length - 1)
      ]!;
    rebuildAttempts += 1;
    consecutiveFailures = 0;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (unsubscribed) return;
      openChannel();
    }, delay);
  }

  function handleStatus(status: string): void {
    if (unsubscribed) return;
    if (status === 'SUBSCRIBED') {
      consecutiveFailures = 0;
      rebuildAttempts = 0;
      return;
    }
    // Anything else that isn't an error — notably CLOSED, which our own
    // removeChannel fires — is left alone.
    if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
    consecutiveFailures += 1;
    if (consecutiveFailures < REBUILD_AFTER_CONSECUTIVE_FAILURES) return;
    scheduleRebuild();
  }

  function handleOnline(): void {
    if (unsubscribed || !parkedUntilOnline) return;
    parkedUntilOnline = false;
    scheduleRebuild();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  void (async () => {
    // Pre-warm the session: an expired access token is refreshed here, so the
    // socket opens with a valid one. No setAuth — see the doc comment.
    await supabase.auth.getSession();
    if (unsubscribed) return;
    openChannel();
  })();

  return () => {
    unsubscribed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (channelRef) {
      void supabase.removeChannel(channelRef);
      channelRef = null;
    }
  };
}
