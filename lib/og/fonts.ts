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
  /** Pins Fraunces' optical-size axis (9–144); omitted = the font's default cut. */
  opsz?: number,
): Promise<ArrayBuffer | null> {
  const axes =
    opsz === undefined
      ? italic
        ? `ital,wght@1,${weight}`
        : `wght@${weight}`
      : italic
        ? `ital,opsz,wght@1,${opsz},${weight}`
        : `opsz,wght@${opsz},${weight}`;
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
  /** The result card's headline cut, `FrauncesDisplay` (see `loadFonts`). */
  hasFrauncesDisplay: boolean;
};

/**
 * Optical size of the result card's upright headline. Chrome draws Fraunces at
 * an optical size equal to the font size in CSS px, so the artboard's 58px
 * headline is the opsz 58-60 cut, tighter than the default cut Satori gets.
 * Google snaps 60 and up to the same instance; «Marte vant» measures 556px
 * against the artboard's 559px (the default cut: 591px). The italic stays the
 * default cut: the artboard's gold is Chrome's slanted upright (its font link
 * has no italic axis), and a true italic at opsz 60 came out 5 % narrower.
 */
const HEADLINE_OPSZ = 60;

/**
 * The four brand weights the share card and OG images use. The result card
 * (#2319) also asks for `headlineDisplay` (Fraunces 500 upright at the
 * headline's optical size plus the italic, under the family name
 * `FrauncesDisplay`) and
 * `inter600` (kicker, tagline link). Without options the result is what it
 * always was. If the display cut fails to load, the headline falls back to the
 * ordinary Fraunces.
 */
export async function loadFonts(
  opts: { headlineDisplay?: boolean; inter600?: boolean } = {},
): Promise<LoadedFonts> {
  const [fr500, fr600, in400, in500, disp, dispItalic, in600] = await Promise.all([
    fetchGoogleFont('Fraunces', 500),
    fetchGoogleFont('Fraunces', 600),
    fetchGoogleFont('Inter', 400),
    fetchGoogleFont('Inter', 500),
    opts.headlineDisplay ? fetchGoogleFont('Fraunces', 500, false, HEADLINE_OPSZ) : null,
    opts.headlineDisplay ? fetchGoogleFont('Fraunces', 500, true) : null,
    opts.inter600 ? fetchGoogleFont('Inter', 600) : null,
  ]);
  const fonts: LoadedFonts['fonts'] = [];
  if (fr500) fonts.push({ name: 'Fraunces', data: fr500, weight: 500, style: 'normal' });
  if (fr600) fonts.push({ name: 'Fraunces', data: fr600, weight: 600, style: 'normal' });
  if (in400) fonts.push({ name: 'Inter', data: in400, weight: 400, style: 'normal' });
  if (in500) fonts.push({ name: 'Inter', data: in500, weight: 500, style: 'normal' });
  if (disp) fonts.push({ name: 'FrauncesDisplay', data: disp, weight: 500, style: 'normal' });
  if (dispItalic) {
    // Under the display family when its upright cut loaded; otherwise under
    // plain Fraunces, which the headline then falls back to, so the gold word
    // keeps its italic.
    const name = disp ? 'FrauncesDisplay' : 'Fraunces';
    fonts.push({ name, data: dispItalic, weight: 500, style: 'italic' });
  }
  if (in600) fonts.push({ name: 'Inter', data: in600, weight: 600, style: 'normal' });
  return {
    fonts,
    hasFraunces: Boolean(fr500 || fr600),
    hasInter: Boolean(in400 || in500),
    hasFrauncesDisplay: Boolean(disp),
  };
}
