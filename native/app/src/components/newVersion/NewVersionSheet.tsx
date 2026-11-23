// native/app/src/components/newVersion/NewVersionSheet.tsx
// Native #2975: arket «Versjon … er klar» (eierens valg B, 2026-11-22). Det glir
// opp nederst én gang per nytt bygg: grep-strek, tittel, punktene om det som er
// nytt (når serveren har dem), «Oppdater» og «Senere».
//
// Samme hinne og grep-strek som de andre arkene (`FriendQrSheet.tsx`,
// `RejectSheet.tsx`). Hinnen, Android-tilbake og VoiceOvers «tilbake» er
// «Senere»: arket kommer ikke igjen for det bygget, og påminnelsen på Profil tar
// over. Med «Reduser bevegelse» på kommer arket uten å gli.
//
// Stor tekst: tittelen og punktene ruller inne i arket, og knappene står fast
// nederst, så «Oppdater» alltid er synlig.
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Tap } from '../Tap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { releaseName } from '../../lib/newVersion';
import { NEW_VERSION_TEXT, newVersionTitle } from '../../lib/newVersionCopy';
import { useNewVersion } from '../../lib/useNewVersion';
import { FONTS, TAP, fraunces, interLine, sheetGrabber, sheetScrim, useTheme } from '../../theme';

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduce(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export function NewVersionSheet() {
  const { mode, release, update, later } = useNewVersion();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const visible = mode === 'sheet' && release !== null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={later}
      testID="new-version-modal"
    >
      <View style={styles.root}>
        <Tap
          feedback="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: sheetScrim(colors, scheme) }]}
          onPress={later}
          accessible={false}
          testID="new-version-scrim"
        />
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 20 + insets.bottom }]}
          accessibilityViewIsModal
          onAccessibilityEscape={later}
          testID="new-version-sheet"
        >
          <View style={[styles.grabber, { backgroundColor: sheetGrabber(scheme) }]} />
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false}>
            {release ? (
              <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
                {newVersionTitle(releaseName(release))}
              </Text>
            ) : null}
            {release && release.notes.length > 0 ? (
              <View style={styles.notes} testID="new-version-notes">
                {release.notes.map((line, index) => (
                  <View key={index} style={styles.note}>
                    <Text style={[styles.bullet, { color: colors.accentText }]}>•</Text>
                    <Text style={[styles.noteText, { color: colors.text }]}>{line}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            <Tap
              accessibilityRole="button"
              onPress={update}
              style={[styles.update, { backgroundColor: colors.primary }]}
              testID="new-version-update"
            >
              <Text style={[styles.updateText, { color: colors.onPrimary }]}>{NEW_VERSION_TEXT.update}</Text>
            </Tap>
            <Tap
              accessibilityRole="button"
              onPress={later}
              style={[styles.later]}
              testID="new-version-later"
            >
              <Text style={[styles.laterText, { color: colors.primary }]}>{NEW_VERSION_TEXT.later}</Text>
            </Tap>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Linjeboksen har egne marger (`theme.ts`); luften legges oppå.
const TITLE_LINE = fraunces(500, 22, 26.4, { multiline: true });

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 20,
    gap: 12,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: 12 },
  title: { ...TITLE_LINE, marginTop: TITLE_LINE.marginTop + 6 },
  notes: { gap: 6 },
  note: { flexDirection: 'row', gap: 8 },
  bullet: { ...interLine(15, 21.5), fontFamily: FONTS.sansSemiBold },
  noteText: { flex: 1, ...interLine(15, 21.5, { multiline: true }), fontFamily: FONTS.sans },
  actions: { gap: 4, marginTop: 4 },
  update: {
    minHeight: 48,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateText: { ...interLine(15, 20), fontFamily: FONTS.sansSemiBold },
  later: { minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  laterText: { ...interLine(15, 20), fontFamily: FONTS.sansMedium },
});
