'use client';

import { useEffect } from 'react';
import { setDeferredPrompt } from '@/lib/pwa/install-state';

/**
 * Captures the browser's `beforeinstallprompt` event into the install-state
 * singleton so that banner/button components mounted later can still trigger
 * the native install dialog. The event fires once per page session, so this
 * component must be mounted as early as possible — currently in the root
 * layout's `<body>` so it boots alongside `PwaBoot`.
 *
 * Renders nothing. Pure side-effect.
 */
export function InstallPromptCapture() {
  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
      });
    }
    function onInstalled() {
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return null;
}
