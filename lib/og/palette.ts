/**
 * Brand palette for Satori-rendered images (share cards, OG images) — lifted
 * from the share-image route (#942) for reuse by #1022's opengraph-image.
 *
 * Hardcoded hex on purpose: these are fixed-look images that must NOT invert
 * in dark mode (unlike the app's CSS-variable surfaces). Keep in sync with
 * `app/globals.css` only when the brand palette itself changes.
 */
export const FOREST = '#1B4332';
export const CHAMP = '#C9A961';
export const CHAMP_DARK = '#8A6F2E';
export const LINEN = '#F8F6F0';
export const MUTED = '#6B6354';
export const TAUPE = '#4A3F30';
export const CHAMP_TINT = '#F6EDD6';
export const CHAMP_PILL = '#F1E6C9';
export const HAIRLINE = 'rgba(201,169,97,0.40)';
export const ROW_HAIRLINE = 'rgba(27,67,50,0.08)';

// Result card on forest green (#2319). Taken from the artboard
// «Resultatkort-forslag», not from the app's CSS variables: the card looks the
// same in light and dark mode. ON_STRONG / ACCENT_ON_STRONG are DESIGN.md's
// `on-strong` and `accent-on-strong`; the hills and the silver/bronze
// medallions are the artboard's own values.
export const ON_STRONG = '#ECE5D2';
export const ACCENT_ON_STRONG = '#D4B870';
export const HILL_FAR = '#163A2A';
export const HILL_NEAR = '#12321F';
export const MEDAL_INK = '#1A2E1F';
export const MEDAL_SILVER = 'radial-gradient(circle at 50% 38%, #ffffff 0%, #cfc9bd 100%)';
export const MEDAL_BRONZE = 'radial-gradient(circle at 50% 38%, #e8c3a4 0%, #b07c52 100%)';
