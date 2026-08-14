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
 * **Auth priming, then hands off (#1366).** `await realtime.setAuth()` — with NO
 * argument — runs before every channel is built. `RealtimeChannel.subscribe()`
 * snapshots the join payload synchronously and only attaches an `access_token`
 * if `socket.accessTokenValue` is already populated; on a cold client nothing
 * has populated it yet, so without this priming the first channel of a page
 * load joins tokenless. The no-arg call resolves the client's own
 * `accessToken` callback (supabase-js always wires it to `auth.getSession()`,
 * which also refreshes an expired token) and leaves `_manuallySetToken`
 * `false`.
 *
 * Never pass a token: `setAuth(token)` sets `_manuallySetToken`, and that
 * switches OFF the library's own upkeep — `_setAuthSafely` no-ops on connect
 * and on every heartbeat, and the join-ok handler skips `socket.setAuth()`.
 * A round lasts 4–5 hours and an access token about one, so blocking that
 * upkeep is what used to kill the channel mid-round. The separate
 * `auth.getSession()` pre-warm this helper used to do is gone: no-arg
 * `setAuth()` awaits the very same call internally, so it was redundant.
 *
 * **Resubscribe.** `.subscribe()` gets a status callback. `CHANNEL_ERROR` and
 * `TIMED_OUT` only count; a rebuild (fresh channel from the same `configure`,
 * on a new unique topic) happens after
 * {@link REBUILD_AFTER_CONSECUTIVE_FAILURES} consecutive failures, with
 * {@link REBUILD_BACKOFF_MS} backoff — transient blips stay with phoenix'
 * rejoin. `SUBSCRIBED` resets both counters. `CLOSED` never rebuilds: it is
 * fired by our own cleanup, and rebuilding there would spawn a zombie channel
 * on unmount. Retries are parked while `navigator.onLine === false` (offline
 * guarantees an error loop) and resume on the `online` event — or, if phoenix
 * recovers on its own meanwhile, the park is lifted by `SUBSCRIBED` so a later
 * wifi flap doesn't tear down a healthy channel. The new channel is subscribed
 * BEFORE the old one is removed, because `removeChannel` on the last remaining
 * channel tears down the whole socket.
 *
 * The failure budget is per channel generation: the doomed channel keeps
 * firing `CHANNEL_ERROR` throughout the backoff window and during its leave
 * round-trip, so statuses from a channel that is no longer the current one are
 * dropped, and the counter is reset when the replacement is built. Otherwise a
 * new channel would start life with a spent budget and rebuild on its first
 * hiccup.
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

  async function openChannel(): Promise<void> {
    // Prime realtime auth BEFORE the channel is built: `subscribe()` snapshots
    // the join payload synchronously and reads `socket.accessTokenValue` as it
    // stands right then. No argument — see the doc comment.
    await supabase.realtime.setAuth();
    if (unsubscribed) return;
    const channel = configure(
      supabase.channel(`${topic}#${++nextSubscriptionId}`),
    );
    const previous = channelRef;
    channelRef = channel;
    // A fresh generation gets a fresh budget: whatever the outgoing channel
    // shouted during the backoff window is not this one's debt.
    consecutiveFailures = 0;
    channel.subscribe((status) => handleStatus(status, channel));
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
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (unsubscribed) return;
      void openChannel();
    }, delay);
  }

  function handleStatus(status: string, channel: RealtimeChannel): void {
    // Statuses from a channel we already replaced don't count — it stays wired
    // to this handler until its leave round-trip completes.
    if (unsubscribed || channel !== channelRef) return;
    if (status === 'SUBSCRIBED') {
      consecutiveFailures = 0;
      rebuildAttempts = 0;
      // Phoenix got there on its own; nothing is waiting for `online` anymore.
      parkedUntilOnline = false;
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

  void openChannel();

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
