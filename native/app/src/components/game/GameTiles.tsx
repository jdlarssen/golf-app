// #2255: flisene under startbilletten — Tavla, Scorekort og Regler.
//
// De står bare når runden pågår eller er avsluttet; skjermen avgjør det. Tavla
// og Scorekort følger samme gate som føringen (`formatGate`): et format appen
// ikke fører, viser den heller ikke tall for, og da står bare Regler.
// Når runden er avsluttet og formatet har «Hull for hull» i appen
// (`lib/holeByHole.ts`), bytter den første flisa til den. Tavla er da
// fortsatt ett trykk unna, via «Se tavla →» i stubben.
//
// Drakten er designlerretets, identisk: et grønt linjeikon (22 pt, strek 1,8)
// over en etikett i blekk, hvit flis med tynn kant og ingen skygge. Ikonene
// er dekor; etiketten er knappens navn.
// «Hull for hull» har ingen tegning på lerretet; flagget sier «hull».
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HOLES_TEXT } from '../../lib/holesCopy';
import { TICKET_TEXT } from '../../lib/ticketCopy';
import { FONTS, useTheme } from '../../theme';
import { BegerIcon, DokumentIcon, FlaggIcon, InfoIcon, type IconProps } from '../icons/Icons';

/**
 * Flisenes høyde: designets `min-height: 84px` er innholdet, og kantene kommer
 * i tillegg (84 + 2 × 1), altså 86 pt her. Godt over `TAP`.
 */
const TILE_HEIGHT = 86;
/** Designets strek på flisikonene. */
const ICON_STROKE = 1.8;

export function GameTiles({
  supported,
  holeByHole,
  onBoard,
  onHoleByHole,
  onScorecard,
  onRules,
}: {
  /** Appen fører formatet (`gateReason === null`). */
  supported: boolean;
  /** Første flis er «Hull for hull» i stedet for «Tavla». */
  holeByHole: boolean;
  onBoard: () => void;
  onHoleByHole: () => void;
  onScorecard: () => void;
  onRules: () => void;
}) {
  const tiles = [
    ...(supported
      ? [
          holeByHole
            ? { label: HOLES_TEXT.heading, Icon: FlaggIcon, onPress: onHoleByHole, testID: 'open-hole-by-hole' }
            : { label: TICKET_TEXT.tileBoard, Icon: BegerIcon, onPress: onBoard, testID: 'open-leaderboard' },
          {
            label: TICKET_TEXT.tileScorecard,
            Icon: DokumentIcon,
            onPress: onScorecard,
            testID: 'open-scorecard',
          },
        ]
      : []),
    { label: TICKET_TEXT.tileRules, Icon: InfoIcon, onPress: onRules, testID: 'open-rules' },
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

function Tile({
  label,
  Icon,
  onPress,
  testID,
}: {
  label: string;
  Icon: ComponentType<IconProps>;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: pressed ? colors.primarySoft : colors.surface,
          borderColor: colors.border,
        },
      ]}
      testID={testID}
    >
      <Icon color={colors.primary} size={22} strokeWidth={ICON_STROKE} />
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 16 pt fra billetten, som i designet: skjermens mellomrom (8) og 8 til.
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  tile: {
    flex: 1,
    minHeight: TILE_HEIGHT,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  label: { fontSize: 13, fontFamily: FONTS.sansSemiBold, textAlign: 'center' },
});
