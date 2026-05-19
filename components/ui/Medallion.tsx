import type { JSX } from 'react';

type Place = 1 | 2 | 3;

const GRADIENTS: Record<
  Place,
  { id: string; stops: [string, string, string]; stroke: string; fg: string }
> = {
  1: {
    id: 'goldSheen',
    stops: ['#E6C988', '#C9A961', '#9C7E3F'],
    stroke: '#9C7E3F',
    fg: '#1A2E1F',
  },
  2: {
    id: 'silverSheen',
    stops: ['#D4CFC2', '#A89F92', '#6C6358'],
    stroke: '#5C5347',
    fg: '#1A2E1F',
  },
  3: {
    id: 'bronzeSheen',
    stops: ['#D2A07B', '#A8714B', '#6F4A2F'],
    stroke: '#6F4A2F',
    fg: 'var(--bg-tint)',
  },
};

/**
 * Champagne / silver-taupe / bronze medallion for leaderboard positions 1, 2, 3.
 * Lifted from the brand-foundations spec (assets/medallion-{gold,silver,bronze}.svg)
 * and inlined as JSX so the gradient ids don't collide across DOM instances
 * (each render gets a unique scoped id via React's `useId`).
 *
 * Default size 44px matches the UI kit's row-medallion; pass `size` to scale
 * (e.g. 56 for the leader hero).
 */
export function Medallion({
  place,
  size = 44,
  title,
}: {
  place: Place;
  size?: number;
  title?: string;
}): JSX.Element {
  const g = GRADIENTS[place];
  // Unique gradient id per render so multiple medallions on one page don't
  // share a gradient definition (React's reconciler would otherwise reuse the
  // first one's id and gradient).
  const gradId = `${g.id}-${place}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      role="img"
      aria-label={title ?? `${place}. plass`}
    >
      <title>{title ?? `${place}. plass`}</title>
      <defs>
        <radialGradient id={gradId} cx="35%" cy="30%" r="65%">
          <stop offset="0" stopColor={g.stops[0]} />
          <stop offset={place === 1 ? '0.55' : '0.6'} stopColor={g.stops[1]} />
          <stop offset="1" stopColor={g.stops[2]} />
        </radialGradient>
      </defs>
      <circle cx="28" cy="28" r="24" fill={`url(#${gradId})`} />
      <circle
        cx="28"
        cy="28"
        r="24"
        fill="none"
        stroke={g.stroke}
        strokeWidth="1"
      />
      {place === 1 && (
        <circle
          cx="28"
          cy="28"
          r="18"
          fill="none"
          stroke={g.stroke}
          strokeWidth="0.75"
          opacity="0.55"
        />
      )}
      <text
        x="28"
        y="38"
        textAnchor="middle"
        fontFamily="Fraunces, Georgia, serif"
        fontSize="22"
        fontWeight="500"
        fill={g.fg}
      >
        {place}
      </text>
    </svg>
  );
}
