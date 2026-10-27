// #2661: «Markør» over lever-knappen i en simulatorliga.
//
// Én spiller fra ligaen godkjenner kortet. Lista kommer fra serveren
// (`data/marker.ts` → `loadMarkerChoice`): ligaens medlemmer unntatt eierne av
// kortene i leveringen og den som leverer. Serveren sjekker valget igjen ved
// leveringen, så velgeren er et tilbud, ikke porten.
//
// Radene er webbens velger (`SubmitForm`): navn i en rad på minst 44 pt med en
// rund markering, og den valgte raden fylt med `primarySoft`.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MARKER_TEXT } from '../lib/markerCopy';
import { useTheme } from '../theme';

export function MarkerPicker({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ userId: string; name: string | null }>;
  value: string | null;
  onChange: (userId: string) => void;
}) {
  const { colors, ui } = useTheme();
  return (
    <View style={styles.wrap} testID="marker-picker" accessibilityRole="radiogroup">
      <Text style={ui.kicker}>{MARKER_TEXT.legend}</Text>
      <Text style={[ui.muted, styles.hint]}>{options.length > 0 ? MARKER_TEXT.hint : MARKER_TEXT.none}</Text>
      {options.map((o) => {
        const checked = value === o.userId;
        return (
          <Pressable
            key={o.userId}
            onPress={() => onChange(o.userId)}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            testID={`marker-option-${o.userId}`}
            style={[
              styles.row,
              {
                borderColor: checked ? colors.primary : colors.border,
                backgroundColor: checked ? colors.primarySoft : colors.surface,
              },
            ]}
          >
            <View style={[styles.ring, { borderColor: checked ? colors.primary : colors.border }]}>
              {checked ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
            </View>
            <Text style={[ui.body, styles.name]} numberOfLines={1}>
              {o.name ?? MARKER_TEXT.unknownPlayer}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 8, marginBottom: 8 },
  hint: { marginBottom: 4 },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1 },
});
