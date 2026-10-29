// #2661: «Markør» over lever-knappen i en simulatorliga.
//
// Én spiller fra ligaen godkjenner kortet. Lista kommer fra serveren
// (`data/marker.ts` → `loadMarkerChoice`): ligaens medlemmer unntatt eierne av
// kortene i leveringen og den som leverer. Serveren sjekker valget igjen ved
// leveringen, så velgeren er et tilbud, ikke porten.
//
// Radene er webbens velger (`SubmitForm`): navn i en rad på minst 44 pt med en
// rund markering, og den valgte raden fylt med `primarySoft`.
//
// #2675: med mer enn seks valg vises seks rader, et søkefelt og «Vis alle»
// (`pickerRows`, samme regel som medspillerlista på «Start runden» og som
// nettet). Rekkefølgen er serverens (navn); den valgte blir stående selv når
// lista er kuttet.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PICKER_VISIBLE_ROWS, pickerRows } from '../../../../lib/league/pickerRows';
import { showAllLine } from '../lib/leagueCopy';
import { MARKER_TEXT } from '../lib/markerCopy';
import { useTheme } from '../theme';
import { PickerMore, PickerNoMatch, PickerSearchField } from './PickerSearch';

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
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const picker = pickerRows(options, {
    query,
    showAll,
    nameOf: (o) => o.name ?? MARKER_TEXT.unknownPlayer,
    keepIds: value === null ? undefined : new Set([value]),
  });
  return (
    <View style={styles.wrap} testID="marker-picker" accessibilityRole="radiogroup">
      <Text style={ui.kicker}>{MARKER_TEXT.legend}</Text>
      <Text style={[ui.muted, styles.hint]}>{options.length > 0 ? MARKER_TEXT.hint : MARKER_TEXT.none}</Text>
      {options.length > PICKER_VISIBLE_ROWS ? (
        <PickerSearchField
          value={query}
          onChange={setQuery}
          label={MARKER_TEXT.searchLabel}
          placeholder={MARKER_TEXT.searchPlaceholder}
          testID="marker-search"
        />
      ) : null}
      {picker.rows.map((o) => {
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
      {picker.searching && picker.total === 0 ? (
        <PickerNoMatch text={MARKER_TEXT.noMatch} testID="marker-no-match" />
      ) : null}
      {picker.canExpand ? (
        <PickerMore
          label={showAll ? MARKER_TEXT.showFewer : showAllLine(picker.total)}
          expanded={showAll}
          onPress={() => setShowAll((v) => !v)}
          testID="marker-show-all"
        />
      ) : null}
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
