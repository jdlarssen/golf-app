// #2577: arket når et kort sendes tilbake (designlerretet,
// `Godkjenning-forslag-send-tilbake`). Samme ark på iOS og Android, så Android
// får grunnfeltet som før bare iOS hadde (`Alert.prompt`).
//
// Teksten sendes som den ble skrevet; tomt felt eller bare mellomrom sender
// ingen grunn. Trimming og kutt ved 500 tegn er serverkjernens
// (`rejectScorecardCore`), som lagrer «ingen grunn» når feltet er tomt.
//
// Mens kallet går, står arket åpent og alle knappene er låst. Grunnen eies av
// arket mens det er åpent; `onReasonChange` lar skjermen huske den, så den står
// igjen hvis kallet feilet og arket åpnes for samme kort på nytt.
//
// Tastaturet: `KeyboardAvoidingView` rundt arket (ikke rundt hinnen), så feltet
// og «Send tilbake» står over tastaturet. `padding` på begge plattformer: en
// `Modal` med edge-to-edge (Android, targetSdk 36) endrer ikke vinduets
// størrelse, så `height` flyttet ingenting der (målt på emulatoren).
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APPROVE_TEXT, rejectSheetText } from '../../lib/approveCopy';
import { useKeyboardShown } from '../KeyboardInset';
import { FONTS, fraunces, interLine, sheetGrabber, sheetScrim, useTheme } from '../../theme';

export type RejectSheetProps = {
  /** Kortnavnet (kallenavn, ellers fornavn). */
  name: string;
  /** Lagkortet åpnes for hele laget. */
  teamCard: boolean;
  /** En gjest får ingen beskjed, så arket lover ikke det. */
  guest: boolean;
  /** Kallet går: knappene er låst, og «Send tilbake» viser «Jobber …». */
  busy: boolean;
  initialReason?: string;
  onReasonChange?: (text: string) => void;
  /** Grunnen, eller `undefined` når feltet er tomt. */
  onSubmit: (reason: string | undefined) => void;
  onCancel: () => void;
};

export function RejectSheet({
  name,
  teamCard,
  guest,
  busy,
  initialReason = '',
  onReasonChange,
  onSubmit,
  onCancel,
}: RejectSheetProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  // #1954 Del B: med tastaturet oppe dekker det hjem-linja, så luften for den droppes.
  const keyboardShown = useKeyboardShown();
  const [reason, setReason] = useState(initialReason);
  const text = rejectSheetText({ name, teamCard, guest });
  const cancel = () => {
    if (!busy) onCancel();
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={cancel}>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: sheetScrim(colors, scheme) }]}
          onPress={cancel}
          accessible={false}
          testID="reject-backdrop"
        />
        <KeyboardAvoidingView behavior="padding">
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, paddingBottom: 24 + (keyboardShown ? 0 : insets.bottom) },
            ]}
            accessibilityViewIsModal
            onAccessibilityEscape={cancel}
            testID="reject-sheet"
          >
            <View style={[styles.grabber, { backgroundColor: sheetGrabber(scheme) }]} />
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              {text.title}
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>{text.body}</Text>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]} nativeID="reject-reason-label">
                {APPROVE_TEXT.reasonLabel}
              </Text>
              <TextInput
                value={reason}
                onChangeText={(value) => {
                  setReason(value);
                  onReasonChange?.(value);
                }}
                multiline
                maxLength={500}
                editable={!busy}
                textAlignVertical="top"
                accessibilityLabel={APPROVE_TEXT.reasonLabel}
                accessibilityLabelledBy="reject-reason-label"
                style={[
                  styles.input,
                  {
                    borderColor: colors.primary,
                    backgroundColor: colors.surface,
                    color: colors.text,
                  },
                ]}
                testID="reject-reason"
              />
              {text.hint ? (
                <Text style={[styles.hint, { color: colors.muted }]}>{text.hint}</Text>
              ) : null}
            </View>
            <View style={styles.actions}>
              <Pressable
                style={[styles.submit, { backgroundColor: colors.danger }]}
                onPress={() => onSubmit(reason.trim() === '' ? undefined : reason)}
                disabled={busy}
                accessibilityRole="button"
                testID="reject-submit"
              >
                <Text style={[styles.submitText, { color: colors.onPrimary }]}>
                  {busy ? APPROVE_TEXT.working : APPROVE_TEXT.sendBack}
                </Text>
              </Pressable>
              <Pressable
                style={styles.cancel}
                onPress={cancel}
                disabled={busy}
                accessibilityRole="button"
                testID="reject-cancel"
              >
                <Text style={[styles.cancelText, { color: colors.primary }]}>
                  {APPROVE_TEXT.cancel}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// Linjeboksen har egne marger (`theme.ts`); designets luft legges oppå.
const TITLE_LINE = fraunces(500, 24, 28.8, { multiline: true });

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  // Designet: 8 pt over grep-streken, 20 pt på sidene og 24 pt under, med 12 pt
  // mellom delene.
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 20,
    gap: 12,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  title: { ...TITLE_LINE, marginTop: TITLE_LINE.marginTop + 6 },
  // Designet: 15/1,45 = 21,75. iOS legger linje 2 på hel enhetspiksel (66 px), så den
  // sto 1 pt under nettleserens; 21,5 lander den der designet har den (målt, #2577).
  body: { ...interLine(15, 21.5, { multiline: true }), fontFamily: FONTS.sans },
  field: { gap: 6, marginTop: 4 },
  label: { ...interLine(14, 17), fontFamily: FONTS.sansMedium },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22.4,
    fontFamily: FONTS.sans,
  },
  hint: { ...interLine(13, 16), fontFamily: FONTS.sans },
  actions: { gap: 6, marginTop: 8 },
  submit: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontSize: 16, fontFamily: FONTS.sansSemiBold },
  cancel: { height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
