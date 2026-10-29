import 'server-only';
import type { getServerClient } from '@/lib/supabase/server';

/**
 * #1023 — validates a `?bane=` course id for the wizard: the deep link from
 * the public course pages, and since #2485 the way back from /opprett-bane
 * («Bruk denne», or a course you just saved). Returns the course id when the
 * course exists (RLS: courses are world-readable, so any authed user resolves
 * it), otherwise `null` and the wizard opens without it. A malformed value (not
 * a UUID) makes PostgREST error; that is swallowed into the same silent-ignore
 * path.
 */
export async function loadBaneCourseId(
  baneId: string,
  supabase: Awaited<ReturnType<typeof getServerClient>>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('id')
    .eq('id', baneId)
    .maybeSingle<{ id: string }>();
  // Best-effort by design (#1445): samme avveining som revansje-prefillen —
  // bane-prefill er valgfri, veiviseren åpner tom hvis oppslaget glapp.
  if (error || !data) {
    if (error) {
      console.error('[loadBaneCourseId] course lookup failed', error);
    }
    return null;
  }
  return data.id;
}
