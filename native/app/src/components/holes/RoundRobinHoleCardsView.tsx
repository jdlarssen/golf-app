// #2255 PR 3c: «Hull for hull» for Round Robin, som på nettsiden.
//
// Ren presentasjon av `RoundRobinHoleCards` (`lib/leaderboard/roundRobinHoles.ts`),
// den samme modellen webbens `RoundRobinHolesView` tegner: tre segmenter, hvert
// med hull-spennet og hvem som er partnere («A + B vs C + D»), og så ett kort
// per hull med begge sidene. Siden som vant hullet står i gull som på webben:
// kant og tone (`border-accent/40 bg-accent/[0.06]`), «Vant hullet» og gull
// score. Stjerna ved sidens beste og «vs» er dekor, skjult for skjermleseren
// som webbens `aria-hidden`.
import { StyleSheet, Text, View } from 'react-native';
import type {
  RoundRobinHoleCard,
  RoundRobinHoleCards,
  RoundRobinHoleSide,
  RoundRobinSegment,
} from '../../../../../lib/leaderboard/roundRobinHoles';
import type { BundlePlayer } from '../../data/gameBundle';
import {
  HOLES_TEXT,
  ROUND_ROBIN_HOLES_TEXT,
  roundRobinBruttoLabel,
  roundRobinSegmentLabel,
  roundRobinSideNames,
} from '../../lib/holesCopy';
import { FONTS, useTheme } from '../../theme';
import {
  HoleHeader,
  HolesFooter,
  HolesTitle,
  goldEdge,
  goldWash,
  holesStyles,
  nameOf,
} from './holesShared';

export function RoundRobinHoleCardsView({
  cards,
  subtitle,
  players,
  finished,
}: {
  cards: RoundRobinHoleCards;
  subtitle: string;
  players: readonly BundlePlayer[];
  /** Runden er ferdig: bunnteksten sier «Vel spilt!». */
  finished: boolean;
}) {
  return (
    <View style={holesStyles.page} testID="hole-by-hole">
      <HolesTitle subtitle={subtitle} />
      {cards.segments.map((segment) => (
        <SegmentView key={segment.segment} segment={segment} players={players} />
      ))}
      <HolesFooter finished={finished} />
    </View>
  );
}

function SegmentView({ segment, players }: { segment: RoundRobinSegment; players: readonly BundlePlayer[] }) {
  const { colors, ui } = useTheme();
  // Webben: ukjent spiller som «(ukjent)», både her og i radene.
  const sideNames = (ids: readonly string[]) =>
    roundRobinSideNames(ids.map((id) => nameOf(players, id, HOLES_TEXT.unknownPlayer)));
  return (
    <View style={styles.segment} testID={`hole-by-hole-segment-${segment.segment}`}>
      <View style={styles.constellation}>
        {/* Webbens `Kicker` (10 px, 0,2em), samme stil som appens `ui.kicker`. */}
        <Text style={ui.kicker}>
          {roundRobinSegmentLabel(segment.segment, segment.holesKey)}
        </Text>
        <View style={styles.sidesLine}>
          <Text style={[styles.sideNames, { color: colors.text }]}>{sideNames(segment.side1PlayerIds)}</Text>
          <Text
            style={[styles.sideNames, styles.vs, { color: colors.muted }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
            testID={`hole-by-hole-vs-${segment.segment}`}
          >
            {ROUND_ROBIN_HOLES_TEXT.vsLabel}
          </Text>
          <Text style={[styles.sideNames, { color: colors.text }]}>{sideNames(segment.side2PlayerIds)}</Text>
        </View>
      </View>
      {segment.holes.map((hole) => (
        <HoleCardView key={hole.holeNumber} hole={hole} players={players} />
      ))}
    </View>
  );
}

function HoleCardView({ hole, players }: { hole: RoundRobinHoleCard; players: readonly BundlePlayer[] }) {
  const { colors, ui } = useTheme();
  return (
    <View style={ui.card} testID={`hole-by-hole-card-${hole.holeNumber}`}>
      <HoleHeader
        holeNumber={hole.holeNumber}
        par={hole.par}
        strokeIndex={hole.strokeIndex}
        right={
          hole.outcomeKey ? (
            <Text style={[holesStyles.caps, styles.outcome, { color: colors.muted }]} testID={`hole-by-hole-outcome-${hole.holeNumber}`}>
              {ROUND_ROBIN_HOLES_TEXT[hole.outcomeKey]}
            </Text>
          ) : null
        }
      />
      {hole.sides.map((side) => (
        <SideView key={side.side} holeNumber={hole.holeNumber} side={side} players={players} />
      ))}
    </View>
  );
}

function SideView({
  holeNumber,
  side,
  players,
}: {
  holeNumber: number;
  side: RoundRobinHoleSide;
  players: readonly BundlePlayer[];
}) {
  const { colors, ui } = useTheme();
  return (
    <View
      style={[
        styles.side,
        side.isWinner
          ? { borderColor: goldEdge(colors.accent), backgroundColor: goldWash(colors.accent) }
          : { borderColor: 'transparent' },
      ]}
      testID={`hole-by-hole-side-${holeNumber}-${side.side}`}
    >
      {side.isWinner ? (
        <Text style={[holesStyles.kicker, { color: colors.accentText }]}>{ROUND_ROBIN_HOLES_TEXT.vantHulletLabel}</Text>
      ) : null}
      {side.rows.map((row) => (
        <View key={row.userId} style={holesStyles.line} testID={`hole-by-hole-row-${holeNumber}-${row.userId}`}>
          <View style={holesStyles.rowName}>
            {row.isContributor ? (
              <Text
                style={[holesStyles.star, { color: side.isWinner ? colors.accent : colors.muted }]}
                accessibilityElementsHidden
                importantForAccessibility="no"
                testID={`hole-by-hole-star-${holeNumber}-${row.userId}`}
              >
                ★
              </Text>
            ) : null}
            <Text style={[ui.body, holesStyles.shrink, row.isContributor && holesStyles.medium]} numberOfLines={1}>
              {nameOf(players, row.userId, HOLES_TEXT.unknownPlayer)}
            </Text>
          </View>
          <View style={holesStyles.rowRight}>
            {row.grossShown != null ? (
              <Text style={[holesStyles.gross, ui.num, { color: colors.muted }]}>
                {roundRobinBruttoLabel(row.grossShown)}
              </Text>
            ) : null}
            <Text style={[holesStyles.value, ui.num, { color: side.isWinner ? colors.accentText : colors.text }]}>
              {row.net ?? '–'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Webbens `gap-5` mellom segmentene: sidens 14 og 6 til. */
  segment: { gap: 10, paddingTop: 6 },
  constellation: { gap: 4, paddingHorizontal: 4 },
  /** «Delt»/«Venter» i hodet: webbens `text-[10.5px] font-medium`. */
  outcome: { fontSize: 10.5, fontFamily: FONTS.sansMedium },
  sidesLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6 },
  /** Webbens `text-[12.5px]`. */
  sideNames: { fontSize: 13, fontFamily: FONTS.sans },
  vs: { opacity: 0.4 },
  /** Siden på et hull: webbens `rounded-xl px-2.5 py-1.5` med kant bare for vinneren. */
  side: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
});
