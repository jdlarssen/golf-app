// native/app/src/components/inbox/InboxFilterChips.tsx
// #2759: «Alle», «Krever handling · N» og «Venner», som webbens
// `InboxFilterChips`. Tallet teller radene i seksjonen og er borte ved 0, der
// brikka fortsatt virker.
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { InboxFilter } from '../../../../../lib/notifications/inboxSections';
import { INBOX_TEXT, actionFilterLabel } from '../../lib/inboxCopy';
import { FONTS, TAP, interLine, useTheme } from '../../theme';

export function InboxFilterChips({
  value,
  onChange,
  actionCount,
}: {
  value: InboxFilter;
  onChange: (next: InboxFilter) => void;
  actionCount: number;
}) {
  const { colors } = useTheme();
  const chips: { key: InboxFilter; label: string }[] = [
    { key: 'all', label: INBOX_TEXT.filters.all },
    { key: 'action', label: actionFilterLabel(actionCount) },
    { key: 'friends', label: INBOX_TEXT.filters.friends },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={INBOX_TEXT.filters.label}
      contentContainerStyle={styles.row}
    >
      {chips.map((chip) => {
        const on = value === chip.key;
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(chip.key)}
            testID={`inbox-filter-${chip.key}`}
            style={[
              styles.chip,
              on
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <Text style={[styles.label, { color: on ? colors.onPrimary : colors.text }]}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  chip: {
    height: TAP,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
});
