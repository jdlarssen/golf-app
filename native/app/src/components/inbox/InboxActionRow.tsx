// native/app/src/components/inbox/InboxActionRow.tsx
// #2759: en rad under «Krever handling», tegnet som webbens
// `components/notifications/InboxActionRow.tsx`: grønn prikk, tittel, underlinje
// og knappene under. Raden er ingen lenke, det er knappene.
//
// En påmelding som venter på svar får «Godta» og «Avslå». Alle andre rader får
// én knapp som merker raden lest og går dit varselet peker.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { InboxWireEntry } from '../../../../../lib/notifications/inboxWire';
import { INBOX_TEXT, actionButtonLabel } from '../../lib/inboxCopy';
import { FONTS, TAP, interLine, useTheme } from '../../theme';

export function InboxActionRow({
  entry,
  last,
  busy,
  onOpen,
  onDecide,
}: {
  entry: InboxWireEntry;
  last: boolean;
  /** Et kall er på vei: knappene beholder bredden og venter. */
  busy: boolean;
  onOpen: () => void;
  onDecide: (decision: 'approve' | 'reject') => void;
}) {
  const { colors } = useTheme();
  const { actionKey } = entry;
  const disabled = { opacity: busy ? 0.6 : 1 };
  return (
    <View
      style={[styles.row, last ? null : { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
      testID="inbox-action-row"
    >
      <View
        accessible
        accessibilityLabel={[entry.title, INBOX_TEXT.unreadLabel, entry.subtitle, entry.quote]
          .filter(Boolean)
          .join(', ')}
        style={styles.top}
      >
        <View style={[styles.dot, { backgroundColor: colors.primary }]} testID="inbox-unread-dot" />
        <View style={styles.texts}>
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
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={() => onDecide('approve')}
              testID="inbox-approve"
              style={[styles.button, { backgroundColor: colors.primary }, disabled]}
            >
              <Text style={[styles.buttonLabel, { color: colors.onPrimary }]}>
                {INBOX_TEXT.buttons.approve}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={() => onDecide('reject')}
              testID="inbox-reject"
              style={[
                styles.button,
                { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                disabled,
              ]}
            >
              <Text style={[styles.buttonLabel, { color: colors.text }]}>{INBOX_TEXT.buttons.reject}</Text>
            </Pressable>
          </>
        ) : entry.destination && actionKey && actionKey !== 'decide' ? (
          <Pressable
            accessibilityRole="link"
            onPress={onOpen}
            testID="inbox-action-open"
            style={[styles.button, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.buttonLabel, { color: colors.onPrimary }]}>{actionButtonLabel(actionKey)}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, flexShrink: 0 },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...interLine(15, 19, { multiline: true }), fontFamily: FONTS.sansSemiBold },
  subtitle: { ...interLine(13, 16, { multiline: true }), fontFamily: FONTS.sans },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 10, paddingLeft: 22 },
  button: {
    height: TAP,
    borderRadius: 999,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
});
