import 'server-only';
import { headers } from 'next/headers';

/**
 * The address the page was opened on, so a link built on staging points at
 * staging. Shared by the big screen's QR code (#2275) and the organiser's TV
 * link in the prize-giving (#2298).
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('host');
  if (!host) return 'https://tornygolf.no';
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
  return `${proto}://${host}`;
}
