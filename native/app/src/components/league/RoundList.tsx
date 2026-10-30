// #2638 Del 2: rundelista på ligasiden (tegning 4).
//
// Én rad per runde med vinduet («LUKKET», «ÅPEN», «KOMMER») og datoene. Den
// åpne runden er grønn. Til høyre står om du har spilt den, for runder som har
// åpnet og når du er deltaker; en kommende runde har ingenting der.
import { StyleSheet, Text, View } from 'react-native';
import type { AppLeagueView } from '../../../../../lib/league/appLeagueView';
import { LEAGUE_TEXT, roundCourseLine, roundDates, roundWindow } from '../../lib/leagueCopy';
import { FONTS, interLine, useTheme } from '../../theme';
import { PlayedPill, WindowChip, type PlayedState } from './LeaguePills';

export function RoundList({ view, now }: { view: AppLeagueView; now: Date }) {
  const { colors } = useTheme();
  const meId = view.me.userId;
  const rounds = [...view.rounds].sort((a, b) => a.sequence - b.sequence);
  if (rounds.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.muted }]} testID="league-rounds-empty">
        {LEAGUE_TEXT.noRounds}
      </Text>
    );
  }
  return (
    <View testID="league-rounds">
      {rounds.map((round, index) => {
        const window = roundWindow(round, now);
        const open = window === 'open';
        const upcoming = window === 'upcoming';
        const played: PlayedState | null =
          upcoming || !view.me.isParticipant
            ? null
            : round.delivered.includes(meId)
              ? 'delivered'
              : round.inProgress.includes(meId)
                ? 'inProgress'
                : 'notPlayed';
        return (
          <View
            key={round.id}
            style={[
              styles.row,
              index > 0 ? styles.next : null,
              open
                ? { backgroundColor: colors.youFill, borderColor: colors.youBorder }
                : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            testID={`league-round-${round.sequence}`}
          >
            <View style={styles.text}>
              <View style={styles.top}>
                <Text
                  style={[
                    styles.name,
                    upcoming
                      ? { color: colors.muted, fontFamily: FONTS.sansMedium }
                      : { color: colors.text, fontFamily: FONTS.sansSemiBold },
                  ]}
                >
                  {round.label}
                </Text>
                <WindowChip window={window} testID={`league-round-${round.sequence}-chip`} />
              </View>
              <Text style={[styles.dates, { color: colors.muted }]}>{roundDates(round.opensAt, round.closesAt)}</Text>
              {roundCourseLine(round) ? (
                <Text style={[styles.dates, { color: colors.muted }]} testID={`league-round-${round.sequence}-course`}>
                  {roundCourseLine(round)}
                </Text>
              ) : null}
            </View>
            {played ? <PlayedPill state={played} testID={`league-round-${round.sequence}-played`} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // `.rr`: 16 fra kanten, 12 og 14 inn, 16 i hjørnene, minst 62 høy.
  row: {
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 62,
  },
  next: { marginTop: 8 },
  text: { flexShrink: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...interLine(15, 20) },
  dates: { ...interLine(12, 16), fontFamily: FONTS.sans, marginTop: 2 + interLine(12, 16).marginTop },
  empty: { ...interLine(14, 20), fontFamily: FONTS.sans, marginHorizontal: 20 },
});
