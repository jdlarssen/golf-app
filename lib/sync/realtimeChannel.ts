import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/supabase/client';

let nextSubscriptionId = 0;

/**
 * Subscribe to a Supabase realtime channel with leak-resistant cleanup.
 *
 * Each call gets a unique topic suffix (`${topic}#${n}`) so rapid re-mounts
 * cannot collide with a stale channel that's still completing its leave round-
 * trip. Without this, `supabase.channel(topic)` falls through to the existing
 * channel object whenever a previous unsubscribe is still in flight (or
 * silently failed with status `'error'`, in which case the channel stays in
 * `realtime.getChannels()` indefinitely) — which would accumulate listeners
 * and prevent proper teardown.
 *
 * `setAuth()` is invoked before subscribe because the websocket transport
 * doesn't pick up the cookie session automatically — see the doc on
 * subscribeGameScores for the original quirk write-up.
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
  const uniqueTopic = `${topic}#${++nextSubscriptionId}`;
  let unsubscribed = false;
  let channelRef: RealtimeChannel | null = null;

  (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      supabase.realtime.setAuth(session.access_token);
    }
    if (unsubscribed) return;

    const channel = configure(supabase.channel(uniqueTopic)).subscribe();
    channelRef = channel;
    if (unsubscribed) {
      void supabase.removeChannel(channel);
    }
  })();

  return () => {
    unsubscribed = true;
    if (channelRef) {
      void supabase.removeChannel(channelRef);
    }
  };
}
