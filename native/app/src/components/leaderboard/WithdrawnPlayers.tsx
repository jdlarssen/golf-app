// «Trukne spillere» under tavla (#1954 A3), webbens `WithdrawnPlayersSection`
// i appens drakt: overskrift i små versaler, et kort med én rad per spiller og
// merket «Trukket» uten plassering. Lista og regelen for hvilke formater som
// har den, kommer fra `lib/withdrawnBoard.ts`. Tom liste tegner ingenting.
import { StyleSheet, Text, View } from 'react-native';
import { WITHDRAWN_BOARD_TEXT } from '../../lib/boardCopy';
import type { WithdrawnOnBoard } from '../../lib/withdrawnBoard';
import { useTheme } from '../../theme';

export function WithdrawnPlayers({ players }: { players: readonly WithdrawnOnBoard[] }) {
  const { ui, colors } = useTheme();
  if (players.length === 0) return null;
  return (
    <View style={styles.wrap} testID="withdrawn-players">
      <Text style={[ui.kicker, styles.kicker]}>{WITHDRAWN_BOARD_TEXT.sectionTitle}</Text>
      <View style={[ui.card, styles.card]}>
        {players.map((p, i) => (
          <View
            key={p.userId}
            style={[
              styles.row,
              i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null,
            ]}
            testID={`withdrawn-player-${p.userId}`}
          >
            <Text style={[ui.body, styles.name]} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={[ui.muted, styles.badge, { borderColor: colors.border }]}>
              {WITHDRAWN_BOARD_TEXT.badge}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, gap: 8 },
  kicker: { paddingHorizontal: 4 },
  card: { padding: 0, gap: 0, overflow: 'hidden' },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  name: { flexShrink: 1, fontSize: 14 },
  badge: {
    fontSize: 12,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
