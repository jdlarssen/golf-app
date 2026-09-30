// #2252: bryteren «Sollys» øverst på hullsiden, til venstre for pokalen.
//
// #2385 (designlerretet, eierens svar): av er den en rund sol-knapp på 44 pt,
// med samme vekt som pokalen ved siden av (20 pt, strek 1,8), og uten tekst,
// så spillnavnet får plass midt i toppen. På er den den svarte pillen fra
// `Hull-sollys`: 44 pt høy, «Sollys på» med fet tekst på 14 pt og sola på
// 18 pt med strek 2,2. Den står da alene til høyre; pokalen er borte i sollys.
//
// Bryteren styrer bare visningen, så den virker også når kortet er låst.
// Ingen animasjon ved bytte. VoiceOver sier «Sollys» og om den er på.
import { Pressable, StyleSheet, Text } from 'react-native';
import { SolIcon } from '../icons/Icons';
import { FONTS, TAP, useTheme } from '../../theme';

export function SunlightToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      style={on ? [styles.pill, { backgroundColor: colors.text }] : styles.round}
      testID="hole-sunlight-toggle"
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Sollys"
    >
      {on ? (
        <>
          <SolIcon color={colors.bg} size={18} strokeWidth={2.2} />
          <Text style={[styles.label, { color: colors.bg }]}>Sollys på</Text>
        </>
      ) : (
        <SolIcon color={colors.text} size={20} strokeWidth={1.8} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  pill: {
    height: TAP,
    paddingHorizontal: 16,
    borderRadius: TAP / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: { fontSize: 14, fontFamily: FONTS.sansBold },
});
