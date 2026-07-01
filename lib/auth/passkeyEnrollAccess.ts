import 'server-only';
import { cache } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { parsePasskeyFlag } from './passkeyFlag';

/**
 * Server-resolved answer to "may the current user enroll a passkey?" — the real
 * admin-first gate for issue #63. Combines the `NEXT_PUBLIC_PASSKEYS` flag with
 * the user's `is_admin` status.
 *
 * Only the `admin` phase needs the role, so `off`/`on` short-circuit before any
 * DB round-trip. Memoised per render via `cache()`.
 */
export const getPasskeyEnrollAccess = cache(async (): Promise<boolean> => {
  const flag = parsePasskeyFlag(process.env.NEXT_PUBLIC_PASSKEYS);
  if (flag === 'off') return false;
  if (flag === 'on') return true;

  // 'admin' phase — enrollment is limited to admins.
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  if (!userId) return false;
  const { data } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return data?.is_admin === true;
});
