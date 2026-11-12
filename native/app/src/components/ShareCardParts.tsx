// Det delebildene tegner likt (#2265, #2756): rutas piksler omregnet til
// punkter, Satoris linjeboks og ordmerket. Bildene tas i telefonens skala, så
// hvert mål er rutas piksel delt på skalaen, og bildet blir 1080 piksler bredt
// også på en 2x-telefon.
import { PixelRatio, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import {
  BALL_CENTER_X_EM,
  BALL_DIAMETER_EM,
  BALL_SHADING_MIN_PX,
  T_CAP_HEIGHT_EM,
} from '../../../../lib/brand/wordmarkBall';
import { CHAMP, LINEN } from '../../../../lib/og/palette';
import { frauncesFamily, frauncesLine } from '../theme';

/** Rutas piksler per punkt her: telefonens skala. */
const SCALE = PixelRatio.get();

export const cardPx = (value: number) => value / SCALE;

/**
 * Fraunces-linja Satori tegner, i punkter her: linjeboksen fra `frauncesLine`
 * regnet i rutas piksler (der én piksel er én skjermpiksel her) og delt på
 * skalaen, så grunnlinja står der Satori og Chromium har den. Uten den legger
 * iOS grunnlinja `descent` over bunnen av linja, og tallet sto 9 px for høyt.
 */
export function satoriLine(size: number, lineHeight: number, multiline = false) {
  const line = frauncesLine(size, lineHeight, { multiline, pixelRatio: 1 });
  return {
    fontSize: cardPx(line.fontSize),
    marginTop: cardPx(line.marginTop),
    marginBottom: cardPx(line.marginBottom),
    ...(line.lineHeight !== undefined ? { lineHeight: cardPx(line.lineHeight) } : {}),
    // Android (#2560): uten den legger Android win-målene rundt teksten.
    ...(line.includeFontPadding === false ? { includeFontPadding: false } : {}),
  };
}

/** Satori sin grunnlinje i ordmerket (`lib/og/wordmark.tsx`). */
const SATORI_BASELINE_EM = 0.86;

/** Ordmerket «Tørny» med gullballen over T-en, som `OgWordmark` (linje 1). */
export function ShareWordmark({
  size,
  weight,
  color,
  lineHeightEm = 1,
}: {
  /** I rutas piksler. */
  size: number;
  weight: 500 | 600;
  color: string;
  /**
   * Linjehøyden i em. 1 er Satoris, og gir delebildene det de alltid har hatt.
   * Låseskjermen (#2841) tegner ordmerket på skjermen, der Android klipper halen
   * på «y» mot en så stram linjeboks; et høyere tall gir den plass under grunnlinja.
   * Grunnlinja følger halve tillegget, så ballen står der den skal.
   */
  lineHeightEm?: number;
}) {
  const fontSize = cardPx(size);
  const baselineEm = SATORI_BASELINE_EM + (lineHeightEm - 1) / 2;
  const d = BALL_DIAMETER_EM * fontSize;
  const clearance = Math.max(0, BALL_DIAMETER_EM + T_CAP_HEIGHT_EM - baselineEm) * fontSize;
  const shaded = d * SCALE >= BALL_SHADING_MIN_PX;
  return (
    <View style={{ paddingTop: clearance }}>
      <Text
        allowFontScaling={false}
        style={{ ...satoriLine(size, size * lineHeightEm), fontFamily: frauncesFamily(weight, 14), color }}
      >
        Tørny
      </Text>
      {/* Flaten er to piksler større enn ballen: en flate på 14,56 px rundes
          ned og klipper sirkelen. Sirkelen står der den står. */}
      <Svg
        width={d + 2 / SCALE}
        height={d + 2 / SCALE}
        style={{
          position: 'absolute',
          left: (BALL_CENTER_X_EM - BALL_DIAMETER_EM / 2) * fontSize,
          top: clearance + (baselineEm - T_CAP_HEIGHT_EM) * fontSize - d,
        }}
      >
        <Defs>
          {/* `BALL_SHADING_CSS`: lys i 36 % / 30 %, borte ved 60 %. */}
          <RadialGradient id="ball" cx="36%" cy="30%" r="60%" fx="36%" fy="30%">
            <Stop offset="0" stopColor={LINEN} stopOpacity={0.55} />
            <Stop offset="1" stopColor={LINEN} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={d / 2} cy={d / 2} r={d / 2} fill={CHAMP} />
        {shaded ? <Circle cx={d / 2} cy={d / 2} r={d / 2} fill="url(#ball)" /> : null}
      </Svg>
    </View>
  );
}
