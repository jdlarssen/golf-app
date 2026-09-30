// #2262: stempelet på et levert scorekort og linjene under det.
//
// #2385 la begge på designlerretet (`Scorekort-forslag`), identisk:
// - **Stempelet** (`ScorecardStampMark`) er en sirkel på 112 pt som ligger
//   over scorekortets nedre høyre hjørne, rotert −12°, med dobbel ring i
//   skoggrønt blekk (75 % dekning) og en nesten hvit flate (86 %). Linjene er
//   klubbnavnet (eller «TØRNY» når banen ikke har noe), «SIGNERT» og datoen i
//   designets korte form («27.09 · 14:32», den delte `formatStampDate`).
//   Skjermleseren får den lange formen («27. september 2026 kl. 14:32»).
// - **Sjekklista** (`ScorecardStatusList`) står til venstre under kortet.
//   «Signert av deg, …» først; et steg som er gjort, har en blekgrønn skive
//   med hake, og et steg som gjenstår (godkjenning som venter, resultatet som
//   ikke er låst ennå), har en stiplet sirkel. Merkene er dekor: teksten sier
//   det samme til skjermleseren.
//
// Skoggrønt (`primary`), ikke gull: gull er seier i Tørny, og et levert kort er
// ikke en seier. Hvilke linjer som vises, avgjør den delte
// `resolveScorecardStamp`; her blir de bare tekst.
import { StyleSheet, Text, View } from 'react-native';
import type { ScorecardStamp as Stamp } from '../../../../../lib/scorecard/scorecardStamp';
import { formatSignedAt, formatStampDateLocal } from '../../lib/display';
import { FONTS, useTheme, withAlpha } from '../../theme';
import { HakeIcon } from '../icons/Icons';

/** Stempelets diameter, som i designet. */
const STAMP = 112;
/** Den indre ringen: 4 pt luft innenfor den ytre, og 1,5 pt strek. */
const INNER_INSET = 4;
/** Ordet øverst i stempelet når banen ikke har noe klubbnavn. */
export const STAMP_FALLBACK_CLUB = 'TØRNY';

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

/**
 * Det runde stempelet. Det ligger over scorekortets nedre høyre hjørne
 * (`ScorecardGrid` sin `overlay`), og er ett skjermleser-element.
 */
export function ScorecardStampMark({
  stamp,
  clubName,
}: {
  stamp: Stamp;
  /** Banens klubb, når den har et navn; ellers står «TØRNY». */
  clubName?: string | null;
}) {
  const { colors, ui } = useTheme();
  const ink = { color: colors.primary };
  const ring = withAlpha(colors.primary, 0.75);
  const signedAt = formatSignedAt(stamp.signedAt);
  const date = formatStampDateLocal(stamp.signedAt);
  return (
    <View
      style={[styles.stamp, { borderColor: ring, backgroundColor: withAlpha(colors.surface, 0.86) }]}
      accessible
      accessibilityLabel={['Signert', signedAt?.replace(' · ', ' kl. ')].filter(Boolean).join(', ')}
      testID="scorecard-stamp"
    >
      <View style={[styles.innerRing, { borderColor: ring }]} />
      <Text style={[styles.club, ink]} numberOfLines={1}>
        {(clubName?.trim() || STAMP_FALLBACK_CLUB).toUpperCase()}
      </Text>
      <Text style={[styles.signed, ink]}>SIGNERT</Text>
      {date ? (
        <Text style={[styles.date, ui.num, ink]} testID="scorecard-stamp-date">
          {date}
        </Text>
      ) : null}
    </View>
  );
}

/** Sjekklista under kortet: hvem som signerte, godkjenningen og låsingen. */
export function ScorecardStatusList({
  stamp,
  ownerFullName,
}: {
  stamp: Stamp;
  ownerFullName: string | null;
}) {
  const copy = stampCopy(stamp, ownerFullName);
  return (
    <View style={styles.checklist} testID="scorecard-stamp-section">
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
            : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: withAlpha(colors.muted, 0.6) },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={`${testID}-${done ? 'done' : 'pending'}`}
      >
        {done ? <HakeIcon color={colors.primary} size={14} strokeWidth={2.4} /> : null}
      </View>
      <Text style={[styles.lineText, { color: done ? colors.text : colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    width: STAMP,
    height: STAMP,
    borderRadius: STAMP / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-12deg' }],
  },
  innerRing: {
    position: 'absolute',
    top: INNER_INSET,
    left: INNER_INSET,
    right: INNER_INSET,
    bottom: INNER_INSET,
    borderRadius: STAMP / 2,
    borderWidth: 1.5,
  },
  club: { fontSize: 9, fontFamily: FONTS.sansSemiBold, letterSpacing: 1.8, maxWidth: STAMP - 24 },
  signed: { fontSize: 20, lineHeight: 24, fontFamily: FONTS.serifScore, letterSpacing: 1.2 },
  date: { fontSize: 10, lineHeight: 13, fontFamily: FONTS.sansSemiBold, textAlign: 'center' },
  // Designet: 30 pt under kortet (stempelet stikker 34 ned) og 16 pt fra kanten.
  checklist: { gap: 8, marginTop: 22, marginHorizontal: -4 },
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
