'use client';

import { isStandalone, isIosSafari } from './detect';

export type PushState =
  | 'loading'      // before useEffect resolves
  | 'unsupported'  // browser lacks the APIs
  | 'ios-install'  // iOS Safari tab — must install to home screen first
  | 'blocked'      // Notification.permission === 'denied'
  | 'off'          // supported, not subscribed
  | 'on';          // subscribed on this device

/** Web Push needs SW + PushManager + Notification. iOS additionally needs install. */
export function pushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** VAPID public key (base64url) → Uint8Array<ArrayBuffer> for pushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Resolve the current push state for this device. */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) {
    return isIosSafari() && !isStandalone() ? 'ios-install' : 'unsupported';
  }
  if (isIosSafari() && !isStandalone()) return 'ios-install';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/**
 * Ask for permission, subscribe, and persist on the server. Returns the new
 * state. Triggered by a user gesture (button) — requestPermission() shows the
 * OS dialog; if already 'denied' it resolves 'denied' with no prompt (#24 spec §3.4).
 */
export async function enablePush(
  save: (sub: PushSubscriptionJSON, userAgent: string) => Promise<void>,
): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';

  const reg = await navigator.serviceWorker.ready;
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  await save(sub.toJSON(), navigator.userAgent);
  return 'on';
}

/** Unsubscribe on this device and remove the server row. */
export async function disablePush(
  remove: (endpoint: string) => Promise<void>,
): Promise<PushState> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await remove(endpoint);
  }
  return 'off';
}
