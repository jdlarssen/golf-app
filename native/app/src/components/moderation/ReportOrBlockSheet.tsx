// #3019: arket «Rapporter eller blokker» (Apples regel 1.2, Google Plays regel
// om brukerskapt innhold). Tegningene fra fase 1 er fasiten (designlerretet,
// rad 159400): 2 valget fra en person, 3 rapporten om en person, 8 rapporten
// om en runde, 10 valget fra startbilletten, 5 og 6 kvitteringene. Spørsmålet
// før blokkering (tegning 4) er telefonens egen dialog, som «Fjern venn».
//
// Ett ark med fire steg, så skjermene bare sier hva som rapporteres:
//   pick    → runden eller en spiller (startbilletten)
//   choose  → rapporter eller blokker en person
//   report  → grunn, valgfri tekst og «Blokker … også» (bare for en person)
//   done    → kvitteringen
//
// Rapporten går til `POST /api/reports`; blokkeringen er appens egen skriving
// i `user_blocks` (`data/blocks.ts`). Mens et kall går, er knappene låst og
// arket kan ikke lukkes. Tastaturet: som `RejectSheet`, `KeyboardAvoidingView`
// rundt arket.
import { useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Tap } from '../Tap';
import { useBottomInsetUnlessKeyboard } from '../KeyboardInset';
import { DesignSwitch, listSwitchOffColor } from '../DesignSwitch';
import { Avatar } from '../friends/FriendParts';
import { BetaltHakeIcon, BlokkerIcon, ChevronIcon, RapportIcon } from '../icons/Icons';
import { FONTS, fraunces, interLine, sheetGrabber, sheetScrim, useTheme } from '../../theme';
import { blockUser } from '../../data/blocks';
import { submitReport, type ReportTarget } from '../../data/reports';
import {
  BLOCKED_BODY,
  MODERATION_TEXT,
  REPORT_PERSON_SUB,
  REPORT_REASON_LABEL,
  alsoBlockLabel,
  blockConfirmMessage,
  blockConfirmTitle,
  blockPersonLabel,
  blockPersonSub,
  blockedTitle,
  describeBlockFailure,
  describeReportFailure,
  reportPersonAnonymous,
  reportPersonLabel,
  reportPersonTitle,
  reportedAndBlockedBody,
} from '../../lib/moderationCopy';
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason } from '../../../../../lib/moderation/reportInput';

export type ModerationPerson = { userId: string; name: string };

export type ModerationSubject =
  /** En person (vennesiden). */
  | { kind: 'person'; person: ModerationPerson }
  /** En runde, og spillerne man kan velge i stedet (startbilletten). */
  | { kind: 'round'; target: ReportTarget; roundName: string; players: ModerationPerson[] };

/** Hva som skjedde, så skjermen kan gå videre (en blokkert venn er borte fra Venner). */
export type ModerationOutcome = 'none' | 'reported' | 'blocked';

type Step =
  | { kind: 'pick' }
  | { kind: 'choose'; person: ModerationPerson }
  | { kind: 'report'; person: ModerationPerson | null }
  | { kind: 'done'; title: string; body: string; outcome: ModerationOutcome };

function firstStep(subject: ModerationSubject): Step {
  if (subject.kind === 'person') return { kind: 'choose', person: subject.person };
  return subject.players.length > 0 ? { kind: 'pick' } : { kind: 'report', person: null };
}

export function ReportOrBlockSheet({
  subject,
  onClose,
}: {
  subject: ModerationSubject;
  onClose: (outcome: ModerationOutcome) => void;
}) {
  const { colors, scheme } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const [step, setStep] = useState<Step>(() => firstStep(subject));
  const [reason, setReason] = useState<ReportReason>('offensive');
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    onClose(step.kind === 'done' ? step.outcome : 'none');
  };

  const showLine = (text: string) => {
    setLine(text);
    AccessibilityInfo.announceForAccessibility(text);
  };

  const block = async (person: ModerationPerson) => {
    setBusy(true);
    setLine(null);
    const result = await blockUser(person.userId);
    setBusy(false);
    if (!result.ok) {
      showLine(describeBlockFailure(result.reason));
      return;
    }
    setStep({ kind: 'done', title: blockedTitle(person.name), body: BLOCKED_BODY, outcome: 'blocked' });
  };

  const confirmBlock = (person: ModerationPerson) => {
    Alert.alert(
      blockConfirmTitle(person.name),
      blockConfirmMessage(person.name),
      [
        { text: MODERATION_TEXT.cancel, style: 'cancel' },
        { text: MODERATION_TEXT.blockConfirm, style: 'destructive', onPress: () => void block(person) },
      ],
      { cancelable: false },
    );
  };

  const send = async (person: ModerationPerson | null) => {
    const target: ReportTarget =
      person ? { kind: 'user', userId: person.userId } : (subject as Extract<ModerationSubject, { kind: 'round' }>).target;
    setBusy(true);
    setLine(null);
    const result = await submitReport(target, reason, note);
    if (!result.ok) {
      setBusy(false);
      showLine(describeReportFailure(result.reason));
      return;
    }
    // «Blokker … også»: rapporten står uansett. Feiler blokkeringen, sier
    // kvitteringen bare at rapporten er sendt, og spilleren kan blokkere fra
    // arket igjen.
    const blocked = person && alsoBlock ? (await blockUser(person.userId)).ok : false;
    setBusy(false);
    setStep({
      kind: 'done',
      title: MODERATION_TEXT.reportedTitle,
      body: blocked && person ? reportedAndBlockedBody(person.name) : MODERATION_TEXT.reportedBody,
      outcome: blocked ? 'blocked' : 'reported',
    });
  };

  const header = (title: string, sub: string | null) => (
    <View>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      {sub ? <Text style={[styles.sub, { color: colors.muted }]}>{sub}</Text> : null}
    </View>
  );

  const cancelButton = (
    <Tap
      style={styles.cancel}
      onPress={close}
      disabled={busy}
      accessibilityRole="button"
      testID="moderation-cancel"
    >
      <Text style={[styles.cancelText, { color: colors.primary }]}>{MODERATION_TEXT.cancel}</Text>
    </Tap>
  );

  const errorLine = line ? (
    <Text style={[styles.error, { color: colors.danger }]} testID="moderation-error">
      {line}
    </Text>
  ) : null;

  let content: React.ReactNode;
  if (step.kind === 'pick' && subject.kind === 'round') {
    content = (
      <>
        {header(MODERATION_TEXT.pickTitle, subject.roundName)}
        <View>
          <ChoiceRow
            icon={<RapportIcon color={colors.text} />}
            label={MODERATION_TEXT.pickRound}
            sub={MODERATION_TEXT.pickRoundSub}
            last={false}
            onPress={() => setStep({ kind: 'report', person: null })}
            testID="moderation-pick-round"
          />
          <Text style={[styles.kicker, { color: colors.muted }]}>{MODERATION_TEXT.pickPlayers}</Text>
          {subject.players.map((p, i) => (
            <ChoiceRow
              key={p.userId}
              icon={<Avatar name={p.name} tone="strong" size={36} />}
              bare
              label={p.name}
              last={i === subject.players.length - 1}
              onPress={() => setStep({ kind: 'choose', person: p })}
              testID={`moderation-pick-player-${p.userId}`}
            />
          ))}
        </View>
        {cancelButton}
      </>
    );
  } else if (step.kind === 'choose') {
    content = (
      <>
        {header(MODERATION_TEXT.chooseTitle, step.person.name)}
        <View>
          <ChoiceRow
            icon={<RapportIcon color={colors.text} />}
            label={reportPersonLabel(step.person.name)}
            sub={REPORT_PERSON_SUB}
            last={false}
            onPress={() => setStep({ kind: 'report', person: step.person })}
            testID="moderation-choose-report"
          />
          <ChoiceRow
            icon={<BlokkerIcon color={colors.danger} />}
            label={blockPersonLabel(step.person.name)}
            labelColor={colors.danger}
            sub={blockPersonSub(step.person.name)}
            last
            disabled={busy}
            onPress={() => confirmBlock(step.person)}
            testID="moderation-choose-block"
          />
        </View>
        {errorLine}
        {cancelButton}
      </>
    );
  } else if (step.kind === 'report') {
    const person = step.person;
    content = (
      <>
        {header(
          person ? reportPersonTitle(person.name) : MODERATION_TEXT.roundTitle,
          person ? null : subject.kind === 'round' ? subject.roundName : null,
        )}
        <Text style={[styles.anonymous, { color: colors.muted }]}>
          {person ? reportPersonAnonymous(person.name) : MODERATION_TEXT.roundAnonymous}
        </Text>
        <Text style={[styles.kicker, styles.reasonHeading, { color: colors.muted }]}>
          {MODERATION_TEXT.reasonHeading}
        </Text>
        <View
          style={[styles.radios, { borderColor: colors.border }]}
          accessibilityRole="radiogroup"
          testID="moderation-reasons"
        >
          {REPORT_REASONS.map((r, i) => {
            const on = r === reason;
            return (
              <Tap
                key={r}
                style={[
                  styles.radioRow,
                  i < REPORT_REASONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                ]}
                onPress={() => setReason(r)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: busy }}
                testID={`moderation-reason-${r}`}
              >
                <View style={[styles.dot, { borderColor: on ? colors.primary : colors.fieldBorder }]}>
                  {on ? <View style={[styles.dotInner, { backgroundColor: colors.primary }]} /> : null}
                </View>
                <Text
                  style={[
                    styles.radioLabel,
                    { color: colors.text, fontFamily: on ? FONTS.sansSemiBold : FONTS.sans },
                  ]}
                >
                  {REPORT_REASON_LABEL[r]}
                </Text>
              </Tap>
            );
          })}
        </View>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.muted }]} nativeID="moderation-note-label">
            {MODERATION_TEXT.noteLabel}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={REPORT_NOTE_MAX}
            editable={!busy}
            textAlignVertical="top"
            placeholder={MODERATION_TEXT.notePlaceholder}
            placeholderTextColor={colors.muted}
            accessibilityLabel={MODERATION_TEXT.noteLabel}
            accessibilityLabelledBy="moderation-note-label"
            style={[
              styles.input,
              { borderColor: colors.fieldBorder, backgroundColor: colors.surface, color: colors.text },
            ]}
            testID="moderation-note"
          />
        </View>
        {person ? (
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.text }]}>{alsoBlockLabel(person.name)}</Text>
            <DesignSwitch
              value={alsoBlock}
              disabled={busy}
              onValueChange={setAlsoBlock}
              label={alsoBlockLabel(person.name)}
              onColor={colors.primary}
              offColor={listSwitchOffColor(colors, scheme)}
              testID="moderation-also-block"
            />
          </View>
        ) : null}
        {errorLine}
        <Tap
          style={[styles.primary, { backgroundColor: colors.primary }, busy && styles.off]}
          onPress={() => void send(person)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          testID="moderation-send"
        >
          <Text style={[styles.primaryText, { color: colors.onPrimary }]}>
            {busy ? MODERATION_TEXT.sending : MODERATION_TEXT.send}
          </Text>
        </Tap>
        {cancelButton}
      </>
    );
  } else if (step.kind === 'done') {
    content = (
      <>
        <View style={[styles.doneIcon, { backgroundColor: colors.primarySoft }]}>
          <BetaltHakeIcon color={colors.primary} size={28} />
        </View>
        <Text style={[styles.doneTitle, { color: colors.text }]} accessibilityRole="header" testID="moderation-done-title">
          {step.title}
        </Text>
        <Text style={[styles.doneBody, { color: colors.muted }]}>{step.body}</Text>
        <Tap
          style={[styles.primary, styles.doneButton, { backgroundColor: colors.primary }]}
          onPress={close}
          accessibilityRole="button"
          testID="moderation-done"
        >
          <Text style={[styles.primaryText, { color: colors.onPrimary }]}>{MODERATION_TEXT.done}</Text>
        </Tap>
      </>
    );
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <View style={styles.root}>
        <Tap
          feedback="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: sheetScrim(colors, scheme) }]}
          onPress={close}
          accessible={false}
          testID="moderation-backdrop"
        />
        <KeyboardAvoidingView behavior="padding">
          <View
            style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 34 + bottomInset }]}
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            testID="moderation-sheet"
          >
            <View style={[styles.grabber, { backgroundColor: sheetGrabber(scheme) }]} />
            {content}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** En rad i valget: ikon i sirkel (eller en avatar), tekst og en chevron. */
function ChoiceRow({
  icon,
  bare = false,
  label,
  labelColor,
  sub,
  last,
  disabled = false,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  bare?: boolean;
  label: string;
  labelColor?: string;
  sub?: string;
  last: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Tap
      style={[styles.choice, !last && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
    >
      {bare ? icon : <View style={[styles.choiceIcon, { backgroundColor: colors.surface2 }]}>{icon}</View>}
      <View style={styles.choiceText}>
        <Text style={[styles.choiceLabel, { color: labelColor ?? colors.text }]}>{label}</Text>
        {sub ? <Text style={[styles.choiceSub, { color: colors.muted }]}>{sub}</Text> : null}
      </View>
      <ChevronIcon direction="right" color={colors.primary} size={16} strokeWidth={2} />
    </Tap>
  );
}

const TITLE = fraunces(500, 22, 27, { multiline: true });
const DONE_TITLE = fraunces(500, 24, 30, { multiline: true });

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  // Tegningene: radius 22, 10 over grep-streken, 20 på sidene, 14 mellom delene.
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 14,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999 },
  title: { ...TITLE },
  sub: { ...interLine(13, 18), fontFamily: FONTS.sans, marginTop: 2 },
  anonymous: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, marginTop: -6 },
  kicker: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, marginTop: 4 },
  reasonHeading: { marginBottom: -6 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  choiceIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  choiceText: { flex: 1, minWidth: 0 },
  choiceLabel: { ...interLine(15, 20), fontFamily: FONTS.sansSemiBold },
  choiceSub: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans, marginTop: 2 },
  radios: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: 10, height: 10, borderRadius: 5 },
  radioLabel: { ...interLine(15, 20) },
  field: { gap: 6 },
  label: { ...interLine(14, 18), fontFamily: FONTS.sansMedium },
  input: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FONTS.sans,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  switchLabel: { flex: 1, ...interLine(15, 20), fontFamily: FONTS.sansSemiBold },
  error: { ...interLine(14, 19, { multiline: true }), fontFamily: FONTS.sans },
  primary: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontFamily: FONTS.sansSemiBold },
  off: { opacity: 0.45 },
  cancel: { height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: -6 },
  cancelText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  doneIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 6 },
  doneTitle: { ...DONE_TITLE, textAlign: 'center' },
  doneBody: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center', marginTop: -4 },
  doneButton: { marginTop: 4 },
});
