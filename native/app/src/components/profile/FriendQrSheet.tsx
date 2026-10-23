// #2627: arket med QR-koden i stort format, så den er lett å skanne ute på
// banen. Åpnes med et trykk på koden på bag-taggen.
//
// Tegningen er `Venne-qr-ark-lys/-natt` (bevissiden til #2627): samme hinne og
// grep-strek som send-tilbake-arket (`RejectSheet.tsx`), og det glir opp som
// kåringsarket (`WinnerSheet.tsx`). Navnet ditt står over, én linje sier hva
// kompisen gjør, og koden står rett (ikke skrå som på taggen) på en hvit flate
// i begge draktene, fordi svart på hvitt er det kameraet leser best.
//
// «Lukk», trykk på hinnen og Android-tilbake lukker arket.
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PROFILE_TEXT } from '../../lib/profileCopy';
import { FONTS, fraunces, interLine, sheetGrabber, sheetScrim, useTheme } from '../../theme';
import { QrCode } from './QrCode';

/** Koden på arket: 240 pt, med den stille sonen innenfor. */
const QR_SIZE = 240;
const QR_PAPER = '#FFFFFF';
const QR_INK = '#000000';

export function FriendQrSheet({
  visible,
  name,
  url,
  onClose,
}: {
  visible: boolean;
  /** Navnet ditt, som på taggen. Tomt mens profilraden lastes: da står ingen tittel. */
  name: string;
  url: string;
  onClose: () => void;
}) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: sheetScrim(colors, scheme) }]}
          onPress={onClose}
          accessible={false}
          testID="friend-qr-sheet-scrim"
        />
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 24 + insets.bottom }]}
          // VoiceOver holdes inne i arket, og «tilbake»-bevegelsen lukker det.
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          testID="friend-qr-sheet"
        >
          <View style={[styles.grabber, { backgroundColor: sheetGrabber(scheme) }]} />
          {name ? (
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              {name}
            </Text>
          ) : null}
          <Text style={[styles.body, { color: colors.muted }]}>{PROFILE_TEXT.friendQrSheetBody}</Text>
          <View style={styles.paper} testID="friend-qr-sheet-code">
            <QrCode value={url} size={QR_SIZE} color={QR_INK} />
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.close, { borderColor: colors.border }, pressed ? styles.pressed : null]}
            accessibilityRole="button"
            testID="friend-qr-sheet-close"
          >
            <Text style={[styles.closeText, { color: colors.primary }]}>{PROFILE_TEXT.friendQrClose}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Linjeboksen har egne marger (`theme.ts`); tegningens luft legges oppå.
const TITLE_LINE = fraunces(500, 22, 26.4, { multiline: true });

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  // Tegningen: 8 pt over grep-streken, 20 pt på sidene og 24 pt under, med
  // 12 pt mellom delene (som send-tilbake-arket).
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 20,
    gap: 12,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  title: { ...TITLE_LINE, marginTop: TITLE_LINE.marginTop + 6, textAlign: 'center' },
  // 15/1,45 som send-tilbake-arket, der 21,5 lander linje 2 der nettleseren gjør.
  body: { ...interLine(15, 21.5, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  paper: {
    alignSelf: 'center',
    width: QR_SIZE,
    height: QR_SIZE,
    marginTop: 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: QR_PAPER,
  },
  // Tegningen: en lys pille på 48 pt, 8 pt ekstra luft over.
  close: {
    marginTop: 8,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  pressed: { opacity: 0.6 },
});
