// #2580 (punkt 19): «Per har 2 av 4 utslag» for arrangøren, på godkjenningen og
// avslutt-skjermen. Linjene regnes i `teeShotOrganizerNotice` (lib/teeShotTeams.ts),
// som webbens `TeeShotOrganizerNotice`; her tegnes de i `warningText`. Ikke
// tegnet på lerretet, så flaten følger webbens blokk.
import { StyleSheet, Text, View } from 'react-native';
import type { BundlePlayer } from '../data/gameBundle';
import { teeShotOrganizerNotice, type TeeShotRowLike } from '../lib/teeShotTeams';
import { useTeamTeeShots } from '../lib/useTeamTeeShots';
import { useScoreCatchUp } from '../lib/useScoreCatchUp';
import { FONTS, interLine, useTheme } from '../theme';

export function TeeShotOrganizerNotice({
  players,
  minimum,
  rows,
}: {
  players: readonly BundlePlayer[];
  minimum: number;
  rows: readonly TeeShotRowLike[];
}) {
  const { colors } = useTheme();
  const lines = teeShotOrganizerNotice(players, minimum, rows);
  if (lines.length === 0) return null;
  return (
    <View style={[styles.box, { backgroundColor: colors.warningSoft }]} testID="tee-shot-organizer">
      {lines.map((line) => (
        <Text key={line} style={[styles.line, { color: colors.warningText }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const noReload = async () => undefined;

/**
 * Samme blokk med egen henting, for avslutt-skjermen, som ellers ikke leser
 * den lokale basen. Monteres bare for spill med innstillingen, så et spill uten
 * den henter ingenting nytt. Arrangøren som ikke spiller, får radene fordi
 * lesepolicyen slipper inn den som laget spillet.
 */
export function TeeShotOrganizerNoticeLive({
  gameId,
  players,
  minimum,
}: {
  gameId: string;
  players: readonly BundlePlayer[];
  minimum: number;
}) {
  const { rows, reload, loaded } = useTeamTeeShots(gameId, { enabled: true });
  useScoreCatchUp(gameId, noReload, { reloadTeeShots: reload });
  if (!loaded) return null;
  return <TeeShotOrganizerNotice players={players} minimum={minimum} rows={rows} />;
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  line: { ...interLine(14, 20), fontFamily: FONTS.sans },
});
