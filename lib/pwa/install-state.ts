/**
 * Module-level singleton for the browser's BeforeInstallPromptEvent.
 *
 * The event fires once per page session (and only on Chromium-based browsers
 * and desktop Edge — never iOS). We capture it eagerly at app boot so that
 * components mounted later (banner, button) can trigger the native install
 * dialog without needing to re-listen for an event that already passed.
 */

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: DeferredPrompt | null = null;
const subscribers = new Set<() => void>();

export function setDeferredPrompt(p: DeferredPrompt | null) {
  deferred = p;
  subscribers.forEach((fn) => fn());
}

export function getDeferredPrompt(): DeferredPrompt | null {
  return deferred;
}

export function subscribeToInstallPrompt(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
