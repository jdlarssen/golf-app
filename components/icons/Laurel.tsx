type Props = {
  /** Height in px. Width is derived as ~45% of height to keep the branch tall and thin. */
  height?: number;
  className?: string;
};

/**
 * Single laurel branch — used in pairs flanking the leaderboard's leader card.
 * Stroke is `currentColor` so the caller controls the tint via Tailwind (the
 * leader card uses champagne `text-accent` at `opacity-55`).
 *
 * The right-side instance flips horizontally via `transform: scaleX(-1)` on
 * its wrapper; the SVG itself is always "left-facing" (stem on the right,
 * leaves curving down-left).
 */
export function Laurel({ height = 68, className }: Props) {
  const width = Math.round(height * 0.45);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 54 120"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ display: 'block' }}
    >
      <path
        d="M40 8 C20 30, 12 60, 14 110"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <g stroke="currentColor" strokeWidth="1" fill="none" opacity="0.95">
        <path d="M36 18 C28 16, 22 22, 24 30" />
        <path d="M30 32 C22 30, 16 36, 18 44" />
        <path d="M24 48 C16 46, 12 54, 14 62" />
        <path d="M20 66 C12 64, 10 72, 12 80" />
        <path d="M16 84 C10 84, 10 92, 12 100" />
      </g>
    </svg>
  );
}
