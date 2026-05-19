type Props = { size?: number; className?: string };

export function MailEnvelope({ size = 64, className }: Props) {
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
        E5 dark-mode pass: interior fill uses var(--surface) so the envelope
        body sits on the page bg as a slightly lighter forest disc in dark
        mode (--surface #1a2e1f on --bg #0f1612) instead of punching a
        glaring white rectangle through the layout. Light mode stays white.
      */}
      <rect
        x="8"
        y="16"
        width="48"
        height="34"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="var(--surface)"
      />
      <path
        d="M8 19 L32 35 L56 19"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="14" r="4" fill="var(--accent)" />
    </svg>
  );
}
