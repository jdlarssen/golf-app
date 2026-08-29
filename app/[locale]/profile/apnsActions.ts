'use server';

import { getServerClient } from '@/lib/supabase/server';
import { expectOne } from '@/lib/supabase/affectedRows';

/**
 * Register the caller's APNs device token for the iOS shell (#1282). Sister to
 * savePushSubscription — same rule: RLS limits rows to the caller and user_id
 * comes from the session, never from the client.
 *
 * The token is globally unique, so a device that switches accounts conflicts on
 * `token`. RLS deliberately refuses that takeover (the existing row belongs to
 * the other user), which fails loudly here rather than silently rerouting one
 * user's notifications to another user's device.
 */
export async function registerApnsToken(token: string, userAgent: string): Promise<void> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');
  if (!token) throw new Error('invalid_token');

  expectOne(
    await supabase
      .from('apns_tokens')
      .upsert(
        {
          user_id: user.id,
          token,
          user_agent: userAgent.slice(0, 400),
        },
        { onConflict: 'token' },
      )
      .select(),
    'registerApnsToken',
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
