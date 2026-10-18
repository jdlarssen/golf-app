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
  italic = false,
): Promise<ArrayBuffer | null> {
  const axes = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family,
  )}:${axes}&display=swap`;
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
  fonts: { name: string; data: ArrayBuffer; weight: 400 | 500 | 600; style: 'normal' | 'italic' }[];
  hasFraunces: boolean;
  hasInter: boolean;
};

/**
 * The four brand weights the share card and OG images use. The result card
 * (#2319) also asks for Fraunces 500 italic (the gold result in the headline)
 * and Inter 600 (kicker, tagline link); without options the result is what it
 * always was. A failed italic fetch just leaves the upright Fraunces to draw it.
 */
export async function loadFonts(
  opts: { frauncesItalic?: boolean; inter600?: boolean } = {},
): Promise<LoadedFonts> {
  const [fr500, fr600, in400, in500, fr500i, in600] = await Promise.all([
    fetchGoogleFont('Fraunces', 500),
    fetchGoogleFont('Fraunces', 600),
    fetchGoogleFont('Inter', 400),
    fetchGoogleFont('Inter', 500),
    opts.frauncesItalic ? fetchGoogleFont('Fraunces', 500, true) : null,
    opts.inter600 ? fetchGoogleFont('Inter', 600) : null,
  ]);
  const fonts: LoadedFonts['fonts'] = [];
  if (fr500) fonts.push({ name: 'Fraunces', data: fr500, weight: 500, style: 'normal' });
  if (fr600) fonts.push({ name: 'Fraunces', data: fr600, weight: 600, style: 'normal' });
  if (in400) fonts.push({ name: 'Inter', data: in400, weight: 400, style: 'normal' });
  if (in500) fonts.push({ name: 'Inter', data: in500, weight: 500, style: 'normal' });
  if (fr500i) fonts.push({ name: 'Fraunces', data: fr500i, weight: 500, style: 'italic' });
  if (in600) fonts.push({ name: 'Inter', data: in600, weight: 600, style: 'normal' });
  return {
    fonts,
    hasFraunces: Boolean(fr500 || fr600),
    hasInter: Boolean(in400 || in500),
  };
}
