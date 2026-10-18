'use client';

import { useSyncExternalStore } from 'react';
import { storePlatform } from '@/lib/pwa/detect';
import type { StorePlatform } from '@/lib/app/appLaunch';

// The device does not change while the page is open, so subscribe is a no-op.
// The server snapshot is `unknown`: server and first hydration render agree,
// and the client snapshot takes over right after (the SpectateCta pattern).
const subscribe = () => () => {};
const getServerSnapshot = (): StorePlatform => 'unknown';

/** The device's store platform for «Hent appen» (#2562). */
export function useStorePlatform(): StorePlatform {
  return useSyncExternalStore(subscribe, storePlatform, getServerSnapshot);
}
