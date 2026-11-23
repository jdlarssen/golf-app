// #2283: hullet for hver plass i sideturneringen når spillet lages
// (`Sidekonk-oppsett` O1 på designlerretet, godkjent 15.11).
//
// Under antall-brikkene står én rad per plass i feltstil, med hullet til høyre
// eller «Velg hull». Raden åpner et ark med hull 1–18 i et rutenett på 6 × 3 og
// «Velg hull senere». Et trykk på et hull velger og lukker. Valget er frivillig:
// uten hull kårer arrangøren vinneren når runden er ferdig, som før.
//
// Arket er bygd som kåringsarket (`endGame/WinnerSheet.tsx`): hinne og ark er
// søsken, VoiceOver holdes inne, og «tilbake» lukker.
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Tap } from '../Tap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SIDE_HOLE_TEXT,
  sideHoleRowA11y,
  sideHoleRowLabel,
  sideHoleSheetIntro,
  sideHoleSheetTitle,
  sideHoleValue,
  type SideHoleCategory,
} from '../../lib/createGameCopy';
import { FONTS, fraunces, interLine, sheetScrim, TAP, useTheme } from '../../theme';
import { ChevronIcon, LukkIcon } from '../icons/Icons';

/** Hullene en plass kan stå på (`games_side_holes_valid`: 1–18). */
const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const ROWS = [HOLES.slice(0, 6), HOLES.slice(6, 12), HOLES.slice(12, 18)];

/** Én plass under antall-brikkene: «Hull for nærmest pinnen 1 … Hull 7 ›». */
export function SideHoleRow({
  category,
  position,
  count,
  hole,
  onPress,
}: {
  category: SideHoleCategory;
  position: number;
  count: number;
  hole: number | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const kind = category === 'longest_drive' ? 'ld' : 'ctp';
  return (
    <Tap
      onPress={onPress}
      style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}
      accessibilityRole="button"
      accessibilityLabel={sideHoleRowA11y(category, position, count, hole)}
      testID={`create-side-${kind}-hole-${position}`}
    >
      <Text style={[styles.rowLabel, { color: colors.muted }]}>{sideHoleRowLabel(category, position, count)}</Text>
      {hole === null ? (
        <Text style={[styles.rowPick, { color: colors.muted }]}>{SIDE_HOLE_TEXT.pick}</Text>
      ) : (
        <Text style={[styles.rowValue, { color: colors.text }]}>{sideHoleValue(hole)}</Text>
      )}
      <ChevronIcon direction="right" color={colors.muted} size={18} strokeWidth={2} />
    </Tap>
  );
}

/** Plassen arket velger hull for; `null` er lukket. */
export interface SideHoleSlot {
  category: SideHoleCategory;
  position: number;
  count: number;
}

export function SideHoleSheet({
  slot,
  value,
  onPick,
  onClose,
}: {
  slot: SideHoleSlot | null;
  /** Hullet plassen har nå. */
  value: number | null;
  /** Hullet som er valgt, eller `null` for «Velg hull senere». */
  onPick: (hole: number | null) => void;
  onClose: () => void;
}) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  if (!slot) return null;
  const pick = (hole: number | null) => {
    onPick(hole);
    onClose();
  };
  const kind = slot.category === 'longest_drive' ? 'ld' : 'ctp';

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill} testID="create-side-hole-sheet" accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <Tap
          feedback="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: sheetScrim(colors, scheme) }]}
          onPress={onClose}
          accessible={false}
          testID="create-side-hole-scrim"
        />
        <View style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: 24 + insets.bottom }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={[styles.kicker, { color: colors.accentText }]}>{SIDE_HOLE_TEXT.sheetKicker}</Text>
              <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
                {sideHoleSheetTitle(slot.category, slot.position, slot.count)}
              </Text>
            </View>
            <Tap
              onPress={onClose}
              style={[styles.close, { backgroundColor: colors.surface2 }]}
              accessibilityRole="button"
              accessibilityLabel={SIDE_HOLE_TEXT.close}
              testID="create-side-hole-close"
            >
              <LukkIcon color={colors.text} size={18} strokeWidth={2} />
            </Tap>
          </View>
          <Text style={[styles.intro, { color: colors.muted }]}>{sideHoleSheetIntro(slot.category)}</Text>
          <View style={styles.grid}>
            {ROWS.map((row) => (
              <View key={row[0]} style={styles.gridRow}>
                {row.map((hole) => {
                  const selected = hole === value;
                  // The cell shares the row, not the button: Yoga counts the border
                  // in the flex basis, so a 2 pt border on the button made the chosen
                  // hole 1.7 pt wider than the rest (53 each on the drawing).
                  return (
                    <View key={hole} style={styles.holeCell}>
                      <Tap
                        onPress={() => pick(hole)}
                        style={[
                          styles.hole,
                          selected
                            ? { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft }
                            : { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={sideHoleValue(hole)}
                        accessibilityState={{ selected }}
                        testID={`create-side-${kind}-hole-${slot.position}-pick-${hole}`}
                      >
                        <Text style={[styles.holeText, { color: colors.text }]}>{hole}</Text>
                      </Tap>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          <Tap
            onPress={() => pick(null)}
            style={[styles.later, { borderColor: colors.border, backgroundColor: colors.surface }]}
            accessibilityRole="button"
            testID={`create-side-${kind}-hole-${slot.position}-later`}
          >
            <Text style={[styles.laterText, { color: colors.text }]}>{SIDE_HOLE_TEXT.later}</Text>
          </Tap>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: TAP,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowLabel: { ...interLine(14, 17), fontFamily: FONTS.sansMedium, flex: 1, minWidth: 0 },
  rowValue: { ...interLine(16, 20), fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  rowPick: { ...interLine(16, 20), fontFamily: FONTS.sans },
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 999 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  headText: { flexShrink: 1 },
  kicker: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  title: { ...fraunces(500, 24, 28.8, { multiline: true }) },
  close: {
    width: TAP,
    height: TAP,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  intro: {
    ...interLine(14, 19.6, { multiline: true }),
    fontFamily: FONTS.sans,
    marginHorizontal: 4,
    marginTop: 6 + interLine(14, 19.6, { multiline: true }).marginTop,
    marginBottom: 12 + interLine(14, 19.6, { multiline: true }).marginBottom,
  },
  grid: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
  holeCell: { flex: 1 },
  hole: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  holeText: { ...fraunces(600, 18, 22), fontVariant: ['tabular-nums'] },
  later: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterText: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold },
});
