/**
 * Client-side platform detection for PWA install paths.
 *
 * All functions are SSR-safe — they return `false` when called server-side.
 * Detection is User-Agent-based, which is fragile by nature but adequate for
 * the install-flow branching we need (iOS Safari requires manual install
 * instructions; other browsers fire `beforeinstallprompt`).
 */

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // The Capacitor shell (#1283) IS the installed app — but its WKWebView
  // reports itself like a Safari tab, so without this branch every
  // "install Tørny as an app" surface shows inside the native app.
  const w = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  if (w.Capacitor?.isNativePlatform?.() === true) return true;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

export function isIosSafari(): boolean {
  if (!isIos()) return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function isIosNonSafari(): boolean {
  if (!isIos()) return false;
  return /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
}
