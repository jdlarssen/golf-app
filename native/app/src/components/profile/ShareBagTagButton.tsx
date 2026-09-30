// #2256 PR 3: «Del bag-taggen» — knappen under menyen i profilen, som i
// designet (Profil-forslag): en lys pille med deleikonet.
//
// Bildet tas av en egen deleversjon av kortet (`BagTag variant="share"`), i
// lys drakt uansett tema. Den ligger utenfor skjermen og er skjult for
// skjermleseren; bare knappen er synlig. Kortet viser bare det profilen alt
// viser deg, altså dine egne data, og ingenting går via en server.
//
// Knappen finnes bare når appen har de to native delene (`canShareBagTag`);
// et eldre bygg uten dem viser ingen knapp i stedet for en som ikke virker.
// Feiler bildet eller arket, står en linje under knappen. Et avbrutt ark er
// ingen feil.
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HandicapTrend } from '../../../../../lib/stats/handicapTrend';
import type { BagTagModel } from '../../lib/bagTag';
import { PROFILE_TEXT } from '../../lib/profileCopy';
import { canShareBagTag, shareBagTagImage } from '../../lib/shareBagTag';
import { FONTS, TAP, ThemeScope, themeFor, useTheme } from '../../theme';
import { DelIcon } from '../icons/Icons';
import { BagTag } from './BagTag';

const LIGHT = themeFor('light');
/** Bredden på bildet i punkter; telefonens skala gir pikslene. */
const SHARE_WIDTH = 360;
const noop = () => {};

export function ShareBagTagButton({
  model,
  trend,
}: {
  model: BagTagModel;
  trend: HandicapTrend | null;
}) {
  const { ui, colors } = useTheme();
  // Byggets moduler endrer seg ikke mens appen kjører.
  const [available] = useState(canShareBagTag);
  const card = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const onShare = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const result = await shareBagTagImage(card);
    setBusy(false);
    if (!result.ok) setFailed(true);
  }, []);

  if (!available) return null;

  return (
    <View>
      {/* Kortet for bildet: utenfor skjermen, usynlig for skjermleseren og for
          trykk. `collapsable={false}` holder visningen i det native treet, så
          den finnes å ta bilde av. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.offscreen}
      >
        <ThemeScope theme={LIGHT}>
          <View ref={card} collapsable={false} style={styles.shareFrame} testID="share-bag-tag-card">
            <BagTag variant="share" model={model} trend={trend} onEditProfile={noop} />
          </View>
        </ThemeScope>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={() => void onShare()}
        style={({ pressed }) => [
          styles.button,
          { borderColor: colors.border },
          pressed || busy ? styles.dimmed : null,
        ]}
        testID="profile-share-bag-tag"
      >
        <DelIcon color={colors.primary} size={18} />
        <Text style={[styles.buttonText, { color: colors.primary }]}>{PROFILE_TEXT.shareBagTag}</Text>
      </Pressable>
      {failed ? (
        <Text style={ui.error} testID="profile-share-error">
          {PROFILE_TEXT.shareBagTagFailed}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', top: 0, left: -10000 },
  shareFrame: { width: SHARE_WIDTH },
  // Designet: 48 pt høy pille med tynn kant, ikon og tekst i skogen.
  button: {
    minHeight: Math.max(TAP, 48),
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  buttonText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  dimmed: { opacity: 0.6 },
});
