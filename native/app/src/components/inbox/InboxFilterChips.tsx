// native/app/src/components/inbox/InboxFilterChips.tsx
// #2759: «Alle», «Krever handling · N» og «Venner», som webbens `InboxFilterChips`.
// Tallet teller rader under «Krever handling» og står ikke ved 0, der brikka
// fortsatt virker.
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { InboxFilter } from '../../data/inbox';
import { INBOX_TEXT, actionChipLabel } from '../../lib/inboxCopy';
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
    { key: 'all', label: INBOX_TEXT.filterAll },
    { key: 'action', label: actionChipLabel(actionCount) },
    { key: 'friends', label: INBOX_TEXT.filterFriends },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={INBOX_TEXT.filterLabel}
    >
      {chips.map((chip) => {
        const on = value === chip.key;
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(chip.key)}
            style={[
              styles.chip,
              on
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
            testID={`inbox-filter-${chip.key}`}
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
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
});
