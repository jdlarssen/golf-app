import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { GlobalSyncBanner } from '@/components/sync/GlobalSyncBanner';

/**
 * Streams the app-wide SyncBanner (#1391) behind the root layout's <Suspense>
 * boundary — same shape and same reason as BottomNavGate: the headers() read in
 * getProxyVerifiedUserId is a runtime API, and under cacheComponents (#538) it
 * must not run in the root layout itself or no route gets a static shell.
 *
 * The login gate IS the public-route gate. proxy.ts deletes x-torny-user-id on
 * every PUBLIC_PATH_PATTERN path, so /demo, /embed, /login, /signup, /spectate
 * and friends return null here — the banner's Dexie code is never even
 * imported there, and no second pathname list can drift out of sync with the
 * proxy's.
 */
export async function GlobalSyncBannerGate() {
  const userId = await getProxyVerifiedUserId();
  if (userId == null) return null;
  return <GlobalSyncBanner />;
}
