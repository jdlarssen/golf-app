// #2265: «Formen din» øverst i Rundedagboka, som designlerretet
// (`Historikk-forslag`) tegner det.
//
// Kortet har egen ramme (ikke `ui.card`): 18 pt hjørner og luft 14/14/10/14.
// Overskriften står på én rad med «brutto, 18 hull» til høyre. Setningen under
// sammenligner de fem siste hele rundene med de fem før (`compareRecentForm`),
// fra ti hele runder: «▲ 3,8 slag bedre …» i `formUp` når formen går opp, og
// «▼ 2,1 slag dårligere …» dempet når den går ned (eierens svar 3). Rundes
// forskjellen til 0,0, står ingen setning. Pila er dekor (`FormArrow`).
//
// Kurven viser de siste 20 hele rundene (`FormCurve`), med gullprikken alltid
// på beste runde: «82 · ny rekord» når den nyeste er lavere enn alle før
// (`isNewRecord` over ALLE hele runder), ellers «82 · beste». Under to hele
// runder står en kort tekst i stedet.
//
// Stripa nederst er siste sesong: runder, snittet med én desimal og beste
// runde. Runder og beste er de samme tallene som bag-taggen viser for året.
import { StyleSheet, Text, View } from 'react-native';
import {
  MAX_TREND_ROUNDS,
  compareRecentForm,
  isNewRecord,
} from '../../../../../lib/stats/scoringTrend';
import type { SeasonSummary } from '../../../../../lib/stats/seasonStats';
import {
  HISTORY_TEXT,
  bestLabel,
  formCurveLabel,
  formSentence,
  formatOneDecimal,
} from '../../lib/historyCopy';
import { PROFILE_TEXT } from '../../lib/profileCopy';
import { FONTS, frauncesLine, interLine, useTheme } from '../../theme';
import { FormArrow } from '../icons/Icons';
import { CURVE, FormCurve } from './FormCurve';

export interface FormCardProps {
  /** Brutto for hver hel 18-hullsrunde, eldst først; `null` mens det lastes. */
  series: readonly number[] | null;
  /** Siste sesong med runder, eller `null`. */
  season: SeasonSummary | null;
  /** Snittet i sesongen uten avrunding. */
  seasonAverage: number | null;
}

export function FormCard({ series, season, seasonAverage }: FormCardProps) {
  const { colors } = useTheme();
  const delta = series ? compareRecentForm(series) : null;
  // «0,0 slag bedre» sier ingenting; da står ingen setning.
  const shownDelta = delta != null && Math.round(Math.abs(delta) * 10) > 0 ? delta : null;
  const window = series ? series.slice(-MAX_TREND_ROUNDS) : [];
  const best = window.length > 0 ? Math.min(...window) : null;

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="form-card"
    >
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
          {HISTORY_TEXT.formHeading}
        </Text>
        <Text style={[styles.scope, { color: colors.muted }]}>{HISTORY_TEXT.formScope}</Text>
      </View>

      {shownDelta != null ? (
        <View style={styles.sentenceRow}>
          <View style={styles.arrow}>
            <FormArrow
              direction={shownDelta > 0 ? 'up' : 'down'}
              color={shownDelta > 0 ? colors.formUp : colors.muted}
            />
          </View>
          <Text
            style={[styles.sentence, { color: shownDelta > 0 ? colors.formUp : colors.muted }]}
            testID="form-card-sentence"
          >
            {formSentence(shownDelta)}
          </Text>
        </View>
      ) : null}

      {series == null ? (
        <View style={styles.curvePlaceholder} />
      ) : window.length >= 2 && best != null ? (
        <FormCurve
          values={window}
          formatValue={String}
          bestText={bestLabel(String(best), isNewRecord(series))}
          accessibilityLabel={formCurveLabel(window.length, window[0], window[window.length - 1])}
          testID="form-curve"
        />
      ) : (
        <Text style={[styles.tooFew, { color: colors.muted }]} testID="form-card-too-few">
          {HISTORY_TEXT.formTooFew}
        </Text>
      )}

      <View style={[styles.strip, { borderTopColor: colors.divider }]} testID="form-card-strip">
        <StripCell
          value={series ? (season ? String(season.rounds) : '0') : null}
          label={HISTORY_TEXT.stripRounds}
        />
        <StripCell
          value={
            series
              ? seasonAverage != null
                ? formatOneDecimal(seasonAverage)
                : PROFILE_TEXT.tileEmpty
              : null
          }
          label={HISTORY_TEXT.stripAverage}
          spokenEmpty={seasonAverage == null}
          middle
        />
        <StripCell
          value={
            series
              ? season?.bestRound != null
                ? String(season.bestRound)
                : PROFILE_TEXT.tileEmpty
              : null
          }
          label={HISTORY_TEXT.stripBest}
          spokenEmpty={season?.bestRound == null}
        />
      </View>
    </View>
  );
}

/**
 * Én kolonne i stripa: tallet i Fraunces 22 og etiketten under. Én node for
 * skjermleseren («snitt brutto: 86,6»). Mens det lastes står tallet tomt med
 * full høyde.
 */
function StripCell({
  value,
  label,
  spokenEmpty = false,
  middle = false,
}: {
  value: string | null;
  label: string;
  spokenEmpty?: boolean;
  middle?: boolean;
}) {
  const { colors } = useTheme();
  const spoken = value == null ? undefined : `${label}: ${spokenEmpty ? PROFILE_TEXT.tileEmptySpoken : value}`;
  return (
    <View
      style={[styles.cell, middle ? [styles.middle, { borderColor: colors.divider }] : null]}
      accessible={value != null}
      accessibilityLabel={spoken}
    >
      <Text style={[styles.value, { color: colors.text }]}>{value ?? ' '}</Text>
      <Text style={[styles.cellLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 18,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  // Linjene i nettleserens `normal` (designet): Fraunces 18 = 23 pt,
  // Inter 12/13 = 15/16 pt, Fraunces 22 = 28 pt og Inter 11 = 14 pt.
  heading: { ...frauncesLine(18, 23), fontFamily: FONTS.serifDisplay },
  scope: { ...interLine(12, 15), fontFamily: FONTS.sans },
  sentenceRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  // Designets «▲»: 8 × 8 pt, 1 pt inn, 4⅓ pt under linjetoppen, og tallet
  // står 5 pt etter (4⅓ pt luft pluss sifferets egen sidekant).
  arrow: { marginLeft: 1, marginTop: 13 / 3, marginRight: 13 / 3 },
  sentence: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold, flexShrink: 1 },
  curvePlaceholder: { height: CURVE.height, marginTop: 8 },
  tooFew: { fontSize: 13, fontFamily: FONTS.sans, marginTop: 8, lineHeight: 18 },
  strip: { flexDirection: 'row', borderTopWidth: 1, marginTop: 6, paddingTop: 10 },
  cell: { flex: 1, alignItems: 'center' },
  middle: { borderLeftWidth: 1, borderRightWidth: 1 },
  value: { ...frauncesLine(22, 28), fontFamily: FONTS.serifScore },
  cellLabel: { ...interLine(11, 14), fontFamily: FONTS.sans },
});
