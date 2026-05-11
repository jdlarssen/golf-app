type Props = { size?: number; className?: string };

export function PinFlag({ size = 64, className }: Props) {
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
      <line
        x1="22"
        y1="6"
        x2="22"
        y2="56"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M22 8 L44 14 L22 22 Z"
        fill="#C9A961"
        stroke="#C9A961"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <ellipse cx="22" cy="56" rx="6" ry="1.8" fill="currentColor" opacity="0.18" />
    </svg>
  );
}
