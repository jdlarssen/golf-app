// #2752: en plass i en kamp, og lista den åpner. På nettet er det en `<select>`. Her åpner et
// trykk lista, og valget lukker den. Brukes av forslaget i «Fordel & generer» og av uttaket.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FONTS, interLine, TAP, useTheme } from '../../theme';
import { ChevronIcon } from '../icons/Icons';

export function PlayerSlot({
  name,
  placeholder,
  open,
  label,
  onPress,
  testID,
}: {
  name: string;
  /** Står når plassen er tom. */
  placeholder?: string;
  open: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const shown = name || placeholder || '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${shown}`}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={[
        styles.slot,
        open
          ? { backgroundColor: colors.primarySoft, borderColor: colors.primary }
          : { backgroundColor: colors.bg, borderColor: colors.border },
      ]}
      testID={testID}
    >
      <Text style={[styles.slotName, { color: name ? colors.text : colors.muted }]} numberOfLines={2}>
        {shown}
      </Text>
      <ChevronIcon direction={open ? 'up' : 'down'} color={colors.muted} size={14} strokeWidth={2} />
    </Pressable>
  );
}

export function PlayerPicker({
  players,
  isDisabled,
  current,
  clearLabel,
  onChoose,
  testID,
}: {
  players: readonly { id: string; name: string }[];
  isDisabled: (id: string) => boolean;
  current: string | null;
  /** Første rad tømmer plassen. Uten denne kan en plass ikke stå tom. */
  clearLabel?: string;
  onChoose: (id: string) => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.picker, { borderColor: colors.border }]} testID={testID}>
      {clearLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChoose('')}
          style={[styles.pickerRow, { borderBottomColor: colors.border }]}
          testID={`${testID}-clear`}
        >
          <Text style={[styles.value, { color: colors.muted }]}>{clearLabel}</Text>
        </Pressable>
      ) : null}
      {players.map((player) => {
        const disabled = isDisabled(player.id);
        return (
          <Pressable
            key={player.id}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected: player.id === current }}
            disabled={disabled}
            onPress={() => onChoose(player.id)}
            style={[
              styles.pickerRow,
              { borderBottomColor: colors.border },
              player.id === current && { backgroundColor: colors.primarySoft },
              disabled && styles.dimmed,
            ]}
            testID={`${testID}-${player.id}`}
          >
            <Text style={[styles.value, { color: colors.text }]}>{player.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    minHeight: TAP,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slotName: { flex: 1, minWidth: 0, ...interLine(13, 17, { multiline: true }), fontFamily: FONTS.sans },
  picker: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginTop: 2 },
  pickerRow: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dimmed: { opacity: 0.4 },
  value: { ...interLine(14, 19), fontFamily: FONTS.sans },
});
