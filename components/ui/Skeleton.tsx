import * as React from 'react';

type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Stagger offset in milliseconds. Applied as `animation-delay` on the
   * shared shimmer keyframe so each shape's sweep is phase-shifted while
   * the keyframe itself stays unison. 90ms steps match the design spec.
   */
  delay?: number;
};

/**
 * Warm-linen skeleton shape with a single 1.8s champagne-tinted shimmer
 * sweep. The `.sk` utility (defined in app/globals.css) owns the gradient,
 * keyframe, and reduced-motion fallback. This component just composes
 * Tailwind sizing onto it and passes per-element stagger delay.
 *
 * Default radius is 6px; pass `rounded-full` for circles/pills or a
 * `rounded-[Npx]` arbitrary class to match the underlying UI shape.
 */
export function Skeleton({
  className = '',
  delay = 0,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <div
      {...rest}
      className={`sk ${className}`}
      style={{ animationDelay: `${delay}ms`, ...(style ?? {}) }}
    />
  );
}

export function SkeletonCircle(props: SkeletonProps) {
  return (
    <Skeleton {...props} className={`rounded-full ${props.className ?? ''}`} />
  );
}

export function SkeletonPill(props: SkeletonProps) {
  return (
    <Skeleton {...props} className={`rounded-full ${props.className ?? ''}`} />
  );
}
