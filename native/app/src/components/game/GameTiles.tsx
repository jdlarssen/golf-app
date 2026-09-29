// #2255: flisene under startbilletten — Tavla, Scorekort og Regler.
//
// De står bare når runden pågår eller er avsluttet; skjermen avgjør det. Tavla
// og Scorekort følger samme gate som føringen (`formatGate`): et format appen
// ikke fører, viser den heller ikke tall for, og da står bare Regler.
// «Hull for hull» når runden er avsluttet, kommer med sin egen skjerm.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TICKET_TEXT } from '../../lib/ticketCopy';
import { FONTS, useTheme } from '../../theme';

/** Flisenes høyde, fra designet. Godt over `TAP`. */
const TILE_HEIGHT = 84;

export function GameTiles({
  supported,
  onBoard,
  onScorecard,
  onRules,
}: {
  /** Appen fører formatet (`gateReason === null`). */
  supported: boolean;
  onBoard: () => void;
  onScorecard: () => void;
  onRules: () => void;
}) {
  const tiles = [
    ...(supported
      ? [
          { label: TICKET_TEXT.tileBoard, onPress: onBoard, testID: 'open-leaderboard' },
          { label: TICKET_TEXT.tileScorecard, onPress: onScorecard, testID: 'open-scorecard' },
        ]
      : []),
    { label: TICKET_TEXT.tileRules, onPress: onRules, testID: 'open-rules' },
  ];

  return (
    <View
      accessibilityLabel={TICKET_TEXT.tilesLabel}
      style={styles.row}
      testID="game-tiles"
    >
      {tiles.map((tile) => (
        <Tile key={tile.testID} {...tile} />
      ))}
    </View>
  );
}

function Tile({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: pressed ? colors.primarySoft : colors.surface, borderColor: colors.border },
      ]}
      testID={testID}
    >
      <Text style={[styles.label, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tile: {
    flex: 1,
    minHeight: TILE_HEIGHT,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  label: { fontSize: 16, fontFamily: FONTS.sansSemiBold, textAlign: 'center' },
});
