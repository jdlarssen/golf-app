// #2255 PR 3b: «Hull for hull» for Wolf, som på nettsiden.
//
// Ren presentasjon av `WolfHoleCards` (`lib/leaderboard/wolfHoles.ts`), den
// samme modellen webbens `WolfHolesView` tegner: ett kort per hull med
// innsatsen, hvem som var ulv, valget og utfallet, og så hver spiller med
// side, score og poeng. Ulvens side står først, i en svak gulltone som på
// webben (`border-accent/30 bg-accent/[0.05]`).
import { StyleSheet, Text, View } from 'react-native';
import type { WolfHoleCard, WolfHoleCards } from '../../../../../lib/leaderboard/wolfHoles';
import type { BundlePlayer } from '../../data/gameBundle';
import {
  HOLES_TEXT,
  WOLF_HOLES_TEXT,
  wolfBruttoLabel,
  wolfChoicePartner,
} from '../../lib/holesCopy';
import { FONTS, useTheme, type ThemeColors } from '../../theme';
import { HoleHeader, HolesTitle, goldEdge, goldWash, holesStyles, nameOf } from './holesShared';

/** Utfallets farge, som webbens `wolfOutcomeClass`. */
function outcomeColor(outcome: WolfHoleCard['outcome'], colors: ThemeColors): string {
  if (outcome === 'wolf_side_wins') return colors.accentText;
  if (outcome === 'opp_side_wins') return colors.text;
  return colors.muted;
}

function choiceText(hole: WolfHoleCard, players: readonly BundlePlayer[]): string {
  if (hole.choiceKey === 'choicePartner') {
    // Webben: kjent partner med navn, ukjent id som «?».
    const partner = hole.partnerUserId ? nameOf(players, hole.partnerUserId, '?') : '?';
    return wolfChoicePartner(partner);
  }
  return WOLF_HOLES_TEXT[hole.choiceKey];
}

export function WolfHoleCardsView({
  cards,
  subtitle,
  players,
}: {
  cards: WolfHoleCards;
  subtitle: string;
  players: readonly BundlePlayer[];
}) {
  return (
    <View style={holesStyles.page} testID="hole-by-hole">
      <HolesTitle subtitle={subtitle} />
      {cards.holes.map((hole) => (
        <WolfHoleCardView key={hole.holeNumber} hole={hole} players={players} />
      ))}
    </View>
  );
}

function WolfHoleCardView({ hole, players }: { hole: WolfHoleCard; players: readonly BundlePlayer[] }) {
  const { colors, ui } = useTheme();
  return (
    <View style={ui.card} testID={`hole-by-hole-card-${hole.holeNumber}`}>
      <HoleHeader
        holeNumber={hole.holeNumber}
        par={hole.par}
        strokeIndex={hole.strokeIndex}
        right={
          hole.stake != null ? (
            <View
              style={[
                styles.stake,
                { borderColor: goldEdge(colors.accent), backgroundColor: goldWash(colors.accent, '14') },
              ]}
              testID={`hole-by-hole-stake-${hole.holeNumber}`}
            >
              <Text style={[styles.stakeText, ui.num, { color: colors.accentText }]}>{`${hole.stake}x`}</Text>
            </View>
          ) : null
        }
      />

      <View style={styles.wolfLine} testID={`hole-by-hole-wolf-${hole.holeNumber}`}>
        <Text style={[holesStyles.small, { color: colors.muted }]}>
          {WOLF_HOLES_TEXT.wolfLabel}{' '}
          <Text style={{ color: colors.text }}>{nameOf(players, hole.wolfUserId, HOLES_TEXT.unknownPlayer)}</Text>
        </Text>
        <Text style={[holesStyles.small, styles.dot, { color: colors.muted }]} accessibilityElementsHidden>
          ·
        </Text>
        <Text style={[holesStyles.small, { color: colors.text }]}>{choiceText(hole, players)}</Text>
        <Text style={[holesStyles.small, styles.dot, { color: colors.muted }]} accessibilityElementsHidden>
          ·
        </Text>
        <Text style={[holesStyles.small, holesStyles.medium, { color: outcomeColor(hole.outcome, colors) }]}>
          {WOLF_HOLES_TEXT[hole.outcomeKey]}
        </Text>
      </View>

      {hole.rows.map((row) => {
        const onWolfSide = row.side === 'wolf';
        return (
          <View
            key={row.userId}
            style={[
              holesStyles.row,
              onWolfSide
                ? { borderColor: goldEdge(colors.accent, '4D'), backgroundColor: goldWash(colors.accent, '0D') }
                : { borderColor: 'transparent' },
            ]}
            testID={`hole-by-hole-row-${hole.holeNumber}-${row.userId}`}
          >
            <View style={holesStyles.rowName}>
              {row.isContributor ? (
                <Text
                  style={[holesStyles.star, { color: onWolfSide ? colors.accentText : colors.muted }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                >
                  ★
                </Text>
              ) : null}
              <Text style={[ui.body, holesStyles.shrink]} numberOfLines={1}>
                {nameOf(players, row.userId, HOLES_TEXT.unknownPlayerFull)}
              </Text>
              {row.side != null ? (
                <Text style={[styles.side, { color: colors.muted }]}>
                  {onWolfSide ? WOLF_HOLES_TEXT.wolfSide : WOLF_HOLES_TEXT.andreSide}
                </Text>
              ) : null}
            </View>
            <View style={holesStyles.rowRight}>
              {row.points > 0 ? (
                <Text style={[styles.points, ui.num, { color: colors.accentText }]}>{`+${row.points}`}</Text>
              ) : null}
              {row.grossShown != null ? (
                <Text style={[styles.gross, ui.num, { color: colors.muted }]}>{wolfBruttoLabel(row.grossShown)}</Text>
              ) : null}
              <Text style={[holesStyles.value, ui.num, { color: colors.text }]}>
                {row.effectiveScore ?? '–'}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stake: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  stakeText: { fontSize: 11, fontFamily: FONTS.sansSemiBold, letterSpacing: 1.3, textTransform: 'uppercase' },
  wolfLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, rowGap: 4 },
  dot: { opacity: 0.4 },
  side: { fontSize: 11, fontFamily: FONTS.sans, letterSpacing: 1.1, textTransform: 'uppercase', flexShrink: 0 },
  points: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  gross: { fontSize: 11, fontFamily: FONTS.sans },
});
