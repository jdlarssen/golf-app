import { getAdminContext } from './_dashboardContext';
import { countKavalkadeSharers } from '@/lib/kavalkade/countKavalkadeSharers';
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
  // #2131: delt-av-tallet ligger ikke i RPC-en — det leses med service-rollen
  // (RLS gir bare egne rader, migrasjon 0183). Lesingen skjer FØRST etter at
  // RPC-en svarte, og den kaster `not_authorized` for alle andre enn admin, så
  // service-rollen brukes aldri uten at gaten har sagt ja. En feil her skal
  // ikke ta ned resten av kortet: da faller tallet tilbake til null og linja
  // står med 0.
  let kavalkadeShares = 0;
  try {
    kavalkadeShares = await countKavalkadeSharers();
  } catch (shareErr) {
    console.error('[admin/klubbhuset] kavalkade-delinger kunne ikke telles', shareErr);
  }

  return <KeyMetricsView metrics={metrics} kavalkadeShares={kavalkadeShares} />;
}

/** Narrows the RPC's jsonb payload; null on any drift (caller renders nothing). */
export function parseMetrics(data: unknown): KeyMetrics | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return null;
  }
  const d = data as Record<string, unknown>;
  if (
    typeof d.users_ge1 !== 'number' ||
    typeof d.users_ge2 !== 'number' ||
    typeof d.gjenger_ge2 !== 'number' ||
    typeof d.public_signups !== 'number' ||
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
  if (typeof d.funnel !== 'object' || d.funnel === null || Array.isArray(d.funnel)) {
    return null;
  }
  const f = d.funnel as Record<string, unknown>;
  if (
    typeof f.invited !== 'number' ||
    typeof f.opened !== 'number' ||
    typeof f.accepted !== 'number' ||
    typeof f.profile_completed !== 'number' ||
    typeof f.first_score !== 'number'
  ) {
    return null;
  }
  const livstegn = parseLivstegn(d);
  if (!livstegn) return null;
  return {
    usersGe1: d.users_ge1,
    usersGe2: d.users_ge2,
    gjengerGe2: d.gjenger_ge2,
    publicSignups: d.public_signups,
    weeks,
    funnel: {
      invited: f.invited,
      opened: f.opened,
      accepted: f.accepted,
      profileCompleted: f.profile_completed,
      firstScore: f.first_score,
    },
    ...livstegn,
  };
}

/** #2119 (0180): the livstegn months + all-time total; null on any drift. */
function parseLivstegn(
  d: Record<string, unknown>,
): Pick<KeyMetrics, 'months' | 'livstegnTotal'> | null {
  if (!Array.isArray(d.months)) return null;
  const months: KeyMetrics['months'] = [];
  for (const entry of d.months) {
    if (typeof entry !== 'object' || entry === null) return null;
    const m = entry as Record<string, unknown>;
    if (
      typeof m.month !== 'string' ||
      !/^\d{4}-\d{2}$/.test(m.month) ||
      typeof m.finished !== 'number' ||
      typeof m.by_others !== 'number' ||
      typeof m.without_admin !== 'number'
    ) {
      return null;
    }
    months.push({
      month: m.month,
      finished: m.finished,
      byOthers: m.by_others,
      withoutAdmin: m.without_admin,
    });
  }
  if (
    typeof d.livstegn_total !== 'object' ||
    d.livstegn_total === null ||
    Array.isArray(d.livstegn_total)
  ) {
    return null;
  }
  const lt = d.livstegn_total as Record<string, unknown>;
  if (
    typeof lt.finished !== 'number' ||
    typeof lt.by_others !== 'number' ||
    typeof lt.without_admin !== 'number'
  ) {
    return null;
  }
  return {
    months,
    livstegnTotal: {
      finished: lt.finished,
      byOthers: lt.by_others,
      withoutAdmin: lt.without_admin,
    },
  };
}
