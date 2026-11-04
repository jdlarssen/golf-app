// native/app/src/components/inbox/InboxRow.tsx
// #2759: en rad under «I dag» eller «Tidligere», webbens `InboxRow`: skive, tittel,
// underlinje og, når raden har et sted å gå, pila. Lest og ulest ser like ut; bare
// den grønne prikken på skiva skiller dem.
//
// `product_update` beholder brødteksten og knappen i raden. Uten mål merker raden
// seg bare lest, og har ingen pil: en pil ville lovet en side.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { InboxEntry } from '../../data/inbox';
import { INBOX_TEXT } from '../../lib/inboxCopy';
import { FONTS, TAP, interLine, useTheme } from '../../theme';
import { ChevronIcon } from '../icons/Icons';
import { InboxAvatar } from './InboxAvatar';

const DOT = 10;
const DOT_RING = 2;

export function InboxRow({
  entry,
  last,
  onOpen,
  onCta,
}: {
  entry: InboxEntry;
  last: boolean;
  onOpen: () => void;
  onCta: () => void;
}) {
  const { colors } = useTheme();
  const divider = !last && { borderBottomWidth: 1, borderBottomColor: colors.divider };
  const label = [
    entry.title,
    entry.subtitle,
    entry.body,
    entry.placeLabel,
    entry.unread ? INBOX_TEXT.unread : null,
  ]
    .filter(Boolean)
    .join('. ');
  const disc = (
    <View style={styles.discWrap}>
      <InboxAvatar avatar={entry.avatar} />
      {entry.unread ? (
        <View style={[styles.dotRing, { backgroundColor: colors.surface }]} testID="inbox-unread-dot">
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
        </View>
      ) : null}
    </View>
  );
  const text = (
    <View style={styles.text}>
      <Text style={[styles.title, { color: colors.text }]}>{entry.title}</Text>
      <Text
        numberOfLines={entry.subtitleIsFreeText ? 2 : undefined}
        style={[styles.subtitle, { color: colors.muted }]}
      >
        {entry.subtitle}
      </Text>
      {entry.body ? <Text style={[styles.body, { color: colors.text }]}>{entry.body}</Text> : null}
    </View>
  );

  if (entry.body !== null) {
    return (
      <View style={[styles.bodyRow, divider]} testID="inbox-row">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onOpen}
          style={styles.bodyTop}
        >
          {disc}
          {text}
        </Pressable>
        {entry.cta ? (
          <Pressable
            accessibilityRole="link"
            onPress={onCta}
            style={[styles.cta, { backgroundColor: colors.primary }]}
            testID="inbox-row-cta"
          >
            <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{entry.cta.label}</Text>
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
      style={[styles.row, divider]}
      testID="inbox-row"
    >
      {disc}
      {text}
      {entry.destination ? (
        <ChevronIcon direction="right" color={colors.primary} size={16} strokeWidth={2} testID="inbox-row-arrow" />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  bodyRow: { paddingVertical: 12, paddingHorizontal: 14 },
  bodyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  discWrap: { flexShrink: 0 },
  dotRing: {
    position: 'absolute',
    left: -2 - DOT_RING,
    top: -2 - DOT_RING,
    width: DOT + DOT_RING * 2,
    height: DOT + DOT_RING * 2,
    borderRadius: (DOT + DOT_RING * 2) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  text: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  title: { ...interLine(15, 18, { multiline: true }), fontFamily: FONTS.sansSemiBold },
  subtitle: { ...interLine(13, 16, { multiline: true }), fontFamily: FONTS.sans },
  body: { ...interLine(13, 16, { multiline: true }), fontFamily: FONTS.sans, marginTop: 2 },
  cta: {
    alignSelf: 'flex-start',
    height: TAP,
    marginTop: 10,
    marginLeft: 42,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
});
