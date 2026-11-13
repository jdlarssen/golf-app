// #2755: Nassau-tavla i appen, «Forslag: tre kamper i én». Front 9, back 9 og
// totalt som tre kort; kortet for kampen som spilles er valgt, og lista for den
// kampen står under. Tallene, hvem som leder og når en kamp er avgjort, regner
// den delte `lib/leaderboard/nassauBoard.ts` ut (samme som nettets tavle); her
// er bare tegningen og teksten. Ingen animasjon.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  NASSAU_SECTION_KEYS,
  summarizeNassau,
  type NassauCardSummary,
  type NassauSectionKey,
} from '../../../../../lib/leaderboard/nassauBoard';
import { headlineUnit, teamHeadline } from '../../../../../lib/leaderboard/vsPar';
import type { NassauResult } from '../../../../../lib/scoring/modes/types';
import type { Settlement } from '../../../../../lib/scoring/settlement';
import { BOARD_TEXT } from '../../lib/boardCopy';
import { formatMessage } from '../../lib/kavalkadeCopy';
import {
  NASSAU_BOARD_TEXT,
  NASSAU_CARD_KICKER,
  NASSAU_TEXT,
  nassauBoardCopy,
} from '../../lib/nassauBoardCopy';
import { FONTS, fraunces, interLine, useTheme, withAlpha } from '../../theme';
import { Medal } from './Medal';
import { ReactableRow, ReactionPlate } from './RowReactions';
import { SettlementCard } from './SettlementCard';

interface ViewerLine {
  text: string;
  sr: string;
  strong: boolean;
}

/** Seerens linje på kortet, med nettets regler (`NassauView.viewerLine`). */
function viewerLineOf(card: NassauCardSummary, viewerUserId: string | null): ViewerLine | null {
  const v = card.viewer;
  if (!v) return null;
  if (card.state === 'decided' && card.leaderUserIds.length === 1 && card.leaderUserIds[0] === viewerUserId) {
    return { text: NASSAU_BOARD_TEXT.viewerWon, sr: NASSAU_BOARD_TEXT.viewerWon, strong: true };
  }
  if (card.state === 'live' && v.rank === 1 && !v.tied) {
    const text = v.lead === null ? NASSAU_BOARD_TEXT.viewerLead : nassauBoardCopy.viewerLeadBy(v.lead);
    return { text, sr: text, strong: true };
  }
  return v.gap === null
    ? { text: nassauBoardCopy.viewerRank(v.tied, v.rank), sr: nassauBoardCopy.viewerSr(v.tied, v.rank), strong: false }
    : {
        text: nassauBoardCopy.viewerRankGap(v.tied, v.rank, v.gap),
        sr: nassauBoardCopy.viewerSrGap(v.tied, v.rank, v.gap),
        strong: false,
      };
}

export function NassauBoard({
  result,
  status,
  settlement = null,
  viewerUserId = null,
  nameOf,
  shortNameOf,
}: {
  result: NassauResult;
  status: string;
  /** Pengeoppgjøret (#2221), eller null. Tegnes ikke så lenge `SHOW_SETTLEMENT_IN_APP` er av. */
  settlement?: Settlement | null;
  /** Seeren: «Deg» på kortene og i lista, og linja «Du …». */
  viewerUserId?: string | null;
  /** Fullt navn, i lista. */
  nameOf: (userId: string) => string;
  /** Fornavnet, eller fullt navn når to i spillet har samme (#2813). På kortene og i sweep-linja. */
  shortNameOf: (userId: string) => string;
}) {
  const { colors, ui } = useTheme();
  const finished = status === 'finished';
  const board = summarizeNassau(result, { finished, viewerUserId });
  const [active, setActive] = useState<NassauSectionKey>(board.defaultSection);
  const viewerPlays = viewerUserId !== null && result.players.some((p) => p.userId === viewerUserId);
  const sweep = board.sweep;
  const holesDone = board.sections.total18.holesDone;
  const live = status === 'active';
  const ink = colors.onStrongWarm;
  const pill = live
    ? holesDone === 0
      ? BOARD_TEXT.pillLive
      : formatMessage(BOARD_TEXT.pillLiveAfter, { holes: holesDone })
    : null;

  return (
    <View testID="nassau-view">
      {finished ? null : (
        <View style={[styles.hero, { backgroundColor: colors.surfaceStrong }]} testID="nassau-hero">
          <View style={styles.heroKicker}>
            <Text style={[styles.kicker, styles.grow, { color: withAlpha(ink, 0.8) }]} numberOfLines={1}>
              {nassauBoardCopy.kicker(result.scoring)}
            </Text>
            {pill ? (
              <View style={[styles.pill, { borderColor: withAlpha(ink, 0.35) }]} testID="nassau-pill">
                <View style={[styles.dot, { backgroundColor: colors.live }]} />
                <Text style={[styles.pillText, { color: ink }]}>{pill}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.title, { color: ink }]} accessibilityRole="header">
            {NASSAU_BOARD_TEXT.title}
          </Text>
          <Text style={[styles.subtitle, { color: withAlpha(ink, 0.85) }]}>{NASSAU_BOARD_TEXT.subtitle}</Text>
        </View>
      )}

      <View
        style={[styles.tabs, finished ? null : styles.tabsAfterHero]}
        accessibilityRole="tablist"
        accessibilityLabel={NASSAU_BOARD_TEXT.tablistLabel}
      >
        {NASSAU_SECTION_KEYS.map((key) => (
          <Card
            key={key}
            sectionKey={key}
            card={board.sections[key]}
            selected={key === active}
            viewerUserId={viewerUserId}
            shortNameOf={shortNameOf}
            onPress={() => setActive(key)}
          />
        ))}
      </View>

      {sweep ? (
        <View
          style={[
            styles.sweep,
            { backgroundColor: colors.warningSoft, borderColor: withAlpha(colors.warning, 0.4) },
          ]}
          testID="nassau-sweep-line"
        >
          <Text style={[styles.sweepText, { color: colors.text }]}>
            <Text style={styles.semibold}>
              {sweep.userId === viewerUserId
                ? NASSAU_BOARD_TEXT.sweepSelf
                : nassauBoardCopy.sweepOther(shortNameOf(sweep.userId))}
            </Text>
            {/* Den som ser på uten å spille, får bare første setning. */}
            {viewerPlays && sweep.userId !== viewerUserId
              ? ` ${nassauBoardCopy.stopSweep(sweep.openSection)}`
              : ''}
          </Text>
        </View>
      ) : null}

      <Panel
        sectionKey={active}
        summary={board.sections[active]}
        result={result}
        viewerUserId={viewerUserId}
        nameOf={nameOf}
        shortNameOf={shortNameOf}
      />

      <Text style={[styles.hint, { color: colors.primary }]}>{NASSAU_BOARD_TEXT.tapHint}</Text>
      {settlement ? <SettlementCard settlement={settlement} nameOf={nameOf} /> : null}
      {/* Et ferdig spill har ikke hodet med kickeren; scoringen står her i stedet. */}
      {finished ? (
        <Text style={ui.muted} testID="nassau-scoring">
          {result.scoring === 'net' ? 'Spilles på netto.' : 'Spilles på brutto.'}
        </Text>
      ) : null}
    </View>
  );
}

function Card({
  sectionKey,
  card,
  selected,
  viewerUserId,
  shortNameOf,
  onPress,
}: {
  sectionKey: NassauSectionKey;
  card: NassauCardSummary;
  selected: boolean;
  viewerUserId: string | null;
  shortNameOf: (userId: string) => string;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const sole = card.leaderUserIds.length === 1 ? card.leaderUserIds[0] : null;
  const decided = card.state === 'decided';
  const status = decided
    ? NASSAU_BOARD_TEXT.stateDecided
    : card.state === 'live'
      ? nassauBoardCopy.stateLive(card.holesDone, card.holesTotal)
      : NASSAU_BOARD_TEXT.stateWaiting;
  const leaderName =
    card.state === 'waiting'
      ? null
      : sole !== null
        ? sole === viewerUserId
          ? NASSAU_BOARD_TEXT.you
          : shortNameOf(sole)
        : card.leaderUserIds.length > 1
          ? decided
            ? NASSAU_BOARD_TEXT.pushed
            : NASSAU_BOARD_TEXT.tiedLead
          : NASSAU_BOARD_TEXT.noWinner;
  const score = card.leaderHeadline?.text ?? null;
  const viewer = viewerLineOf(card, viewerUserId);
  const kicker = NASSAU_CARD_KICKER[sectionKey];
  // Skjermleseren får kortet som én setning; medaljongen, ringen og «·» leses ikke.
  const spoken = [kicker, status, leaderName, score, viewer?.sr].filter(Boolean).join(', ');
  const divider = selected
    ? scheme === 'dark'
      ? withAlpha(colors.primary, 0.4)
      : withAlpha(colors.successText, 0.3)
    : colors.divider;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={spoken}
      style={[
        styles.card,
        selected
          ? {
              backgroundColor: colors.primarySoft,
              borderColor: scheme === 'dark' ? colors.primary : withAlpha(colors.successText, 0.3),
            }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      testID={`nassau-card-${sectionKey}`}
    >
      <Text style={[styles.cardKicker, { color: colors.muted }]} numberOfLines={1}>
        {kicker}
      </Text>
      <Text
        style={[styles.cardStatus, { color: decided ? colors.successText : colors.muted }]}
        numberOfLines={1}
      >
        {status}
      </Text>
      {leaderName !== null ? (
        <View style={styles.leader}>
          {sole !== null ? <LeaderMark decided={decided} /> : null}
          <Text style={[styles.leaderName, styles.grow, { color: colors.text }]} numberOfLines={1}>
            {leaderName}
          </Text>
        </View>
      ) : null}
      {score !== null ? <Text style={[styles.score, { color: colors.text }]}>{score}</Text> : null}
      {viewer ? (
        <Text
          style={[
            styles.viewer,
            { borderTopColor: divider, color: viewer.strong ? colors.primary : colors.muted },
            viewer.strong && styles.semibold,
          ]}
          testID={`nassau-card-${sectionKey}-you`}
        >
          {viewer.text}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Gullskiva med «1» når kampen er avgjort, ringen med «1» mens den pågår. */
function LeaderMark({ decided }: { decided: boolean }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        decided
          ? { backgroundColor: colors.accent }
          : { borderWidth: 1, borderColor: colors.primary },
      ]}
      testID={decided ? 'nassau-mark-decided' : 'nassau-mark-live'}
    >
      <Text
        style={[
          styles.markText,
          { color: decided ? (scheme === 'dark' ? colors.onAccent : colors.text) : colors.text },
        ]}
      >
        1
      </Text>
    </View>
  );
}

function Panel({
  sectionKey,
  summary,
  result,
  viewerUserId,
  nameOf,
  shortNameOf,
}: {
  sectionKey: NassauSectionKey;
  summary: NassauCardSummary;
  result: NassauResult;
  viewerUserId: string | null;
  nameOf: (userId: string) => string;
  shortNameOf: (userId: string) => string;
}) {
  const { colors } = useTheme();
  const section = result.sections[sectionKey];
  const decided = summary.state === 'decided';
  const winnerUserIds = decided ? summary.leaderUserIds : [];
  const unit = headlineUnit(result.ranking) === 'toPar' ? 'toPar' : result.scoring;
  const testId = `nassau-section-${sectionKey}`;

  return (
    <View accessibilityRole="none" testID={testId}>
      <View style={styles.panelHead}>
        <View style={[styles.panelTitle, styles.grow]}>
          <Text style={[styles.panelHeading, { color: colors.muted }]} accessibilityRole="header">
            {nassauBoardCopy.panelHeading(sectionKey)}
          </Text>
          {winnerUserIds.length > 1 ? (
            <View
              style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}
              testID={`${testId}-push`}
            >
              <Text style={[styles.chipText, { color: colors.muted }]}>{NASSAU_TEXT.sectionTied}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.panelUnit, { color: colors.muted }]}>{nassauBoardCopy.listUnit(unit)}</Text>
      </View>

      {summary.state === 'waiting' ? (
        <View
          style={[styles.waiting, { borderColor: colors.border, backgroundColor: colors.surface }]}
          testID={`${testId}-pending`}
        >
          <Text style={[styles.waitingTitle, { color: colors.text }]}>{NASSAU_TEXT.sectionsPending}</Text>
          <Text style={[styles.waitingNote, { color: colors.muted }]}>{NASSAU_TEXT.sectionsPendingNote}</Text>
        </View>
      ) : (
        <View
          style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}
          testID={`${testId}-list`}
        >
          {section.players.map((line, i) => {
            const isViewer = line.userId === viewerUserId;
            const displayName = isViewer ? NASSAU_BOARD_TEXT.you : nameOf(line.userId);
            const tied = line.tiedWith.length > 0;
            const isWinner = winnerUserIds.length === 1 && winnerUserIds[0] === line.userId;
            // Medaljer bare i en avgjort kamp; en kamp som pågår har vanlige plasser.
            const medal = decided && !tied && line.rank >= 1 && line.rank <= 3;
            const score = teamHeadline(result.ranking, {
              total: line.totalEffectiveStrokes,
              toPar: line.toPar,
            }).text;
            const holes = nassauBoardCopy.rowHoles(line.holesPlayed);
            const placeText = tied ? formatMessage(BOARD_TEXT.tiedRank, { rank: line.rank }) : String(line.rank);
            const spokenPlace = formatMessage(tied ? BOARD_TEXT.srTiedPlace : BOARD_TEXT.srPlace, {
              rank: line.rank,
            });
            return (
              <ReactableRow
                key={line.userId}
                target={{ userId: line.userId, name: shortNameOf(line.userId) }}
                style={[
                  styles.row,
                  i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
                  isWinner
                    ? { backgroundColor: withAlpha(colors.accent, 0.1) }
                    : isViewer
                      ? { backgroundColor: colors.primarySoft }
                      : null,
                ]}
                plainAccessible
                label={`${spokenPlace}, ${displayName}, ${holes}, ${score}`}
                testID={`nassau-row-${line.userId}`}
              >
                <View style={styles.place}>
                  {medal ? (
                    line.rank === 1 ? (
                      <GoldDisc rank={line.rank} />
                    ) : (
                      <Medal
                        rank={line.rank as 2 | 3}
                        size={28}
                        label={String(line.rank)}
                        labelStyle={styles.placeMedal}
                      />
                    )
                  ) : (
                    <Text style={[styles.placeText, { color: colors.text }]}>{placeText}</Text>
                  )}
                </View>
                <View style={[styles.nameCell, styles.grow]}>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <ReactionPlate userId={line.userId} />
                </View>
                <Text style={[styles.rowHoles, { color: colors.muted }]}>{holes}</Text>
                <Text style={[styles.rowScore, { color: colors.text }]}>{score}</Text>
              </ReactableRow>
            );
          })}
        </View>
      )}
    </View>
  );
}

function GoldDisc({ rank }: { rank: number }) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.gold, { backgroundColor: colors.accent }]} testID="nassau-row-gold">
      <Text style={[styles.placeMedal, { color: scheme === 'dark' ? colors.onAccent : colors.text }]}>{rank}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  semibold: { fontFamily: FONTS.sansSemiBold },
  hero: { borderRadius: 16, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 20 },
  heroKicker: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  kicker: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  title: { ...fraunces(500, 28, 31), marginTop: 4 },
  subtitle: { ...interLine(13, 16), fontFamily: FONTS.sans, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8 },
  tabsAfterHero: { marginTop: 14 },
  card: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  cardKicker: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  cardStatus: { ...interLine(11, 14), fontFamily: FONTS.sansSemiBold },
  leader: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  leaderName: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  mark: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  markText: { ...fraunces(600, 11, 13) },
  score: { ...fraunces(600, 22, 26), fontVariant: ['tabular-nums'] },
  viewer: { ...interLine(11, 14), fontFamily: FONTS.sans, borderTopWidth: 1, paddingTop: 6 },
  sweep: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12 },
  sweepText: { ...interLine(13, 17), fontFamily: FONTS.sans },
  panelHead: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingTop: 16, paddingBottom: 8, paddingHorizontal: 4 },
  panelTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  panelHeading: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  panelUnit: { ...interLine(12, 15), fontFamily: FONTS.sans },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { ...interLine(11, 14), fontFamily: FONTS.sansSemiBold },
  waiting: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  waitingTitle: { ...fraunces(500, 15, 19), textAlign: 'center' },
  waitingNote: { ...interLine(12, 15), fontFamily: FONTS.sans, textAlign: 'center', marginTop: 4 },
  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 10, paddingHorizontal: 14 },
  place: { width: 28, alignItems: 'center' },
  placeText: { ...fraunces(600, 15, 18), fontVariant: ['tabular-nums'] },
  placeMedal: { ...fraunces(600, 13, 16), fontVariant: ['tabular-nums'] },
  gold: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold, flexShrink: 1 },
  rowHoles: { ...interLine(12, 15), fontFamily: FONTS.sans, width: 60, textAlign: 'right' },
  rowScore: { ...fraunces(600, 18, 22), width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
  hint: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold, paddingHorizontal: 4, paddingTop: 10 },
});
