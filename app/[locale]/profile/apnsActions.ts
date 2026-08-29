'use server';

import { getServerClient } from '@/lib/supabase/server';
import { expectOneOrClaim } from '@/lib/supabase/claimFallback';

/**
 * Register the caller's APNs device token for the iOS shell (#1282). Sister to
 * savePushSubscription — same rule: RLS limits rows to the caller and user_id
 * comes from the session, never from the client.
 *
 * The token is globally unique, so a device that switches accounts conflicts on
 * `token`. RLS still refuses the naive upsert (the existing row belongs to the
 * other user) — that refusal is what keeps takeover out of the normal write
 * path. The recovery is the possession-gated claim RPC (0167, #1790): only a
 * caller presenting the exact unguessable token — proof the device is theirs —
 * gets the row moved to their account.
 */
export async function registerApnsToken(token: string, userAgent: string): Promise<void> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');
  if (!token) throw new Error('invalid_token');

  const userAgentSlim = userAgent.slice(0, 400);
  await expectOneOrClaim(
    await supabase
      .from('apns_tokens')
      .upsert(
        {
          user_id: user.id,
          token,
          user_agent: userAgentSlim,
        },
        { onConflict: 'token' },
      )
      .select(),
    'registerApnsToken',
    () =>
      supabase.rpc('claim_apns_token', {
        p_token: token,
        p_user_agent: userAgentSlim,
      }),
  );
}

/** Drop the caller's token for this device (turn push off in the shell). */
export async function removeApnsToken(token: string): Promise<void> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  // Best-effort, like removePushSubscription: the sender may already have pruned
  // this row on a 410, and deleting nothing is the correct outcome then.
  await supabase.from('apns_tokens').delete().eq('token', token).eq('user_id', user.id);
}
