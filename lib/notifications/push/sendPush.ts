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
import {
  buildFcmMessage,
  decideFcmPruneAction,
  isFcmConfigured,
  sendFcmNotification,
} from './fcm';
import { buildNotificationText } from '@/lib/notifications/cardContent';
import { notificationDestination } from '@/lib/notifications/deeplink';
import { withReadMarker } from '@/lib/notifications/readMarker';
import { getInboxTranslator } from '@/lib/notifications/inboxTranslator';
import type { NotificationKind, NotificationPayload } from '@/lib/notifications/types';

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };
type ApnsRow = { id: string; token: string; environment: string | null };
type FcmRow = { id: string; token: string };

/**
 * Best-effort push fan-out to all of a user's devices, across three channels:
 * Web Push for browsers and installed PWAs (#24), APNs for iPhones (#1282), FCM
 * for Android (#2758). ADDITIVE on top of email — never throws, never blocks the
 * caller. Each channel no-ops on its own when unconfigured, so one missing key
 * never silences the others. Dead registrations are pruned (web 404/410, APNs per
 * decidePruneAction, FCM per decideFcmPruneAction).
 */
export async function sendPushToUser<K extends NotificationKind>(opts: {
  userId: string;
  kind: K;
  payload: NotificationPayload<K>;
  locale: string | null;
  /** The stored row. Rides on the link as `?varsel=<id>`, so the tap marks it read (#2201). */
  notificationId?: string;
}): Promise<void> {
  try {
    const webpush = isPushConfigured() ? ensureVapid() : null;
    const apnsOn = isApnsConfigured();
    const fcmOn = isFcmConfigured();
    if (!webpush && !apnsOn && !fcmOn) return;

    const admin = getAdminClient();
    // The channels feed the same notification, so read them in parallel — an
    // unconfigured channel is skipped rather than queried.
    const [subs, apnsTokens, fcmTokens] = await Promise.all([
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
      fcmOn
        ? admin
            .from('fcm_tokens')
            .select('id, token')
            .eq('user_id', opts.userId)
            .then((r) => {
              if (r.error) console.error('[push] fcm token read failed', r.error);
              return (r.data ?? []) as FcmRow[];
            })
        : Promise.resolve([] as FcmRow[]),
    ]);
    const rows = subs;
    if (rows.length === 0 && apnsTokens.length === 0 && fcmTokens.length === 0) return;

    const t = await getInboxTranslator(opts.locale);
    const { title, detail } = buildNotificationText(opts.kind, opts.payload, t);
    const destination =
      notificationDestination({ kind: opts.kind, payload: opts.payload }) ?? '/';
    // Same url for every channel: the page the tap opens reads the marker.
    const url = opts.notificationId
      ? withReadMarker(destination, opts.notificationId)
      : destination;
    // Cap lengths so admin-authored content (product_update has no max length)
    // can't overflow the push service's ~4 KB payload limit and silently fail.
    const body = JSON.stringify({
      title: clamp(title, TITLE_MAX),
      body: clamp(detail, BODY_MAX),
      url,
      kind: opts.kind,
    });

    // #2749: the app shows the entry fee, so APNs and FCM get the web text.
    const apnsPayload = buildApnsPayload(title, detail, url, opts.kind);
    const fcmContent = buildFcmMessage(title, detail, url, opts.kind);

    await Promise.allSettled([
      ...rows.map(async (sub) => {
        if (!webpush) return; // unreachable: rows is empty without a client
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
          // postgrest-js returns a DB error instead of throwing it, so the
          // catch below never sees one: read and log it (#2223).
          const { error: touchError } = await admin
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('endpoint', sub.endpoint);
          if (touchError) {
            console.error('[push] last_used_at update failed', touchError);
          }
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            const { error: pruneError } = await admin
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint);
            if (pruneError) {
              console.error('[push] subscription prune failed', pruneError);
            }
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
              const { error: touchError } = await admin
                .from('apns_tokens')
                .update({ last_used_at: new Date().toISOString(), environment })
                .eq('token', row.token);
              if (touchError) {
                console.error('[push] apns last_used_at update failed', touchError);
              }
              return;
            }

            const action = decidePruneAction(
              res.status,
              res.reason,
              i === candidates.length - 1,
            );
            if (action === 'retry-sandbox') continue;
            if (action === 'prune') {
              const { error: pruneError } = await admin
                .from('apns_tokens')
                .delete()
                .eq('token', row.token);
              if (pruneError) {
                console.error('[push] apns token prune failed', pruneError);
              }
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

      ...fcmTokens.map(async (row) => {
        // Logs carry the row id: FCM tokens never go in a log (#2758).
        try {
          const res = await sendFcmNotification(row.token, fcmContent);

          if (res.status >= 200 && res.status < 300) {
            const { error: touchError } = await admin
              .from('fcm_tokens')
              .update({ last_used_at: new Date().toISOString() })
              .eq('token', row.token);
            if (touchError) {
              console.error('[push] fcm last_used_at update failed', touchError);
            }
            return;
          }

          if (decideFcmPruneAction(res.status, res.errorCode) === 'prune') {
            const { error: pruneError } = await admin
              .from('fcm_tokens')
              .delete()
              .eq('token', row.token);
            if (pruneError) {
              console.error('[push] fcm token prune failed', pruneError);
            }
            return;
          }
          console.error('[push] fcm send failed', row.id, res.status, res.errorCode);
        } catch (err) {
          // Network or token-exchange trouble says nothing about the token — keep the row.
          console.error('[push] fcm send failed', row.id, err);
        }
      }),
    ]);
  } catch (err) {
    // Never let push break the parent flow.
    console.error('[push] sendPushToUser failed', err);
  }
}
