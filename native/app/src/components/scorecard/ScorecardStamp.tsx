// #2262: stempelet på et levert scorekort — «TØRNY · SIGNERT · 27. september
// 2026 · 14:32 · Signert av deg, Kari Nordmann» — og under det én linje om
// godkjenning og én om låsing.
//
// Skoggrønt (`primary`), ikke gull: gull er seier i Tørny, og et levert kort er
// ikke en seier. Rotasjonen er statisk; stempelet står der det står, uten
// animasjon. Hvilke linjer som vises, avgjør den delte
// `resolveScorecardStamp`; her blir de bare tekst.
//
// #2385 (designlerretet): stempelet er rundt og 112 pt, med dobbel ring,
// «TØRNY» langs den øvre buen, «SIGNERT» i midten og datoen under i designets
// korte form («27.09 · 14:32», den delte `formatStampDate`). Skjermleseren
// får den lange formen («27. september 2026 kl. 14:32»). «Signert av deg, …» er første linje i sjekklista under, som i
// designet (orkestratorens svar A). Sjekklista står til venstre: et steg som
// er gjort, har en blekgrønn skive med hake; et steg som gjenstår (godkjenning
// som venter, resultatet som ikke er låst ennå), har en stiplet sirkel.
// Merkene er dekor: teksten sier det samme til skjermleseren.
import { StyleSheet, Text, View } from 'react-native';
import type { ScorecardStamp as Stamp } from '../../../../../lib/scorecard/scorecardStamp';
import { formatSignedAt, formatStampDateLocal } from '../../lib/display';
import { FONTS, useTheme } from '../../theme';
import { HakeIcon, StampRing } from '../icons/Icons';

/** Stempelets diameter, som i designet. */
const STAMP = 112;

export interface StampCopy {
  /** Den lange formen, til skjermleseren. */
  signedAt: string | null;
  /** Den korte formen i stempelet. */
  stampDate: string | null;
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
    stampDate: formatStampDateLocal(stamp.signedAt),
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
        style={styles.stamp}
        accessible
        accessibilityLabel={['Signert', copy.signedAt?.replace(' · ', ' kl. ')]
          .filter(Boolean)
          .join(', ')}
        testID="scorecard-stamp"
      >
        <StampRing size={STAMP} color={colors.primary} kicker="TØRNY" fontFamily={FONTS.sansSemiBold} />
        <View style={styles.stampText}>
          <Text style={[styles.signed, ink]}>SIGNERT</Text>
          {copy.stampDate ? (
            <Text style={[styles.date, ui.num, ink]} testID="scorecard-stamp-date">
              {copy.stampDate}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.checklist}>
        <StatusLine done text={copy.signedBy} testID="scorecard-signed-by" />
        {copy.approval ? (
          <StatusLine
            done={stamp.approval.kind !== 'pending'}
            text={copy.approval}
            testID="scorecard-approval"
          />
        ) : null}
        <StatusLine done={stamp.locked} text={copy.lock} testID="scorecard-lock" />
      </View>
    </View>
  );
}

/** Én linje i sjekklista: hake i blekgrønt når steget er gjort, stiplet sirkel ellers. */
function StatusLine({ done, text, testID }: { done: boolean; text: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.statusLine} testID={testID}>
      <View
        style={[
          styles.mark,
          done
            ? { backgroundColor: colors.primarySoft }
            : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={`${testID}-${done ? 'done' : 'pending'}`}
      >
        {done ? <HakeIcon color={colors.primary} size={14} /> : null}
      </View>
      <Text style={[styles.lineText, { color: done ? colors.text : colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, marginTop: 16 },
  stamp: {
    width: STAMP,
    height: STAMP,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-2deg' }],
  },
  stampText: { position: 'absolute', alignItems: 'center', paddingTop: 8 },
  signed: { fontSize: 20, lineHeight: 24, fontFamily: FONTS.serifScore, letterSpacing: 1.2 },
  date: { fontSize: 10, lineHeight: 13, fontFamily: FONTS.sansSemiBold, textAlign: 'center' },
  checklist: { alignSelf: 'stretch', gap: 8, marginTop: 8 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: FONTS.sans },
});
