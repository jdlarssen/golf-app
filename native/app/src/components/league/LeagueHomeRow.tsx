// #2638 Del 2: én liga i «Ligaene dine» på Hjem (tegning 1a og 1b).
//
// Navnet, den åpne runden med frist («Runde 3 · stenger tor. 23.59») og om du
// har spilt den, med pila til høyre. Samme rad som «Forrige runde»
// (`.lrow`). En liga uten åpen runde viser navnet og «Ingen åpen runde nå»
// uten pille (orkestratorens avgjørelse 25.10); et utkast «Ikke startet ennå».
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppLeagueSummary } from '../../../../../lib/league/appLeagueView';
import { LEAGUE_TEXT, homeRoundLine } from '../../lib/leagueCopy';
import { FONTS, TAP, interLine, useTheme } from '../../theme';
import { withSystemArrows } from '../SystemArrow';
import { PlayedPill } from './LeaguePills';

export function LeagueHomeRow({ league, onPress }: { league: AppLeagueSummary; onPress: () => void }) {
  const { colors } = useTheme();
  const open = league.openRound;
  const line = open
    ? homeRoundLine(open.label, open.closesAt)
    : league.status === 'draft'
      ? LEAGUE_TEXT.homeNotStarted
      : LEAGUE_TEXT.homeNoOpenRound;
  const state = league.delivered ? 'delivered' : league.inProgress ? 'inProgress' : 'notPlayed';
  const stateText =
    state === 'delivered' ? LEAGUE_TEXT.delivered : state === 'inProgress' ? LEAGUE_TEXT.inProgress : LEAGUE_TEXT.notPlayed;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // Pillen er en del av raden for skjermleseren også: navn, runde og om du har spilt.
      accessibilityLabel={[league.name, line, open ? stateText : null].filter(Boolean).join('. ')}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`home-league-${league.id}`}
    >
      <View style={styles.text}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {league.name}
        </Text>
        <Text style={[styles.line, { color: colors.muted }]} testID={`home-league-line-${league.id}`}>
          {line}
        </Text>
      </View>
      {open ? <PlayedPill state={state} testID={`home-league-played-${league.id}`} /> : null}
      <Text
        style={[styles.arrow, { color: colors.primary }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {withSystemArrows('→', '400')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `.lrow`: minst 64 høy, 12 og 14 inn, 16 i hjørnene, 12 mellom; 8 under
  // overskriften og mellom radene, som «Forrige runde».
  row: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: Math.max(TAP, 64),
  },
  text: { flex: 1, minWidth: 0 },
  name: { ...interLine(15, 20), fontFamily: FONTS.sansSemiBold },
  line: { ...interLine(12, 16), fontFamily: FONTS.sans },
  // Nettleserens `normal` for Inter 18 er 21; pila er systemfontens.
  arrow: { ...interLine(18, 21), fontFamily: FONTS.sans },
});
