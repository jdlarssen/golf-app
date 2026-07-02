import { getAdminContext } from './_dashboardContext';
import { KeyMetricsView, type KeyMetrics } from './KeyMetricsView';

/**
 * «Nøkkeltall»-card (#1010): the epic's success metric made visible — do the
 * rounds seed new rounds? All aggregation lives in the `admin_key_metrics`
 * RPC (SECURITY DEFINER, in-body is_admin() gate — migration 0126); this
 * wrapper just calls it with the admin's JWT and hands the parsed payload to
 * the presentational view. Own Suspense boundary on the dashboard; renders
 * nothing on RPC failure or shape drift (ActionItemsStripe discipline: a
 * broken metrics card must never break the room).
 */
export async function KeyMetricsCard() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.rpc('admin_key_metrics');
  if (error) {
    console.error('[admin/klubbhuset] admin_key_metrics failed', error);
    return null;
  }
  const metrics = parseMetrics(data);
  if (!metrics) {
    console.error(
      '[admin/klubbhuset] admin_key_metrics returned unexpected shape',
      data,
    );
    return null;
  }
  return <KeyMetricsView metrics={metrics} />;
}

/** Narrows the RPC's jsonb payload; null on any drift (caller renders nothing). */
function parseMetrics(data: unknown): KeyMetrics | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return null;
  }
  const d = data as Record<string, unknown>;
  if (
    typeof d.users_ge1 !== 'number' ||
    typeof d.users_ge2 !== 'number' ||
    typeof d.gjenger_ge2 !== 'number' ||
    !Array.isArray(d.weeks)
  ) {
    return null;
  }
  const weeks: KeyMetrics['weeks'] = [];
  for (const entry of d.weeks) {
    if (typeof entry !== 'object' || entry === null) return null;
    const w = entry as Record<string, unknown>;
    if (typeof w.week_start !== 'string' || typeof w.finished !== 'number') {
      return null;
    }
    weeks.push({ weekStart: w.week_start, finished: w.finished });
  }
  return {
    usersGe1: d.users_ge1,
    usersGe2: d.users_ge2,
    gjengerGe2: d.gjenger_ge2,
    weeks,
  };
}
