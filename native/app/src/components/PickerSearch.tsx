// #2675: søkefeltet og «Vis alle» over og under en lang spillerliste.
//
// Brukt av medspillerlista på «Start runden» og av markørvalget ved levering,
// så de to velgerne ser like ut (tegning 9a og 9g). Regelen for hvor mange
// rader som vises og hva søket treffer bor i `lib/league/pickerRows.ts`; her
// er bare tegningen: et 50 pt høyt felt med forstørrelsesglass, og en
// tekstknapp på minst 44 pt. Fargene leses fra `useTheme()` i render, så
// feltet står riktig i natt-modus fra første bilde.
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FONTS, TAP, interLine, useTheme } from '../theme';
import { SokIcon } from './icons/Icons';

export function PickerSearchField({
  value,
  onChange,
  label,
  placeholder,
  testID,
}: {
  value: string;
  onChange: (text: string) => void;
  /** Skjermleserens navn på feltet (`searchLabel`). */
  label: string;
  placeholder: string;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.search}>
      <View style={styles.icon} pointerEvents="none">
        <SokIcon color={colors.muted} size={18} />
      </View>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
      />
    </View>
  );
}

/** «Vis alle 9» / «Vis færre»: en tekstknapp under lista. */
export function PickerMore({
  label,
  expanded,
  onPress,
  testID,
}: {
  label: string;
  expanded: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      style={styles.more}
      testID={testID}
    >
      <Text style={[styles.moreText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

/** «Ingen spillere med det navnet.» når søket ikke treffer noen. */
export function PickerNoMatch({ text, testID }: { text: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.noMatch, { color: colors.muted }]} testID={testID}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  // `.srch .in`: 50 høy, 12 i hjørnene, 40 til venstre for glasset.
  search: { justifyContent: 'center' },
  icon: { position: 'absolute', left: 13, zIndex: 1 },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 40,
    paddingRight: 12,
    fontSize: 16,
    fontFamily: FONTS.sans,
  },
  // `.more`: minst 44 høy, 14/500 i primærfargen.
  more: { minHeight: TAP, justifyContent: 'center', alignSelf: 'flex-start' },
  moreText: { ...interLine(14, 20), fontFamily: FONTS.sansMedium },
  noMatch: { ...interLine(14, 20, { multiline: true }), fontFamily: FONTS.sans },
});
