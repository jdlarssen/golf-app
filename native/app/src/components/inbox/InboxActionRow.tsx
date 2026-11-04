// native/app/src/components/inbox/InboxActionRow.tsx
// #2759: en rad under «Krever handling», webbens `InboxActionRow`: prikk, tittel,
// underlinje og knappene under dem. Raden selv er ikke en lenke, knappene er.
//
// En påmelding du kan svare på, får «Godta» og «Avslå». En annen sak får én knapp
// som går dit varselet peker.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { InboxDecision, InboxEntry } from '../../data/inbox';
import { INBOX_TEXT } from '../../lib/inboxCopy';
import { FONTS, TAP, interLine, useTheme } from '../../theme';

export function InboxActionRow({
  entry,
  last,
  onOpen,
  onDecide,
  locked,
}: {
  entry: InboxEntry;
  last: boolean;
  onOpen: () => void;
  onDecide: (decision: InboxDecision) => void;
  /** Et svar er på vei: knappene beholder bredden og venter. */
  locked: boolean;
}) {
  const { colors } = useTheme();
  const key = entry.actionKey;
  const label = key && key !== 'decide' ? INBOX_TEXT.buttons[key] : null;
  return (
    <View
      style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
      testID="inbox-action-row"
    >
      <View style={styles.top}>
        <View style={[styles.dot, { backgroundColor: colors.primary }]} testID="inbox-unread-dot" />
        <View style={styles.text} accessible accessibilityLabel={`${entry.title}, ${INBOX_TEXT.unread}. ${entry.subtitle}`}>
          <Text style={[styles.title, { color: colors.text }]}>{entry.title}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{entry.subtitle}</Text>
          {entry.quote ? (
            <Text numberOfLines={2} style={[styles.subtitle, { color: colors.muted }]}>
              {entry.quote}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.buttons}>
        {entry.decidable ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: locked, busy: locked }}
              disabled={locked}
              onPress={() => onDecide('approve')}
              style={[styles.button, { backgroundColor: colors.primary }, locked && styles.waiting]}
              testID="inbox-approve"
            >
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{INBOX_TEXT.approve}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: locked, busy: locked }}
              disabled={locked}
              onPress={() => onDecide('reject')}
              style={[
                styles.button,
                { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                locked && styles.waiting,
              ]}
              testID="inbox-reject"
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>{INBOX_TEXT.reject}</Text>
            </Pressable>
          </>
        ) : label && entry.destination ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpen}
            style={[styles.button, { backgroundColor: colors.primary }]}
            testID="inbox-action-button"
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingTop: 14, paddingBottom: 12, paddingHorizontal: 14 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, flexShrink: 0 },
  text: { flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 2 },
  title: { ...interLine(15, 18, { multiline: true }), fontFamily: FONTS.sansSemiBold },
  subtitle: { ...interLine(13, 16, { multiline: true }), fontFamily: FONTS.sans },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 10, paddingLeft: 22 },
  button: {
    height: TAP,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  waiting: { opacity: 0.6 },
});
