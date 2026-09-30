// #2255 PR 3d: «Hull for hull» for best ball, som webbens drilldown
// (`holes/formats/drilldown.tsx`).
//
// Ren presentasjon av `bestBallDrilldown` (`lib/leaderboard/bestBallHoles.ts`),
// den samme modellen webben tegner: ett lag om gangen, lederen først. Øverst
// står «Lag 2 · 1. plass» (webbens topp), så heltefeltet med plass, lagnavn,
// spillerne, total og mot par, forklaringen, «Ut» og «Inn» med én rad per hull
// og en sumrad, totalen med hull vunnet og til slutt «forrige» og «neste» lag.
//
// Hver hullrad har spillerne under hverandre: initialer, brutto i scoreformen,
// netto og netto mot spillerens egen par. Den som ga lagets ball, står i
// halvfet tekst. Til høyre står lagets netto og mot par. Skjermleseren får én
// setning per spiller i stedet for tallene, som webbens `role="img"`.
//
// Webben har ingen «Vel spilt!» under drilldownen, så heller ikke appen.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TeamLine } from '../../../../../lib/leaderboard';
import {
  bestBallDrilldown,
  bestBallRevealMeta,
  formatVsPar,
  type BestBallHoleRow,
  type BestBallNine,
  type BestBallTeamRef,
  type VsParTone,
} from '../../../../../lib/leaderboard/bestBallHoles';
import { formatOtherGendersPar } from '../../../../../lib/games/parDisplay';
import {
  BEST_BALL_HOLES_TEXT,
  bestBallHolesWon,
  bestBallParAsideAria,
  bestBallPlayerAria,
  bestBallTeamHeader,
  bestBallTeamLabel,
  bestBallTeamNav,
} from '../../lib/holesCopy';
import { FONTS, TAP, useTheme, type ThemeColors } from '../../theme';
import { ScoreShape } from '../scorecard/ScoreShape';
import { holesStyles } from './holesShared';

/** Webbens `--score-*-bg` og `--score-*-fg` per tone. */
const TONE: Record<VsParTone, { bg: keyof ThemeColors; fg: keyof ThemeColors }> = {
  under: { bg: 'scoreUnderBg', fg: 'scoreUnderFg' },
  par: { bg: 'scoreParBg', fg: 'scoreParFg' },
  over1: { bg: 'scoreOver1Bg', fg: 'scoreOver1Fg' },
  over2: { bg: 'scoreOver2Bg', fg: 'scoreOver2Fg' },
};

/** Mot par i en pille i tonen, eller «—» dempet uten verdi. */
function VsParPill({
  value,
  tone,
  width,
  testID,
}: {
  value: number | null;
  tone: VsParTone | null;
  width: number;
  testID?: string;
}) {
  const { colors, ui } = useTheme();
  return (
    <View
      style={[styles.pill, { width }, tone !== null && { backgroundColor: colors[TONE[tone].bg] }]}
      testID={testID}
    >
      <Text style={[styles.pillText, ui.num, { color: tone !== null ? colors[TONE[tone].fg] : colors.muted }]}>
        {value === null ? '—' : formatVsPar(value)}
      </Text>
    </View>
  );
}

export function BestBallHoleCardsView({
  lines,
  coursePar,
  onTeamChange,
}: {
  lines: readonly TeamLine[];
  coursePar: number;
  /** Et annet lag er valgt; skjermen ruller til toppen av det nye laget. */
  onTeamChange?: () => void;
}) {
  const { colors, ui } = useTheme();
  const [team, setTeam] = useState<number | null>(null);
  const selectTeam = (teamNumber: number) => {
    setTeam(teamNumber);
    onTeamChange?.();
  };
  const view = bestBallDrilldown({ lines, requestedTeam: team, coursePar });
  if (view === null) return null;
  const front = view.nines.find((n) => n.key === 'front');
  const back = view.nines.find((n) => n.key === 'back');
  const meta = bestBallRevealMeta(view.players);

  return (
    <View style={holesStyles.page} testID="hole-by-hole-best-ball">
      <Text style={[styles.kicker, holesStyles.center, { color: colors.muted }]} testID="hole-by-hole-team-header">
        {bestBallTeamHeader(view.teamNumber, view.rank)}
      </Text>

      <View style={styles.hero}>
        <Text
          style={[styles.rank, ui.num, { color: view.isLeader ? colors.accentText : colors.muted }]}
          testID="hole-by-hole-team-rank"
        >
          {view.rank}
        </Text>
        <View style={holesStyles.shrink}>
          <Text accessibilityRole="header" style={[styles.teamName, { color: colors.text }]}>
            {bestBallTeamLabel(view.teamNumber)}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>
            {meta || BEST_BALL_HOLES_TEXT.noPlayers}
          </Text>
        </View>
        <View style={styles.heroRight}>
          <Text style={[styles.heroTotal, ui.num, { color: colors.text }]} testID="hole-by-hole-team-total">
            {view.total}
          </Text>
          <Text style={[styles.heroVsPar, ui.num, { color: colors.muted }]} testID="hole-by-hole-team-vs-par">
            {`${formatVsPar(view.totalVsPar)} ${BEST_BALL_HOLES_TEXT.vsParSuffix}`}
          </Text>
        </View>
      </View>

      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: colors.muted }]}>
          <Text style={[styles.legendBest, { color: colors.text }]}>{BEST_BALL_HOLES_TEXT.legendBest}</Text>
          {` ${BEST_BALL_HOLES_TEXT.legendNetLabel}`}
        </Text>
        <Text style={[styles.legendFormat, { color: colors.muted }]}>{BEST_BALL_HOLES_TEXT.legendFormat}</Text>
      </View>

      {front && <NineTable nine={front} label={BEST_BALL_HOLES_TEXT.frontNineLabel} summary={BEST_BALL_HOLES_TEXT.summaryUt} />}
      {back && <NineTable nine={back} label={BEST_BALL_HOLES_TEXT.backNineLabel} summary={BEST_BALL_HOLES_TEXT.summaryInn} />}

      <View style={[styles.totalBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View>
          <Text style={[styles.kicker, { color: colors.accentText }]}>{BEST_BALL_HOLES_TEXT.totalLabel}</Text>
          <Text style={[styles.meta, ui.num, { color: colors.muted }]} testID="hole-by-hole-holes-won">
            {bestBallHolesWon(view.holesWon)}
          </Text>
        </View>
        <View style={styles.totalRight}>
          <Text style={[styles.barTotal, ui.num, { color: colors.text }]}>{view.total}</Text>
          <Text style={[styles.barVsPar, ui.num, { color: colors.muted }]} testID="hole-by-hole-total-vs-par">
            {formatVsPar(view.totalVsPar)}
          </Text>
        </View>
      </View>

      {view.teamCount > 1 && (
        <View style={styles.nav}>
          <TeamNavButton target={view.prev} direction="prev" onPress={selectTeam} />
          <TeamNavButton target={view.next} direction="next" onPress={selectTeam} />
        </View>
      )}
    </View>
  );
}

function NineTable({ nine, label, summary }: { nine: BestBallNine; label: string; summary: string }) {
  const { colors, ui } = useTheme();
  return (
    <View style={styles.nineBlock} testID={`hole-by-hole-nine-${nine.key}`}>
      <Text style={[styles.kicker, styles.nineLabel, { color: colors.muted }]}>{label}</Text>
      <View style={[styles.table, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {nine.rows.map((row, i) => (
          <HoleRow key={row.holeNumber} row={row} first={i === 0} />
        ))}
        <View
          style={[styles.summary, { backgroundColor: colors.surface2, borderTopColor: colors.border }]}
          testID={`hole-by-hole-summary-${nine.key}`}
        >
          <View style={styles.holeCol}>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>{summary}</Text>
            <Text style={[styles.parText, ui.num, { color: colors.muted }]}>{`P${nine.par}`}</Text>
          </View>
          <View style={styles.flex} />
          <Text style={[styles.teamNet, ui.num, { color: colors.text }]}>{nine.net}</Text>
          <View style={styles.summaryPill}>
            <VsParPill value={nine.vsPar} tone={nine.tone} width={40} />
          </View>
        </View>
      </View>
    </View>
  );
}

function HoleRow({ row, first }: { row: BestBallHoleRow; first: boolean }) {
  const { colors, ui } = useTheme();
  return (
    <View
      style={[styles.holeRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
      testID={`hole-by-hole-card-${row.holeNumber}`}
    >
      <View style={styles.holeCol}>
        <Text style={[styles.holeNumber, ui.num, { color: colors.text }]}>{row.holeNumber}</Text>
        <Text
          style={[styles.parText, ui.num, { color: colors.muted }]}
          // VoiceOver leser ikke etiketter på tekst inni tekst, så stjernas
          // forklaring (webbens `aria-label` på `<sup>`) står på «P4» selv.
          accessibilityLabel={
            row.parAside && row.parByGender
              ? `P${row.par}. ${bestBallParAsideAria(formatOtherGendersPar(row.parByGender, undefined))}`
              : undefined
          }
          testID={`hole-by-hole-par-${row.holeNumber}`}
        >
          {`P${row.par}`}
          {row.parAside && row.parByGender && (
            <Text style={styles.parAside} testID={`hole-by-hole-par-aside-${row.holeNumber}`}>
              *
            </Text>
          )}
        </Text>
      </View>

      <View style={styles.players}>
        {row.players.map((cell) => (
          <View
            key={cell.userId}
            // Setningen erstatter tallene for skjermleseren, som webbens `role="img"`.
            accessible
            accessibilityLabel={bestBallPlayerAria(cell, cell.isBestNet)}
            style={styles.playerLine}
            testID={`hole-by-hole-row-${row.holeNumber}-${cell.userId}`}
          >
            <Text
              style={[
                styles.initial,
                cell.isBestNet ? { fontFamily: FONTS.serifScore, color: colors.text } : { color: colors.muted },
              ]}
            >
              {cell.initial}
            </Text>
            {cell.gross === null ? (
              <View style={styles.noShape}>
                <Text style={[styles.dash, { color: colors.muted }]}>{cell.grossText}</Text>
              </View>
            ) : (
              <ScoreShape strokes={cell.gross} par={cell.par} size={28} toned />
            )}
            <Text
              style={[
                styles.net,
                ui.num,
                cell.isBestNet ? { fontFamily: FONTS.serifScore, color: colors.text } : { color: colors.muted },
              ]}
              testID={`hole-by-hole-net-${row.holeNumber}-${cell.userId}`}
            >
              {cell.netText}
            </Text>
            <VsParPill value={cell.netVsPar} tone={cell.netTone} width={32} />
          </View>
        ))}
      </View>

      <View style={styles.teamCol}>
        <Text style={[styles.teamNet, ui.num, { color: colors.text }]} testID={`hole-by-hole-team-net-${row.holeNumber}`}>
          {row.teamNet ?? '–'}
        </Text>
        <VsParPill value={row.teamVsPar} tone={row.teamTone} width={40} />
      </View>
    </View>
  );
}

function TeamNavButton({
  target,
  direction,
  onPress,
}: {
  target: BestBallTeamRef | null;
  direction: 'prev' | 'next';
  onPress: (teamNumber: number) => void;
}) {
  const { colors } = useTheme();
  // Uten nabo står en tom halvdel, så «neste» alltid ligger til høyre.
  if (!target) return <View style={styles.navHalf} />;
  const label = bestBallTeamNav(direction, target.rank, target.teamNumber);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(target.teamNumber)}
      style={[styles.navHalf, styles.navButton, direction === 'next' && styles.navNext]}
      testID={`hole-by-hole-team-${direction}`}
    >
      <Text style={[styles.navText, { color: colors.muted }]}>
        {direction === 'prev' ? `‹ ${label}` : `${label} ›`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Webbens `text-[11px] font-semibold uppercase tracking-[0.20em]`. */
  kicker: { fontSize: 11, fontFamily: FONTS.sansSemiBold, letterSpacing: 2.2, textTransform: 'uppercase' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rank: { minWidth: 50, textAlign: 'center', fontSize: 48, lineHeight: 52, fontFamily: FONTS.serifScore },
  teamName: { fontSize: 22, fontFamily: FONTS.serifDisplay },
  meta: { fontSize: 11.5, fontFamily: FONTS.sans, marginTop: 2 },
  heroRight: { marginLeft: 'auto', alignItems: 'flex-end' },
  heroTotal: { fontSize: 24, fontFamily: FONTS.serifScore },
  heroVsPar: { fontSize: 11, fontFamily: FONTS.sansSemiBold, letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4, paddingHorizontal: 4 },
  legendText: { fontSize: 10.5, fontFamily: FONTS.sans },
  legendBest: { fontFamily: FONTS.serifScore },
  legendFormat: { marginLeft: 'auto', fontSize: 11, fontFamily: FONTS.serifDisplay, fontStyle: 'italic' },
  nineBlock: { gap: 6 },
  nineLabel: { paddingHorizontal: 4 },
  table: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  holeRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  holeCol: { width: 40, alignItems: 'center', justifyContent: 'center' },
  holeNumber: { fontSize: 15, fontFamily: FONTS.serifDisplay },
  /** «P4»: webbens `text-[11px] font-semibold uppercase tracking-[0.12em]`. */
  parText: { fontSize: 11, fontFamily: FONTS.sansSemiBold, letterSpacing: 1.3, marginTop: 2 },
  parAside: { fontSize: 8 },
  players: { flex: 1, justifyContent: 'center', gap: 6 },
  playerLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  initial: { width: 24, textAlign: 'center', fontSize: 12, fontFamily: FONTS.serifDisplay },
  noShape: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  dash: { fontSize: 13, fontFamily: FONTS.serifDisplay },
  net: { minWidth: 18, textAlign: 'right', fontSize: 14, fontFamily: FONTS.serifDisplay },
  pill: { borderRadius: 999, paddingVertical: 2, alignItems: 'center' },
  pillText: { fontSize: 11, fontFamily: FONTS.sansSemiBold },
  teamCol: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  teamNet: { fontSize: 18, fontFamily: FONTS.serifScore },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1.5 },
  summaryLabel: { fontSize: 13, fontFamily: FONTS.serifScore, letterSpacing: 0.5 },
  summaryPill: { marginLeft: 8 },
  flex: { flex: 1 },
  totalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  totalRight: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  barTotal: { fontSize: 32, fontFamily: FONTS.serifScore },
  barVsPar: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  nav: { flexDirection: 'row', justifyContent: 'space-between' },
  navHalf: { width: '50%' },
  navButton: { minHeight: TAP, justifyContent: 'center' },
  navNext: { alignItems: 'flex-end' },
  navText: { fontSize: 12, fontFamily: FONTS.sans },
});
