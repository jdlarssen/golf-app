'use client';

import { useEffect, useState } from 'react';
import {
  getDeferredPrompt,
  setDeferredPrompt,
  subscribeToInstallPrompt,
} from '@/lib/pwa/install-state';
import {
  isStandalone,
  isIosSafari,
  isIosNonSafari,
} from '@/lib/pwa/detect';

export type InstallStatus =
  | 'loading' // SSR or first render before useEffect resolves the environment
  | 'standalone' // already running as installed PWA
  | 'native' // beforeinstallprompt was captured — native install dialog available
  | 'ios-safari' // iOS Safari, must show manual Add-to-Home-Screen instructions
  | 'ios-other' // iOS Chrome/Firefox/Edge — must redirect user to Safari
  | 'unsupported'; // desktop without prompt, or other unsupported browser

export function useInstallPrompt(): {
  status: InstallStatus;
  install: () => Promise<void>;
} {
  const [status, setStatus] = useState<InstallStatus>('loading');

  useEffect(() => {
    function recompute() {
      if (isStandalone()) {
        setStatus('standalone');
        return;
      }
      const prompt = getDeferredPrompt();
      if (prompt) {
        setStatus('native');
        return;
      }
      if (isIosSafari()) {
        setStatus('ios-safari');
        return;
      }
      if (isIosNonSafari()) {
        setStatus('ios-other');
        return;
      }
      setStatus('unsupported');
    }

    recompute();
    const unsubscribe = subscribeToInstallPrompt(recompute);

    function onAppInstalled() {
      setStatus('standalone');
    }
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      unsubscribe();
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  async function install(): Promise<void> {
    const prompt = getDeferredPrompt();
    if (!prompt) return;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // User cancelled or browser refused — silent.
    } finally {
      // The beforeinstallprompt event is single-shot per session, so the
      // captured prompt cannot be reused. Null it out so subsequent calls
      // don't try to re-invoke a consumed event.
      setDeferredPrompt(null);
    }
  }

  return { status, install };
}
