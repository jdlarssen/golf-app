// #2627: en QR-kode tegnet med `react-native-svg`, med stille sone rundt.
//
// Brukes to steder med samme tegning: den lille koden på bag-taggen og den
// store på arket. Matrisen og stien er `lib/qrMatrix.ts` sine; her settes bare
// størrelsen og fargen. Den stille sonen ligger i `viewBox` (negativ origo),
// så stien tegnes i hele moduler og skaleres av SVG-en. Flaten bak (krem på
// taggen, hvit på arket) er kallerens.
//
// Pynt for skjermleseren: det er knappen eller arket rundt som sier hva koden
// er.
import { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { QR_QUIET_ZONE, qrMatrix, qrPath } from '../../lib/qrMatrix';

export function QrCode({ value, size, color }: { value: string; size: number; color: string }) {
  const { side, d } = useMemo(() => {
    const matrix = qrMatrix(value);
    return { side: matrix.size + QR_QUIET_ZONE * 2, d: qrPath(matrix, 1) };
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
    </Svg>
  );
}
