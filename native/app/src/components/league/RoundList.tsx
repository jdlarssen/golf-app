// #2638 Del 2: rundelista på ligasiden (tegning 4).
//
// Én rad per runde med vinduet («LUKKET», «ÅPEN», «KOMMER») og datoene. Den
// åpne runden er grønn. Til høyre står om du har spilt den, for runder som har
// åpnet og når du er deltaker; en kommende runde har ingenting der.
//
// #2980 (variant A): har du et tall i tabellen for runden, står tallet der
// «Har spilt» sto («34 poeng ›»), og hele raden åpner kortet ditt fra runden.
// Tallet er cella fra tabellen (`myRoundCell`), så det regnes aldri på nytt.
// Uten kort bak (`gameId` null) er tallet tekst, og raden kan ikke trykkes på.
// Knappens navn for skjermleseren har med det raden sa før: runden, vinduet,
// datoene og banen, så tallet og «Se kortet ditt».
import { StyleSheet, Text, View } from 'react-native';
import type { AppLeagueView } from '../../../../../lib/league/appLeagueView';
import { myRoundCell } from '../../../../../lib/league/standingsFormat';
import {
  LEAGUE_TEXT,
  myRoundCardLabel,
  myRoundResult,
  roundCourseLine,
  roundDates,
  roundWindow,
  WINDOW_CHIP,
} from '../../lib/leagueCopy';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';
import { ChevronIcon } from '../icons/Icons';
import { Tap } from '../Tap';
import { PlayedPill, WindowChip, type PlayedState } from './LeaguePills';

export function RoundList({
  view,
  now,
  onOpenCard,
}: {
  view: AppLeagueView;
  now: Date;
  /** #2980: et trykk på en runde med tallet ditt og et kort bak. Uten den kan ingen rad trykkes på. */
  onOpenCard?: (card: { gameId: string; userId: string }) => void;
}) {
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
        // Et kort som venter på markøren, har ikke noe tall ennå (#2661).
        const waiting = round.awaitingMarker.some((a) => a.userId === meId);
        const mine =
          played === null || waiting
            ? null
            : myRoundCell(view.standings, meId, round.id, view.league.standingsModel);
        const result = mine ? myRoundResult(mine.raw, view.league) : null;
        const gameId = mine?.gameId ?? null;
        const pressable = result !== null && gameId !== null && onOpenCard !== undefined;
        const rowStyle = [
          styles.row,
          index > 0 ? styles.next : null,
          open
            ? { backgroundColor: colors.youFill, borderColor: colors.youBorder }
            : { backgroundColor: colors.surface, borderColor: colors.border },
        ];
        const content = (
          <>
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
            {result ? (
              <View style={styles.result} testID={`league-round-${round.sequence}-result`}>
                <Text style={[styles.resultValue, { color: colors.text }]}>{result.value}</Text>
                {result.unit ? <Text style={[styles.resultUnit, { color: colors.muted }]}>{result.unit}</Text> : null}
                {pressable ? <ChevronIcon direction="right" color={colors.muted} size={16} strokeWidth={2} /> : null}
              </View>
            ) : played ? (
              <PlayedPill state={played} testID={`league-round-${round.sequence}-played`} />
            ) : null}
          </>
        );
        if (pressable && result && gameId) {
          return (
            <Tap
              key={round.id}
              onPress={() => onOpenCard({ gameId, userId: meId })}
              accessibilityRole="button"
              accessibilityLabel={myRoundCardLabel(
                [round.label, WINDOW_CHIP[window], roundDates(round.opensAt, round.closesAt), roundCourseLine(round)]
                  .filter(Boolean)
                  .join(', '),
                result.unit ? `${result.value} ${result.unit}` : result.value,
              )}
              style={rowStyle}
              testID={`league-round-${round.sequence}`}
            >
              {content}
            </Tap>
          );
        }
        return (
          <View key={round.id} style={rowStyle} testID={`league-round-${round.sequence}`}>
            {content}
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
  // #2980: tallet som sesongverdien i tabellen (Fraunces 600, 18/22), «poeng» og pila etter.
  result: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  resultValue: { ...fraunces(600, 18, 22), fontVariant: ['tabular-nums'] },
  resultUnit: { ...interLine(12, 16), fontFamily: FONTS.sans },
  empty: { ...interLine(14, 20), fontFamily: FONTS.sans, marginHorizontal: 20 },
});
