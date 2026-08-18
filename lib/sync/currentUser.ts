import { getBrowserClient } from '@/lib/supabase/client';

/**
 * Who is logged in on THIS device (#1368) — needed by every path that has to
 * decide whether a number about to be overwritten was typed here.
 *
 * `getSession` reads local storage and resolves offline, which is exactly when
 * the sync queue fills up; `getUser` would round-trip to the server and fail
 * there. A sync path must never break on this lookup, so any failure returns
 * null and the caller falls back to the pre-#1368 proxy
 * (see `conflictRecordFor`).
 */
export async function currentDeviceUserId(): Promise<string | null> {
  try {
    const { data } = await getBrowserClient().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}
