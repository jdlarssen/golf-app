// #1879: Tørnys ikonspråk i appen.
//
// Kilde: webbens `components/icons/Icons.tsx` (linjeikonene) og
// `components/icons/PinFlag.tsx` (hero-flagget). Geometrien er kopiert 1:1 —
// 24×24, strek 1,5, runde ender, 2px safe-zone. Kopi framfor delt path-modul
// er bevisst: ikonene endres så godt som aldri, og en delt kilde ville krevd
// en refaktor av webben. Endres et ikon der, endres det her også.
//
// Hake, pluss, chevron og sol finnes ikke i webbens sett; de er tegnet her i
// samme strek.
//
// Fra app-designet (#2385): sola er tegnet som i `Hull-sollys`, og pokalen med
// hanker i toppen av hullsiden (`PokalHankerIcon`) som i `Main`.
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
  /** Streken i 24-rutenettet; 1,5 som standard (#2385: haken i sjekklista er 2,4). */
  strokeWidth?: number;
};

function LineIcon({
  color,
  size = 24,
  accessibilityLabel,
  testID,
  strokeWidth = 1.5,
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
      strokeWidth={strokeWidth}
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

/**
 * Pokalen med hanker i toppen av hullsiden (#2385, `Main`): bred skål med
 * runde hanker, én stett og én fot. Ikke webbens sett.
 */
export const PokalHankerIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
    <Path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
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

/** Scorekortet: flisa på startbilletten (#2255), tegnet etter designet. */
export const DokumentIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Rect x="4" y="3" width="16" height="18" rx="2" />
    <Line x1="8" y1="8" x2="16" y2="8" />
    <Line x1="8" y1="12" x2="16" y2="12" />
    <Line x1="8" y1="16" x2="13" y2="16" />
  </LineIcon>
);

/** Regler: flisa på startbilletten (#2255), tegnet etter designet. */
export const InfoIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Circle cx="12" cy="12" r="9" />
    <Line x1="12" y1="11" x2="12" y2="16" />
    <Line x1="12" y1="8" x2="12.01" y2="8" />
  </LineIcon>
);

/** Del: pil opp ut av en skål (#2255, øverst til høyre på startbilletten). */
export const DelIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Line x1="12" y1="3" x2="12" y2="15" />
    <Path d="M 7 8 L 12 3 L 17 8" />
    <Path d="M 5 13 L 5 19 Q 5 21 7 21 L 17 21 Q 19 21 19 19 L 19 13" />
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

/**
 * Sol: sollys-bryteren på hullsiden (#2252). Webben har ikke ikonet; det er
 * tegnet som i `Hull-sollys` (#2385).
 */
export const SolIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Circle cx="12" cy="12" r="4" />
    <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </LineIcon>
);

/** Peker ned (vis mer) som standard; `up` for «lukk». */
export const ChevronIcon = ({ up = false, ...props }: IconProps & { up?: boolean }) => (
  <LineIcon {...props}>
    <Path d={up ? 'M 6 15 L 12 9 L 18 15' : 'M 6 9 L 12 15 L 18 9'} />
  </LineIcon>
);

/** Tilbake-pila i toppen (#2385, designlerretet): en bar vinkel mot venstre. */
export const TilbakeIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Path d="M 15 18 L 9 12 L 15 6" />
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

/**
 * Ringen på heltekortet (#2254): et spor rundt hele sirkelen og en bue for
 * andelen spilte hull, startet klokka tolv. Grafikk, ikke et ikon, og alltid
 * dekor: kalleren legger hullnummeret oppå og gir hele ringen etiketten
 * («Hull 8 av 18, 7 spilt»), så skjermleseren leser tall og tekst samlet.
 *
 * Sporet er `color` med lav opasitet. Buen er `arcColor` når den er gitt
 * (heltekortet gir salvie-`live`, som designet, #2385), ellers `color`.
 */
export function HoleRing({
  color,
  arcColor,
  fraction,
  size = 112,
  strokeWidth = 8,
  testID,
}: {
  color: string;
  arcColor?: string;
  /** Spilte hull delt på hullene i runden, 0–1. */
  fraction: number;
  size?: number;
  strokeWidth?: number;
  testID?: string;
}) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(1, fraction));
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={color}
        strokeOpacity={0.2}
        strokeWidth={strokeWidth}
      />
      {shown > 0 ? (
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={arcColor ?? color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - shown)}
          transform={`rotate(-90 ${center} ${center})`}
          testID={testID ? `${testID}-arc` : undefined}
        />
      ) : null}
    </Svg>
  );
}

/**
 * Designets stiplede sirkler slik Chromium tegner dem (målt i 2x og 3x, #2385):
 * - `check`: `1.5px dashed` rundt 22 pt i sjekklista under scorekortet. 14
 *   streker på 3 pt, i praksis 1 pt tykke, dreid 10,4° så én står midt på toppen.
 * - `score`: `2px dashed` rundt 40 pt på den aktive raden på hullsiden. 12
 *   streker på 6 pt, 2 pt tykke, der den første begynner rett ut til høyre.
 */
const DASHED_RINGS = {
  check: { size: 22, stroke: 1, dashes: 14, dash: 3, phase: 10.4 },
  score: { size: 40, stroke: 2, dashes: 12, dash: 6, phase: 0 },
} as const;

/**
 * Den stiplede sirkelen for noe som ikke er tastet ennå (#2385): et steg som
 * gjenstår i sjekklista, eller scoren på raden som er på tur. RN sin
 * `borderStyle: 'dashed'` tegner andre og tettere streker enn nettleseren, så
 * sirkelen er tegnet her med designets mønster. Alltid dekor: teksten ved
 * siden av, eller radens etikett, sier det samme.
 */
export function DashedRing({
  color,
  kind = 'check',
  testID,
}: {
  color: string;
  kind?: keyof typeof DASHED_RINGS;
  testID?: string;
}) {
  const { size, stroke, dashes, dash, phase } = DASHED_RINGS[kind];
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const period = (2 * Math.PI * radius) / dashes;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${period - dash}`}
        transform={`rotate(${phase} ${center} ${center})`}
      />
    </Svg>
  );
}
