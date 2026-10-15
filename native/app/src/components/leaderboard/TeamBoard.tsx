// #2579 PR 2: lagtavla, etter designlerretet (`Lagtavle-forslag` live,
// `Lagtavle-ferdig-forslag-lys`/`-natt` ferdig, `Lagtavle-bestball-forslag-*`
// best ball i første halvdel).
//
// Ett kort per lag: plassen, «Lag N» med navnelinja (lederen live har
// avatarene i stedet), prikkene og summen. Under kortene står låskortet
// (best ball) og «Ditt lag på hull N». Alle tall og tekster kommer ferdige fra
// `teamBoardFor` (`lib/teamBoard.ts`); her tegnes de.
//
// Stripa nederst («Laget ditt») er en egen komponent fordi skjermen legger den
// fast over innholdet, utenfor rullingen, i full bredde.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TeamHoleTone } from '../../../../../lib/leaderboard/teamLiveBoard';
import { BOARD_TEAM_TEXT } from '../../lib/boardCopy';
import type { TeamBoardModel, TeamBoardRow, TeamBoardStrip, TeamHoleCard } from '../../lib/teamBoard';
import {
  FONTS,
  TAP,
  boardRing,
  fraunces,
  frauncesNormalLine,
  interLine,
  teamLiveRing,
  useTheme,
  withAlpha,
  type ThemeColors,
} from '../../theme';
import { HatchBar, TavleLaasIcon } from '../icons/Icons';
import { withSystemArrows } from '../SystemArrow';

/** Plass-kolonnen i tegningen. */
const PLACE_W = 34;

export function TeamBoard({ model }: { model: TeamBoardModel }) {
  const { colors } = useTheme();
  return (
    <View testID="team-board">
      {model.halves ? (
        <View style={styles.halves} testID="team-board-halves">
          <Text style={[styles.halfText, { color: colors.muted }]}>{model.halves.shown}</Text>
          <View style={styles.hidden}>
            <TavleLaasIcon color={colors.muted} size={12} strokeWidth={2} />
            <Text style={[styles.halfText, { color: colors.muted }]}>{model.halves.hidden}</Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.cards, model.halves && styles.cardsUnderHalves]} testID="leaderboard-table">
        {model.rows.map((row) => (
          <TeamCard key={row.teamNumber} row={row} variant={model.variant} />
        ))}
      </View>

      {model.lock ? (
        <View
          style={[styles.card, styles.lock, { backgroundColor: colors.surface, borderColor: colors.border }]}
          testID="leaderboard-first-half-locked"
        >
          <View style={[styles.lockBadge, { backgroundColor: colors.trackBg }]}>
            <TavleLaasIcon color={colors.primary} size={16} strokeWidth={2} />
          </View>
          <View style={styles.shrink}>
            <Text style={[styles.lockHeading, { color: colors.text }]}>{model.lock.heading}</Text>
            <Text style={[styles.lockSub, { color: colors.muted }]}>{model.lock.sub}</Text>
          </View>
        </View>
      ) : null}

      {model.holeCard ? <HoleCard card={model.holeCard} /> : null}
    </View>
  );
}

function TeamCard({ row, variant }: { row: TeamBoardRow; variant: TeamBoardModel['variant'] }) {
  const { colors, scheme } = useTheme();
  const finished = variant === 'finished';
  const winner = finished && row.leader;
  const fill = winner ? colors.leaderFill : row.you ? colors.youFill : colors.surface;
  const ring = row.leader
    ? winner
      ? `inset 0 0 0 1.5px ${boardRing(colors, scheme)}`
      : `inset 0 0 0 1px ${teamLiveRing(colors, scheme)}`
    : undefined;
  // Små tekster på ditt lag og vinneren er `text` i natt: `muted` er for svak
  // mot `youFill` og `leaderFill` der.
  const small = (row.you || winner) && scheme === 'dark' ? colors.text : colors.muted;
  // Bare `Lagtavle-forslag` (live) tegner tallene uten faste sifre.
  const num = variant === 'live' ? null : styles.tabular;
  const smallText = { color: small };
  const avatars = row.leader && !finished;

  return (
    <View
      style={[
        styles.card,
        styles.teamCard,
        winner && styles.winnerCard,
        {
          backgroundColor: fill,
          borderColor: row.you && !winner ? colors.youBorder : colors.border,
          boxShadow: ring,
        },
      ]}
      // Hele kortet er ett element for skjermleseren, med plass, sum og hull i
      // én setning.
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

      <View style={styles.shrink}>
        {winner ? (
          <View style={styles.winnerName}>
            <Text style={[styles.winnerWord, { color: colors.accentText }]}>{BOARD_TEAM_TEXT.winnerTeam}</Text>
            <View style={styles.nameLine}>
              <Text style={[styles.winnerTeam, { color: colors.text }]}>{row.name}</Text>
              {row.you ? <YouTag colors={colors} /> : null}
            </View>
            <Text style={[styles.members, styles.flush, smallText]}>{row.members}</Text>
          </View>
        ) : (
          <>
            <View style={styles.nameLine}>
              <Text style={[styles.name, { color: colors.text }]}>{row.name}</Text>
              {avatars ? <Avatars initials={row.initials} fill={fill} colors={colors} /> : null}
              {/* Best ball: lederen har navnelinja på samme linje som avatarene. */}
              {avatars && variant === 'first-half' ? (
                <Text style={[styles.members, styles.flush, styles.shrink, smallText]} numberOfLines={1}>
                  {row.members}
                </Text>
              ) : null}
              {row.you ? <YouTag colors={colors} /> : null}
            </View>
            {avatars ? null : (
              <Text style={[styles.members, smallText]} testID="team-members">
                {row.members}
              </Text>
            )}
            {row.note ? (
              <Text style={[styles.note, smallText]} testID="board-tie-note">
                {row.note}
              </Text>
            ) : null}
            {row.dots ? (
              <Dots
                dots={row.dots}
                hatched={variant === 'first-half'}
                note={row.holesNote}
                movement={row.movement}
                small={small}
                colors={colors}
              />
            ) : null}
          </>
        )}
      </View>

      <View style={styles.totalCol}>
        <Text
          testID={`team-row-${row.teamNumber}-total`}
          style={[
            winner ? styles.totalWinner : styles.total,
            { color: row.leader ? colors.accentText : colors.text },
            num,
          ]}
        >
          {row.total}
        </Text>
        <Text style={[styles.under, smallText, num]} testID={`team-row-${row.teamNumber}-under`}>
          {row.under}
        </Text>
      </View>
    </View>
  );
}

function YouTag({ colors }: { colors: ThemeColors }) {
  return (
    <Text style={[styles.you, { color: colors.primary }]} testID="team-you">
      {BOARD_TEAM_TEXT.yourTeam}
    </Text>
  );
}

/** Initialene, 5 pt over hverandre, med en ring i kortets farge rundt hver. */
function Avatars({ initials, fill, colors }: { initials: string[]; fill: string; colors: ThemeColors }) {
  return (
    <View style={styles.avatars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {initials.map((text, index) => (
        <View
          key={index}
          style={[
            styles.avatar,
            index > 0 && styles.avatarOverlap,
            { backgroundColor: colors.youFill, boxShadow: `0 0 0 2px ${fill}` },
          ]}
          testID="team-avatar"
        >
          <Text style={[styles.avatarText, { color: colors.avatarInk }]}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Prikkene for hullene: live de siste fem med «hull 11 · ▲ 1» etter, best
 * ball hull 1–9 (et uspilt hull er en ring) og den skraverte staven for resten.
 */
function Dots({
  dots,
  hatched,
  note,
  movement,
  small,
  colors,
}: {
  dots: TeamHoleTone[];
  hatched: boolean;
  note: string | null;
  movement: number | null;
  small: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {dots.map((tone, index) =>
        tone === 'unset' ? (
          <View key={index} style={[styles.dot, styles.dotUnset, { borderColor: colors.scoreUnsetFg }]} testID="board-dot" />
        ) : (
          <View key={index} style={[styles.dot, { backgroundColor: dotColor(colors, tone) }]} testID="board-dot" />
        ),
      )}
      {hatched ? (
        <HatchBar track={colors.trackBg} hatch={colors.boardHatch} style={styles.hatch} testID="team-hatch" />
      ) : null}
      {note ? (
        <Text style={[styles.holesNote, { color: small }]}>
          {note}
          {movement ? (
            <>
              {' · '}
              <Text style={styles.glyph}>{movement > 0 ? '▲' : '▼'}</Text>
              {` ${Math.abs(movement)}`}
            </>
          ) : null}
        </Text>
      ) : null}
    </View>
  );
}

function dotColor(colors: ThemeColors, tone: Exclude<TeamHoleTone, 'unset'>): string {
  return tone === 'under'
    ? colors.formUp
    : tone === 'over1'
      ? colors.dotOver
      : tone === 'over2'
        ? colors.danger
        : colors.scoreUnsetFg;
}

/** «Ditt lag på hull 8» med det som skjedde der. */
function HoleCard({ card }: { card: TeamHoleCard }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, styles.holeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="team-hole-card"
    >
      <Text style={[styles.holeHeading, { color: colors.muted }]}>{card.heading}</Text>
      <Text style={[styles.holeText, { color: colors.text }]}>
        {card.lead ? (
          <>
            {card.lead.before}
            <Text style={styles.bold}>{card.lead.names}</Text>
            {card.lead.after}
            {' · '}
          </>
        ) : null}
        {card.score}
      </Text>
    </View>
  );
}

/**
 * Stripa nederst i full bredde: «Laget ditt» med plassen stort og avstanden
 * eller hullene etter, og knappen. Skjermen legger den fast mot bunnen;
 * `bottomInset` er den sikre sonen under de 20 pt tegningen har.
 */
export function TeamStrip({
  strip,
  tabular,
  bottomInset,
  onAction,
  onLayout,
}: {
  strip: TeamBoardStrip;
  /** Faste sifre, som i den ferdige tavla og best ball (ikke `Lagtavle-forslag`). */
  tabular: boolean;
  bottomInset: number;
  onAction: () => void;
  onLayout?: (height: number) => void;
}) {
  const { colors } = useTheme();
  const ink = colors.onStrongWarm;
  return (
    <View
      style={[styles.strip, { backgroundColor: colors.surfaceStrong, paddingBottom: 20 + bottomInset }]}
      onLayout={(event) => onLayout?.(event.nativeEvent.layout.height)}
      testID="board-strip"
    >
      <View style={styles.shrink}>
        <Text style={[styles.stripKicker, { color: withAlpha(ink, 0.8) }]}>{strip.kicker}</Text>
        <Text style={[styles.stripLine, { color: ink }, tabular && styles.tabular]} numberOfLines={1}>
          <Text style={styles.stripPlace}>{strip.place}</Text>
          {strip.detail ? ` · ${strip.detail}` : null}
        </Text>
      </View>
      {strip.action ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={[styles.stripButton, { backgroundColor: ink }]}
          testID="board-strip-action"
        >
          <Text style={[styles.stripButtonText, { color: colors.surfaceStrong }]}>
            {withSystemArrows(strip.action.label, '600')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shrink: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  bold: { fontFamily: FONTS.sansSemiBold },
  // «HULL 1–9» og «HULL 10–18 ER SKJULT»: 16 pt fra sidene, 8 pt over kortene.
  halves: {
    marginTop: 12,
    marginHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hidden: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  halfText: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  cards: { marginTop: 12, marginHorizontal: 12, gap: 8 },
  cardsUnderHalves: { marginTop: 8 },
  card: { borderRadius: 16, borderWidth: 1 },
  teamCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  winnerCard: { paddingVertical: 12 },
  placeCol: { width: PLACE_W },
  place: { ...fraunces(600, 18), textAlign: 'center' },
  disc: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  discText: { ...fraunces(600, 15) },
  discWinner: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  discWinnerText: { ...fraunces(600, 16) },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  you: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  members: { ...interLine(12, 15), fontFamily: FONTS.sans, marginTop: 2 + interLine(12, 15).marginTop },
  flush: { marginTop: interLine(12, 15).marginTop },
  note: { ...interLine(11, 14), fontFamily: FONTS.sans, marginTop: 3 + interLine(11, 14).marginTop },
  // Vinneren: «VINNERLAGET», lagnavnet og navnelinja med 3 pt mellom.
  winnerName: { gap: 3 },
  winnerWord: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  winnerTeam: { ...fraunces(600, 18) },
  avatars: { flexDirection: 'row' },
  avatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  avatarOverlap: { marginLeft: -5 },
  avatarText: { ...interLine(9, 11), fontFamily: FONTS.sansSemiBold },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  dotUnset: { borderWidth: 1.5 },
  hatch: { flexGrow: 1, minWidth: 40, height: 9, marginLeft: 4 },
  holesNote: { ...interLine(11, 14), fontFamily: FONTS.sans, marginLeft: 4 },
  glyph: { fontFamily: FONTS.system, fontWeight: '600' },
  totalCol: { alignItems: 'flex-end' },
  total: { ...fraunces(600, 24) },
  totalWinner: { ...fraunces(600, 28) },
  under: { ...interLine(11, 14), fontFamily: FONTS.sans },
  // Kortene under lagene: 16 pt fra sidene, 12 over.
  lock: {
    marginTop: 12,
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  lockBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  lockHeading: { ...fraunces(600, 17) },
  lockSub: { ...interLine(13, 13 * 1.35), fontFamily: FONTS.sans, marginTop: 2 + interLine(13, 13 * 1.35).marginTop },
  holeCard: { marginTop: 12, marginHorizontal: 16, paddingVertical: 12, paddingHorizontal: 14 },
  holeHeading: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  holeText: { ...interLine(14, 17), fontFamily: FONTS.sans, marginTop: 6 + interLine(14, 17).marginTop },
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  stripKicker: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  // Linja er like høy som det store tallet i Fraunces 18; resten står i Inter 14.
  stripLine: { ...interLine(14, frauncesNormalLine(18)), fontFamily: FONTS.sans },
  stripPlace: { fontFamily: fraunces(600, 18).fontFamily, fontSize: 18 },
  stripButton: {
    height: TAP,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripButtonText: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
});
