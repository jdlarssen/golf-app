// #2661: kortene som venter på et svar, som nettets `MarkerQueueCard`: én rad
// per kort, et trykk åpner markørens skjerm. Brukes på ligasiden og (#2688) på
// Hjem, så en markør ser at det ligger kort å godkjenne uten å åpne ligaen.
// Overskriften over står i skjermen som bruker kortet: de to skjermene har
// hver sin seksjonsoverskrift.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MARKER_TEXT } from '../../lib/markerCopy';
import { FONTS, interLine, useTheme } from '../../theme';

export function MarkerQueueCard<T extends { gameId: string; userId: string; name: string; sub: string }>({
  rows,
  onOpen,
  inset = true,
}: {
  rows: T[];
  onOpen: (row: T) => void;
  /** 16 pt fra kanten (ligasiden). Hjem har den marginen alt, og sender `false`. */
  inset?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.queueCard,
        !inset && styles.flush,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {rows.map((row, i) => (
        <Pressable
          key={`${row.gameId}:${row.userId}`}
          onPress={() => onOpen(row)}
          accessibilityRole="button"
          testID={`marker-queue-${row.gameId}-${row.userId}`}
          style={[styles.queueRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
        >
          <View style={styles.queueText}>
            <Text style={[styles.queueName, { color: colors.text }]} numberOfLines={1}>
              {row.name}
            </Text>
            <Text style={[styles.queueSub, { color: colors.muted }]} numberOfLines={1}>
              {row.sub}
            </Text>
          </View>
          <Text style={[styles.queueLink, { color: colors.primary }]}>{MARKER_TEXT.review}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  queueCard: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  flush: { marginHorizontal: 0 },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10 },
  queueText: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  queueName: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  queueSub: { ...interLine(12, 15), fontFamily: FONTS.sans, marginTop: 2 },
  queueLink: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
});
