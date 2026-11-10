// #2749: premiebordet i venterommet, foldet (eierens valg B, 01.11). Lukket er det
// én rad, «Premiebord» og «{n} premier» (`Venterom-forslag-lenke-foldet`); et
// trykk åpner lista med én linje per premie og «Sponset av …» under dem som har
// sponsor (`Venterom-forslag-runden-foldet`, eierens svar 10.11). Logoer vises
// ikke i appen. Raden er lukket hver gang skjermen åpnes.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GamePrize } from '../../../../../lib/games/prizes';
import { PRIZE_TEXT } from '../../lib/paymentCopy';
import { prizeRows, type PrizeRow } from '../../lib/paymentView';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';
import { ChevronIcon } from '../icons/Icons';

/** Medaljene i tegningen: flate skiver, sølv og bronse like i begge drakter. */
const SILVER = '#CFC9BD';
const BRONZE = '#B07C52';

export function PrizeTable({ prizes }: { prizes: readonly GamePrize[] | undefined }) {
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rows = prizeRows(prizes);
  if (rows.length === 0) return null;

  // Gull er draktens gull; tallet på metallet er mørk skog i lys og natt-bunnen i natt.
  const medal = { 1: colors.accent, 2: SILVER, 3: BRONZE } as const;
  const medalInk = scheme === 'dark' ? colors.bg : colors.text;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="prize-table">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${PRIZE_TEXT.boardTitle}, ${PRIZE_TEXT.count(rows.length)}`}
        onPress={() => setOpen((was) => !was)}
        style={styles.toggle}
        testID="prize-table-toggle"
      >
        <Text style={[styles.title, { color: colors.text }]}>{PRIZE_TEXT.boardTitle}</Text>
        <Text style={[styles.count, { color: colors.muted }]}>{PRIZE_TEXT.count(rows.length)}</Text>
        <ChevronIcon direction={open ? 'up' : 'down'} size={18} strokeWidth={2} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={styles.list} testID="prize-table-list">
          {rows.map((row) => (
            <PrizeLine key={row.key} row={row} medalFill={row.medal ? medal[row.medal] : null} medalInk={medalInk} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PrizeLine({ row, medalFill, medalInk }: { row: PrizeRow; medalFill: string | null; medalInk: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.item} testID={`prize-${row.key}`}>
      <View style={styles.line}>
        {medalFill ? (
          <View style={[styles.medal, { backgroundColor: medalFill }]}>
            <Text style={[styles.medalText, { color: medalInk }]}>{row.medal}</Text>
          </View>
        ) : (
          <View style={styles.medalSpace} />
        )}
        <Text style={[styles.label, { color: colors.text }]}>{row.label}</Text>
        <Text style={[styles.dot, { color: colors.muted }]}>·</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.description, { color: colors.text }]}>
          {row.description}
        </Text>
      </View>
      {row.sponsorLine ? (
        <Text style={[styles.sponsor, { color: colors.muted }]} testID={`prize-${row.key}-sponsor`}>
          {row.sponsorLine}
        </Text>
      ) : null}
    </View>
  );
}

/** Medaljen er 18 pt, tallet Fraunces 11 midt i. */
const MEDAL = 18;

const styles = StyleSheet.create({
  // 16 pt over raden i tegningen: skjermens `gap` på 8 og 8 til.
  card: { marginTop: 8, borderWidth: 1, borderRadius: 16 },
  toggle: {
    minHeight: 56,
    paddingLeft: 16,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: { ...fraunces(500, 17), letterSpacing: -0.17, flexGrow: 1, flexShrink: 1 },
  count: { ...interLine(14, 17), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  list: { paddingHorizontal: 16, paddingBottom: 14, gap: 6 },
  item: { gap: 2, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20, minWidth: 0 },
  medal: {
    width: MEDAL,
    height: MEDAL,
    borderRadius: MEDAL / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  medalText: fraunces(600, 11),
  medalSpace: { width: MEDAL, flexShrink: 0 },
  label: { ...interLine(14, 20), fontFamily: FONTS.sansSemiBold, flexShrink: 0 },
  dot: { ...interLine(14, 20), fontFamily: FONTS.sans, flexShrink: 0 },
  description: { ...fraunces(500, 14, 20), flexShrink: 1, minWidth: 0 },
  sponsor: { ...interLine(12, 16), fontFamily: FONTS.sans, paddingLeft: 26 },
});
