// #2256: «Sesongen 2026» — runder, beste runde og seire under bag-taggen.
//
// Tallene kommer ferdig regnet fra `computeProfileSeason` (Type A der); flisa
// viser dem bare. Seire over null gir gull kant og gull tall: kanten er
// `accent`, tallet `accentText`, som holder kontrasten som tekst i begge
// draktene (webbens `--accent-text`).
//
// **Hver flis er én node for skjermleseren** — «Seire i 2026: 2» — i stedet
// for et tall og et ord hver for seg.
//
// **Mens sesongen lastes** står flisene tomme med full høyde, så menyen under
// ikke flytter seg når tallene kommer. De er da skjult for skjermleseren.
import { StyleSheet, Text, View } from 'react-native';
import type { ProfileSeason } from '../../../../../lib/stats/profileSeason';
import { PROFILE_TEXT, seasonHeading, seasonTileSpoken } from '../../lib/profileCopy';
import { FONTS, useTheme } from '../../theme';

export interface SeasonTilesProps {
  year: number;
  /** `null` mens sesongen lastes. */
  season: ProfileSeason | null;
}

export function SeasonTiles({ year, season }: SeasonTilesProps) {
  const { ui } = useTheme();
  const best = season?.bestRound;

  return (
    <View testID="season-tiles">
      <Text style={ui.sectionTitle}>{seasonHeading(year)}</Text>
      <View style={styles.row}>
        <Tile
          label={PROFILE_TEXT.tileRounds}
          value={season ? String(season.rounds) : null}
          spoken={season ? seasonTileSpoken(PROFILE_TEXT.tileRounds, year, String(season.rounds)) : null}
          testID="season-tile-rounds"
        />
        <Tile
          label={PROFILE_TEXT.tileBestRound}
          value={season ? (best != null ? String(best) : PROFILE_TEXT.tileEmpty) : null}
          spoken={
            season
              ? seasonTileSpoken(
                  PROFILE_TEXT.tileBestRound,
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
          spoken={season ? seasonTileSpoken(PROFILE_TEXT.tileWins, year, String(season.wins)) : null}
          gold={season != null && season.wins > 0}
          testID="season-tile-wins"
        />
      </View>
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
        {
          backgroundColor: colors.surface,
          borderColor: gold ? colors.accent : colors.border,
          borderWidth: gold ? 2 : 1,
        },
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  tile: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 2,
  },
  value: {
    fontSize: 28,
    lineHeight: 34,
    minHeight: 34,
    fontFamily: FONTS.serifScore,
    fontVariant: ['tabular-nums'],
  },
  label: { fontSize: 13, lineHeight: 18, fontFamily: FONTS.sans },
});
