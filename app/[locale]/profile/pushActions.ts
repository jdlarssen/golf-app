'use server';

import { getServerClient } from '@/lib/supabase/server';
import { expectOne } from '@/lib/supabase/affectedRows';

type SubJSON = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

/**
 * Upsert the caller's push subscription for the current device (#24). RLS limits
 * rows to the caller; user_id is taken from the session, never the client.
 */
export async function savePushSubscription(sub: SubJSON, userAgent: string): Promise<void> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error('invalid_subscription');

  expectOne(
    await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: userAgent.slice(0, 400),
        },
        { onConflict: 'endpoint' },
      )
      .select(),
    'savePushSubscription',
  );
}

/** Remove the caller's subscription for a given endpoint (turn off this device). */
export async function removePushSubscription(endpoint: string): Promise<void> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  // Best-effort: deleting an already-gone row is fine (no expectAffected here —
  // the client may have unsubscribed a sub the server already pruned on 410).
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id);
}
