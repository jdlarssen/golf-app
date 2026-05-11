import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  size?: number;
  className?: string;
};

/**
 * Circular medallion with a radial-gradient surface, a champagne hairline
 * ring, and a soft drop shadow. Designed to host an icon (e.g. PinFlag) in
 * empty-state hero illustrations.
 *
 * The ring and drop shadow are both delivered via `ring-medallion` (see
 * `app/globals.css`), so we don't apply `shadow-medallion` separately.
 */
export function ChampagneMedallion({ children, size = 128, className }: Props) {
  return (
    <div
      className={`rounded-full grid place-items-center bg-medallion ring-medallion ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      {children}
    </div>
  );
}
