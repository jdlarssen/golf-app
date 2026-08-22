'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
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
 * settled "logged in?"; the questions left are the round dedupe and the owner
 * guard.
 *
 * `usePathname` MUST come from `@/i18n/navigation` — the `as-needed` routing
 * rewrites `/games/x` to `/no/games/x` internally, and the `next/navigation`
 * variant leaks that `/no` prefix, which would defeat the `/games/` test and
 * put two banners on every round screen. Same trap BottomNav documents.
 *
 * #1697: the owner guard (#1404) used to run only from `SyncBoot`, which is
 * mounted in the round layout alone — so on a shared phone the banner on Hjem
 * could report the PREVIOUS user's stranded strokes (and leak that round's
 * UUID through «Åpne runden»). Run the guard here too, and hold the banner
 * back until it has resolved.
 */
export function GlobalSyncBanner() {
  const pathname = usePathname();
  const [guardDone, setGuardDone] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        // Lazy import for the same reason as the banner itself: the guard
        // pulls in Dexie + the supabase browser client.
        const cleanup = await import('@/lib/sync/localDataCleanup');
        await cleanup.ensureLocalDataOwnerBrowser();
      } catch {
        // Silent, and fail-OPEN: same tolerance as SyncBoot (:28–30). The
        // guard is defensive; hiding the banner on a guard failure would
        // punish the far commoner case — one owner, one phone, real stranded
        // strokes to report.
      }
      setGuardDone(true);
    })();
  }, []);

  // The path gate MUST stay BELOW the hooks (rules of hooks). The guard effect
  // therefore also fires on /games/* alongside SyncBoot — harmless, since the
  // clear + stamp are idempotent.
  if (!guardDone || !shouldMountGlobalSyncBanner(pathname)) return null;
  return <SyncBanner />;
}
