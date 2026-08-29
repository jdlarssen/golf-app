'use server';

import { getServerClient } from '@/lib/supabase/server';
import { expectOneOrClaim } from '@/lib/supabase/claimFallback';

type SubJSON = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

/**
 * Upsert the caller's push subscription for the current device (#24). RLS limits
 * rows to the caller; user_id is taken from the session, never the client.
 *
 * The endpoint is globally unique, so a device that switches accounts conflicts
 * on `endpoint` and RLS refuses the naive upsert. Same recovery as
 * registerApnsToken: the possession-gated claim RPC (0167, #1790) moves the row
 * to the caller, because presenting the exact endpoint proves device possession.
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

  const userAgentSlim = userAgent.slice(0, 400);
  await expectOneOrClaim(
    await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: userAgentSlim,
        },
        { onConflict: 'endpoint' },
      )
      .select(),
    'savePushSubscription',
    () =>
      supabase.rpc('claim_push_subscription', {
        p_endpoint: endpoint,
        p_p256dh: p256dh,
        p_auth: auth,
        p_user_agent: userAgentSlim,
      }),
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
