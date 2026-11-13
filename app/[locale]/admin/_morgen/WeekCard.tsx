import { SectionError } from '@/components/ui/SectionError';
import { weekSummary } from '@/lib/admin/morningReport';
import { getAdminContext } from '../_dashboardContext';
import { parseMetrics } from '../KeyMetricsCard';
import { WeekCardView } from './WeekCardView';

/**
 * «Denne uka» (#2345): this week's finished rounds from `admin_key_metrics`
 * (SECURITY DEFINER, in-body is_admin() gate). A failed read or a payload
 * that does not parse shows an error box rather than a missing card.
 */
export async function WeekCard() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.rpc('admin_key_metrics');
  if (error) {
    console.error('[admin/morning] admin_key_metrics failed', error);
    return <WeekCardError />;
  }
  const summary = weekSummary(parseMetrics(data)?.weeks ?? []);
  if (!summary) {
    console.error('[admin/morning] admin_key_metrics returned unexpected shape', data);
    return <WeekCardError />;
  }
  return <WeekCardView summary={summary} />;
}

function WeekCardError() {
  return (
    <div className="-mx-1 mt-3.5">
      <SectionError testId="morning-week-error" />
    </div>
  );
}
