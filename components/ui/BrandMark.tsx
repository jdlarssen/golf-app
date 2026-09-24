import {
  BALL_CENTER_X_EM,
  BALL_CLEARANCE_EM,
  BALL_DIAMETER_EM,
  BALL_SHADING_CSS,
  BALL_SHADING_MIN_PX,
  T_CAP_HEIGHT_EM,
} from '@/lib/brand/wordmarkBall';

// Font size is set here and only here: two text-* classes on one element are
// decided by their order in the CSS, not in className, so className is for
// margins only.
const SIZES = {
  xs: { className: 'text-sm', px: 14 }, // spectate banner
  sm: { className: 'text-xl', px: 20 }, // top of a page
  md: { className: 'text-3xl', px: 30 }, // signup poster
  lg: { className: 'text-5xl', px: 48 }, // BrandHero, /login
} as const;

export type BrandMarkSize = keyof typeof SIZES;

/**
 * The «Tørny» wordmark with the champagne ball resting on the T (#1985) —
 * the only web rendering of it. `<BrandHero />` wraps the lg size in the page
 * heading with the tagline below.
 *
 * The root is a span, so it can sit inside an <h1>, and its text is exactly
 * «Tørny» (the ball is aria-hidden), which keeps the heading's accessible
 * name. The ball hangs off a zero-size inline-block on the baseline, so it
 * lands on the T's cap height with Fraunces and with next/font's fallback
 * alike; every offset is in em and scales with the size.
 *
 * `tone="current"` takes the surrounding text colour for both letters and ball
 * (the spectate banner, which switches between champagne and forest).
 */
export function BrandMark({
  size = 'sm',
  tone = 'default',
  className = '',
}: {
  size?: BrandMarkSize;
  tone?: 'default' | 'current';
  className?: string;
}) {
  const { className: sizeClass, px } = SIZES[size];
  const shaded = tone === 'default' && px * BALL_DIAMETER_EM >= BALL_SHADING_MIN_PX;
  return (
    <span
      className={`block font-serif font-medium tracking-tight leading-none ${sizeClass} ${
        tone === 'default' ? 'text-text' : ''
      } ${className}`}
      style={{ paddingTop: `${BALL_CLEARANCE_EM}em` }}
    >
      <span aria-hidden="true" className="relative inline-block h-0 w-0 align-baseline">
        <span
          className={`absolute rounded-full ${tone === 'default' ? 'bg-accent' : 'bg-current'}`}
          style={{
            left: `${BALL_CENTER_X_EM - BALL_DIAMETER_EM / 2}em`,
            bottom: `${T_CAP_HEIGHT_EM}em`,
            width: `${BALL_DIAMETER_EM}em`,
            height: `${BALL_DIAMETER_EM}em`,
            backgroundImage: shaded ? BALL_SHADING_CSS : undefined,
          }}
        />
      </span>
      Tørny
    </span>
  );
}
