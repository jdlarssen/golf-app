// native/app/src/components/terminliste/TerminRow.tsx
// #2838: én runde i terminlista. Flyttet ut av `screens/Terminliste.tsx` i
// #2753, så Hjem-seksjonen «Klubbturneringer» viser radene likt (én hjem for
// raden, trap 4).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppTerminEntry } from '../../../../../lib/games/appTerminView';
import { capacityState, terminTimeNote } from '../../../../../lib/games/terminliste';
import { nameInitials } from '../../../../../lib/names/initials';
import { formatStubClock } from '../../lib/homeDates';
import {
  TERMIN_TEXT,
  courseFormatLine,
  rowA11yLabel,
  seatLineText,
  socialProofText,
  timeNoteText,
} from '../../lib/terminlisteCopy';
import { FONTS, TAP, fraunces, interLine, useTheme } from '../../theme';

/**
 * Én runde: klokka med den lille linja under, navnet, «Bane · Format · lag på N»,
 * én tredje linje og «Meld på» / «Be om plass». Hele raden er ett trykkpunkt;
 * knappen er tegnet, ikke en egen trykkflate. En full runde har ingen knapp.
 */
export function TerminRow({
  entry,
  onPress,
  showClub = false,
}: {
  entry: AppTerminEntry;
  onPress: () => void;
  /** Hjem (#2753): klubben står foran banen, siden et medlem kan være med i flere klubber. */
  showClub?: boolean;
}) {
  const { colors } = useTheme();
  const clock = formatStubClock(entry.scheduled_tee_off_at)?.replace(/^kl\. /, '') ?? null;
  const note = timeNoteText(terminTimeNote(entry));
  const courseFormat = [
    showClub ? entry.clubName : null,
    courseFormatLine(entry.course_name, entry.modeLabel, entry.teamSize),
  ]
    .filter(Boolean)
    .join(' · ');
  const label = rowA11yLabel({
    name: entry.name,
    full: entry.full,
    cta: entry.cta,
    clock,
    note,
    courseFormat,
    third: entry.capacity ? seatLineText(entry.capacity) : entry.socialProof ? socialProofText(entry.socialProof) : null,
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.row}
      testID={`terminliste-row-${entry.id}`}
    >
      <View style={[styles.time, { borderRightColor: colors.divider }]}>
        <Text
          numberOfLines={1}
          style={[styles.clock, { color: clock ? colors.text : colors.muted }]}
          testID={`terminliste-clock-${entry.id}`}
        >
          {clock ?? '–'}
        </Text>
        {note ? <Text style={[styles.note, { color: colors.muted }]}>{note}</Text> : null}
      </View>
      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]}>{entry.name}</Text>
        <Text style={[styles.line, { color: colors.muted }]}>{courseFormat}</Text>
        <ThirdLine entry={entry} />
      </View>
      {entry.full ? null : entry.cta === 'direct' ? (
        <View style={[styles.cta, { backgroundColor: colors.primary }]} testID={`terminliste-cta-${entry.id}`}>
          <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{TERMIN_TEXT.signUp}</Text>
        </View>
      ) : (
        <View style={[styles.cta, { borderColor: colors.primary, borderWidth: 1 }]} testID={`terminliste-cta-${entry.id}`}>
          <Text style={[styles.ctaText, { color: colors.primary }]}>{TERMIN_TEXT.request}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Plass-linja, «Fullt», vennene som er med, antallet, eller ingenting. */
function ThirdLine({ entry }: { entry: AppTerminEntry }) {
  const { colors } = useTheme();
  if (entry.capacity) {
    const { fillRatio, tone } = capacityState(entry.capacity);
    const warn = tone !== 'normal';
    return (
      <View style={styles.third} testID={`terminliste-seats-${entry.id}`}>
        <View style={[styles.track, { backgroundColor: colors.trackBg }]}>
          <View
            style={[styles.fill, { width: `${Math.round(fillRatio * 100)}%`, backgroundColor: warn ? colors.warning : colors.primary }]}
          />
        </View>
        <Text
          numberOfLines={1}
          style={[styles.small, styles.seatLabel, warn ? { color: colors.warningText, fontFamily: FONTS.sansSemiBold } : { color: colors.muted }]}
        >
          {seatLineText(entry.capacity)}
        </Text>
      </View>
    );
  }
  if (entry.full) {
    return (
      <View style={styles.third}>
        <Text style={[styles.small, { color: colors.warningText, fontFamily: FONTS.sansSemiBold }]}>{TERMIN_TEXT.full}</Text>
      </View>
    );
  }
  const text = entry.socialProof ? socialProofText(entry.socialProof) : null;
  if (text === null || !entry.socialProof) return null;
  const friends = entry.socialProof.knownFriendNames;
  return (
    <View style={styles.third} testID={`terminliste-proof-${entry.id}`}>
      {friends.map((friend, i) => (
        <View
          key={`${friend}-${i}`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.bubble,
            { backgroundColor: colors.primarySoft },
            i > 0 && { marginLeft: -6, borderWidth: 2, borderColor: colors.surface },
          ]}
        >
          <Text style={[styles.bubbleText, { color: colors.primary }]}>{nameInitials(friend)}</Text>
        </View>
      ))}
      <Text style={[styles.small, { color: colors.muted, marginLeft: friends.length > 0 ? 4 : 0 }]}>{text}</Text>
    </View>
  );
}

export function TerminDayHeading({ title, label }: { title: string; label?: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={styles.heading} accessibilityRole="header" accessible>
      <Text style={[styles.headingTitle, { color: colors.text }]}>{title}</Text>
      {label ? <Text style={[styles.headingLabel, { color: colors.muted }]}>{label}</Text> : null}
    </View>
  );
}

export function TerminDayCard({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8, paddingHorizontal: 4 },
  headingTitle: { ...fraunces(600, 18, 22) },
  headingLabel: { ...interLine(12, 15), fontFamily: FONTS.sans },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: TAP },
  // Nettet: 56 innhold + 10 luft + 1 strek (content-box), og klokka flyter ut i luften når «09:20» er bredere enn 56.
  // RN klipper i stedet, så blokken har 5 pt mer innhold (61 + 10 + 1) og tallene står i ro.
  time: { width: 72, paddingRight: 10, borderRightWidth: 1, alignItems: 'center' },
  // Proporsjonale tall som i artboardet: tabellsifrene gjør «09:20» for bred for de 56 pt, og klokka brekker.
  clock: { ...fraunces(600, 20, 24) },
  note: { ...interLine(11, 14), fontFamily: FONTS.sans },
  body: { flex: 1, minWidth: 0 },
  name: { ...interLine(15, 20, { multiline: true }), fontFamily: FONTS.sansSemiBold },
  line: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans, marginTop: 2 },
  third: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  small: { ...interLine(11, 14, { multiline: true }), fontFamily: FONTS.sans, flexShrink: 1 },
  // Teksten går først: søylen (64 pt i artboardet) gir etter, så «40 av 40 plasser ledige» står på én linje ved 390 pt.
  track: { width: 64, minWidth: 8, flexShrink: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  seatLabel: { flexShrink: 0 },
  fill: { height: 6 },
  bubble: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { fontSize: 9, fontFamily: FONTS.sansSemiBold },
  cta: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
});
