import { cache } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';

// Request-scoped Supabase client + verified user id. Sharing the same client
// across suspended siblings means we don't pay the cookie-auth round-trip
// per section.
export const getGameContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});
