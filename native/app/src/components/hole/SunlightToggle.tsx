// #2252: bryteren «Sollys» øverst på hullsiden, til venstre for pokalen.
//
// På: fylt pille i `primary` med `onPrimary`-tekst. Av: vanlig merke. Bryteren
// styrer bare visningen, så den virker også når kortet er låst. Ingen
// animasjon ved bytte. `hitSlop` løfter trykkflaten til 44 px uten å koste
// plass i raden, som putte-bryteren.
import { Pressable, StyleSheet, Text } from 'react-native';
import { SolIcon } from '../icons/Icons';
import { FONTS, TAP, useTheme } from '../../theme';

/** Pillen er rundt 30 px høy; resten av 44 px tas av `hitSlop`. */
const HIT_SLOP = 8;

export function SunlightToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { colors, ui } = useTheme();
  const ink = on ? colors.onPrimary : colors.text;
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={HIT_SLOP}
      style={[
        ui.badge,
        styles.pill,
        on
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { backgroundColor: colors.surface },
      ]}
      testID="hole-sunlight-toggle"
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Sollysmodus"
    >
      <SolIcon color={ink} size={16} />
      <Text style={[ui.badgeText, styles.label, { color: ink }]}>Sollys</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: TAP - 2 * HIT_SLOP,
  },
  label: { fontFamily: FONTS.sansSemiBold },
});
