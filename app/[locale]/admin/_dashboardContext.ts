import { cache } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getRoleContext } from '@/lib/admin/auth';
import type { OsloTimeOfDay } from '@/lib/format/osloCalendar';

// Request-scoped Supabase client + verified user id. The id is forwarded by
// proxy.ts (which already verified the session) so the three Suspense bodies
// on the dashboard don't each pay another Supabase Auth round-trip.
export const getAdminContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

// Role context cached for the whole request. Non-redirecting (#392): /admin is
// the universal Klubbhuset room, so a non-admin is NOT bounced — the page
// branches on role and renders a minimal player view instead.
export const getRole = cache(async () => {
  const { supabase } = await getAdminContext();
  return getRoleContext(supabase);
});

/** Maps the Oslo time-of-day bucket to its greeting translation key. */
export const TIME_OF_DAY_KEY: Record<
  OsloTimeOfDay,
  'timeOfDayMorgen' | 'timeOfDayFormiddag' | 'timeOfDayEttermiddag' | 'timeOfDayKveld'
> = {
  morgen: 'timeOfDayMorgen',
  formiddag: 'timeOfDayFormiddag',
  ettermiddag: 'timeOfDayEttermiddag',
  kveld: 'timeOfDayKveld',
};
