// #2297: arket «Oppdater handicap» (`Hcp-forslag-ark-B-*`, versjon 101 av
// designlerretet). Spilleren drar linjalen eller skriver tallet, fra +8 til 54, og
// lagrer uten å forlate spillet.
//
// Arket eier utkastet og tilstanden mens det er åpent, og starter på det som står
// lagret. Forelderen monterer det på nytt for hver åpning (`key`), så et utkast fra
// forrige gang aldri henger igjen; lagringen er forelderens
// (`onSave`), så arket vet ingenting om ruta. Lykkes den, kaller arket `onSaved`.
// Feiler den, står arket med tallet og en linje under knappen.
//
// ✕, dra ned, trykk utenfor, tilbake (Android) og VoiceOver-escape lukker uten å
// lagre, men ikke mens lagringen pågår. Mens tastaturet er oppe for «Skriv inn
// tallet», er linjalen skjult og «Lagre» står rett over tastaturet; lukkes
// tastaturet, kommer linjalen tilbake på det siste gyldige tallet.
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ProfileSaveResult } from '../../data/profile';
import {
  describeHandicapSaveFailure,
  HANDICAP_SHEET_TEXT,
  handicapFieldError,
  handicapSaveLabel,
  handicapSheetSubline,
  handicapSinceLast,
  handicapSinceLastSpoken,
} from '../../lib/handicapCopy';
import {
  hcpChange,
  isPlusOverLimit,
  parseRulerField,
  rulerMin,
  stepHcp,
} from '../../lib/hcpRuler';
import { formatHcpNb } from '../../lib/profileCopy';
import { useDeviceOnline } from '../../lib/useDeviceOnline';
import { FONTS, fraunces, interLine, sheetGrabber, sheetScrim, useTheme } from '../../theme';
import { FormArrow, LukkIcon } from '../icons/Icons';
import { HcpRuler } from './HcpRuler';

export function HandicapSheet({
  open,
  stored,
  updatedAt,
  onSave,
  onSaved,
  onClose,
}: {
  open: boolean;
  /** Handicapet som står lagret (signert; plusshandicap er negativt). */
  stored: number;
  updatedAt: string | null;
  onSave: (signed: number) => Promise<ProfileSaveResult>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useDeviceOnline();
  const min = rulerMin(stored);

  const [value, setValue] = useState(stored);
  const [typing, setTyping] = useState(false);
  const [raw, setRaw] = useState(formatHcpNb(stored));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lukkes tastaturet, er feltet ferdig: linjalen tar over på siste gyldige tall.
  useEffect(() => {
    if (!typing) return undefined;
    const ios = Keyboard.addListener('keyboardWillHide', () => setTyping(false));
    const android = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    return () => {
      ios.remove();
      android.remove();
    };
  }, [typing]);

  const parsed = typing ? parseRulerField(raw, min) : value;
  const invalid = typing && parsed === null;
  const shown = parsed ?? value;
  const change = hcpChange(stored, shown);
  const since = handicapSinceLast(change);
  const sinceSpoken = handicapSinceLastSpoken(change);
  const canSave = parsed !== null && online && !pending;

  const close = () => {
    if (!pending) onClose();
  };

  // Dra ned i hodet (grep-streken og tittelen) lukker arket, som i Apples ark. Bare hodet
  // lytter, så linjalens vannrette dra aldri kan lukke det.
  const [drag] = useState(() => new Animated.Value(0));
  const dragFrom = useRef<number | null>(null);
  const dragged = useRef(0);
  const dragHandlers = {
    onTouchStart: (event: { nativeEvent: { pageY: number } }) => {
      dragFrom.current = event.nativeEvent.pageY;
      dragged.current = 0;
    },
    onTouchMove: (event: { nativeEvent: { pageY: number } }) => {
      if (dragFrom.current === null) return;
      dragged.current = Math.max(0, event.nativeEvent.pageY - dragFrom.current);
      drag.setValue(dragged.current);
    },
    onTouchEnd: () => {
      const far = dragged.current >= DRAG_CLOSE_PT;
      dragFrom.current = null;
      dragged.current = 0;
      if (far && !pending) onClose();
      Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    },
    onTouchCancel: () => {
      dragFrom.current = null;
      dragged.current = 0;
      Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    },
  };

  const editField = (text: string) => {
    setRaw(text);
    setError(null);
    const next = parseRulerField(text, min);
    if (next !== null) setValue(next);
  };

  const startTyping = () => {
    setRaw(formatHcpNb(value));
    setTyping(true);
  };

  const save = async () => {
    if (parsed === null || !canSave) return;
    setPending(true);
    setError(null);
    const result = await onSave(parsed);
    setPending(false);
    if (result.ok) onSaved();
    else setError(describeHandicapSaveFailure(result.reason));
  };

  const bottom = typing ? 16 : 24 + insets.bottom;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={close}
      testID="handicap-sheet-modal"
    >
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: sheetScrim(colors, scheme) }]}
          onPress={close}
          accessible={false}
          testID="handicap-sheet-backdrop"
        />
        <KeyboardAvoidingView behavior="padding">
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, paddingBottom: bottom, transform: [{ translateY: drag }] },
            ]}
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            testID="handicap-sheet"
          >
            <View style={styles.dragZone} testID="handicap-sheet-drag" {...dragHandlers}>
            <View style={[styles.grabber, { backgroundColor: sheetGrabber(scheme) }]} />
            <View style={styles.head}>
              <View style={styles.headText}>
                <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
                  {HANDICAP_SHEET_TEXT.title}
                </Text>
                <Text style={[styles.subline, { color: colors.muted }]} testID="handicap-sheet-subline">
                  {handicapSheetSubline(updatedAt, stored)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={HANDICAP_SHEET_TEXT.close}
                onPress={close}
                style={styles.close}
                testID="handicap-sheet-close"
              >
                <LukkIcon color={colors.text} size={20} strokeWidth={2} />
              </Pressable>
            </View>
            </View>

            {typing ? (
              <View style={styles.fieldBlock}>
                <TextInput
                  value={raw}
                  onChangeText={editField}
                  keyboardType="decimal-pad"
                  autoFocus
                  autoCorrect={false}
                  maxLength={6}
                  selectTextOnFocus
                  accessibilityLabel={HANDICAP_SHEET_TEXT.fieldLabel}
                  style={[styles.field, { color: colors.text, borderBottomColor: colors.primary }]}
                  testID="handicap-sheet-field"
                />
                {invalid ? (
                  <Text
                    accessibilityRole="alert"
                    style={[styles.errorLine, { color: colors.danger }]}
                    testID="handicap-sheet-invalid"
                  >
                    {handicapFieldError(isPlusOverLimit(raw, min), min)}
                  </Text>
                ) : (
                  <Since since={since} spoken={sinceSpoken} down={change.direction === 'down'} />
                )}
              </View>
            ) : (
              <>
                <View style={styles.numberBlock}>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.number, { color: colors.text }]}
                    testID="handicap-sheet-number"
                  >
                    {formatHcpNb(shown)}
                  </Text>
                  <Since since={since} spoken={sinceSpoken} down={change.direction === 'down'} />
                </View>
                <HcpRuler
                  value={value}
                  stored={stored}
                  min={min}
                  onChange={setValue}
                  onStep={(delta) => setValue((current) => stepHcp(current, delta, min))}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={startTyping}
                  style={styles.enter}
                  testID="handicap-sheet-enter"
                >
                  <Text style={[styles.enterText, { color: colors.primary }]}>
                    {HANDICAP_SHEET_TEXT.enter}
                  </Text>
                </Pressable>
              </>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave, busy: pending }}
              disabled={!canSave}
              onPress={() => void save()}
              style={[
                styles.save,
                { backgroundColor: colors.primary },
                !canSave ? styles.saveOff : null,
              ]}
              testID="handicap-sheet-save"
            >
              <Text style={[styles.saveText, { color: colors.onPrimary }]}>
                {handicapSaveLabel(parsed, pending)}
              </Text>
            </Pressable>
            {error ? (
              <Text
                accessibilityRole="alert"
                style={[styles.errorLine, { color: colors.danger }]}
                testID="handicap-sheet-error"
              >
                {error}
              </Text>
            ) : null}
            {!online ? (
              <Text style={[styles.offline, { color: colors.muted }]} testID="handicap-sheet-offline">
                {HANDICAP_SHEET_TEXT.offline}
              </Text>
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** «0,4 fra sist» med pil: ned (lavere, bedre) i grønt, opp i dempet. Uendret: ingenting. */
function Since({
  since,
  spoken,
  down,
}: {
  since: string | null;
  spoken: string | null;
  down: boolean;
}) {
  const { colors } = useTheme();
  if (!since) return null;
  const color = down ? colors.formUp : colors.muted;
  return (
    <View style={styles.since} accessible accessibilityLabel={spoken ?? since} testID="handicap-sheet-since">
      <FormArrow direction={down ? 'down' : 'up'} color={color} />
      <Text style={[styles.sinceText, { color }]}>{since}</Text>
    </View>
  );
}

/** Hvor langt ned hodet må dras før arket lukkes. */
export const DRAG_CLOSE_PT = 100;

const TITLE = fraunces(500, 22, 27);
const NUMBER = fraunces(600, 52, 52);

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  // Designet: 22 i hjørnene, 10 over grep-streken, 20 på sidene, 14 mellom delene.
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 14,
  },
  dragZone: { gap: 14 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headText: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  title: TITLE,
  subline: {
    ...interLine(13, 16),
    fontFamily: FONTS.sans,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  // 44 × 44, −10 til høyre og −8 opp, som ✕ i flightvelgeren.
  close: {
    width: 44,
    height: 44,
    marginTop: -8,
    marginRight: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBlock: { alignItems: 'center', gap: 4 },
  number: { ...NUMBER, fontVariant: ['tabular-nums'] },
  since: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  sinceText: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  enter: { alignSelf: 'center', minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  enterText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  fieldBlock: { alignItems: 'center', gap: 8, paddingTop: 4 },
  field: {
    ...NUMBER,
    width: 160,
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 6,
    borderBottomWidth: 2,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  save: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  saveOff: { opacity: 0.4 },
  saveText: { fontSize: 16, fontFamily: FONTS.sansSemiBold },
  errorLine: { ...interLine(15, 20, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  offline: { ...interLine(14, 18, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
});
