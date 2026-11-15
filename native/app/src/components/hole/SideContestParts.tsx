// #2283: delene raden og arket for sidekonkurransen er bygd av, felles for
// nærmest pinnen og lengste drive (`SideContestCard`) og GIR (`GirContestCard`).
// Tegningene: `Sidekonk-kortet`, `Sidekonk-gir` og `Sidekonk-hullet` på
// designlerretet (eierens valg 15.11: «B, rad og ark»).
//
// - **Raden** står på hullet og åpner arket. Den viser svaret flighten har meldt
//   inn, eller «Meld inn». Uten nett og når hentingen ikke har lyktes, er den
//   sperret med en forklaring.
// - **Arket** er bygd som kåringsarket (`endGame/WinnerSheet.tsx`): hinne og ark
//   er søsken, VoiceOver holdes inne, og «tilbake» lukker. Linjene har rolle og
//   valgt-tilstand, og status og feil leses opp. `BingoBangoBongoCard` har ingen
//   av delene, og arket kopierer det ikke.
// - **Avstanden** (bare nærmest pinnen) har tekstfelt, og arket står derfor i
//   en `KeyboardAvoidingView`, som handicaparket (`game/HandicapSheet.tsx`).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseClaimDistance } from '../../../../../lib/games/sideContest';
import { formatDistance, SIDE_CONTEST_TEXT, stepDistance } from '../../lib/sideContestCopy';
import { FONTS, fraunces, frauncesFamily, interLine, sheetScrim, TAP, useTheme } from '../../theme';
import {
  AvstandIcon,
  ChevronIcon,
  FeilIcon,
  IngenIcon,
  LukkIcon,
  UtenNettIcon,
  UtslagHakeIcon,
} from '../icons/Icons';

/** Hva raden viser til høyre, og om den kan åpnes. */
export type ContestRowState = 'report' | 'answered' | 'offline' | 'failed';

/** Raden på hullet (min-høyde 64, ikonrute 36, «Meld inn» eller pil). */
export function ContestRow({
  icon,
  title,
  subtitle,
  state,
  onPress,
  testID,
}: {
  icon: (color: string) => ReactNode;
  title: string;
  /** Svaret, poenglinja, eller forklaringen når raden er sperret. */
  subtitle: string;
  state: ContestRowState;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const disabled = state === 'offline' || state === 'failed';
  const subtitleColor = state === 'offline' ? colors.warningText : colors.muted;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityHint={state === 'report' ? SIDE_CONTEST_TEXT.report : undefined}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.primary }]}>{icon(colors.surface)}</View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.rowSubtitle, { color: subtitleColor }]} numberOfLines={1} testID={`${testID}-subtitle`}>
          {subtitle}
        </Text>
      </View>
      {state === 'report' ? (
        <View style={[styles.pill, { backgroundColor: colors.primary }]}>
          <Text style={[styles.pillText, { color: colors.onPrimary }]}>{SIDE_CONTEST_TEXT.report}</Text>
        </View>
      ) : state === 'answered' ? (
        <ChevronIcon direction="right" color={colors.muted} size={20} strokeWidth={2} />
      ) : state === 'offline' ? (
        <UtenNettIcon color={colors.warningText} size={20} />
      ) : (
        <FeilIcon color={colors.muted} size={20} />
      )}
    </Pressable>
  );
}

/** Varselet øverst i arket: uten nett, eller lagringsfeil. */
export type SheetNotice = { kind: 'offline' | 'error'; text: string } | null;

/**
 * Arket: kicker, tittel og lukk, varsel, innhold, status og «Ferdig». «Ferdig»
 * lukker bare; hvert trykk på en linje er alt lagret.
 */
export function ContestSheet({
  open,
  onClose,
  kicker,
  title,
  notice,
  status,
  saved,
  children,
  testID,
}: {
  open: boolean;
  onClose: () => void;
  kicker: string;
  title: string;
  notice: SheetNotice;
  /** Linja over «Ferdig». */
  status: string;
  /** Noe er lagret: statusen får hake og grønn tekst. */
  saved: boolean;
  children: ReactNode;
  testID: string;
}) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // iOS har ingen live region: en ny feil eller status leses opp med en
  // kunngjøring. Android leser `accessibilityLiveRegion` under.
  const announced = useRef<string | null>(null);
  const spoken = notice?.kind === 'error' ? notice.text : status;
  useEffect(() => {
    if (!open) {
      announced.current = null;
      return;
    }
    if (announced.current === null) {
      // Første tekst er det som sto da arket åpnet; den leses med arket.
      announced.current = spoken;
      return;
    }
    if (announced.current === spoken) return;
    announced.current = spoken;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(spoken);
  }, [open, spoken]);

  return (
    <Modal transparent visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill} testID={testID}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: sheetScrim(colors, scheme) }]}
          onPress={onClose}
          accessible={false}
          testID={`${testID}-scrim`}
        />
        <KeyboardAvoidingView behavior="padding">
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.bg,
                paddingBottom: 24 + insets.bottom,
                // Arket står under statuslinja også med fem i flighten (Wolf).
                maxHeight: windowHeight - insets.top - 24,
              },
            ]}
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
          >
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
              <View style={styles.head}>
                <View style={styles.headText}>
                  <Text style={[styles.kicker, { color: colors.accentText }]}>{kicker}</Text>
                  <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
                    {title}
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  style={[styles.close, { backgroundColor: colors.surface2 }]}
                  accessibilityRole="button"
                  accessibilityLabel={SIDE_CONTEST_TEXT.close}
                  testID={`${testID}-close`}
                >
                  <LukkIcon color={colors.text} size={18} strokeWidth={2} />
                </Pressable>
              </View>
              <View style={styles.headGap} />
              {notice ? (
                <View
                  style={[
                    styles.notice,
                    notice.kind === 'offline'
                      ? { backgroundColor: colors.warningSoft, borderColor: 'transparent' }
                      : { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
                  ]}
                  accessibilityLiveRegion="polite"
                  testID={`${testID}-notice`}
                >
                  {notice.kind === 'offline' ? (
                    <UtenNettIcon color={colors.warningText} size={18} />
                  ) : (
                    <FeilIcon color={colors.danger} size={18} />
                  )}
                  <Text
                    style={[
                      styles.noticeText,
                      { color: notice.kind === 'offline' ? colors.warningText : colors.danger },
                    ]}
                  >
                    {notice.text}
                  </Text>
                </View>
              ) : null}
              {children}
              <View style={styles.statusBox} accessibilityLiveRegion="polite" testID={`${testID}-status`}>
                {saved ? <UtslagHakeIcon color={colors.successText} size={14} strokeWidth={2.4} /> : null}
                <Text
                  style={[
                    styles.status,
                    saved
                      ? { color: colors.successText, fontFamily: FONTS.sansSemiBold }
                      : { color: colors.muted, fontFamily: FONTS.sans },
                  ]}
                >
                  {status}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                style={[styles.done, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
                testID={`${testID}-done`}
              >
                <Text style={[styles.doneText, { color: colors.onPrimary }]}>{SIDE_CONTEST_TEXT.done}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Spørsmålet over lista. */
export function SheetQuestion({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.question, { color: colors.muted }]}>{text}</Text>;
}

/** Kortet linjene står i. */
export function LineList({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}>{children}</View>;
}

/** Et fjes med forbokstaver, eller den stiplede ringen foran «Ingen …». */
export type LineFace = { initials: string } | 'none';

/**
 * Én linje i arket: fjes, navn og en radioknapp (ett valg) eller en
 * avkrysningsboks (GIR, flere valg).
 */
export function ContestLine({
  faces,
  label,
  checked,
  kind,
  disabled,
  last,
  onPress,
  testID,
}: {
  /** Ett fjes, to for en foursomes-side, eller ringen for «Ingen …». */
  faces: readonly LineFace[];
  label: string;
  checked: boolean;
  kind: 'radio' | 'checkbox';
  disabled: boolean;
  last: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.line,
        !last && { borderBottomWidth: 1, borderBottomColor: colors.divider },
        checked && { backgroundColor: colors.primarySoft },
        disabled && styles.lineDisabled,
      ]}
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      testID={testID}
    >
      <Faces faces={faces} />
      <Text style={[styles.lineName, { color: colors.text }, checked && styles.lineNameChecked]}>{label}</Text>
      {kind === 'radio' ? <Radio checked={checked} /> : <Checkbox checked={checked} />}
    </Pressable>
  );
}

function Faces({ faces }: { faces: readonly LineFace[] }) {
  const { colors } = useTheme();
  if (faces.length === 1 && faces[0] === 'none') {
    return (
      <View style={[styles.face, styles.noneFace, { borderColor: colors.fieldBorder }]}>
        <IngenIcon color={colors.muted} size={20} />
      </View>
    );
  }
  const pair = faces.length > 1;
  return (
    <View style={styles.faces}>
      {faces.map((face, index) =>
        face === 'none' ? null : (
          <View
            key={index}
            style={[
              pair ? styles.pairFace : styles.face,
              { backgroundColor: colors.surface2 },
              // Den andre ligger 6 inn over den første, med en ring i kortets farge.
              index > 0 && { marginLeft: -6, borderWidth: 2, borderColor: colors.surface },
            ]}
          >
            <Text style={[styles.initials, { color: colors.text }]}>{face.initials}</Text>
          </View>
        ),
      )}
    </View>
  );
}

/** Radioknappen: tom ring, eller grønn ring med prikk (som `WinnerSheet`). */
function Radio({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.radio,
        checked ? { borderWidth: 2, borderColor: colors.primary } : { borderWidth: 1.5, borderColor: colors.muted },
      ]}
    >
      {checked ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
    </View>
  );
}

/** Avkrysningsboksen: tom firkant, eller fylt med hake. */
function Checkbox({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.checkbox,
        checked ? { backgroundColor: colors.primary } : { borderWidth: 1.5, borderColor: colors.muted },
      ]}
    >
      {checked ? <UtslagHakeIcon color={colors.onPrimary} size={14} strokeWidth={2.6} /> : null}
    </View>
  );
}

/**
 * «Hvor nær?» med − og + i halve meter, og tallet som kan skrives inn («2,4»
 * og «2.4»). `onCommit` får den nye avstanden når den er gyldig og endret.
 */
export function DistanceField({
  value,
  disabled,
  onCommit,
  testID,
}: {
  value: number | null;
  disabled: boolean;
  onCommit: (distanceM: number | null) => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState(value == null ? '' : formatDistance(value));
  const [editing, setEditing] = useState(false);
  // Et svar utenfra (lagret, eller en flightkamerat) skal stå i feltet, men
  // ikke mens spilleren skriver.
  const shown = editing ? text : value == null ? '' : formatDistance(value);

  const step = (direction: -1 | 1) => {
    const next = stepDistance(value, direction);
    if (next != null) onCommit(next);
  };
  const commitText = () => {
    setEditing(false);
    const parsed = parseClaimDistance(text);
    if (parsed.ok && parsed.distanceM !== value) onCommit(parsed.distanceM);
  };

  return (
    <View
      style={[styles.distance, { borderColor: colors.border, backgroundColor: colors.surface }]}
      testID={testID}
    >
      <View style={[styles.distanceRow, disabled && styles.lineDisabled]}>
        <Text style={[styles.distanceLabel, { color: colors.text }]}>{SIDE_CONTEST_TEXT.distanceLabel}</Text>
        <View style={styles.stepper}>
          <StepButton
            plus={false}
            disabled={disabled || stepDistance(value, -1) == null}
            onPress={() => step(-1)}
            testID={`${testID}-minus`}
          />
          <View style={styles.distanceValue}>
            <TextInput
              value={shown}
              editable={!disabled}
              onFocus={() => {
                setText(value == null ? '' : formatDistance(value));
                setEditing(true);
              }}
              onChangeText={setText}
              onEndEditing={commitText}
              onSubmitEditing={commitText}
              keyboardType="decimal-pad"
              inputMode="decimal"
              accessibilityLabel={SIDE_CONTEST_TEXT.metreField}
              style={[styles.distanceInput, { color: colors.text }]}
              testID={`${testID}-input`}
            />
            <View style={styles.metreBox}>
              <Text style={[styles.metre, { color: colors.muted }]}>{SIDE_CONTEST_TEXT.metre}</Text>
            </View>
          </View>
          <StepButton
            plus
            disabled={disabled || stepDistance(value, 1) == null}
            onPress={() => step(1)}
            testID={`${testID}-plus`}
          />
        </View>
      </View>
    </View>
  );
}

function StepButton({
  plus,
  disabled,
  onPress,
  testID,
}: {
  plus: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.step, { borderColor: colors.fieldBorder, backgroundColor: colors.surface }]}
      accessibilityRole="button"
      accessibilityLabel={plus ? SIDE_CONTEST_TEXT.longer : SIDE_CONTEST_TEXT.shorter}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <AvstandIcon plus={plus} color={colors.text} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  rowSubtitle: { ...interLine(13, 17), fontFamily: FONTS.sans },
  pill: { height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', flexShrink: 0 },
  pillText: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 999 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  headText: { flexShrink: 1 },
  kicker: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  title: { ...fraunces(500, 24, 28.8, { multiline: true }) },
  close: {
    width: TAP,
    height: TAP,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headGap: { height: 8 },
  notice: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  noticeText: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sansMedium, flexShrink: 1 },
  question: {
    ...interLine(14, 19.6, { multiline: true }),
    fontFamily: FONTS.sans,
    marginHorizontal: 4,
    marginBottom: 12 + interLine(14, 19.6, { multiline: true }).marginBottom,
  },
  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  line: {
    minHeight: 56,
    paddingVertical: 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lineDisabled: { opacity: 0.4 },
  faces: { flexDirection: 'row', alignItems: 'center' },
  face: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  pairFace: { width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  noneFace: { borderWidth: 1.5, borderStyle: 'dashed' },
  initials: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
  lineName: { ...interLine(16, 20, { multiline: true }), fontFamily: FONTS.sans, flex: 1, minWidth: 0 },
  lineNameChecked: { fontFamily: FONTS.sansSemiBold },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dot: { width: 10, height: 10, borderRadius: 999 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  distance: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  distanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  distanceLabel: { ...interLine(14, 18), fontFamily: FONTS.sans },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  step: {
    width: TAP,
    height: TAP,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Tegningen setter tallet og «m» på samme grunnlinje. Et tekstfelt har ingen
  // grunnlinje i flex, så «m» flyttes ned: feltet sentrerer Fraunces 20 i 44
  // (grunnlinja ~29 ned), og Inter 13 i en 16-linje har grunnlinja 13 ned.
  distanceValue: {
    width: 64,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 3,
  },
  metreBox: { marginTop: 16 },
  // Feltet er 44 høyt; tallet står midt i det, uten linjeboksens marger.
  distanceInput: {
    fontFamily: frauncesFamily(600, 20),
    fontSize: 20,
    width: 40,
    height: TAP,
    padding: 0,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  metre: { ...interLine(13, 16), fontFamily: FONTS.sans },
  statusBox: {
    marginTop: 12,
    marginHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  status: { ...interLine(12, 16, { multiline: true }), flexShrink: 1 },
  done: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { ...interLine(16, 20), fontFamily: FONTS.sansSemiBold },
});
