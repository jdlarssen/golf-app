// #2579: tavla for solo stableford og slagspill, etter designlerretet
// (`Tavle-forslag` live, `Tavle-ferdig-forslag-lys`/`-natt` ferdig).
//
// Den mørke flaten med skiltene: plass, spiller, hull og tallet. Live har
// pilene og de fem prikkene for siste hull, og tegnforklaringen under. Ferdig
// har vinneren i gull og «Likt med X · avgjort på siste ni». Alle tall og
// tekster kommer ferdige fra `soloBoardFor` (`lib/soloBoard.ts`); her tegnes de.
//
// Stripa nederst («Din runde», «Ditt resultat») er en egen komponent fordi
// skjermen legger den fast over innholdet, utenfor rullingen.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toneKey, visibleBoardRows } from '../../../../../lib/leaderboard/boardRules';
import type { ScoreTone } from '../../../../../lib/scoring/scoreTone';
import { BOARD_APP_TEXT, BOARD_TEXT } from '../../lib/boardCopy';
import { formatMessage } from '../../lib/kavalkadeCopy';
import type { SoloBoardModel, SoloBoardRow, SoloBoardStrip } from '../../lib/soloBoard';
import {
  BOARD_PLAQUE_SHADOW,
  FONTS,
  TAP,
  boardRing,
  boardSlabShadow,
  boardStripShadow,
  fraunces,
  interLine,
  useTheme,
  type ThemeColors,
} from '../../theme';
import { withSystemArrows } from '../SystemArrow';

/** Kolonnene i tegningen: plass 44, spiller, hull 46 og tallet 58, med 6 mellom. */
const PLACE_W = 44;
const HOLES_W = 46;
const TOTAL_W = 58;

export function SoloBoard({ model }: { model: SoloBoardModel }) {
  const { colors, scheme } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const live = model.variant === 'live';
  const { visible, canCollapse } = visibleBoardRows(
    model.rows,
    model.viewerId,
    showAll,
    (row) => row.userId,
  );

  return (
    <View testID="solo-board">
      <View
        style={[
          styles.slab,
          { backgroundColor: colors.boardSlab, boxShadow: boardSlabShadow(scheme) },
          !live && { borderWidth: 1, borderColor: colors.boardSlabBorder },
        ]}
        testID="leaderboard-table"
      >
        <View style={styles.head} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={[styles.headText, styles.center, { width: PLACE_W, color: colors.onStrongWarm }]}>
            {BOARD_TEXT.colPlace}
          </Text>
          <Text style={[styles.headText, styles.grow, { color: colors.onStrongWarm }]}>
            {BOARD_TEXT.colPlayer}
          </Text>
          {model.showHoles ? (
            <Text style={[styles.headText, styles.center, { width: HOLES_W, color: colors.onStrongWarm }]}>
              {BOARD_TEXT.colHoles}
            </Text>
          ) : null}
          <Text style={[styles.headText, styles.center, { width: TOTAL_W, color: colors.onStrongWarm }]}>
            {model.totalHeading}
          </Text>
        </View>

        {visible.map((item) =>
          item === 'gap' ? (
            <Text key="gap" style={[styles.gap, { color: colors.onStrongWarm }]} testID="board-gap">
              …
            </Text>
          ) : (
            <BoardRow key={item.userId} row={item} live={live} showHoles={model.showHoles} />
          ),
        )}

        {live ? <Legend colors={colors} /> : null}
      </View>

      {canCollapse ? (
        <Pressable
          onPress={() => setShowAll((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAll }}
          style={[styles.toggle, { borderColor: colors.border, backgroundColor: colors.surface }]}
          testID="board-toggle"
        >
          <Text style={[styles.toggleText, { color: colors.primary }]}>
            {showAll
              ? BOARD_TEXT.showFewer
              : formatMessage(BOARD_TEXT.showAll, { count: model.rows.length })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function BoardRow({ row, live, showHoles }: { row: SoloBoardRow; live: boolean; showHoles: boolean }) {
  const { colors, scheme } = useTheme();
  // Lederen live har hvite skilt og ringen rundt navnet; vinneren ferdig har
  // gull fyll og ring på alle tre.
  const winner = !live && row.leader;
  const fill = winner ? colors.leaderFill : row.you ? colors.youFill : colors.surface;
  const ring = `inset 0 0 0 ${winner ? 1.5 : 1}px ${boardRing(colors, scheme)}`;
  const plaque = [styles.plaque, { backgroundColor: fill, boxShadow: BOARD_PLAQUE_SHADOW }];
  const winnerPlaque = winner ? { boxShadow: `${BOARD_PLAQUE_SHADOW}, ${ring}` } : null;
  // Små tekster på din rad er `text` i natt: `muted` er for svak mot `youFill`.
  const small = row.you && scheme === 'dark' ? colors.text : colors.muted;
  const num = live ? null : styles.tabular;

  return (
    <View
      style={[styles.row, !live && { minHeight: winner ? 54 : 44 }]}
      testID={`board-row-${row.userId}`}
    >
      <View style={[plaque, styles.cellCenter, { width: PLACE_W }, winnerPlaque]} testID={`board-row-${row.userId}-place`}>
        {row.leader ? (
          <View
            style={[
              live ? styles.disc : styles.discWinner,
              { backgroundColor: colors.accent },
            ]}
            testID="board-leader-disc"
          >
            <Text
              style={[
                live ? styles.discText : styles.discWinnerText,
                // Blekket på skiva: skogblekket i lys, `onAccent` i natt (tegningen).
                { color: scheme === 'dark' ? colors.onAccent : colors.text },
                num,
              ]}
            >
              {row.place}
            </Text>
          </View>
        ) : (
          <Text style={[styles.place, { color: colors.text }, num]}>{row.place}</Text>
        )}
      </View>

      <View
        style={[
          plaque,
          styles.nameCell,
          live && row.leader ? { boxShadow: `${BOARD_PLAQUE_SHADOW}, ${ring}` } : null,
          winnerPlaque,
          !live && (winner ? styles.nameWinner : styles.nameFinished),
        ]}
        testID={`board-row-${row.userId}-name`}
      >
        {live ? (
          <>
            <View style={styles.nameTop}>
              <Text style={[styles.name, styles.shrink, { color: colors.text }]} numberOfLines={1}>
                {row.name}
                {row.you ? (
                  <Text style={[styles.you, { color: colors.primary }]}>
                    {' '}
                    {BOARD_TEXT.you}
                  </Text>
                ) : null}
              </Text>
              <Movement movement={row.movement} small={small} />
            </View>
            <View style={styles.dots}>
              {row.recent.map((tone, index) => (
                <View
                  key={index}
                  style={[styles.dot, { backgroundColor: dotColor(colors, tone) }]}
                  testID="board-dot"
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={[styles.nameLine, styles.shrink]}>
              <Text
                style={[winner ? styles.nameWinnerText : styles.name, styles.shrink, { color: colors.text }]}
                numberOfLines={1}
              >
                {row.name}
              </Text>
              {row.you ? <Text style={[styles.you, { color: colors.primary }]}>{BOARD_TEXT.you}</Text> : null}
            </View>
            {winner ? (
              <Text style={[styles.winnerWord, { color: colors.accentText }]}>{BOARD_APP_TEXT.winner}</Text>
            ) : null}
            {row.note ? (
              <Text style={[styles.note, { color: small }]} testID="board-tie-note">
                {row.note}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {showHoles ? (
        <View style={[plaque, styles.cellCenter, { width: HOLES_W }, winnerPlaque]} testID={`board-row-${row.userId}-holes`}>
          <Text style={[styles.holes, { color: colors.text }, num]}>{row.holesPlayed}</Text>
        </View>
      ) : null}

      <View style={[plaque, styles.cellCenter, { width: TOTAL_W }, winnerPlaque]} testID={`board-row-${row.userId}-total`}>
        <Text
          style={[
            winner ? styles.totalWinner : styles.total,
            { color: winner ? colors.accentText : colors.primary },
            num,
          ]}
        >
          {row.total}
        </Text>
      </View>
    </View>
  );
}

/** «▲ 1», «▼ 2», «–» for samme plass, ingenting før to hull. Trekanten er systemfontens, som i tegningen. */
function Movement({ movement, small }: { movement: number | null; small: string }) {
  const { colors } = useTheme();
  if (movement === null) return null;
  if (movement === 0) {
    return (
      <Text style={[styles.same, { color: small }]} testID="board-movement">
        –
      </Text>
    );
  }
  const up = movement > 0;
  return (
    <Text
      style={[styles.move, { color: up ? colors.scoreUnderFg : colors.scoreOver2Fg }]}
      testID="board-movement"
    >
      <Text style={styles.glyph}>{up ? '▲' : '▼'}</Text>
      {` ${Math.abs(movement)}`}
    </Text>
  );
}

function dotColor(colors: ThemeColors, tone: ScoreTone): string {
  const key = toneKey(tone);
  return key === 'under'
    ? colors.scoreUnderFg
    : key === 'over1'
      ? colors.dotOver
      : key === 'over2'
        ? colors.danger
        : colors.scoreUnsetFg;
}

/** «● under ● par ● over» til venstre og «Siste 5 hull» til høyre. */
function Legend({ colors }: { colors: ThemeColors }) {
  const ink = { color: colors.onStrongWarm };
  return (
    <View style={styles.legend} testID="board-legend">
      <View style={styles.legendItems}>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.dot,
              { backgroundColor: colors.scoreUnderFg, boxShadow: `0 0 0 1px ${colors.onStrongWarm}` },
            ]}
          />
          <Text style={[styles.legendText, ink]}>{BOARD_APP_TEXT.legendUnder}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: colors.scoreUnsetFg }]} />
          <Text style={[styles.legendText, ink]}>{BOARD_TEXT.tone.par}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: colors.dotOver }]} />
          <Text style={[styles.legendText, ink]}>{BOARD_APP_TEXT.legendOver}</Text>
        </View>
      </View>
      <Text style={[styles.legendText, ink]}>{BOARD_TEXT.legendRecent}</Text>
    </View>
  );
}

/**
 * Stripa nederst: «Din runde» med plassen og avstanden til ledelsen, og
 * knappen til neste hull eller scorekortet. Skjermen legger den fast 20 pt
 * over bunnen (pluss sikker sone) og 12 pt fra sidene.
 */
export function BoardStrip({
  strip,
  finished,
  onAction,
  onLayout,
  bottom,
}: {
  strip: SoloBoardStrip;
  finished: boolean;
  onAction: () => void;
  onLayout?: (height: number) => void;
  bottom: number;
}) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        styles.strip,
        {
          bottom,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          boxShadow: boardStripShadow(scheme),
        },
      ]}
      onLayout={(event) => onLayout?.(event.nativeEvent.layout.height)}
      testID="board-strip"
    >
      <View style={styles.stripText}>
        <Text style={[styles.stripKicker, { color: colors.accentText }]}>{strip.kicker}</Text>
        <Text style={[styles.stripLine, { color: colors.text }, finished && styles.tabular]} numberOfLines={1}>
          {strip.text}
        </Text>
      </View>
      {strip.action ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={[styles.stripButton, { backgroundColor: colors.primary }]}
          testID="board-strip-action"
        >
          <Text style={[styles.stripButtonText, { color: colors.onPrimary }]}>
            {withSystemArrows(strip.action.label, '600')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Flaten: 12 pt fra sidene, 10 pt luft og 6 mellom radene. Skjermen legger
  // de 8 øverste punktene over båndets hale.
  slab: { marginHorizontal: 12, borderRadius: 16, padding: 10, gap: 6 },
  head: { flexDirection: 'row', gap: 6, paddingHorizontal: 2 },
  headText: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  center: { textAlign: 'center' },
  grow: { flex: 1 },
  shrink: { flexShrink: 1, minWidth: 0 },
  gap: { ...interLine(15, 15), textAlign: 'center', fontFamily: FONTS.sans },
  row: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  plaque: { borderRadius: 6 },
  cellCenter: { alignItems: 'center', justifyContent: 'center' },
  place: { ...fraunces(600, 18) },
  disc: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  discText: { ...fraunces(600, 15) },
  discWinner: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  discWinnerText: { ...fraunces(600, 16) },
  nameCell: { flex: 1, minWidth: 0, paddingVertical: 8, paddingHorizontal: 10 },
  nameTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  // Ferdig: navnet midt i skiltet; vinneren med «VINNER» helt til høyre, og
  // likt-linja 3 pt under navnet.
  nameFinished: { justifyContent: 'center', gap: 3 },
  nameWinner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  nameWinnerText: { ...fraunces(600, 18) },
  you: { ...interLine(10, 12), fontFamily: FONTS.sansSemiBold, letterSpacing: 1.4, textTransform: 'uppercase' },
  winnerWord: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  note: { ...interLine(11, 14), fontFamily: FONTS.sans },
  move: { ...interLine(11, 14), fontFamily: FONTS.sansSemiBold },
  same: { ...interLine(11, 14), fontFamily: FONTS.sans },
  glyph: { fontFamily: FONTS.system, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 4, marginTop: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  // Tegningen laster bare Fraunces 500 og 600, så hull-tallet uten vekt
  // tegnes i 500-snittet.
  holes: { ...fraunces(500, 18) },
  total: { ...fraunces(600, 24) },
  totalWinner: { ...fraunces(600, 26) },
  tabular: { fontVariant: ['tabular-nums'] },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    paddingHorizontal: 4,
  },
  legendItems: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { ...interLine(11, 14), fontFamily: FONTS.sans },
  toggle: {
    marginTop: 10,
    marginHorizontal: 12,
    height: TAP,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
  strip: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stripText: { flex: 1, minWidth: 0 },
  stripKicker: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  stripLine: { ...fraunces(500, 18), marginTop: 2 + fraunces(500, 18).marginTop },
  stripButton: {
    height: TAP,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripButtonText: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
});
