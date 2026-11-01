// #2750: «Velg flight» / «Bytt flight» under startbilletten, og arket raden
// åpner (Forslag 2 på tegningen, eierens valg 01.11). Billetten er låst
// «identisk med artboardet», så velgeren står utenfor den.
//
// Regnestykket er `lib/flightPicker.ts`, og regelen er serverens
// (`lib/games/joinFlight.ts`). Her er bare drakten og kallet. Valget går aldri i
// sync-køen: uten nett viser arket flightene fra siste henting, og et trykk gir
// en ærlig feil.
//
// Hinnen og arket er søsken, ikke forelder og barn, som i
// `components/hole/SpecificValueSheet.tsx`: en Pressable rundt arket ville gjort
// alt inni til ett element for VoiceOver.
import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GameBundle } from '../../data/gameBundle';
import { joinFlight, type JoinFlightResult } from '../../data/joinFlight';
import {
  FLIGHT_PICKER_TEXT,
  buildFlightPicker,
  joinFlightOutcome,
  type PickerFlight,
} from '../../lib/flightPicker';
import { FONTS, fraunces, interLine, sheetGrabber, sheetScrim, TAP, useTheme } from '../../theme';
import { ChevronIcon, LukkIcon } from '../icons/Icons';

/** Arket står høyst så langt fra toppen. 700 pt på tegningens 844. */
const SHEET_TOP_GAP = 144;

export function FlightPicker({
  bundle,
  userId,
  onChanged,
}: {
  bundle: Pick<GameBundle, 'game' | 'players'>;
  userId: string;
  /** Hent bundelen på nytt. Spill-hjem tegner deretter raden og billetten. */
  onChanged: () => void | Promise<void>;
}) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // `busy` kommer først med neste render. Et dobbelttrykk er raskere enn det, og
  // to kall kunne gitt spilleren den andres feilmelding.
  const inFlight = useRef(false);
  const model = buildFlightPicker(bundle, userId);
  const hasFlight = model.myFlight != null;

  // Lista hentes på nytt når arket åpnes. En flight som ble ledig mens skjermen
  // sto åpen, skal ikke stå sperret til spilleren går ut og inn.
  const show = () => {
    setNotice(null);
    setOpen(true);
    void onChanged();
  };
  const close = () => {
    setOpen(false);
    setNotice(null);
  };

  const pick = async (flightNumber: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    let result: JoinFlightResult;
    try {
      result = await joinFlight(bundle.game.id, flightNumber);
    } catch {
      result = { ok: false, reason: 'flight_failed' };
    }
    const outcome = joinFlightOutcome(result);
    setNotice(outcome.notice);
    // Arket lukkes etter hentingen, så raden og billetten viser den nye flighten
    // i det de kommer til syne.
    if (outcome.refetch) await onChanged();
    if (outcome.close) setOpen(false);
    inFlight.current = false;
    setBusy(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${model.title}. ${model.rowSub}`}
        onPress={show}
        style={[
          styles.row,
          { backgroundColor: colors.surface },
          hasFlight
            ? { borderWidth: 1, borderColor: colors.border }
            : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.warning },
        ]}
        testID="flight-row"
      >
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{model.title}</Text>
          <Text
            style={[styles.rowSub, { color: hasFlight ? colors.muted : colors.warningText }]}
            testID="flight-row-sub"
          >
            {model.rowSub}
          </Text>
        </View>
        <ChevronIcon direction="right" color={colors.muted} size={18} strokeWidth={2} />
      </Pressable>

      <Modal transparent visible={open} animationType="slide" onRequestClose={close}>
        <View
          style={styles.fill}
          testID="flight-sheet"
          // VoiceOver holdes inne i arket, og «tilbake»-bevegelsen lukker det.
          accessibilityViewIsModal
          onAccessibilityEscape={close}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: sheetScrim(colors, scheme) }]}
            onPress={close}
            onAccessibilityTap={close}
            accessibilityRole="button"
            accessibilityLabel={FLIGHT_PICKER_TEXT.close}
            testID="flight-sheet-scrim"
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                maxHeight: height - SHEET_TOP_GAP,
                paddingBottom: 28 + insets.bottom,
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: sheetGrabber(scheme) }]} />
            <View style={styles.head}>
              <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
                {model.title}
              </Text>
              <Pressable
                onPress={close}
                style={styles.close}
                accessibilityRole="button"
                accessibilityLabel={FLIGHT_PICKER_TEXT.close}
                testID="flight-sheet-close"
              >
                <LukkIcon color={colors.text} size={20} strokeWidth={2} />
              </Pressable>
            </View>
            {notice ? (
              <View
                style={[styles.notice, { backgroundColor: colors.warningSoft }]}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                testID="flight-sheet-notice"
              >
                <Text style={[styles.noticeText, { color: colors.warningText }]}>{notice}</Text>
              </View>
            ) : (
              <Text style={[styles.hint, { color: colors.muted }]} testID="flight-sheet-hint">
                {model.hint}
              </Text>
            )}
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {model.sections.map((section) => (
                <View key={section.key} style={styles.listContent}>
                  <Text
                    style={[styles.sectionHead, { color: colors.muted }]}
                    accessibilityRole="header"
                  >
                    {section.title}
                  </Text>
                  {section.flights.map((flight) => (
                    <FlightOption
                      key={flight.number}
                      flight={flight}
                      busy={busy}
                      onPick={() => void pick(flight.number)}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function FlightOption({
  flight,
  busy,
  onPick,
}: {
  flight: PickerFlight;
  busy: boolean;
  onPick: () => void;
}) {
  const { colors, scheme } = useTheme();
  const disabled = flight.disabled || busy;
  // Tegningens fulle rad: `surface2` i lys, bakgrunnen i natt.
  const fullFill = scheme === 'dark' ? colors.bg : colors.surface2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={flight.a11y}
      accessibilityState={{ selected: flight.mine, disabled }}
      disabled={disabled}
      onPress={onPick}
      style={[
        styles.option,
        flight.mine
          ? { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft }
          : flight.full
            ? { borderWidth: 1, borderColor: colors.border, backgroundColor: fullFill }
            : { borderWidth: 1, borderColor: colors.fieldBorder, backgroundColor: colors.surface },
        busy && !flight.mine && styles.optionBusy,
      ]}
      testID={`flight-option-${flight.number}`}
    >
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{flight.label}</Text>
        <Text style={[styles.optionNames, { color: flight.namesMuted ? colors.muted : colors.text }]}>
          {flight.names}
        </Text>
      </View>
      <View style={styles.optionSide}>
        <Text style={[styles.optionCount, { color: colors.muted }]}>{flight.count}</Text>
        <Text style={[styles.optionStatus, { color: flight.full ? colors.muted : colors.primary }]}>
          {flight.status}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 12 pt under billetten i tegningen: skjermens `gap` på 8 og 4 til.
  row: {
    marginTop: 4,
    minHeight: 64,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: { flexGrow: 1, flexShrink: 1, gap: 2 },
  rowTitle: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold },
  rowSub: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  fill: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...fraunces(600, 22), flexShrink: 1 },
  close: {
    width: TAP,
    height: TAP,
    marginRight: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  noticeText: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  hint: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  // Lista ruller inne i arket, så 13 flighter ikke skyver tittelen ut av skjermen.
  list: { flexShrink: 1 },
  listContent: { gap: 8 },
  sectionHead: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, marginTop: 6 },
  option: {
    minHeight: 60,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // Som nettets velger mens et kall pågår.
  optionBusy: { opacity: 0.6 },
  optionText: { flexGrow: 1, flexShrink: 1, gap: 1 },
  optionLabel: fraunces(600, 17),
  optionNames: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  optionSide: { flexShrink: 0, alignItems: 'flex-end', gap: 2 },
  optionCount: {
    ...interLine(13, 16),
    fontFamily: FONTS.sans,
    fontVariant: ['tabular-nums'],
  },
  optionStatus: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
});
