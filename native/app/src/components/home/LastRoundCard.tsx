// #2254: «Forrige runde» — én rad med medaljong, spillnavn, plass og brutto.
//
// Plassen er den som ble lagret da runden ble avsluttet
// (`game_players.result_summary`), og teksten og gull-regelen er webbens:
// `finishedResultBadge` avgjør både ordlyden og om du vant. Gull brukes bare når
// du vant. Brutto er webbens «Runder»-tall (`computeRoundScore`), og står bare
// når tallet hører til nettopp denne runden.
//
// #2385 la raden på designlerretet (`Hjem-forslag`): 36 pt medaljong, navnet i
// 15 pt og en pil til høyre som sier at raden kan trykkes.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { finishedResultBadge } from '../../../../../lib/games/finishedResultBadge';
import type { HomeCard, LastRoundScore } from '../../data/homeList';
import { HOME_TEXT, bruttoText, finishedResultText } from '../../lib/homeCopy';
import { FONTS, TAP, useTheme } from '../../theme';
import { PokalIcon } from '../icons/Icons';

/** Tallet i medaljongen, eller `null` når runden ikke har en plass (matchplay). */
function medalRank(card: HomeCard): number | null {
  const summary = card.resultSummary;
  if (!summary || summary.kind === 'matchplay') return null;
  return summary.rank;
}

export function LastRoundCard({
  card,
  score,
  onPress,
}: {
  card: HomeCard;
  /** Brutto for forrige runde; tas bare med når `gameId` er dette spillet. */
  score: LastRoundScore | null;
  onPress: () => void;
}) {
  const { colors, ui } = useTheme();
  const badge = card.resultSummary ? finishedResultBadge(card.resultSummary) : null;
  const win = badge?.isWin ?? false;
  const rank = win ? 1 : medalRank(card);
  const own = score && score.gameId === card.gameId ? score : null;

  const parts = [
    badge ? finishedResultText(badge) : null,
    own?.teamBall ? HOME_TEXT.teamRound : null,
    own && !own.teamBall && own.brutto != null ? bruttoText(own.brutto) : null,
  ].filter((part): part is string => part != null);
  const line = parts.join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // Komma, ikke «·»: VoiceOver leser midtpunktet høyt.
      accessibilityLabel={[card.name, parts.join(', ')].filter(Boolean).join('. ')}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`home-last-round-${card.gameId}`}
    >
      <View
        style={[
          styles.medal,
          win
            ? { backgroundColor: colors.accent, borderColor: colors.accent }
            : { backgroundColor: colors.bg, borderColor: colors.border },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={win ? 'home-last-round-gold' : 'home-last-round-medal'}
      >
        {rank !== null ? (
          <Text
            style={[styles.medalText, { color: win ? colors.onAccent : colors.text }]}
          >
            {rank}
          </Text>
        ) : (
          <PokalIcon color={colors.muted} size={20} />
        )}
      </View>
      <View style={styles.text}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
          {card.name}
        </Text>
        {line ? (
          <Text
            style={[styles.line, ui.num, { color: colors.muted }]}
            testID={`home-last-round-line-${card.gameId}`}
          >
            {line}
          </Text>
        ) : null}
      </View>
      <Text
        style={[styles.arrow, { color: colors.primary }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="home-last-round-arrow"
      >
        →
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
    minHeight: Math.max(TAP, 64),
  },
  medal: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: { fontSize: 16, fontFamily: FONTS.serifScore, fontVariant: ['tabular-nums'] },
  text: { flex: 1 },
  name: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  line: { fontSize: 12, fontFamily: FONTS.sans },
  arrow: { fontSize: 18, fontFamily: FONTS.sans },
});
