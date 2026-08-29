import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The Capacitor branch of the push state machine (#1282).
 *
 * Two properties matter here: the shell maps OS permission onto the existing
 * PushState vocabulary (never 'ios-install' or 'unsupported'), and the branch is
 * inert without `window.Capacitor` — i.e. every browser keeps the #24 behavior.
 *
 * Module-level state (bound listeners, remembered token) makes each case
 * re-import through `loadPush()`, the apns.test.ts idiom.
 */

type Handler = (payload: unknown) => void;

function buildPlugin(permission: string) {
  const listeners = new Map<string, Handler>();
  return {
    listeners,
    checkPermissions: vi.fn(async () => ({ receive: permission })),
    requestPermissions: vi.fn(async () => ({ receive: permission })),
    register: vi.fn(async () => {}),
    unregister: vi.fn(async () => {}),
    addListener: vi.fn(async (event: string, handler: Handler) => {
      listeners.set(event, handler);
      return { remove: async () => {} };
    }),
  };
}

function installCapacitor(plugin: ReturnType<typeof buildPlugin> | null) {
  if (!plugin) {
    delete (window as { Capacitor?: unknown }).Capacitor;
    return;
  }
  (window as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    Plugins: { PushNotifications: plugin },
  };
}

async function loadPush() {
  vi.resetModules();
  return import('./push');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  installCapacitor(null);
});

describe('isNativePush', () => {
  it('is false in a plain browser', async () => {
    installCapacitor(null);
    const { isNativePush } = await loadPush();
    expect(isNativePush()).toBe(false);
  });

  it('is true when the shell reports a native platform', async () => {
    installCapacitor(buildPlugin('granted'));
    const { isNativePush } = await loadPush();
    expect(isNativePush()).toBe(true);
  });
});

describe('getPushState in the shell', () => {
  it.each([
    ['granted', 'on'],
    ['denied', 'blocked'],
    ['prompt', 'off'],
    ['prompt-with-rationale', 'off'],
  ])('permission %s → %s', async (permission, expected) => {
    installCapacitor(buildPlugin(permission));
    const { getPushState } = await loadPush();
    expect(await getPushState()).toBe(expected);
  });

  it('falls through to the browser path when Capacitor is absent', async () => {
    installCapacitor(null);
    const { getPushState } = await loadPush();
    // jsdom has no serviceWorker/PushManager, so the untouched web path answers.
    expect(await getPushState()).toBe('unsupported');
  });
});

describe('enablePush in the shell', () => {
  it('registers with APNs and persists the token the event delivers', async () => {
    const plugin = buildPlugin('granted');
    installCapacitor(plugin);
    const register = vi.fn(async () => {});
    const { enablePush } = await loadPush();

    const state = await enablePush(vi.fn(), register);

    expect(state).toBe('on');
    expect(plugin.register).toHaveBeenCalled();
    // The listener is bound BEFORE register(), so a token arriving immediately
    // is not dropped.
    expect(plugin.listeners.has('registration')).toBe(true);

    plugin.listeners.get('registration')!({ value: 'device-token-1' });
    expect(register).toHaveBeenCalledWith('device-token-1', navigator.userAgent);
    expect(localStorage.getItem('torny-apns-token')).toBe('device-token-1');
  });

  it('a denied permission → blocked, and nothing is registered', async () => {
    const plugin = buildPlugin('denied');
    installCapacitor(plugin);
    const { enablePush } = await loadPush();

    expect(await enablePush(vi.fn(), vi.fn())).toBe('blocked');
    expect(plugin.register).not.toHaveBeenCalled();
  });

  it('a dismissed prompt → off', async () => {
    installCapacitor(buildPlugin('prompt'));
    const { enablePush } = await loadPush();
    expect(await enablePush(vi.fn(), vi.fn())).toBe('off');
  });
});

describe('disablePush in the shell', () => {
  it('removes the stored token server-side and unregisters the device', async () => {
    const plugin = buildPlugin('granted');
    installCapacitor(plugin);
    localStorage.setItem('torny-apns-token', 'device-token-1');
    const remove = vi.fn(async () => {});
    const { disablePush } = await loadPush();

    expect(await disablePush(vi.fn(), remove)).toBe('off');
    expect(remove).toHaveBeenCalledWith('device-token-1');
    expect(plugin.unregister).toHaveBeenCalled();
    expect(localStorage.getItem('torny-apns-token')).toBeNull();
  });

  it('no remembered token → still unregisters, calls no action', async () => {
    const plugin = buildPlugin('granted');
    installCapacitor(plugin);
    const remove = vi.fn(async () => {});
    const { disablePush } = await loadPush();

    expect(await disablePush(vi.fn(), remove)).toBe('off');
    expect(remove).not.toHaveBeenCalled();
    expect(plugin.unregister).toHaveBeenCalled();
  });
});

describe('initNativePush', () => {
  it('re-registers on launch when permission is already granted', async () => {
    const plugin = buildPlugin('granted');
    installCapacitor(plugin);
    const { initNativePush } = await loadPush();

    initNativePush({ register: vi.fn(), navigate: vi.fn() });
    await vi.waitFor(() => expect(plugin.register).toHaveBeenCalled());
  });

  it('does not register when permission was never granted', async () => {
    const plugin = buildPlugin('prompt');
    installCapacitor(plugin);
    const { initNativePush } = await loadPush();

    initNativePush({ register: vi.fn(), navigate: vi.fn() });
    await vi.waitFor(() => expect(plugin.checkPermissions).toHaveBeenCalled());
    expect(plugin.register).not.toHaveBeenCalled();
  });

  it('a tapped notification navigates to the deeplink in its data', async () => {
    const plugin = buildPlugin('granted');
    installCapacitor(plugin);
    const navigate = vi.fn();
    const { initNativePush } = await loadPush();

    initNativePush({ register: vi.fn(), navigate });
    await vi.waitFor(() =>
      expect(plugin.listeners.has('pushNotificationActionPerformed')).toBe(true),
    );

    plugin.listeners.get('pushNotificationActionPerformed')!({
      notification: { data: { url: '/games/abc' } },
    });
    expect(navigate).toHaveBeenCalledWith('/games/abc');
  });

  it('ignores an absolute or missing url — deeplinks stay in-app', async () => {
    const plugin = buildPlugin('granted');
    installCapacitor(plugin);
    const navigate = vi.fn();
    const { initNativePush } = await loadPush();

    initNativePush({ register: vi.fn(), navigate });
    await vi.waitFor(() =>
      expect(plugin.listeners.has('pushNotificationActionPerformed')).toBe(true),
    );
    const handler = plugin.listeners.get('pushNotificationActionPerformed')!;

    handler({ notification: { data: { url: 'https://evil.example.com' } } });
    handler({ notification: { data: {} } });
    handler({});
    expect(navigate).not.toHaveBeenCalled();
  });

  it('is a no-op in a browser', async () => {
    installCapacitor(null);
    const { initNativePush } = await loadPush();
    expect(() => initNativePush({ register: vi.fn(), navigate: vi.fn() })).not.toThrow();
  });
});
