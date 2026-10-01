// #2265 PR 2: de to dørene inn i Kavalkaden, med webbens utseende og tekster.
//
// - `KavalkadeHistoryRow`: raden på Rundedagboka, mellom undertittelen og
//   «Formen din» (eierens svar 4, 01.10), som webbens `KavalkadeLinkCard` på
//   historikken. Vises når Kavalkaden er åpen, og for admin før datoen.
// - `KavalkadeHomeBanner`: banneret på Hjem, som webbens `KavalkadeHomeNudge`
//   (eieren: «Ja, samme banner»). `teaser` (1.–23. desember) er tekst uten
//   lenke; `link` (24. desember–31. januar) har en egen pilleknapp inn. Hele
//   kortet er ikke en lenke, og banneret kan ikke lukkes.
//
// Hvem som ser dem og når, avgjør serveren (`useKavalkadeStatus`).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { KavalkadeHomeSlot } from '../../../../../lib/kavalkade/release';
import { kavalkadeT as t } from '../../lib/kavalkadeCopy';
import { FONTS, TAP, interLine, useTheme } from '../../theme';

/** Juletreet foran teksten, `text-lg leading-none` på webben. */
function Tree() {
  return (
    <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.tree}>
      🎄
    </Text>
  );
}

export function KavalkadeHistoryRow({ year, onOpen }: { year: number; onOpen: () => void }) {
  const { colors } = useTheme();
  const title = t('historikkLinkTitle', { year });
  const body = t('historikkLinkBody');
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${body}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.bg : colors.surface, borderColor: colors.border },
      ]}
      testID="round-diary-kavalkade"
    >
      <Tree />
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.body, { color: colors.muted }]}>{body}</Text>
      </View>
    </Pressable>
  );
}

export function KavalkadeHomeBanner({
  slot,
  year,
  onOpen,
}: {
  slot: KavalkadeHomeSlot;
  year: number;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const teaser = slot === 'teaser';
  return (
    <View
      style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="kavalkade-home-banner"
    >
      <View style={[styles.stripe, { backgroundColor: colors.accent }]} />
      <View style={styles.bannerRow}>
        <Tree />
        <View style={styles.text}>
          <Text style={[styles.title, { color: colors.text }]}>
            {teaser ? t('homeTeaserTitle') : t('homeLinkTitle', { year })}
          </Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            {teaser ? t('homeTeaserBody') : t('homeLinkBody')}
          </Text>
          {teaser ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={onOpen}
              style={[styles.cta, { backgroundColor: colors.primary }]}
              testID="kavalkade-home-banner-cta"
            >
              <Text style={[styles.ctaText, { color: colors.bg }]}>{t('homeLinkCta')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// Webben: `rounded-xl border px-4 py-3`, juletreet 18 og `gap-3`, tittelen
// 14/500 med `leading-tight`, brødteksten 13 med `leading-snug` og `mt-1`.
// Banneret har `pl-5` og en gullstripe på 4 fra `top-2` til `bottom-2`;
// knappen er `min-h-11 rounded-full px-4 py-2`, 13/500, med `mt-2`.
const TITLE = interLine(14, 17.5, { multiline: true });
const BODY = interLine(13, 17.875, { multiline: true });
const CTA = interLine(13, 19.5);

const styles = StyleSheet.create({
  // iOS gir 🎄 3 pt mer bredde enn Chromium på 18 pt (målt mot webbens dører),
  // så teksten etter treet starter der den gjør på webben.
  tree: { fontSize: 18, lineHeight: 18, marginRight: -3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: TAP,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 14,
  },
  text: { flex: 1, minWidth: 0 },
  title: { ...TITLE, fontFamily: FONTS.sansMedium },
  body: { ...BODY, fontFamily: FONTS.sans, marginTop: BODY.marginTop + 4 },
  banner: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingLeft: 20,
    paddingRight: 16,
  },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 4,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cta: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: TAP,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
  },
  ctaText: { ...CTA, fontFamily: FONTS.sansMedium },
});
