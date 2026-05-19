type Props = { size?: number; className?: string };

/**
 * Tight 16-viewBox variant of PinFlag for inline use next to text — used in
 * pairs flanking the leader card's team name. Fill is hardcoded champagne;
 * for any other tint, use the larger `PinFlag` which inherits `currentColor`
 * on its pole.
 */
export function PinFlagSm({ size = 14, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <line
        x1="5"
        y1="1"
        x2="5"
        y2="15"
        stroke="var(--accent)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M5 2 L13 4 L5 6 Z" fill="var(--accent)" />
    </svg>
  );
}
