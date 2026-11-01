// #2751: Patsome-tavla, etter tegningen «Patsome-tavla», variant A. Lagkortene
// med poeng per del, og «Hull for hull» med alle lagene side om side. Alle tall
// og tekster kommer ferdige fra `patsomeBoardFor` (`lib/patsomeBoard.ts`); her
// tegnes de. Stripa nederst er lagtavlas (`TeamStrip`).
//
// Tabellen er to stabler ved siden av hverandre, Hull og Par til venstre og
// lagene til høyre, med skillelinjene lagt over begge. Da kan lagene rulle
// sideveis mens Hull og Par står fast, når alle kolonnene ikke får plass.
import { Fragment } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BOARD_TEAM_TEXT, BOARD_TEXT } from '../../lib/boardCopy';
import { HOLES_TEXT } from '../../lib/holesCopy';
import type {
  PatsomeBoardColumn,
  PatsomeBoardModel,
  PatsomeBoardRow,
} from '../../lib/patsomeBoard';
import {
  FONTS,
  boardRing,
  fraunces,
  interLine,
  teamLiveRing,
  useTheme,
} from '../../theme';

/** Plass-kolonnen i tegningen. */
const PLACE_W = 34;
const HOLE_W = 40;
const PAR_W = 30;
const HEAD_H = 22;
const GROUP_H = 22;
const ROW_H = 21;
/** Fra sju lag får ikke alle kolonnene plass på 390 pt, og da ruller de. */
const SCROLL_FROM_TEAMS = 7;
const SCROLL_COLUMN_W = 44;

export function PatsomeView({ model }: { model: PatsomeBoardModel }) {
  return (
    <View testID="patsome-board">
      <View style={styles.cards} testID="leaderboard-table">
        {model.rows.map((row) => (
          <TeamCard key={row.teamNumber} row={row} finished={model.variant === 'finished'} />
        ))}
      </View>
      <HoleTable model={model} />
    </View>
  );
}

function TeamCard({ row, finished }: { row: PatsomeBoardRow; finished: boolean }) {
  const { colors, scheme } = useTheme();
  const winner = finished && row.leader;
  const fill = winner ? colors.leaderFill : row.you ? colors.youFill : colors.surface;
  const ring = row.leader
    ? winner
      ? `inset 0 0 0 1.5px ${boardRing(colors, scheme)}`
      : `inset 0 0 0 1px ${teamLiveRing(colors, scheme)}`
    : undefined;
  // Små tekster på ditt lag og vinneren er `text` i natt: `muted` er for svak
  // mot `youFill` og `leaderFill` der.
  const small = { color: (row.you || winner) && scheme === 'dark' ? colors.text : colors.muted };
  return (
    <View
      style={[
        styles.card,
        winner && styles.winnerCard,
        {
          backgroundColor: fill,
          borderColor: row.you && !winner ? colors.youBorder : colors.border,
          boxShadow: ring,
        },
      ]}
      accessible
      accessibilityLabel={row.a11y}
      testID={`team-row-${row.teamNumber}`}
    >
      <View style={styles.placeCol}>
        {row.leader ? (
          <View
            style={[winner ? styles.discWinner : styles.disc, { backgroundColor: colors.accent }]}
            testID="board-leader-disc"
          >
            <Text
              style={[
                winner ? styles.discWinnerText : styles.discText,
                styles.tabular,
                // Blekket på skiva: skogblekket i lys, `onAccent` i natt (tegningen).
                { color: scheme === 'dark' ? colors.onAccent : colors.text },
              ]}
            >
              {row.place}
            </Text>
          </View>
        ) : (
          <Text style={[styles.place, styles.tabular, { color: colors.text }]}>{row.place}</Text>
        )}
      </View>

      <View style={styles.shrink}>
        <View style={styles.topLine}>
          <View style={styles.shrink}>
            {winner ? (
              <>
                <Text style={[styles.winnerWord, { color: colors.accentText }]}>{BOARD_TEAM_TEXT.winnerTeam}</Text>
                <View style={styles.nameLine}>
                  <Text style={[styles.winnerTeam, { color: colors.text }]}>{row.name}</Text>
                  {row.you ? <YouTag /> : null}
                </View>
              </>
            ) : (
              <View style={styles.nameLine}>
                <Text style={[styles.name, { color: colors.text }]}>{row.name}</Text>
                {row.you ? <YouTag /> : null}
              </View>
            )}
            <Text style={[styles.members, small]} testID="team-members">
              {row.members}
            </Text>
          </View>
          <View style={styles.totalCol}>
            <Text
              style={[
                winner ? styles.totalWinner : styles.total,
                styles.tabular,
                { color: row.leader ? colors.accentText : colors.text },
              ]}
              testID={`team-row-${row.teamNumber}-total`}
            >
              {row.total}
            </Text>
            <Text style={[styles.under, styles.tabular, small]} testID={`team-row-${row.teamNumber}-under`}>
              {row.under}
            </Text>
          </View>
        </View>
        {row.note ? (
          <Text style={[styles.note, small]} testID="board-tie-note">
            {row.note}
          </Text>
        ) : null}
        <Text style={[styles.segments, styles.tabular, small]} testID={`team-row-${row.teamNumber}-segments`}>
          {row.segments.map((segment, index) => (
            <Fragment key={segment.label}>
              {index > 0 ? ' · ' : ''}
              {`${segment.label} `}
              <Text style={[styles.segmentValue, { color: colors.text }]}>{segment.value}</Text>
            </Fragment>
          ))}
        </Text>
      </View>
    </View>
  );
}

function YouTag() {
  const { colors } = useTheme();
  return (
    <Text style={[styles.you, { color: colors.primary }]} testID="team-you">
      {BOARD_TEAM_TEXT.yourTeam}
    </Text>
  );
}

/** Hvor skillelinjene står: over stablene, i høyden hver stabel holder av til dem. */
function groupLines(groups: PatsomeBoardModel['groups']): { label: string; top: number }[] {
  const lines: { label: string; top: number }[] = [];
  let top = HEAD_H;
  for (const group of groups) {
    lines.push({ label: group.label, top });
    top += GROUP_H + group.holes.length * ROW_H;
  }
  return lines;
}

function HoleTable({ model }: { model: PatsomeBoardModel }) {
  const { colors } = useTheme();
  const scrolls = model.columns.length >= SCROLL_FROM_TEAMS;
  const columnStyle = scrolls ? styles.columnFixed : styles.columnFill;
  const cellFill = (column: PatsomeBoardColumn) => (column.you ? { backgroundColor: colors.youFill } : null);

  const teamColumns = (
    <View
      style={scrolls ? { width: model.columns.length * SCROLL_COLUMN_W } : styles.shrink}
      // Hele raden leses fra Hull-cellen.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.tableRowHead}>
        {model.columns.map((column) => (
          <View key={column.teamNumber} style={[columnStyle, styles.headCell, cellFill(column)]}>
            <Text style={[styles.headText, { color: column.you ? colors.primary : colors.muted }]} numberOfLines={1}>
              {column.label}
            </Text>
          </View>
        ))}
      </View>
      {model.groups.map((group) => (
        <Fragment key={group.label}>
          <View style={styles.groupGap} />
          {group.holes.map((hole) => (
            <View key={hole.holeNumber} style={styles.tableRow}>
              {model.columns.map((column, index) => {
                const text = hole.cells[index] ?? '—';
                return (
                  <View key={column.teamNumber} style={[columnStyle, styles.cell, cellFill(column)]}>
                    <Text
                      style={[styles.cellText, styles.tabular, { color: text === '—' ? colors.scoreUnsetFg : colors.text }]}
                      testID={`patsome-cell-${hole.holeNumber}-${column.teamNumber}`}
                    >
                      {text}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </Fragment>
      ))}
    </View>
  );

  return (
    <View
      style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="patsome-holes"
    >
      <Text style={[styles.tableHeading, { color: colors.muted }]} accessibilityRole="header">
        {HOLES_TEXT.heading}
      </Text>
      <View style={styles.tableBody}>
        <View style={styles.fixedColumns} testID="patsome-holes-fixed">
          <View style={styles.tableRowHead}>
            <Text style={[styles.headText, styles.holeCol, { color: colors.muted }]}>{BOARD_TEXT.colHoles}</Text>
            <Text style={[styles.headText, styles.parCol, { color: colors.muted }]}>{BOARD_TEXT.legendPar}</Text>
          </View>
          {model.groups.map((group) => (
            <Fragment key={group.label}>
              <View style={styles.groupGap} />
              {group.holes.map((hole) => (
                <View
                  key={hole.holeNumber}
                  style={styles.tableRow}
                  accessible
                  accessibilityLabel={hole.a11y}
                  testID={`patsome-hole-${hole.holeNumber}`}
                >
                  <Text style={[styles.holeNumber, styles.holeCol, styles.tabular, { color: colors.text }]}>
                    {hole.holeNumber}
                  </Text>
                  <Text style={[styles.par, styles.parCol, styles.tabular, { color: colors.muted }]}>{hole.par}</Text>
                </View>
              ))}
            </Fragment>
          ))}
        </View>
        {scrolls ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.shrink}
            testID="patsome-holes-scroll"
          >
            {teamColumns}
          </ScrollView>
        ) : (
          teamColumns
        )}
        {groupLines(model.groups).map((line) => (
          <View key={line.label} style={[styles.groupLine, { top: line.top }]} pointerEvents="none">
            <View style={[styles.rule, { backgroundColor: colors.border }]} />
            <Text style={[styles.groupLabel, { color: colors.muted }]}>{line.label}</Text>
            <View style={[styles.rule, { backgroundColor: colors.border }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

const SEGMENTS_LINE = interLine(12, 15);
const MEMBERS_LINE = interLine(12, 15);
const NOTE_LINE = interLine(11, 14);

const styles = StyleSheet.create({
  shrink: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  cards: { marginTop: 12, marginHorizontal: 12, gap: 8 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  winnerCard: { paddingVertical: 12 },
  placeCol: { width: PLACE_W, alignItems: 'center', paddingTop: 3 },
  place: { ...fraunces(600, 18), textAlign: 'center' },
  disc: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  discText: { ...fraunces(600, 15) },
  discWinner: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  discWinnerText: { ...fraunces(600, 16) },
  topLine: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  you: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  winnerWord: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, marginBottom: 3 + interLine(12, 15).marginBottom },
  winnerTeam: { ...fraunces(600, 18) },
  members: { ...MEMBERS_LINE, fontFamily: FONTS.sans, marginTop: 2 + MEMBERS_LINE.marginTop },
  totalCol: { alignItems: 'flex-end' },
  total: { ...fraunces(600, 24) },
  totalWinner: { ...fraunces(600, 28) },
  under: { ...interLine(11, 14), fontFamily: FONTS.sans },
  note: { ...NOTE_LINE, fontFamily: FONTS.sans, marginTop: 3 + NOTE_LINE.marginTop },
  segments: { ...SEGMENTS_LINE, fontFamily: FONTS.sans, marginTop: 5 + SEGMENTS_LINE.marginTop },
  segmentValue: { fontFamily: FONTS.sansSemiBold },
  tableCard: { marginTop: 12, marginHorizontal: 12, borderRadius: 16, borderWidth: 1, paddingTop: 12, paddingBottom: 8 },
  tableHeading: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, paddingHorizontal: 14, paddingBottom: 6 },
  tableBody: { flexDirection: 'row', paddingHorizontal: 8 },
  fixedColumns: { width: HOLE_W + PAR_W },
  tableRowHead: { flexDirection: 'row', alignItems: 'center', height: HEAD_H },
  tableRow: { flexDirection: 'row', alignItems: 'center', height: ROW_H },
  holeCol: { width: HOLE_W, textAlign: 'center' },
  parCol: { width: PAR_W, textAlign: 'center' },
  columnFill: { flex: 1, minWidth: 0 },
  columnFixed: { width: SCROLL_COLUMN_W },
  headCell: {
    height: HEAD_H,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  headText: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  holeNumber: { ...interLine(13, 16), fontFamily: FONTS.sansMedium },
  par: { ...interLine(12, 15), fontFamily: FONTS.sans },
  cell: { height: ROW_H, alignItems: 'center', justifyContent: 'center' },
  cellText: { ...fraunces(600, 14) },
  groupGap: { height: GROUP_H },
  groupLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: GROUP_H,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rule: { flex: 1, height: 1 },
  groupLabel: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
});
