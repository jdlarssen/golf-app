// #2756: «Del resultat» i resultatets bånd. Bildet tas av `ResultShareCard`, som
// ligger utenfor skjermen og er skjult for skjermleseren; hjelperen er den
// Kavalkaden og bag-taggen bruker (`lib/shareImage.ts`), så et bygg uten de
// native delene viser ingen knapp. Et lukket ark er ingen feil. Feiler bildet
// eller arket, står en linje under knappen.
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SHARE_CARD_WIDTH } from '../../../../../lib/og/shareCardLayout';
import { RESULT_APP_TEXT, SHARE_RESULT_LABEL } from '../../lib/resultCardCopy';
import type { ResultCardModel } from '../../lib/resultHero';
import { canShareImage, shareViewImage } from '../../lib/shareImage';
import { FONTS, TAP, interLine, useTheme } from '../../theme';
import { ShareCardIcon } from '../icons/Icons';
import { ResultShareCard } from './ResultShareCard';

export function ShareResultButton({ card }: { card: ResultCardModel }) {
  const { colors } = useTheme();
  // Byggets moduler endrer seg ikke mens appen kjører.
  const [available] = useState(canShareImage);
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const onShare = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const result = await shareViewImage(cardRef, { width: SHARE_CARD_WIDTH, height: card.height });
    setBusy(false);
    if (!result.ok) setFailed(true);
  }, [card.height]);

  if (!available) return null;

  // Linet på skogen: samme par som knappen i lagtavlas stripe, i begge drakter.
  const ink = colors.surfaceStrong;

  return (
    <View style={styles.wrap}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.offscreen}
      >
        <View ref={cardRef} collapsable={false}>
          <ResultShareCard card={card} />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={() => void onShare()}
        style={[styles.button, { backgroundColor: colors.onStrongWarm }, busy ? styles.dimmed : null]}
        testID="share-result"
      >
        <ShareCardIcon color={ink} size={16} />
        <Text style={[styles.label, { color: ink }]}>{SHARE_RESULT_LABEL}</Text>
      </Pressable>
      {failed ? (
        <Text style={[styles.error, { color: colors.onStrong }]} testID="share-result-error">
          {RESULT_APP_TEXT.shareFailed}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, alignItems: 'flex-start', gap: 8 },
  offscreen: { position: 'absolute', top: 0, left: -10000 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: TAP,
    borderRadius: 999,
    paddingHorizontal: 20,
  },
  label: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  error: { ...interLine(13, 16), fontFamily: FONTS.sans },
  dimmed: { opacity: 0.6 },
});
