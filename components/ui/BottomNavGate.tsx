import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { BottomNav } from '@/components/ui/BottomNav';

/**
 * Streams the persistent bottom nav (#355) behind the root layout's
 * <Suspense> boundary. The headers() read in getProxyVerifiedUserId is a
 * runtime API — under cacheComponents (#538) it must not run in the root
 * layout itself, or no route in the app can get a static shell. BottomNav
 * is fixed to the bottom, so it streaming in causes no layout shift.
 */
export async function BottomNavGate() {
  const userId = await getProxyVerifiedUserId();
  return <BottomNav userId={userId} />;
}
