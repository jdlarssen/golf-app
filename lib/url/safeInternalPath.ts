/**
 * The one home for "may we send the user to this path?" (#2206). Returns the
 * input unchanged when it is a same-origin path, otherwise null. Each caller
 * keeps its own fallback ('/', '' or a default route).
 */
const PROBE_ORIGIN = 'https://torny.invalid';

export function safeInternalPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null;
  // Browsers read '\' as '/' and drop tab/CR/LF inside a URL, so these
  // characters can turn a path into a link to another host.
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || c === 0x5c) return null;
  }
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  // A dot segment can stay same-origin yet normalise to a '//' pathname.
  if (url.pathname.startsWith('//')) return null;
  return raw;
}
