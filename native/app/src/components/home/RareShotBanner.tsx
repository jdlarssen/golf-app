// #2894 PR 2: banneret på Hjem om det nyeste delte hole-in-one eller albatross
// (designlerretet, `Deling-med-alle-1`, gruppe 11). Det står under spørsmålet om varsler,
// på plassen til Kavalkade-banneret og med samme kort: `surface`, radius 12, kant og
// gullstripe til venstre. Står begge, kommer Kavalkaden først (kontraktstillegget).
//
// Hvilket slag og når, avgjør `buildRareShotBanner` (`lib/aeresliste.ts`): det nyeste, i 7
// dager etter runden, med «+1 til» når flere kom de samme dagene. × lukker banneret for det
// slaget (`closeRareShot`); et nytt slag gir et nytt banner. Trykk ellers åpner Æreslista.
//
// Lista hentes ved hvert fokus, som kortet om varsler. Feiler hentingen eller er nettet
// borte, står det ikke noe banner: Hjem sier aldri fra om en feil her.
//
// Med stor tekst (`fontScale` over 1,2) viker merket, så navn og bane får plass på én linje
// (tegnet med 135 % på 320).
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { closeRareShot, fetchAeresliste, readClosedRareShot } from '../../data/aeresliste';
import { buildRareShotBanner, type RareShotBannerModel } from '../../lib/aeresliste';
import { TOPPLISTE_TEXT } from '../../lib/topplisteCopy';
import { FONTS, interLine, useTheme } from '../../theme';
import { AchievementBadge } from '../history/AchievementBadge';
import { LukkIcon } from '../icons/Icons';

/** Over denne tekststørrelsen viker merket (tegningen, «stor tekst»). */
const BADGE_MAX_FONT_SCALE = 1.2;
/** × er 32; slakken gir 44 å treffe på. */
const CLOSE_SLOP = 6;

export function RareShotBanner({ onOpen }: { onOpen: () => void }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [banner, setBanner] = useState<RareShotBannerModel | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void Promise.all([fetchAeresliste(), readClosedRareShot()]).then(([load, closed]) => {
        if (cancelled) return;
        setBanner(load.ok ? buildRareShotBanner(load.view.rows, new Date(), closed) : null);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const onClose = useCallback(() => {
    if (!banner) return;
    setBanner(null);
    void closeRareShot(banner.key);
  }, [banner]);

  if (!banner) return null;

  return (
    <View style={styles.wrap} testID="rare-shot-banner">
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.stripe, { backgroundColor: colors.accent }]} />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={banner.spoken}
          onPress={onOpen}
          style={({ pressed }) => [styles.open, pressed ? styles.pressed : null]}
          testID="rare-shot-banner-open"
        >
          {fontScale > BADGE_MAX_FONT_SCALE ? null : <AchievementBadge mark={banner.mark} earned />}
          <View style={styles.text} importantForAccessibility="no-hide-descendants">
            <View style={styles.line}>
              <Text numberOfLines={1} style={[styles.shot, { color: colors.accentText }]}>
                {banner.shot}
              </Text>
              {banner.more ? (
                <View style={[styles.more, { backgroundColor: colors.surface2 }]} testID="rare-shot-banner-more">
                  <Text style={[styles.moreText, { color: colors.text }]}>{banner.more}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.line}>
              <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                {banner.name}
              </Text>
              {banner.isViewer ? (
                <View style={[styles.you, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.youText, { color: colors.onPrimary }]}>{TOPPLISTE_TEXT.you}</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={[styles.where, { color: colors.muted }]}>
              {banner.where}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={TOPPLISTE_TEXT.bannerClose}
          hitSlop={CLOSE_SLOP}
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
          testID="rare-shot-banner-close"
        >
          <LukkIcon color={colors.text} size={18} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

// Linjehøydene er tegningens (gruppe 11, målt i DOM-en: 15, 19 og 17), så kortet blir 81 høyt.
const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  // 8 pt luft under, som Kavalkade-banneret.
  wrap: { marginBottom: 8 },
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingLeft: 20,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  // Gullstripen på 4, som Kavalkade-banneret.
  stripe: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 4,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  open: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  shot: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, flexShrink: 1 },
  more: { flexShrink: 0, height: 18, paddingHorizontal: 7, borderRadius: 999, justifyContent: 'center' },
  moreText: { ...interLine(11, 18), fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  name: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold, flexShrink: 1, minWidth: 0 },
  you: { flexShrink: 0, height: 20, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center' },
  youText: { ...interLine(12, 20), fontFamily: FONTS.sansSemiBold },
  where: interLine(13, 17),
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
