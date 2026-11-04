// #2756: sølv- og bronsemedaljen på tavlas rad nummer to og tre, og på
// resultatkortet. Gullet er tavlas egen skive. Fargene er kortets
// (`lib/og/palette.ts`) og bytter ikke med drakten; en medalje er en medalje.
import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { MEDAL_BRONZE_STOPS, MEDAL_INK, MEDAL_SILVER_STOPS } from '../../../../../lib/og/palette';

export function Medal({
  rank,
  size,
  label,
  labelStyle,
  allowFontScaling,
}: {
  rank: 2 | 3;
  size: number;
  /** Plassen slik raden skriver den: «2», «T2». */
  label: string;
  labelStyle: StyleProp<TextStyle>;
  allowFontScaling?: boolean;
}) {
  const [centre, edge] = rank === 2 ? MEDAL_SILVER_STOPS : MEDAL_BRONZE_STOPS;
  const id = `medal-${rank}`;
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      testID={`board-medal-${rank}`}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', left: 0, top: 0 }}>
        <Defs>
          {/* `radial-gradient(circle at 50% 38%, …)`: radien går til det fjerneste hjørnet. */}
          <RadialGradient id={id} cx="50%" cy="38%" r="79.6%" fx="50%" fy="38%">
            <Stop offset="0" stopColor={centre} />
            <Stop offset="1" stopColor={edge} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
      <Text allowFontScaling={allowFontScaling} style={[labelStyle, { color: MEDAL_INK }]}>
        {label}
      </Text>
    </View>
  );
}
