'use client';

import dynamic from 'next/dynamic';
import { usePathname } from '@/i18n/navigation';
import { shouldMountGlobalSyncBanner } from '@/components/sync/globalMount';

// Loaded on demand so Dexie and the supabase browser client stay out of the
// root-layout chunk on the many screens that never render a banner. `ssr:
// false` matches the component's own nature: it reads IndexedDB, so its first
// paint is client-side regardless.
const SyncBanner = dynamic(
  () => import('@/components/sync/SyncBanner').then((m) => m.SyncBanner),
  { ssr: false },
);

/**
 * Client half of the global sync banner (#1391). The server gate already
 * settled "logged in?"; the only question left is the round dedupe.
 *
 * `usePathname` MUST come from `@/i18n/navigation` — the `as-needed` routing
 * rewrites `/games/x` to `/no/games/x` internally, and the `next/navigation`
 * variant leaks that `/no` prefix, which would defeat the `/games/` test and
 * put two banners on every round screen. Same trap BottomNav documents.
 */
export function GlobalSyncBanner() {
  const pathname = usePathname();
  if (!shouldMountGlobalSyncBanner(pathname)) return null;
  return <SyncBanner />;
}
