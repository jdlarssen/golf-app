import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { ensureVapid, isPushConfigured } from './vapid';
import { clamp, TITLE_MAX, BODY_MAX } from './clampText';
import {
  buildApnsPayload,
  decidePruneAction,
  isApnsConfigured,
  sendApnsNotification,
  type ApnsEnvironment,
} from './apns';
import { buildNotificationText } from '@/lib/notifications/cardContent';
import { notificationDestination } from '@/lib/notifications/deeplink';
import { getInboxTranslator } from '@/lib/notifications/inboxTranslator';
import type { NotificationKind, NotificationPayload } from '@/lib/notifications/types';

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };
type ApnsRow = { id: string; token: string; environment: string | null };

/**
 * Best-effort push fan-out to all of a user's devices, across BOTH channels:
 * Web Push for browsers and installed PWAs (#24), APNs for the iOS shell (#1282).
 * ADDITIVE on top of email — never throws, never blocks the caller. Each channel
 * no-ops on its own when unconfigured, so one missing key never silences the
 * other. Dead registrations are pruned (web 404/410, APNs per decidePruneAction).
 */
export async function sendPushToUser<K extends NotificationKind>(opts: {
  userId: string;
  kind: K;
  payload: NotificationPayload<K>;
  locale: string | null;
}): Promise<void> {
  try {
    const webpush = isPushConfigured() ? ensureVapid() : null;
    const apnsOn = isApnsConfigured();
    if (!webpush && !apnsOn) return;

    const admin = getAdminClient();
    // Both channels feed the same notification, so read them in parallel — an
    // unconfigured channel is skipped rather than queried.
    const [subs, apnsTokens] = await Promise.all([
      webpush
        ? admin
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('user_id', opts.userId)
            .then((r) => (r.data ?? []) as SubRow[])
        : Promise.resolve([] as SubRow[]),
      apnsOn
        ? admin
            .from('apns_tokens')
            .select('id, token, environment')
            .eq('user_id', opts.userId)
            .then((r) => (r.data ?? []) as ApnsRow[])
        : Promise.resolve([] as ApnsRow[]),
    ]);
    const rows = subs;
    if (rows.length === 0 && apnsTokens.length === 0) return;

    const t = await getInboxTranslator(opts.locale);
    const { title, detail } = buildNotificationText(opts.kind, opts.payload, t);
    const url = notificationDestination({ kind: opts.kind, payload: opts.payload }) ?? '/';
    // Cap lengths so admin-authored content (product_update has no max length)
    // can't overflow the push service's ~4 KB payload limit and silently fail.
    const body = JSON.stringify({
      title: clamp(title, TITLE_MAX),
      body: clamp(detail, BODY_MAX),
      url,
      kind: opts.kind,
    });

    const apnsPayload = buildApnsPayload(title, detail, url, opts.kind);

    await Promise.allSettled([
      ...rows.map(async (sub) => {
        if (!webpush) return; // unreachable: rows is empty without a client
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

      ...apnsTokens.map(async (row) => {
        // A token's environment is only known after a send has succeeded once:
        // dev builds are sandbox, TestFlight/App Store are production, and the
        // device cannot tell us which it is. Unknown → try the common case
        // first and let BadDeviceToken point us at the other one.
        const known =
          row.environment === 'sandbox' || row.environment === 'production'
            ? (row.environment as ApnsEnvironment)
            : null;
        const candidates: ApnsEnvironment[] = known ? [known] : ['production', 'sandbox'];

        try {
          for (let i = 0; i < candidates.length; i++) {
            const environment = candidates[i];
            const res = await sendApnsNotification(row.token, apnsPayload, environment);

            if (res.status >= 200 && res.status < 300) {
              // Persist the environment that answered, so the next send skips
              // straight to the right host (self-healing, #1282 design 3).
              await admin
                .from('apns_tokens')
                .update({ last_used_at: new Date().toISOString(), environment })
                .eq('token', row.token);
              return;
            }

            const action = decidePruneAction(
              res.status,
              res.reason,
              i === candidates.length - 1,
            );
            if (action === 'retry-sandbox') continue;
            if (action === 'prune') {
              await admin.from('apns_tokens').delete().eq('token', row.token);
              return;
            }
            console.error('[push] apns send failed', row.token, res.status, res.reason);
            return;
          }
        } catch (err) {
          // Network/HTTP2 trouble says nothing about the token — keep the row.
          console.error('[push] apns send failed', row.token, err);
        }
      }),
    ]);
  } catch (err) {
    // Never let push break the parent flow.
    console.error('[push] sendPushToUser failed', err);
  }
}
