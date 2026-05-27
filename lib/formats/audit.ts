import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { logAdminEvent } from '@/lib/admin/auditLog';
import type { MappingIntent } from './getAllFormatsWithMappings';

export type FormatChangeType =
  | 'visibility'
  | 'primary'
  | 'cup_eligible'
  | 'active';

export type FormatAuditEntry = {
  id: string;
  actor_name: string;
  format_slug: string;
  intent: MappingIntent | null;
  change_type: FormatChangeType;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  created_at: string;
};

/**
 * F3-spesifikk skriv-helper rundt `logAdminEvent`. Snapshot-er `actorName`,
 * pakker payload-en i et stabilt skjema, og lar `logAdminEvent` håndtere
 * best-effort-feilfangst (audit-feil ruller aldri tilbake selve mutasjonen).
 */
export async function recordFormatMappingChange(args: {
  actorId: string;
  actorName: string;
  formatSlug: string;
  intent: MappingIntent | null;
  changeType: FormatChangeType;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): Promise<void> {
  await logAdminEvent({
    actorId: args.actorId,
    actorName: args.actorName,
    eventType: 'format_mapping_change',
    targetType: 'format',
    // target_id er uuid; format-slug passer ikke. Lagres i payload i stedet.
    targetId: null,
    payload: {
      format_slug: args.formatSlug,
      intent: args.intent,
      change_type: args.changeType,
      before: args.before,
      after: args.after,
    },
  });
}

/**
 * Henter siste N audit-entries med `event_type='format_mapping_change'`,
 * sortert nyeste først. Ikke cachet — admin-view skal alltid se siste state.
 *
 * `actor_name` er snapshottet på write-tidspunktet, så den overlever
 * eventuell rename eller delete av admin-konto.
 */
export async function getFormatMappingAudit(
  limit = 50,
): Promise<FormatAuditEntry[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('id, actor_name, payload, created_at')
    .eq('event_type', 'format_mapping_change')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[getFormatMappingAudit] query failed', { error });
    throw new Error('Failed to fetch format-mapping audit entries');
  }

  return (data ?? []).map((row) => {
    const payload = (row.payload as Record<string, unknown>) ?? {};
    const intent = payload.intent as MappingIntent | null | undefined;
    return {
      id: row.id as string,
      actor_name: (row.actor_name as string) ?? 'Ukjent',
      format_slug: (payload.format_slug as string) ?? '?',
      intent: intent ?? null,
      change_type: (payload.change_type as FormatChangeType) ?? 'visibility',
      before: (payload.before as Record<string, unknown>) ?? {},
      after: (payload.after as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
    };
  });
}
