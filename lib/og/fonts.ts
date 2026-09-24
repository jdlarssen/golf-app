import 'server-only';

/**
 * Google-font loading for Satori-rendered images — lifted from the
 * share-image route (#942) for reuse by #1022's opengraph-image. The app
 * icons are no longer Satori routes: they are static PNGs from
 * native/assets/generate-icons.mjs (#1985).
 */

/**
 * Fetch one Google-font weight as a ttf ArrayBuffer (or null on any failure).
 * No User-Agent spoofing: the css2 endpoint picks the format from the UA, and
 * a browser UA now gets woff2, which Satori cannot read — the ttf match then
 * found nothing and every image fell back to Satori's default sans (#1985).
 * Node's own UA gets one ttf. Graceful: a null means Satori uses its default.
 */
export async function fetchGoogleFont(
  family: string,
  weight: number,
): Promise<ArrayBuffer | null> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family,
  )}:wght@${weight}&display=swap`;
  try {
    const css = await fetch(cssUrl).then((r) => (r.ok ? r.text() : ''));
    const m = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);
    if (!m) return null;
    return await fetch(m[1]).then((r) => (r.ok ? r.arrayBuffer() : null));
  } catch {
    return null;
  }
}

export type LoadedFonts = {
  fonts: { name: string; data: ArrayBuffer; weight: 400 | 500 | 600; style: 'normal' }[];
  hasFraunces: boolean;
  hasInter: boolean;
};

/** The four brand weights the share card and OG images use. */
export async function loadFonts(): Promise<LoadedFonts> {
  const [fr500, fr600, in400, in500] = await Promise.all([
    fetchGoogleFont('Fraunces', 500),
    fetchGoogleFont('Fraunces', 600),
    fetchGoogleFont('Inter', 400),
    fetchGoogleFont('Inter', 500),
  ]);
  const fonts: LoadedFonts['fonts'] = [];
  if (fr500) fonts.push({ name: 'Fraunces', data: fr500, weight: 500, style: 'normal' });
  if (fr600) fonts.push({ name: 'Fraunces', data: fr600, weight: 600, style: 'normal' });
  if (in400) fonts.push({ name: 'Inter', data: in400, weight: 400, style: 'normal' });
  if (in500) fonts.push({ name: 'Inter', data: in500, weight: 500, style: 'normal' });
  return {
    fonts,
    hasFraunces: Boolean(fr500 || fr600),
    hasInter: Boolean(in400 || in500),
  };
}
