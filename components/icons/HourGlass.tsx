type Props = { size?: number; className?: string };

export function HourGlass({ size = 64, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/*
        E5 dark-mode pass (preemptive for Phase F state #3): interior fill
        uses var(--surface) so the hourglass body adapts to theme — slightly
        lighter forest in dark mode, white in light mode — instead of a
        hardcoded white shape on the near-black page bg.
      */}
      <path
        d="M18 10 L46 10 L46 18 L34 32 L46 46 L46 54 L18 54 L18 46 L30 32 L18 18 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="var(--surface)"
        strokeLinejoin="round"
      />
      <path d="M22 14 L42 14 L33 24 Z" fill="#C9A961" opacity="0.7" />
      <circle cx="32" cy="42" r="1.5" fill="currentColor" />
    </svg>
  );
}
