'use client';

import { isStandalone, isIosSafari } from './detect';

export type PushState =
  | 'loading'      // before useEffect resolves
  | 'unsupported'  // browser lacks the APIs
  | 'ios-install'  // iOS Safari tab — must install to home screen first
  | 'blocked'      // Notification.permission === 'denied'
  | 'off'          // supported, not subscribed
  | 'on';          // subscribed on this device

// ── Native (iOS shell) bridge ────────────────────────────────────────────────
// The Capacitor shell injects `window.Capacitor` into the remote page it loads,
// so the registration and deeplink code can live here in the web app and ship
// via Vercel — no App Store release to iterate on it (#1282). None of this
// exists in a browser, which makes the whole branch dead code there: the
// browser/PWA path below is untouched.
//
// The @capacitor/* packages are deliberately NOT installed in the web app (they
// belong to native/ios), so the bridge is typed locally, to the surface we use.

/** Payload shapes of the three PushNotifications events we listen for. */
type PushListenerPayload = {
  value?: string; // 'registration' → the raw APNs device token
  error?: string; // 'registrationError'
  notification?: { data?: Record<string, unknown> }; // action performed → our deeplink
};

type PluginListenerHandle = { remove: () => Promise<void> };

type PushNotificationsPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  unregister?: () => Promise<void>;
  addListener: (
    event: string,
    handler: (payload: PushListenerPayload) => void,
  ) => Promise<PluginListenerHandle> | PluginListenerHandle;
};

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  Plugins?: { PushNotifications?: PushNotificationsPlugin };
};

declare global {
  interface Window {
    Capacitor?: CapacitorBridge;
  }
}

/** True only inside the Capacitor shell — false in every browser and PWA. */
export function isNativePush(): boolean {
  if (typeof window === 'undefined') return false;
  return window.Capacitor?.isNativePlatform?.() === true;
}

function nativePlugin(): PushNotificationsPlugin | null {
  if (!isNativePush()) return null;
  return window.Capacitor?.Plugins?.PushNotifications ?? null;
}

// The device token is not readable on demand — it arrives on the 'registration'
// event — so remember the last one to know what to delete when push is turned
// off. localStorage keeps it across the shell's page loads.
const NATIVE_TOKEN_KEY = 'torny-apns-token';

function rememberNativeToken(token: string): void {
  try {
    localStorage.setItem(NATIVE_TOKEN_KEY, token);
  } catch {
    /* private mode — the token still reached the server */
  }
}

function recallNativeToken(): string | null {
  try {
    return localStorage.getItem(NATIVE_TOKEN_KEY);
  } catch {
    return null;
  }
}

function forgetNativeToken(): void {
  try {
    localStorage.removeItem(NATIVE_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

let registrationListenerBound = false;
let actionListenerBound = false;

/**
 * Bind the 'registration' listener once. APNs hands the token to this event —
 * both after an opt-in and again whenever iOS rotates it — so persisting from
 * here covers every path that produces a token.
 */
function ensureRegistrationListener(
  plugin: PushNotificationsPlugin,
  register: (token: string, userAgent: string) => Promise<void>,
): void {
  if (registrationListenerBound) return;
  registrationListenerBound = true;

  void plugin.addListener('registration', (payload) => {
    const token = payload.value;
    if (!token) return;
    rememberNativeToken(token);
    register(token, navigator.userAgent).catch(() => {
      // Best-effort like the rest of push: the next app start re-registers.
    });
  });
  void plugin.addListener('registrationError', () => {
    // Nothing to do — without a token the user simply keeps email notifications.
  });
}

/**
 * Wire the shell's push bridge: persist tokens, and follow a tapped
 * notification to the same destination web-push would open. Idempotent, and a
 * no-op outside the shell — safe to call from anywhere that mounts app-wide.
 */
export function initNativePush(opts: {
  register: (token: string, userAgent: string) => Promise<void>;
  navigate: (url: string) => void;
}): void {
  const plugin = nativePlugin();
  if (!plugin) return;

  ensureRegistrationListener(plugin, opts.register);

  if (!actionListenerBound) {
    actionListenerBound = true;
    void plugin.addListener('pushNotificationActionPerformed', (payload) => {
      const url = payload.notification?.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) opts.navigate(url);
    });
  }

  // Tokens rotate, so a device that already granted permission re-registers on
  // every app start rather than trusting the row we wrote once.
  void plugin
    .checkPermissions()
    .then(({ receive }) => (receive === 'granted' ? plugin.register() : undefined))
    .catch(() => {});
}

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
  // In the shell there is nothing to install and no service worker, so
  // 'ios-install' and 'unsupported' can never be the answer — the OS permission
  // is the whole story.
  const plugin = nativePlugin();
  if (plugin) {
    const { receive } = await plugin.checkPermissions();
    if (receive === 'denied') return 'blocked';
    return receive === 'granted' ? 'on' : 'off';
  }

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
  nativeRegister?: (token: string, userAgent: string) => Promise<void>,
): Promise<PushState> {
  const plugin = nativePlugin();
  if (plugin && nativeRegister) {
    // Bind before asking: iOS can deliver the token the moment register()
    // resolves, and an unbound listener would drop it.
    ensureRegistrationListener(plugin, nativeRegister);
    const { receive } = await plugin.requestPermissions();
    if (receive === 'denied') return 'blocked';
    if (receive !== 'granted') return 'off';
    await plugin.register();
    return 'on';
  }

  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';

  const reg = await navigator.serviceWorker.ready;
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  // No VAPID key configured → an empty key yields a broken subscription, so
  // bail out as 'unsupported' rather than registering garbage on the device.
  if (!key) return 'unsupported';

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  // Roll the subscription back if the server save fails — otherwise the device
  // keeps an active push subscription with no server row and forever reports 'on'.
  try {
    await save(sub.toJSON(), navigator.userAgent);
  } catch (e) {
    await sub.unsubscribe().catch(() => {});
    throw e;
  }
  return 'on';
}

/** Unsubscribe on this device and remove the server row. */
export async function disablePush(
  remove: (endpoint: string) => Promise<void>,
  nativeRemove?: (token: string) => Promise<void>,
): Promise<PushState> {
  const plugin = nativePlugin();
  if (plugin && nativeRemove) {
    const token = recallNativeToken();
    if (token) {
      await nativeRemove(token);
      forgetNativeToken();
    }
    // iOS keeps the permission — dropping the token is what stops delivery.
    await plugin.unregister?.();
    return 'off';
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await remove(endpoint);
  }
  return 'off';
}
