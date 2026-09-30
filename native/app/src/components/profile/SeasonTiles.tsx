// #2256: runder, beste runde og seire under bag-taggen.
//
// Tallene kommer ferdig regnet fra `computeProfileSeason` (Type A der); flisa
// viser dem bare. Utseendet følger designlerretet (eierens retning 29.09):
// ingen overskrift over flisene, tallet stort i Fraunces og en liten etikett
// under («runder i år», «beste runde», «seire»). Seire over null gir gull kant,
// kremflate (`leaderFill`) og tallet i `accentText`, som holder kontrasten
// som tekst i begge draktene (webbens `--accent-text`).
//
// **Hver flis er én node for skjermleseren** («Seire i 2026: 2») i stedet
// for et tall og et ord hver for seg.
//
// **Mens sesongen lastes** står flisene tomme med full høyde, så menyen under
// ikke flytter seg når tallene kommer. De er da skjult for skjermleseren.
import { StyleSheet, Text, View } from 'react-native';
import type { ProfileSeason } from '../../../../../lib/stats/profileSeason';
import { PROFILE_TEXT, seasonTileSpoken } from '../../lib/profileCopy';
import { FONTS, fraunces, useTheme } from '../../theme';

export interface SeasonTilesProps {
  year: number;
  /** `null` mens sesongen lastes. */
  season: ProfileSeason | null;
}

export function SeasonTiles({ year, season }: SeasonTilesProps) {
  const best = season?.bestRound;

  return (
    <View style={styles.row} testID="season-tiles">
      <Tile
        label={PROFILE_TEXT.tileRounds}
        value={season ? String(season.rounds) : null}
        spoken={
          season ? seasonTileSpoken(PROFILE_TEXT.tileRoundsSpoken, year, String(season.rounds)) : null
        }
        testID="season-tile-rounds"
      />
      <Tile
        label={PROFILE_TEXT.tileBestRound}
        value={season ? (best != null ? String(best) : PROFILE_TEXT.tileEmpty) : null}
        spoken={
          season
            ? seasonTileSpoken(
                PROFILE_TEXT.tileBestRoundSpoken,
                year,
                best != null ? String(best) : PROFILE_TEXT.tileEmptySpoken,
              )
            : null
        }
        testID="season-tile-best"
      />
      <Tile
        label={PROFILE_TEXT.tileWins}
        value={season ? String(season.wins) : null}
        spoken={season ? seasonTileSpoken(PROFILE_TEXT.tileWinsSpoken, year, String(season.wins)) : null}
        gold={season != null && season.wins > 0}
        testID="season-tile-wins"
      />
    </View>
  );
}

function Tile({
  label,
  value,
  spoken,
  gold = false,
  testID,
}: {
  label: string;
  /** `null` mens sesongen lastes. */
  value: string | null;
  spoken: string | null;
  gold?: boolean;
  testID: string;
}) {
  const { colors } = useTheme();
  const loaded = value != null && spoken != null;

  return (
    <View
      accessible={loaded}
      accessibilityLabel={spoken ?? undefined}
      importantForAccessibility={loaded ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={!loaded}
      style={[
        styles.tile,
        gold
          ? // Kremen under webbens lederkort, og gullkanten.
            { backgroundColor: colors.leaderFill, borderColor: `${colors.accent}CC` }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      testID={testID}
    >
      <Text
        style={[styles.value, { color: gold ? colors.accentText : colors.text }]}
        testID={`${testID}-value`}
      >
        {value ?? ''}
      </Text>
      <Text style={[styles.label, { color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const VALUE = fraunces(600, 28, 28);

const styles = StyleSheet.create({
  // Designet: 28 pt under bag-taggen, så skyggen legger seg over toppen.
  row: { flexDirection: 'row', gap: 10, marginTop: 28 },
  tile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 4,
  },
  // Designet har linjehøyde 1 (28 pt), med nettleserens linjeboks (#2385).
  // En tom flis (mens sesongen lastes) holder linja.
  value: {
    ...VALUE,
    minHeight: 28 - VALUE.marginTop - VALUE.marginBottom,
    fontVariant: ['tabular-nums'],
  },
  label: { fontSize: 12, lineHeight: 15, fontFamily: FONTS.sans },
});
