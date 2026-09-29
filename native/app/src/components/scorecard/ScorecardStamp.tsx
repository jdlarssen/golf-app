// #2262: stempelet på et levert scorekort — «TØRNY · SIGNERT · 27. september
// 2026 · 14:32 · Signert av deg, Kari Nordmann» — og under det én linje om
// godkjenning og én om låsing.
//
// Skoggrønt (`primary`), ikke gull: gull er seier i Tørny, og et levert kort er
// ikke en seier. Rotasjonen er statisk; stempelet står der det står, uten
// animasjon. Hvilke linjer som vises, avgjør den delte
// `resolveScorecardStamp`; her blir de bare tekst.
import { StyleSheet, Text, View } from 'react-native';
import type { ScorecardStamp as Stamp } from '../../../../../lib/scorecard/scorecardStamp';
import { formatSignedAt } from '../../lib/display';
import { FONTS, useTheme } from '../../theme';

export interface StampCopy {
  signedAt: string | null;
  signedBy: string;
  approval: string | null;
  lock: string;
}

/** Tekstene i og under stempelet. `ownerFullName` er kortets eier. */
export function stampCopy(stamp: Stamp, ownerFullName: string | null): StampCopy {
  const signedBy =
    stamp.signedBy.kind === 'self'
      ? ownerFullName
        ? `Signert av deg, ${ownerFullName}`
        : 'Signert av deg'
      : stamp.signedBy.fullName
        ? `Signert av ${stamp.signedBy.fullName}`
        : 'Signert av en annen spiller';

  const approval = (() => {
    switch (stamp.approval.kind) {
      case 'marker':
        return `Markør: ${stamp.approval.name} har godkjent`;
      case 'organizer':
        return 'Godkjent av arrangøren';
      case 'approved':
        return 'Godkjent';
      case 'pending':
        return 'Venter på at noen i flighten godkjenner';
      case 'none':
        return null;
    }
  })();

  return {
    signedAt: formatSignedAt(stamp.signedAt),
    signedBy,
    approval,
    lock: stamp.locked
      ? 'Resultatet er låst'
      : 'Arrangøren låser resultatet når alle har levert',
  };
}

export function ScorecardStamp({
  stamp,
  ownerFullName,
}: {
  stamp: Stamp;
  ownerFullName: string | null;
}) {
  const { colors, ui } = useTheme();
  const copy = stampCopy(stamp, ownerFullName);
  const ink = { color: colors.primary };

  return (
    <View style={styles.wrap} testID="scorecard-stamp-section">
      <View
        style={[styles.stamp, { borderColor: colors.primary }]}
        accessible
        accessibilityLabel={[copy.signedBy, copy.signedAt?.replace(' · ', ' kl. ')]
          .filter(Boolean)
          .join(', ')}
        testID="scorecard-stamp"
      >
        <Text style={[styles.brand, ink]}>TØRNY</Text>
        <Text style={[styles.signed, ink]}>SIGNERT</Text>
        {copy.signedAt ? <Text style={[styles.line, ui.num, ink]}>{copy.signedAt}</Text> : null}
        <Text style={[styles.line, ink]}>{copy.signedBy}</Text>
      </View>
      {copy.approval ? (
        <Text style={[ui.body, styles.center]} testID="scorecard-approval">
          {copy.approval}
        </Text>
      ) : null}
      <Text style={[ui.muted, styles.center]} testID="scorecard-lock">
        {copy.lock}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, marginTop: 16 },
  stamp: {
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 2,
    transform: [{ rotate: '-2deg' }],
    marginBottom: 8,
  },
  brand: { fontSize: 12, fontFamily: FONTS.sansBold, letterSpacing: 3 },
  signed: { fontSize: 24, fontFamily: FONTS.serifScore, letterSpacing: 2 },
  line: { fontSize: 14, fontFamily: FONTS.sansMedium, textAlign: 'center' },
  center: { textAlign: 'center' },
});
