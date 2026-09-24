/**
 * The ball resting on the T in the «Tørny» wordmark (#1985), as ratios of the
 * font size (em). One home for the two code renderings — `BrandMark` (CSS) and
 * the Satori lockup in `lib/og/wordmark.tsx` — and the numbers
 * `native/assets/wordmark-master.svg` draws at font-size 100 (the mail header's
 * PNG). `wordmarkBall.test.ts` holds the SVG to these values.
 *
 * Plain constants on purpose: no `server-only`, so client components
 * (ErrorScreen, DemoGame) can render BrandMark.
 */

/** Ball diameter. */
export const BALL_DIAMETER_EM = 0.26;

/**
 * Horizontal centre of the ball, from the text origin: the T's ink centre in
 * Fraunces 500 (0.336–0.344 em across the optical sizes BrandMark renders at).
 */
export const BALL_CENTER_X_EM = 0.34;

/** Fraunces 500's cap height. The ball's bottom sits this far above the baseline. */
export const T_CAP_HEIGHT_EM = 0.72;

/**
 * Room reserved above a line-height-1 line box so the ball (0.98 em above the
 * baseline) never reaches into the text above. Fraunces puts the baseline
 * ~0.81 em below the top of such a line box, so the ball pokes out ~0.17 em.
 */
export const BALL_CLEARANCE_EM = 0.18;

/** Below this diameter (px) the ball is a flat circle — a highlight does not read. */
export const BALL_SHADING_MIN_PX = 8;

/**
 * The ball's highlight as a CSS gradient over the champagne fill: the soft
 * linen light up-left from the icon (`ball-light` in
 * `native/assets/icon-master-full-bleed.svg`). The icon's dark rim is left
 * out on purpose — Satori paints a second radial layer across the whole ball
 * and turns it olive.
 */
export const BALL_SHADING_CSS =
  'radial-gradient(circle at 36% 30%, rgba(248,246,240,0.55), rgba(248,246,240,0) 60%)';
