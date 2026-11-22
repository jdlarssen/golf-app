// native/app/src/components/NewVersionStrip.tsx
// Native #2975: stripa «Ny versjon er klar.» øverst i appen, med «Oppdater» og ✕.
// Eierens valg (2026-11-22): et hint som kan lukkes, ikke en tvungen oppdatering.
// Den tvungne dialogen for bygg under minstenivået er `useUpdateGuard.ts`.
//
// `NewVersionTop` ligger rundt hele appen, innenfor `SafeAreaProvider`. Når
// stripa vises, tar den statuslinjas høyde selv og gir resten av appen en
// innfelling på 0 i toppen. Da legger ikke skjermene og navigatorens header
// statuslinja inn en gang til under stripa. Treet er det samme med og uten
// stripe, så navigatoren beholder stakken når stripa kommer og går.
//
// Appens grunn-statuslinje bor også her, montert før alt annet. «auto» følger
// systemets lys/mørk (#1833); mens stripa vises, er den «light», fordi stripa
// er skog i begge draktene (`surfaceStrong`). Skjermer som setter sin egen
// statuslinje (Login, tavla), legger seg over som før. Hullet i sollys ber om
// mørk tekst over den hvite siden; mens stripa vises, spør det
// {@link useNewVersionStripShown} og lar være, for da står stripa under klokka.
import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NEW_VERSION_TEXT } from '../lib/newVersionCopy';
import { useNewVersion } from '../lib/useNewVersion';
import { FONTS, TAP, interLine, useTheme } from '../theme';
import { LukkIcon } from './icons/Icons';

const StripShownContext = createContext(false);

/** Sant mens stripa står øverst. For skjermer som setter sin egen statuslinje. */
export function useNewVersionStripShown(): boolean {
  return useContext(StripShownContext);
}

export function NewVersionStrip({
  topInset,
  onUpdate,
  onDismiss,
}: {
  topInset: number;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_FONT_SCALE;
  return (
    <View
      style={[styles.strip, { paddingTop: topInset, backgroundColor: colors.surfaceStrong }]}
      testID="new-version-strip"
    >
      <View style={stacked ? styles.stack : styles.row} testID="new-version-row">
        <Text style={[stacked ? styles.messageStacked : styles.message, { color: colors.onStrong }]}>
          {NEW_VERSION_TEXT.message}
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onUpdate}
            style={({ pressed }) => [
              styles.update,
              { backgroundColor: colors.accent },
              pressed ? styles.pressed : null,
            ]}
            testID="new-version-update"
          >
            <Text style={[styles.updateText, { color: colors.onAccent }]}>{NEW_VERSION_TEXT.update}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={NEW_VERSION_TEXT.dismiss}
            onPress={onDismiss}
            style={({ pressed }) => [styles.dismiss, pressed ? styles.pressed : null]}
            testID="new-version-dismiss"
          >
            <LukkIcon size={20} color={colors.onStrong} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function NewVersionTop({ children }: { children: ReactNode }) {
  const { visible, update, dismiss } = useNewVersion(true);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.fill}>
      <StatusBar style={visible ? 'light' : 'auto'} />
      {visible ? <NewVersionStrip topInset={insets.top} onUpdate={update} onDismiss={dismiss} /> : null}
      <SafeAreaInsetsContext.Provider value={visible ? { ...insets, top: 0 } : insets}>
        <StripShownContext.Provider value={visible}>{children}</StripShownContext.Provider>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

/**
 * Fra denne tekstskaleringen (Innstillinger → Tekststørrelse) står knappene på en
 * egen linje under teksten. Ved 1,5 rekker teksten fortsatt to linjer ved siden
 * av knappene på en 375 pt bred skjerm; over det ble den brukket bokstav for
 * bokstav i simulatoren.
 */
export const STACK_FONT_SCALE = 1.5;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  strip: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  stack: { gap: 4, paddingTop: 10, paddingBottom: 6 },
  message: { flex: 1, ...interLine(15, 20, { multiline: true }), fontFamily: FONTS.sansMedium },
  messageStacked: { ...interLine(15, 20, { multiline: true }), fontFamily: FONTS.sansMedium },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-end' },
  update: {
    minHeight: TAP,
    borderRadius: 999,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  updateText: { ...interLine(15, 20), fontFamily: FONTS.sansSemiBold },
  dismiss: {
    minWidth: TAP,
    minHeight: TAP,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  pressed: { opacity: 0.7 },
});
