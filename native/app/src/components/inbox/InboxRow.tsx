// native/app/src/components/inbox/InboxRow.tsx
// #2759: en rad under «I dag» eller «Tidligere», tegnet som webbens
// `components/notifications/InboxRow.tsx`: skive, tittel, underlinje og pil når
// raden fører et sted. Pila er tegnet, som på innstillingsradene.
//
// Uten mål er raden en knapp som bare merker lest, uten pil. En pil ville lovet
// en side. Med brødtekst (nyheter og et avlyst spill) står teksten i raden, og
// nyhetens knapp under den, så ingen knapp ligger inni en annen.
//
// Leste og uleste ser like ut. Bare den grønne prikken på skiva skiller dem.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { InboxWireEntry } from '../../../../../lib/notifications/inboxWire';
import { INBOX_TEXT } from '../../lib/inboxCopy';
import { FONTS, TAP, interLine, useTheme } from '../../theme';
import { ChevronIcon } from '../icons/Icons';
import { InboxAvatarDisc } from './InboxAvatar';

/** Radens høyde; alene i seksjonen er den selve kortet, med rammen innenfor. */
const ROW_HEIGHT = 64;

export function InboxRow({
  entry,
  last,
  lone,
  onOpen,
  onCta,
}: {
  entry: InboxWireEntry;
  /** Siste rad i kortet har ingen strek under seg. */
  last: boolean;
  /** Den eneste raden i seksjonen, som i «Tidligere» på tegningen. */
  lone: boolean;
  onOpen: () => void;
  onCta: () => void;
}) {
  const { colors } = useTheme();
  const rule = last ? null : { borderBottomWidth: 1, borderBottomColor: colors.divider };
  const label = [
    entry.title,
    entry.subtitle,
    entry.body,
    entry.placeLabel,
    entry.unread ? INBOX_TEXT.unreadLabel : null,
  ]
    .filter(Boolean)
    .join(', ');

  const disc = (
    <View style={styles.discWrap}>
      <InboxAvatarDisc avatar={entry.avatar} />
      {entry.unread ? (
        <View
          style={[styles.dot, { backgroundColor: colors.primary, boxShadow: `0 0 0 2px ${colors.surface}` }]}
          testID="inbox-unread-dot"
        />
      ) : null}
    </View>
  );
  const texts = (
    <View style={styles.texts}>
      <Text style={[styles.title, { color: colors.text }]}>{entry.title}</Text>
      <Text
        numberOfLines={entry.subtitleIsFreeText ? 2 : undefined}
        style={[styles.subtitle, { color: colors.muted }]}
      >
        {entry.subtitle}
      </Text>
      {entry.body !== null ? (
        <Text style={[styles.body, { color: colors.text }]}>{entry.body}</Text>
      ) : null}
    </View>
  );

  if (entry.body !== null) {
    return (
      <View style={[styles.bodyRow, rule]} testID="inbox-row">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onOpen}
          style={styles.bodyPress}
        >
          {disc}
          {texts}
        </Pressable>
        {entry.cta ? (
          <Pressable
            accessibilityRole="link"
            onPress={onCta}
            testID="inbox-row-cta"
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.ctaLabel, { color: colors.onPrimary }]}>{entry.cta.label}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole={entry.destination ? 'link' : 'button'}
      accessibilityLabel={label}
      onPress={onOpen}
      testID="inbox-row"
      style={[styles.row, { minHeight: lone ? ROW_HEIGHT - 2 : ROW_HEIGHT }, rule]}
    >
      {disc}
      {texts}
      {entry.destination ? (
        <ChevronIcon direction="right" color={colors.primary} size={16} strokeWidth={2} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bodyRow: { paddingHorizontal: 14, paddingVertical: 12 },
  bodyPress: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  discWrap: { flexShrink: 0 },
  dot: { position: 'absolute', left: -2, top: -2, width: 10, height: 10, borderRadius: 5 },
  texts: { flex: 1, minWidth: 0 },
  title: { ...interLine(15, 19, { multiline: true }), fontFamily: FONTS.sansSemiBold },
  subtitle: { ...interLine(13, 16, { multiline: true }), fontFamily: FONTS.sans },
  body: { ...interLine(13, 16, { multiline: true }), fontFamily: FONTS.sans, paddingTop: 2 },
  cta: {
    alignSelf: 'flex-start',
    marginTop: 10,
    marginLeft: 42,
    height: TAP,
    borderRadius: 999,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
});
