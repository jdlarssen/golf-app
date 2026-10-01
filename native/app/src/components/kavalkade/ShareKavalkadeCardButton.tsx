// #2265 PR 2: «Del kortet» på ett kavalkade-kort, som webbens
// `ShareKavalkadeCardButton`: en fylt pille med deleikonet, nederst på kortet.
//
// Bildet tas av deleversjonen (`KavalkadeShareCard`), som ligger utenfor
// skjermen og er skjult for skjermleseren. Hjelperen er den bag-taggen bruker
// (`lib/shareImage.ts`), så et bygg uten de native delene viser ingen knapp.
// Delte spilleren bildet, telles delingen i `kavalkade_shares`, best-effort;
// et lukket ark telles ikke, som på webben.
// Feiler bildet eller arket, står en linje under knappen.
//
// Knappen vises bare for kort som har en deleversjon: kallstedet sender
// modellen, og `buildKavalkadeCardModel` gir `null` når faktumet mangler,
// slik webbens rute svarer 404 og knappen der aldri blir synlig.
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { KavalkadeCardModel } from '../../../../../lib/kavalkade/cardModel';
import { logKavalkadeShare } from '../../data/kavalkade';
import { KAVALKADE_APP_TEXT, KAVALKADE_SHARE_TEXT } from '../../lib/kavalkadeCopy';
import { canShareImage, shareViewImage } from '../../lib/shareImage';
import { FONTS, TAP, interLine, useTheme } from '../../theme';
import { ShareCardIcon } from '../icons/Icons';
import { KavalkadeShareCard } from './KavalkadeShareCard';

export function ShareKavalkadeCardButton({ year, model }: { year: number; model: KavalkadeCardModel }) {
  const { colors, scheme, ui } = useTheme();
  // Byggets moduler endrer seg ikke mens appen kjører.
  const [available] = useState(canShareImage);
  const card = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const onShare = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const result = await shareViewImage(card);
    setBusy(false);
    if (!result.ok) setFailed(true);
    else if (result.shared) void logKavalkadeShare(year, model.kind);
  }, [year, model.kind]);

  if (!available) return null;

  // Webben: hvit tekst på skogen, og linets farge i mørk drakt (`dark:text-bg`).
  const ink = scheme === 'dark' ? colors.bg : '#FFFFFF';

  return (
    <View>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.offscreen}
      >
        <View ref={card} collapsable={false}>
          <KavalkadeShareCard model={model} />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={() => void onShare()}
        style={[styles.button, { backgroundColor: colors.primary }, busy ? styles.dimmed : null]}
        testID={`share-kavalkade-card-${model.kind}`}
      >
        <ShareCardIcon color={ink} size={16} />
        <Text style={[styles.label, { color: ink }]}>{KAVALKADE_SHARE_TEXT.shareCard}</Text>
      </Pressable>
      {failed ? (
        <Text style={ui.error} testID={`share-kavalkade-error-${model.kind}`}>
          {KAVALKADE_APP_TEXT.shareFailed}
        </Text>
      ) : null}
    </View>
  );
}

// Webben: `min-h-[44px] rounded-full px-5 py-2.5 gap-2`, tekst 14/500 med
// `tracking-tight` (−0,025 em).
const LABEL = interLine(14, 20);

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', top: 0, left: -10000 },
  button: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: TAP,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  label: { ...LABEL, fontFamily: FONTS.sansMedium, letterSpacing: -0.35 },
  dimmed: { opacity: 0.6 },
});
