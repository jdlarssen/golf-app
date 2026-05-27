import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Event types recorded to `public.admin_audit_log`. New events must be added
 * here AND to the matching call-site — the DB column itself is freeform
 * TEXT, so this union is the single source of truth for what "we currently
 * audit" means.
 */
export type AdminAuditEventType =
  | 'game.finished'
  | 'game.reopened'
  | 'scorecard.approved'
  | 'scorecard.reopened'
  // F3 (#273): admin endrer format-mapping eller aktivitet/cup-eligibility.
  // Payload bærer `format_slug`, `intent` (eller null), `change_type`,
  // `before`/`after` (delvis state).
  | 'format_mapping_change';

/**
 * Record an admin action to the audit log. Best-effort: insert failures are
 * logged to console but never bubble up to the caller — the audit log is a
 * forensic aid, not a correctness gate, and a transient DB hiccup mustn't
 * roll back a successful game-end or scorecard-approval.
 *
 * Writes via the service-role admin client so RLS isn't in the way; the
 * `admin_audit_log` table has no client policies, so this is the only
 * supported write path.
 */
export async function logAdminEvent(event: {
  actorId: string;
  /** Snapshot of admin's display name at write-time — survives later renames. */
  actorName: string;
  eventType: AdminAuditEventType;
  targetType?: string;
  targetId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = getAdminClient();
    const { error } = await supabase.from('admin_audit_log').insert({
      actor_user_id: event.actorId,
      actor_name: event.actorName,
      event_type: event.eventType,
      target_type: event.targetType ?? null,
      target_id: event.targetId ?? null,
      payload: event.payload ?? {},
    });
    if (error) {
      console.error('[auditLog] insert failed', {
        eventType: event.eventType,
        error: error.message,
      });
    }
  } catch (err) {
    console.error('[auditLog] insert threw', err);
  }
}
