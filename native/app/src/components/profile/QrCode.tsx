// #2627: en QR-kode tegnet med `react-native-svg`, med stille sone rundt og
// Tørny-merket i midten.
//
// Brukes to steder med samme tegning: den lille koden på bag-taggen og den
// store på arket. Matrisen, stien og merkefeltet er `lib/qrMatrix.ts` sine, og
// merket er `lib/tornyMark.ts` sitt; her settes bare størrelsen og fargen. Den
// stille sonen ligger i `viewBox` (negativ origo), så stien tegnes i hele
// moduler og skaleres av SVG-en. Flaten bak (krem på taggen, hvit på arket) er
// kallerens, og den er også den lyse kanten rundt merket: feltet står blankt,
// og merket tegnes med én modul luft på hver side.
//
// Pynt for skjermleseren: det er knappen eller arket rundt som sier hva koden
// er.
import { useId, useMemo } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { QR_QUIET_ZONE, qrMatrix, qrPath } from '../../lib/qrMatrix';
import { MARK_SIZE, TORNY_MARK as M } from '../../lib/tornyMark';

export function QrCode({ value, size, color }: { value: string; size: number; color: string }) {
  const { side, d, logo } = useMemo(() => {
    const matrix = qrMatrix(value);
    return { side: matrix.size + QR_QUIET_ZONE * 2, d: qrPath(matrix, 1), logo: matrix.logo };
  }, [value]);

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${side} ${side}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={d} fill={color} />
      {logo ? <TornyMark at={logo.start + 1} size={logo.span - 2} /> : null}
    </Svg>
  );
}

/** Merket i 80 × 80 fra masteren, flyttet og skalert inn i feltet (i moduler). */
function TornyMark({ at, size }: { at: number; size: number }) {
  // Overgangene trenger id-er som er unike i appen (taggen og arket står samtidig).
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const tile = `tile${id}`;
  const shade = `shade${id}`;
  const light = `light${id}`;
  return (
    <G transform={`translate(${at} ${at}) scale(${size / MARK_SIZE})`} testID="qr-torny-mark">
      <Defs>
        <LinearGradient id={tile} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={M.tileTop} />
          <Stop offset="1" stopColor={M.tileBottom} />
        </LinearGradient>
        <RadialGradient id={shade} cx={M.ballShade.cx} cy={M.ballShade.cy} r={M.ballShade.r}>
          <Stop offset={M.ballShade.from} stopColor={M.ballShade.color} stopOpacity={0} />
          <Stop offset="1" stopColor={M.ballShade.color} stopOpacity={M.ballShade.opacity} />
        </RadialGradient>
        <RadialGradient id={light} cx={M.ballLight.cx} cy={M.ballLight.cy} r={M.ballLight.r}>
          <Stop offset="0" stopColor={M.ballLight.color} stopOpacity={M.ballLight.opacity} />
          <Stop offset={M.ballLight.to} stopColor={M.ballLight.color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={MARK_SIZE} height={MARK_SIZE} rx={M.tileRadius} fill={`url(#${tile})`} />
      <Path d={M.tPath} fill={M.ink} />
      <Ellipse {...M.shadow} />
      <Circle cx={M.ball.cx} cy={M.ball.cy} r={M.ball.r} fill={M.ball.fill} />
      <Circle cx={M.ball.cx} cy={M.ball.cy} r={M.ball.r} fill={`url(#${shade})`} />
      <Circle cx={M.ball.cx} cy={M.ball.cy} r={M.ball.r} fill={`url(#${light})`} />
    </G>
  );
}
