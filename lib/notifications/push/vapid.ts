import 'server-only';
import webpush from 'web-push';

// VAPID = the app-server identity that signs Web Push requests. Keys are env-
// provided (own keypair per environment). Missing env → push degrades to a no-op
// and email still covers the user (additive design). See the push design spec §7/§11.
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:post@tornygolf.no';

let configured = false;

/** True when VAPID env is present. When false, callers must skip push silently. */
export function isPushConfigured(): boolean {
  return PUBLIC_KEY.length > 0 && PRIVATE_KEY.length > 0;
}

/** Idempotently apply VAPID details to the web-push singleton. */
export function ensureVapid(): typeof webpush | null {
  if (!isPushConfigured()) return null;
  if (!configured) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  }
  return webpush;
}
