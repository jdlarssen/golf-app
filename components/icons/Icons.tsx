// Tørny iconset — 10 functional 24×24 icons, currentColor, 1.5 stroke,
// round caps/joins, 2px safe-zone. Distinct from the hero 64px icons in
// this folder (PinFlag/Laurel/MailEnvelope/HourGlass) which are
// decorative empty-state illustrations. These ten are line-icons for
// inline use in tiles, list rows, pills, and bottom-nav.

import * as React from 'react';

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number | string };

const base = (size: IconProps['size']) => ({
  width: size ?? 24,
  height: size ?? 24,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
});

export const FlaggIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <line x1="7" y1="3.5" x2="7" y2="20" />
    <line x1="4" y1="20" x2="11" y2="20" />
    <path d="M 7 4 L 16.5 6.5 L 7 10 Z" />
  </svg>
);

export const UtslagIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="6.5" r="3" />
    <path d="M 9.5 10 Q 12 11.4 14.5 10" />
    <path d="M 9.8 10 L 12 18 L 14.2 10" />
    <line x1="4" y1="20" x2="20" y2="20" />
  </svg>
);

export const PokalIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M 8.5 4 L 15.5 4 L 15.5 11 Q 15.5 14.5 12 14.5 Q 8.5 14.5 8.5 11 Z" />
    <path d="M 8.5 5.5 Q 5.5 5.5 5.5 8 Q 5.5 10 8.5 10" />
    <path d="M 15.5 5.5 Q 18.5 5.5 18.5 8 Q 18.5 10 15.5 10" />
    <line x1="12" y1="14.5" x2="12" y2="17.5" />
    <line x1="8.5" y1="20" x2="15.5" y2="20" />
    <line x1="10" y1="17.5" x2="14" y2="17.5" />
  </svg>
);

export const ScorekortIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <rect x="5.5" y="5" width="13" height="16" rx="1.5" />
    <rect x="9.5" y="3" width="5" height="3.5" rx="0.75" />
    <line x1="8" y1="11" x2="16" y2="11" />
    <line x1="8" y1="14" x2="14" y2="14" />
    <line x1="8" y1="17" x2="15" y2="17" />
  </svg>
);

export const BaneIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M 3 16 Q 8 12.5 12.5 14 Q 17 15.5 21 12" />
    <line x1="3" y1="20" x2="21" y2="20" />
    <line x1="14" y1="14" x2="14" y2="8.5" />
    <path d="M 14 8.7 L 18 9.7 L 14 11 Z" />
  </svg>
);

export const KonvoluttIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <rect x="3" y="6" width="18" height="13" rx="1.75" />
    <path d="M 3.5 7.5 L 12 13.5 L 20.5 7.5" />
  </svg>
);

export const LaurbaerIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M 12 21 C 6 19 4 13 5 8 C 5.5 5.5 7 4 9 3.5" />
    <ellipse cx="6.2" cy="14.5" rx="2.2" ry="0.95" transform="rotate(-55 6.2 14.5)" />
    <ellipse cx="6.2" cy="10.5" rx="2.2" ry="0.95" transform="rotate(-65 6.2 10.5)" />
    <ellipse cx="7.6" cy="6.8" rx="2.0" ry="0.85" transform="rotate(-75 7.6 6.8)" />
    <path d="M 12 21 C 18 19 20 13 19 8 C 18.5 5.5 17 4 15 3.5" />
    <ellipse cx="17.8" cy="14.5" rx="2.2" ry="0.95" transform="rotate(55 17.8 14.5)" />
    <ellipse cx="17.8" cy="10.5" rx="2.2" ry="0.95" transform="rotate(65 17.8 10.5)" />
    <ellipse cx="16.4" cy="6.8" rx="2.0" ry="0.85" transform="rotate(75 16.4 6.8)" />
  </svg>
);

export const HandicapIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5.5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const KolleIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <rect x="14.5" y="2.8" width="4" height="2.6" rx="0.9" />
    <line x1="16.5" y1="5.4" x2="9.4" y2="14.6" />
    <path d="M 9.4 14.6 L 4.4 17.4 L 6.2 20.6 L 12.3 17.6 Z" />
    <line x1="5.5" y1="19" x2="11.2" y2="16.2" />
  </svg>
);

export const KalenderIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <rect x="4" y="6" width="16" height="14" rx="1.75" />
    <line x1="4" y1="10.5" x2="20" y2="10.5" />
    <line x1="9" y1="4" x2="9" y2="8" />
    <line x1="15" y1="4" x2="15" y2="8" />
    <circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

// Counter-clockwise replay arrow — used to retrigger one-shot animations
// (e.g. confetti burst on the finished leaderboard). Arc spans roughly
// from 9 o'clock to 5 o'clock, with the arrow-head pointing into the arc
// at the 9 o'clock entry so the gesture reads as "rewind / play again".
export const ReplayIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M 4 12 A 8 8 0 1 0 6.3 6.3" />
    <polyline points="3,3 4,12 13,11" />
  </svg>
);

// Four-pointed sparkle med to mindre satellitter — SVG-pendant til ✨-emojien
// som brukes i product-update-banner og notification-card. Stor stjerne har
// litt konkave «pinch»-kanter (samme silhuett som Unicode-glyphen); de små
// satellittene er rene rhombuser. Holder seg innenfor 2px safe-zone.
export const SparkleIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M 12 3 Q 12.6 8.4 13.5 9.3 Q 14.4 10.2 19.8 10.8 Q 14.4 11.4 13.5 12.3 Q 12.6 13.2 12 18.6 Q 11.4 13.2 10.5 12.3 Q 9.6 11.4 4.2 10.8 Q 9.6 10.2 10.5 9.3 Q 11.4 8.4 12 3 Z" />
    <path d="M 18.5 14 L 19 16 L 21 16.5 L 19 17 L 18.5 19 L 18 17 L 16 16.5 L 18 16 Z" />
    <path d="M 5.5 4 L 5.9 5.4 L 7.3 5.8 L 5.9 6.2 L 5.5 7.6 L 5.1 6.2 L 3.7 5.8 L 5.1 5.4 Z" />
  </svg>
);

// F3 (#273): admin format-mapping-tile-ikon. 3x3-grid med to celler fylt
// signalerer matrix-view + on/off-toggle. Currentcolor, 1.5 stroke som
// resten av iconsettet.
export const FormatsIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <rect x="3" y="3" width="5" height="5" rx="1" />
    <rect x="10" y="3" width="5" height="5" rx="1" fill="currentColor" />
    <rect x="17" y="3" width="4" height="5" rx="1" />
    <rect x="3" y="10" width="5" height="5" rx="1" fill="currentColor" />
    <rect x="10" y="10" width="5" height="5" rx="1" />
    <rect x="17" y="10" width="4" height="5" rx="1" fill="currentColor" />
    <rect x="3" y="17" width="5" height="4" rx="1" />
    <rect x="10" y="17" width="5" height="4" rx="1" />
    <rect x="17" y="17" width="4" height="4" rx="1" fill="currentColor" />
  </svg>
);
