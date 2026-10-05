import { isUuid } from '@/lib/url/isUuid';

/**
 * The push tap marks exactly that notification read (#2201). The server puts
 * the notification's id on the link in the push (`?varsel=<id>`), the same
 * link for web push and APNs, so neither the service worker, the iOS shell
 * nor the app needs tap logic of its own to carry it. `PwaBoot` reads it on
 * page load, marks the row and takes the parameter out of the address bar.
 *
 * Shared by server and client: no `server-only`.
 */
export const READ_MARKER_PARAM = 'varsel';

/** `path` with `?varsel=<id>` (or `&varsel=<id>`), before any `#hash`. */
export function withReadMarker(path: string, notificationId: string): string {
  const hashAt = path.indexOf('#');
  const base = hashAt === -1 ? path : path.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : path.slice(hashAt);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${READ_MARKER_PARAM}=${encodeURIComponent(notificationId)}${hash}`;
}

/** The notification id in a `location.search`, only when it is a UUID. */
export function readMarkerFrom(search: string): string | null {
  const value = new URLSearchParams(search).get(READ_MARKER_PARAM);
  return value && isUuid(value) ? value : null;
}

/**
 * `href` without the marker, as a same-origin path (`/path?rest#hash`) for
 * `history.replaceState`. Other parameters and the hash stay.
 */
export function withoutReadMarker(href: string): string {
  const url = new URL(href, 'http://local');
  url.searchParams.delete(READ_MARKER_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
