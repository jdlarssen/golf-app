import 'server-only';

/**
 * Google-font loading for Satori-rendered images — lifted from the
 * share-image route (#942) for reuse by #1022's opengraph-image. The three
 * icon files (app/icon.tsx, icon0.tsx, apple-icon.tsx) keep their private
 * copies for now; migrating them is deliberately out of scope for #1022.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/**
 * Fetch one Google-font weight as a ttf ArrayBuffer (or null on any failure),
 * mirroring `app/icon.tsx`. Spoofs a desktop UA so the css2 endpoint returns a
 * ttf URL we can parse. Graceful: a null just means Satori uses its default.
 */
export async function fetchGoogleFont(
  family: string,
  weight: number,
): Promise<ArrayBuffer | null> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family,
  )}:wght@${weight}&display=swap`;
  try {
    const css = await fetch(cssUrl, { headers: { 'User-Agent': UA } }).then(
      (r) => (r.ok ? r.text() : ''),
    );
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
