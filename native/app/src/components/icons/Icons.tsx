// #1879: Tørnys ikonspråk i appen.
//
// Kilde: webbens `components/icons/Icons.tsx` (linjeikonene) og
// `components/icons/PinFlag.tsx` (hero-flagget). Geometrien er kopiert 1:1 —
// 24×24, strek 1,5, runde ender, 2px safe-zone. Kopi framfor delt path-modul
// er bevisst: ikonene endres så godt som aldri, og en delt kilde ville krevd
// en refaktor av webben. Endres et ikon der, endres det her også.
//
// Hake, pluss og chevron finnes ikke i webbens sett; de er tegnet her i samme
// strek.
//
// Reglene ikonene brukes etter (eier, #1879):
//  - ikon + etikett er hovedregelen, og teksten bærer meningen — derfor er
//    ikonene skjult for skjermleseren som standard;
//  - ikon alene kun for det universelle settet (tilbake, lukk, pluss,
//    chevron) — da MÅ kallstedet gi `accessibilityLabel`;
//  - aldri ikon alene for domenehandlinger (Juster, Trekk, Fjern, Lever).
//
// Fargen er en eksplisitt `color`-prop fra `useTheme().colors`, ikke en
// arvet `currentColor`-kaskade som på web. `viewBox` må stå: Android tegner
// feil uten.
//
// Dette er appens ENESTE import-flate for `react-native-svg`.
import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

export type IconProps = {
  color: string;
  size?: number;
  /** Kun for ikon som står alene. Uten den er ikonet dekor. */
  accessibilityLabel?: string;
  testID?: string;
};

function LineIcon({
  color,
  size = 24,
  accessibilityLabel,
  testID,
  children,
}: IconProps & { children: ReactNode }) {
  const decorative = accessibilityLabel == null;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      testID={testID}
      accessible={!decorative}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    >
      {children}
    </Svg>
  );
}

export const FlaggIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Line x1="7" y1="3.5" x2="7" y2="20" />
    <Line x1="4" y1="20" x2="11" y2="20" />
    <Path d="M 7 4 L 16.5 6.5 L 7 10 Z" />
  </LineIcon>
);

export const PokalIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Path d="M 8.5 4 L 15.5 4 L 15.5 11 Q 15.5 14.5 12 14.5 Q 8.5 14.5 8.5 11 Z" />
    <Path d="M 8.5 5.5 Q 5.5 5.5 5.5 8 Q 5.5 10 8.5 10" />
    <Path d="M 15.5 5.5 Q 18.5 5.5 18.5 8 Q 18.5 10 15.5 10" />
    <Line x1="12" y1="14.5" x2="12" y2="17.5" />
    <Line x1="8.5" y1="20" x2="15.5" y2="20" />
    <Line x1="10" y1="17.5" x2="14" y2="17.5" />
  </LineIcon>
);

export const KalenderIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Rect x="4" y="6" width="16" height="14" rx="1.75" />
    <Line x1="4" y1="10.5" x2="20" y2="10.5" />
    <Line x1="9" y1="4" x2="9" y2="8" />
    <Line x1="15" y1="4" x2="15" y2="8" />
    <Circle cx="12" cy="15" r="1.5" fill={props.color} stroke="none" />
  </LineIcon>
);

/** Levert/godkjent — statusglyfen i tette rader. */
export const HakeIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Path d="M 5 12.5 L 10 17.5 L 19 7" />
  </LineIcon>
);

export const PlussIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Line x1="12" y1="5" x2="12" y2="19" />
    <Line x1="5" y1="12" x2="19" y2="12" />
  </LineIcon>
);

/** Peker ned (vis mer) som standard; `up` for «lukk». */
export const ChevronIcon = ({ up = false, ...props }: IconProps & { up?: boolean }) => (
  <LineIcon {...props}>
    <Path d={up ? 'M 6 15 L 12 9 L 18 15' : 'M 6 9 L 12 15 L 18 9'} />
  </LineIcon>
);

/**
 * Hero-flagget fra webbens tomtilstand på hjem (64×64-rutenett). Stanga i
 * `color`, vimpelen i `accent` — samme to roller som webbens
 * `currentColor` + `var(--accent)`. Alltid dekor.
 */
export function PinFlagHero({
  color,
  accent,
  size = 64,
  testID,
}: {
  color: string;
  accent: string;
  size?: number;
  testID?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Line
        x1="22"
        y1="6"
        x2="22"
        y2="56"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M22 8 L44 14 L22 22 Z"
        fill={accent}
        stroke={accent}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Ellipse cx="22" cy="56" rx="6" ry="1.8" fill={color} opacity={0.18} />
    </Svg>
  );
}
