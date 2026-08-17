/**
 * Route policy for the app-wide SyncBanner mount (#1391).
 *
 * The sync queue drains globally, but the banner that reports it used to be
 * mounted only in the round layout — so «N slag venter», «Mistet
 * nettforbindelsen» and above all «Kunne ikke lagre N slag» were silent on
 * Hjem, Innboks, Klubbhuset and Profil. `GlobalSyncBannerGate` fixes that by
 * mounting a banner in the root layout; this module answers the one question
 * that mount needs on the client.
 *
 * Login gating is NOT here: the server gate reads the proxy-verified user id,
 * and proxy.ts strips that header on every PUBLIC_PATH_PATTERN path, so /demo,
 * /embed, /login and /spectate are excluded by one existing home rather than a
 * second pathname list that would drift from it.
 *
 * Deliberately NOT in `lib/sync/queueScope.ts`: that module owns which queue
 * ITEM belongs to which round. This one owns route policy.
 */

/**
 * True when the root layout should render the global SyncBanner.
 *
 * The only exclusion is the round itself: `app/[locale]/games/[id]/layout.tsx`
 * already mounts a `SyncBanner` scoped to that round, and two banners on one
 * screen would double every message. `/games` has no index route, so testing
 * the prefix WITH its trailing slash is exact.
 *
 * `pathname` is nullable because `usePathname()` from `@/i18n/navigation` can
 * return null; an unknown path falls through to mounting — a banner that has
 * nothing to report renders nothing anyway, while a missed one hides stranded
 * strokes.
 */
export function shouldMountGlobalSyncBanner(pathname: string | null): boolean {
  return !(pathname ?? '').startsWith('/games/');
}
