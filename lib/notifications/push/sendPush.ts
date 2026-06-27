import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureVapid, isPushConfigured } from './vapid';
import { buildNotificationText } from '@/lib/notifications/cardContent';
import { notificationDestination } from '@/lib/notifications/deeplink';
import { getInboxTranslator } from '@/lib/notifications/inboxTranslator';
import type { NotificationKind, NotificationPayload } from '@/lib/notifications/types';

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Best-effort Web Push fan-out to all of a user's devices. ADDITIVE on top of
 * email — never throws, never blocks the caller. No-ops when push is unconfigured
 * or the user has no subscriptions. Prunes dead subscriptions (404/410). #24.
 */
export async function sendPushToUser<K extends NotificationKind>(opts: {
  userId: string;
  kind: K;
  payload: NotificationPayload<K>;
  locale: string | null;
}): Promise<void> {
  try {
    const webpush = ensureVapid();
    if (!webpush || !isPushConfigured()) return;

    const admin = getAdminClient();
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', opts.userId);
    const rows = (subs ?? []) as SubRow[];
    if (rows.length === 0) return;

    const t = await getInboxTranslator(opts.locale);
    const { title, detail } = buildNotificationText(opts.kind, opts.payload, t);
    const url = notificationDestination({ kind: opts.kind, payload: opts.payload }) ?? '/';
    // Cap lengths so admin-authored content (product_update has no max length)
    // can't overflow the push service's ~4 KB payload limit and silently fail.
    const body = JSON.stringify({
      title: clamp(title, 120),
      body: clamp(detail, 240),
      url,
      kind: opts.kind,
    });

    await Promise.allSettled(
      rows.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
          await admin
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('endpoint', sub.endpoint);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          } else {
            console.error('[push] send failed', sub.endpoint, err);
          }
        }
      }),
    );
  } catch (err) {
    // Never let push break the parent flow.
    console.error('[push] sendPushToUser failed', err);
  }
}

/** Trim a string to `max` chars, adding an ellipsis when it was cut. */
function clamp(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
