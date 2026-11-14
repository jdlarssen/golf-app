// #2297: arket «Oppdater handicap» fra kortet på spillsiden (tegningene
// `Hcp-forslag-ark-B-*`: linjal, skriv, ugyldig, lagrer, feil, uten nett, pluss
// og 320).
//
// Spilleren drar linjalen eller skriver tallet, fra +8 til 54, og lagrer uten å
// forlate spillet. Arket tar ikke spillet som prop: det vet bare om handicapet,
// så profilen og Hjem kan ta det i bruk senere.
//
// Lukking: ✕, et trykk på hinnen, dra ned fra toppen, tilbake på Android
// (`onRequestClose`) og VoiceOver-escape. Ingenting lagres da, og ingen av dem
// virker mens lagringen pågår.
//
// Tastaturet: `KeyboardAvoidingView` rundt arket, som avvisningsarket
// (`RejectSheet`), så «Lagre» står rett over tastaturet mens feltet er oppe.
import { useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ProfileSaveResult } from '../../data/profile';
import {
  describeHandicapSaveFailure,
  fromLastLine,
  HANDICAP_TEXT,
  plusBeyondMinLine,
  rulerA11yValue,
  saveLabel,
  sheetSubtitle,
} from '../../lib/handicapCopy';
import { hcpChange, parseRulerField, rulerFieldProblem, rulerMin } from '../../lib/hcpRuler';
import { formatHcpNb } from '../../lib/profileCopy';
import { useDeviceOnline } from '../../lib/useDeviceOnline';
import { FONTS, fraunces, interLine, sheetGrabber, sheetScrim, TAP, useTheme } from '../../theme';
import { FormArrow, LukkIcon } from '../icons/Icons';
import { useKeyboardShown } from '../KeyboardInset';
import { HcpRuler } from './HcpRuler';

/** Så langt ned toppen av arket må dras før det lukkes. */
const DRAG_CLOSE = 100;

export function HandicapSheet({
  open,
  stored,
  updatedAt,
  onSave,
  onSaved,
  onCancel,
  onDismissed,
}: {
  open: boolean;
  /** Det lagrede handicapet, signert (plusshandicap er negativt). */
  stored: number;
  /** `users.handicap_updated_at`. */
  updatedAt: string;
  onSave: (signed: number) => Promise<ProfileSaveResult>;
  /** Lagringen gikk gjennom. Kalleren lukker arket. */
  onSaved: (signed: number) => void;
  /** Lukket uten å lagre. */
  onCancel: () => void;
  /** iOS: arket har glidd helt ut (fokus kan flyttes nå). */
  onDismissed?: () => void;
}) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardShown = useKeyboardShown();
  const online = useDeviceOnline();
  const min = rulerMin(stored);
  const [value, setValue] = useState(stored);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag] = useState(() => new Animated.Value(0));
  const dragFrom = useRef<number | null>(null);
  const dragged = useRef(0);

  const typed = typing ? parseRulerField(text, min) : null;
  // Mens feltet er oppe, er det feltet som gjelder. Et tomt felt er ikke en
  // feil ennå, men det er heller ikke et tall å lagre.
  const candidate = typing ? typed : value;
  const invalid = typing && text.trim() !== '' && typed === null;
  const change = hcpChange(stored, candidate ?? value);
  const fromLast = fromLastLine(change);
  const canSave = candidate !== null && online && !pending;

  const cancel = () => {
    if (!pending) onCancel();
  };

  const save = async () => {
    if (candidate === null || !online || pending) return;
    setPending(true);
    setError(null);
    const result = await onSave(candidate);
    setPending(false);
    if (result.ok) onSaved(candidate);
    else setError(describeHandicapSaveFailure(result.reason));
  };

  const startTyping = () => {
    setText(formatHcpNb(value));
    setTyping(true);
  };

  const stopTyping = () => {
    // Linjalen kommer tilbake på det skrevne tallet når det kan leses, ellers
    // på det siste gyldige.
    if (typed !== null) setValue(typed);
    setTyping(false);
    setText('');
  };

  // Dra ned fra toppen av arket. Rå berøringer, ikke en responder: ✕ i samme
  // rad skal fortsatt få trykket sitt. `pageY` er skjermens, så arket som
  // flytter seg under fingeren endrer ikke målingen.
  const onTouchStart = (event: GestureResponderEvent) => {
    dragFrom.current = event.nativeEvent.pageY;
    dragged.current = 0;
  };
  const onTouchMove = (event: GestureResponderEvent) => {
    if (dragFrom.current === null || pending) return;
    dragged.current = Math.max(0, event.nativeEvent.pageY - dragFrom.current);
    drag.setValue(dragged.current);
  };
  const endDrag = () => {
    const far = dragged.current >= DRAG_CLOSE;
    dragFrom.current = null;
    dragged.current = 0;
    // Lukkes arket, glir det ut der det står. En fjær tilbake samtidig ville
    // rykket det opp før det forsvant.
    if (far && !pending) onCancel();
    else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
  };

  const saveText = pending ? HANDICAP_TEXT.saving : saveLabel(candidate);
  const invalidLine =
    rulerFieldProblem(text, min) === 'plus_beyond_min' ? plusBeyondMinLine(min) : HANDICAP_TEXT.invalidRange;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={cancel}
      onDismiss={onDismissed}
      testID="hcp-sheet-modal"
    >
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: sheetScrim(colors, scheme) }]}
          onPress={cancel}
          accessible={false}
          testID="hcp-sheet-backdrop"
        />
        <KeyboardAvoidingView behavior="padding">
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                paddingBottom: keyboardShown ? 16 : 24 + insets.bottom,
                transform: [{ translateY: drag }],
              },
            ]}
            accessibilityViewIsModal
            onAccessibilityEscape={cancel}
            testID="hcp-sheet"
          >
            <View
              style={styles.top}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={endDrag}
              onTouchCancel={endDrag}
              testID="hcp-sheet-top"
            >
              <View style={[styles.grabber, { backgroundColor: sheetGrabber(scheme) }]} />
              <View style={styles.head}>
                <View style={styles.headText}>
                  <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
                    {HANDICAP_TEXT.sheetTitle}
                  </Text>
                  <Text style={[styles.subtitle, { color: colors.muted }]} testID="hcp-sheet-subtitle">
                    {sheetSubtitle(updatedAt, stored)}
                  </Text>
                </View>
                <Pressable
                  onPress={cancel}
                  style={styles.close}
                  accessibilityRole="button"
                  accessibilityLabel={HANDICAP_TEXT.close}
                  testID="hcp-sheet-close"
                >
                  <LukkIcon color={colors.text} size={20} strokeWidth={2} />
                </Pressable>
              </View>
            </View>

            {typing ? (
              <View style={styles.fieldBlock}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  onBlur={stopTyping}
                  autoFocus
                  keyboardType="decimal-pad"
                  autoComplete="off"
                  autoCorrect={false}
                  accessibilityLabel={HANDICAP_TEXT.fieldLabel}
                  style={[styles.field, { color: colors.text, borderBottomColor: colors.primary }]}
                  testID="hcp-sheet-field"
                />
                {invalid ? (
                  <Text
                    accessibilityRole="alert"
                    style={[styles.alert, { color: colors.danger }]}
                    testID="hcp-sheet-invalid"
                  >
                    {invalidLine}
                  </Text>
                ) : (
                  <FromLast change={change.direction} line={fromLast} />
                )}
              </View>
            ) : (
              <>
                <View style={styles.numberBlock}>
                  <Text
                    style={[styles.number, { color: colors.text }]}
                    accessibilityLiveRegion="polite"
                    testID="hcp-sheet-number"
                  >
                    {formatHcpNb(value)}
                  </Text>
                  <FromLast change={change.direction} line={fromLast} />
                </View>
                <HcpRuler
                  value={value}
                  min={min}
                  stored={stored}
                  onChange={setValue}
                  accessibilityValueText={rulerA11yValue(value, change)}
                />
                <Pressable
                  onPress={startTyping}
                  style={styles.typeButton}
                  accessibilityRole="button"
                  testID="hcp-sheet-type"
                >
                  <Text style={[styles.typeText, { color: colors.primary }]}>{HANDICAP_TEXT.typeNumber}</Text>
                </Pressable>
              </>
            )}

            <Pressable
              onPress={() => void save()}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave, busy: pending }}
              style={[styles.save, { backgroundColor: colors.primary }, !canSave && styles.off]}
              testID="hcp-sheet-save"
            >
              <Text style={[styles.saveText, { color: colors.onPrimary }]}>{saveText}</Text>
            </Pressable>
            {error ? (
              <Text
                accessibilityRole="alert"
                style={[styles.alert, { color: colors.danger }]}
                testID="hcp-sheet-error"
              >
                {error}
              </Text>
            ) : null}
            {!online ? (
              <Text style={[styles.offline, { color: colors.muted }]} testID="hcp-sheet-offline">
                {HANDICAP_TEXT.needsNetwork}
              </Text>
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Pila og «0,4 fra sist». Ned (lavere handicap) er bedre og får formfargen. */
function FromLast({ change, line }: { change: 'up' | 'down' | 'none'; line: string | null }) {
  const { colors } = useTheme();
  if (change === 'none' || line === null) return null;
  const color = change === 'down' ? colors.formUp : colors.muted;
  return (
    <View style={styles.fromLast} testID="hcp-sheet-from-last">
      <FormArrow direction={change} color={color} />
      <Text style={[styles.fromLastText, { color }]}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  // Tegningen: hjørner 22, 10 over grep-streken, 20 til sidene og 14 mellom delene.
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 14,
  },
  top: { gap: 14 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headText: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  title: fraunces(500, 22, 27),
  subtitle: {
    ...interLine(13, 16),
    marginTop: 2 + interLine(13, 16).marginTop,
    fontFamily: FONTS.sans,
    fontVariant: ['tabular-nums'],
  },
  close: {
    width: TAP,
    height: TAP,
    marginTop: -8,
    marginRight: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBlock: { alignItems: 'center', gap: 4 },
  number: { ...fraunces(600, 52, 52), fontVariant: ['tabular-nums'] },
  fromLast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  fromLastText: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  fieldBlock: { alignItems: 'center', gap: 8, paddingTop: 4 },
  field: {
    width: 160,
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 6,
    borderBottomWidth: 2,
    textAlign: 'center',
    fontFamily: fraunces(600, 52).fontFamily,
    fontSize: 52,
    lineHeight: 58,
    fontVariant: ['tabular-nums'],
  },
  alert: { ...interLine(15, 20, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  typeButton: { alignSelf: 'center', minHeight: TAP, paddingHorizontal: 16, justifyContent: 'center' },
  typeText: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold },
  save: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  saveText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
  off: { opacity: 0.4 },
  offline: { ...interLine(14, 18, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
});
