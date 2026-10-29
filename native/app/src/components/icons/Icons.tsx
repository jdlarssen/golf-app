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
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import type { ScoringTrendGeometry } from '../../../../../lib/stats/scoringTrend';

export type IconProps = {
  color: string;
  size?: number;
  /** Kun for ikon som står alene. Uten den er ikonet dekor. */
  accessibilityLabel?: string;
  testID?: string;
  /**
   * Streken i 24-rutenettet; 1,5 som standard (#2385: haken i sjekklista er
   * 2,4; Profil v2: «Del bag-taggen» er 1,8).
   */
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

/**
 * Tavla: flisa på startbilletten (#2255), designets beger (skål, stett og fot),
 * ikke webbens pokal med ører. Pokalen står fortsatt på Hjem.
 */
export const BegerIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
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

/**
 * Haken på ligaskjermene (#2638, tegningene 1–4): «Har spilt»-pillen, raden i
 * «hvem har spilt» og «Du har levert». Strek 2,6 som tegningene.
 */
export const LigaHakeIcon = ({ strokeWidth = 2.6, ...props }: IconProps) => (
  <LineIcon strokeWidth={strokeWidth} {...props}>
    <Path d="M5 12.5l4.5 4.5L19 7.5" />
  </LineIcon>
);

/** I-en i avslagsboksen på «Start runden» (#2638, tegning 5b), strek 2. */
export const LigaInfoIcon = ({ size = 18, strokeWidth = 2, ...props }: IconProps) => (
  <LineIcon size={size} strokeWidth={strokeWidth} {...props}>
    <Circle cx="12" cy="12" r="9.5" />
    <Path d="M12 11v5.5M12 7.6h.01" />
  </LineIcon>
);

/** Varsel: trekant med utropstegn (#2228, lagringsbanneret på hullsiden). */
export const VarselIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <Path d="M12 9v4" />
    <Path d="M12 17h.01" />
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

/**
 * Deleikonet på webbens «Del kortet» (#2265, Kavalkaden): pil opp av et brett.
 * Strekene er webbens, 2 i strek.
 */
export const ShareCardIcon = (props: IconProps) => (
  <LineIcon strokeWidth={2} {...props}>
    <Path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
    <Path d="M12 3v13" />
    <Path d="m7 8 5-5 5 5" />
  </LineIcon>
);

/** Levert/godkjent — statusglyfen i tette rader. */
export const HakeIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Path d="M 5 12.5 L 10 17.5 L 19 7" />
  </LineIcon>
);

/**
 * Den lille haken foran «har 4» i utslagsflatene (#2580), 11 pt med strek 3 som
 * webbens `TeeShotCheck` og `Utslag-forslag-*`.
 */
export const UtslagHakeIcon = ({ size = 11, strokeWidth = 3, ...props }: IconProps) => (
  <LineIcon size={size} strokeWidth={strokeWidth} {...props}>
    <Path d="M5 12l5 5 9-10" />
  </LineIcon>
);

/**
 * Varseltrekanten i utslagsboksen på scorekortet (#2580), 18 pt med strek 2
 * som webbens `TeeShotShortBox` og `Utslag-forslag-levering`.
 */
export const UtslagVarselIcon = ({ size = 18, strokeWidth = 2, ...props }: IconProps) => (
  <LineIcon size={size} strokeWidth={strokeWidth} {...props}>
    <Path d="M12 3l9.5 17h-19z" />
    <Path d="M12 10v4M12 17.5v.01" />
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

/** Forstørrelsesglasset i søkefeltet over en lang spillerliste (#2675, tegning 9a). */
export const SokIcon = ({ size = 18, strokeWidth = 2, ...props }: IconProps) => (
  <LineIcon size={size} strokeWidth={strokeWidth} {...props}>
    <Circle cx="11" cy="11" r="7" />
    <Path d="M20 20l-3.5-3.5" />
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

/** Lukk-krysset (#2578, arket for kåringen på designlerretet). */
export const LukkIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Path d="M6 6l12 12M18 6L6 18" />
  </LineIcon>
);

/** Hengelåsen (#2578, lås-linja på bekreft-siden): «noe låses». */
export const LaasIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Rect x="5" y="11" width="14" height="10" rx="2" />
    <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </LineIcon>
);

/**
 * Låsen på lagtavla (#2579, `Lagtavle-bestball-forslag-*`: «Hull 10–18 er
 * skjult» og låskortet). Som {@link LaasIcon}, men bøylen går én enhet høyere,
 * som tegningen.
 */
export const TavleLaasIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <Rect x="5" y="11" width="14" height="10" rx="2" />
    <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </LineIcon>
);

/**
 * Den skraverte staven for hullene best ball holder skjult (#2579): skrå
 * striper, 3 pt `hatch` og 3 pt `track` langs 135°, og en hårlinje i `hatch`
 * rundt (tegningens `repeating-linear-gradient(135deg, …)` med
 * `inset 0 0 0 1px`). Kallstedet gir størrelsen. Alltid dekor.
 *
 * Stripene er tegnet som parallellogrammer ut fra den målte bredden: et
 * rotert `Pattern` blir trekanter i react-native-svg. Langs 135° er perioden
 * 6 pt; langs x blir den 6√2 og hver stripe 3√2, med første stripe fra
 * øvre venstre hjørne, som i nettleseren.
 */
export function HatchBar({
  track,
  hatch,
  style,
  testID,
}: {
  track: string;
  hatch: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const period = 6 * Math.SQRT2;
  const band = 3 * Math.SQRT2;
  const { width, height } = size;
  const stripes = width > 0 ? Math.ceil((width + height) / period) + 1 : 0;
  return (
    <View
      style={[hatchStyles.bar, { backgroundColor: track }, style]}
      onLayout={(event) =>
        setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })
      }
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {stripes > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          {Array.from({ length: stripes }, (_, k) => {
            const left = k * period;
            const right = left + band;
            return (
              <Polygon
                key={k}
                points={`${left},0 ${right},0 ${right - height},${height} ${left - height},${height}`}
                fill={hatch}
              />
            );
          })}
        </Svg>
      ) : null}
      <View style={[StyleSheet.absoluteFill, hatchStyles.ring, { borderColor: hatch }]} />
    </View>
  );
}

const hatchStyles = StyleSheet.create({
  bar: { borderRadius: 999, overflow: 'hidden' },
  ring: { borderRadius: 999, borderWidth: 1 },
});

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
 * Medaljongen i «Forrige runde» (Hjem v2, #2385): designets
 * `radial-gradient(circle at 50% 38%, #fff, #e5e0d3)` med en innfelt ring på
 * 1 pt i 60 % dekning. Gradienten har nettleserens standardradius, avstanden fra midten til
 * det fjerneste hjørnet av boksen. Alltid dekor: kalleren legger tallet oppå.
 */
export function MedalDisc({
  highlight,
  edge,
  ring,
  size = 36,
  gradientId = 'medal',
  testID,
}: {
  highlight: string;
  edge: string;
  /** Den innfelte ringen; utelatt = ingen ring (bronsen i Rundedagboka, #2265). */
  ring?: string;
  size?: number;
  /** Egen id per metall når flere skiver står på samme skjerm (#2265). */
  gradientId?: string;
  testID?: string;
}) {
  const r = size / 2;
  const cy = size * 0.38;
  const reach = Math.hypot(r, size - cy);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ position: 'absolute' }}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient
          id={gradientId}
          cx={r}
          cy={cy}
          fx={r}
          fy={cy}
          r={reach}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset={0} stopColor={highlight} />
          <Stop offset={1} stopColor={edge} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill={`url(#${gradientId})`} />
      {ring ? (
        <Circle
          cx={r}
          cy={r}
          r={r - 0.5}
          fill="none"
          stroke={ring}
          strokeOpacity={0.6}
          strokeWidth={1}
        />
      ) : null}
    </Svg>
  );
}

/**
 * Pila foran formsetningen i Rundedagboka (#2265): designets «▲»/«▼», 8 × 8 pt
 * slik nettleseren tegner tegnet i Inter 13. iOS henter tegnet fra en bredere
 * reservefont (nesten 12 pt), så den er tegnet her. Alltid dekor: setningen
 * sier «bedre» eller «dårligere».
 */
export function FormArrow({ direction, color }: { direction: 'up' | 'down'; color: string }) {
  return (
    <Svg
      width={8}
      height={8}
      viewBox="0 0 8 8"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`form-arrow-${direction}`}
    >
      <Path d={direction === 'up' ? 'M4 0 L8 8 L0 8 Z' : 'M0 0 L8 0 L4 8 Z'} fill={color} />
    </Svg>
  );
}

/**
 * Formkurven i Rundedagboka (#2265), som designlerretet (`Historikk-forslag`)
 * tegner den: tre rutelinjer, en ugjennomsiktig flate under linja, linja på
 * 2,5 pt med runde ledd, en prikk på første runde og gullprikken med ring på
 * beste runde. Geometrien kommer ferdig fra `buildScoringTrend`; tallene ved
 * prikkene er tekst kalleren legger oppå. Alltid dekor: kalleren gir hele
 * kurven én etikett.
 */
export function TrendCurve({
  geometry,
  gridYs,
  colors,
  testID,
}: {
  geometry: ScoringTrendGeometry;
  /** Rutelinjene, i punkter fra toppen; de går fra kant til kant. */
  gridYs: readonly number[];
  colors: {
    grid: string;
    area: string;
    line: string;
    best: string;
    bestRing: string;
  };
  testID?: string;
}) {
  const { width, height, bruttoPoints, bruttoBestPoint } = geometry;
  const first = bruttoPoints[0];
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {gridYs.map((y) => (
        <Line key={y} x1={0} y1={y} x2={width} y2={y} stroke={colors.grid} strokeWidth={1} />
      ))}
      <Path d={geometry.areaPath} fill={colors.area} />
      <Polyline
        points={geometry.bruttoPolyline}
        fill="none"
        stroke={colors.line}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={first.x} cy={first.y} r={3.5} fill={colors.line} />
      <Circle
        cx={bruttoBestPoint.x}
        cy={bruttoBestPoint.y}
        r={6}
        fill={colors.best}
        stroke={colors.bestRing}
        strokeWidth={2}
        testID={testID ? `${testID}-best` : undefined}
      />
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
