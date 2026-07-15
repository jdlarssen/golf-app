/**
 * #1052: URL-bygging for sponsorlogoer — server-trygg modul (ingen browser-
 * API-er, ingen 'use client'-import), brukes av både server- og klient-
 * komponenter på visningsflatene.
 *
 * Bucketen er public: lesing går via CDN-stien /storage/v1/object/public/…
 * uten signering. Pathen i games.prizes er object-key ({uid}/{uuid}.webp),
 * aldri full URL — så et evt. domene-/ref-bytte ikke krever datamigrering.
 */

export const SPONSOR_LOGO_BUCKET = 'sponsor-logos';

export function sponsorLogoUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${SPONSOR_LOGO_BUCKET}/${encodeURI(path)}`;
}
