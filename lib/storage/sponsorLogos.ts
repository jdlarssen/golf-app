/**
 * #1052: klient-side sponsorlogo-pipeline — dekode → rasterisere/nedskalere →
 * laste opp til sponsor-logos-bucketen. KUN for browser (Image/canvas/
 * URL.createObjectURL); importeres bare fra klient-komponenter.
 *
 * Designvalg (kontrakt 1052-sponsor-logo-storage.md):
 *   • SVG godtas som INPUT men rasteriseres alltid — SVG-bytes når aldri
 *     bucketen (eier-beslutning 2026-07-15; XSS-flaten «lagret SVG» finnes
 *     dermed ikke). Dimensjonsløs SVG faller tilbake til kvadrat (fitWithin).
 *   • Klient-taket på råfila (5 MB) er UX-guard FØR dekoding; bucketens
 *     file_size_limit (1 MB) er server-sannheten (trap #4 — regelens hjem er
 *     migrasjon 0143).
 *   • webp foretrekkes; Safari uten webp-encoder faller tilbake til png
 *     (toBlob gir da en png-typet blob — filendelsen følger blob-typen).
 *   • Path = {auth.uid}/{uuid}.{ext} — mappe-per-eier tilfredsstiller
 *     INSERT-RLS-en, og gameId finnes ikke under atomisk opprett (trap #5).
 */

import { getBrowserClient } from '@/lib/supabase/client';
import { fitWithin } from './fitWithin';
import { SPONSOR_LOGO_BUCKET } from './sponsorLogoUrl';

/** Rå-fil-tak før nedskalering — UX-guard, ikke authz (den bor i 0143). */
export const SPONSOR_LOGO_MAX_RAW_BYTES = 5 * 1024 * 1024;
/** Lengste kant etter nedskalering. Logoer vises ≤ ~40px høye; 400px gir
 *  retina-margin uten å nærme seg bucketens 1 MB-tak. */
export const SPONSOR_LOGO_MAX_DIMENSION = 400;

export type SponsorLogoUploadResult =
  | { ok: true; path: string }
  | { ok: false; error: 'too_large' | 'decode_failed' | 'upload_failed' };

async function decodeImage(file: File): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    // decode() har lastet bitmapen i minnet — trygt å revoke før drawImage.
    URL.revokeObjectURL(url);
  }
}

function toBlobAsync(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Dekod, rasteriser (inkl. SVG), nedskaler og last opp. Returnerer object-
 * path for games.prizes, eller en typet feil UI-et oversetter til norsk.
 */
export async function processAndUploadSponsorLogo(
  file: File,
): Promise<SponsorLogoUploadResult> {
  if (file.size > SPONSOR_LOGO_MAX_RAW_BYTES) {
    return { ok: false, error: 'too_large' };
  }

  const img = await decodeImage(file);
  if (!img) return { ok: false, error: 'decode_failed' };

  const { width, height } = fitWithin(
    img.naturalWidth,
    img.naturalHeight,
    SPONSOR_LOGO_MAX_DIMENSION,
  );
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, error: 'decode_failed' };
  ctx.drawImage(img, 0, 0, width, height);

  // webp først (alfa + minst bytes); Safari-fallback: png (også alfa).
  let blob = await toBlobAsync(canvas, 'image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') {
    blob = await toBlobAsync(canvas, 'image/png');
  }
  if (!blob) return { ok: false, error: 'decode_failed' };
  const ext = blob.type === 'image/webp' ? 'webp' : 'png';

  const supabase = getBrowserClient();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return { ok: false, error: 'upload_failed' };

  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(SPONSOR_LOGO_BUCKET)
    .upload(path, blob, {
      contentType: blob.type,
      // Path er unik per opplasting (uuid) → innholdet er immutabelt og kan
      // CDN-caches hardt. Bytte av logo gir ny path, aldri overskriving.
      cacheControl: '31536000',
      upsert: false,
    });
  if (error) {
    console.error('[sponsorLogos] upload failed', error);
    return { ok: false, error: 'upload_failed' };
  }
  return { ok: true, path };
}

/**
 * Best-effort-sletting ved «Fjern»/re-opplasting i wizarden (Resend-mønsteret:
 * feil logges, blokkerer aldri flyten). RLS DELETE-policyen dekker eieren;
 * en admin som redigerer andres spill feiler stille her → akseptert orphan
 * (kontraktens restrisiko).
 */
export async function removeSponsorLogo(path: string): Promise<void> {
  try {
    const supabase = getBrowserClient();
    const { error } = await supabase.storage
      .from(SPONSOR_LOGO_BUCKET)
      .remove([path]);
    if (error) console.error('[sponsorLogos] remove failed', error);
  } catch (err) {
    console.error('[sponsorLogos] remove failed', err);
  }
}
