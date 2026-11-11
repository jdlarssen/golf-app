// #2348: arket «Trygt på telefonen» bak lagringsbrikka (artboardet `Synk-forslag`).
//
// Hva ligger hvor: en setning om det som venter, rundens hull i et rutenett
// (✓ sendt, ● på telefonen, ! ikke lagret, – ikke tastet), forklaringen og
// knappene «Prøv å sende nå» og «Fortsett runden». Har spillet slag som ikke
// ble lagret, er tittelen SyncBanners egen («Hull 7 ble ikke lagret.»), og
// hvert hull får «Tast hull N på nytt», eller forklaringen når kortet er låst.
//
// Arket leser bare. «Prøv å sende nå» starter en vanlig drain og melder aldri
// «sendt» selv: rutene skifter først når køen er lest på nytt.
//
// Bygget som `SpecificValueSheet`: Modal uten animasjon, bakgrunnen og arket er
// søsken (ellers hører VoiceOver bare «Lukk»), og arkets felles hinne og grep.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  syncCellState,
  type RoundSyncState,
  type SyncCellState,
} from '../../../../../lib/sync/roundSyncState';
import { drainQueue } from '../../data/syncWorker';
import { SYNC_BANNER_TEXT, quarantineHolesText } from '../../lib/syncBannerCopy';
import {
  SYNC_CELL_TEXT,
  SYNC_CHIP_TEXT,
  cellA11yLabel,
  pendingText,
  retakeHoleText,
} from '../../lib/syncChipCopy';
import {
  FONTS,
  TAP,
  fraunces,
  interLine,
  sheetGrabber,
  sheetScrim,
  sheetShadowColor,
  type ThemeColors,
  useTheme,
} from '../../theme';

/** Webbens `RETRY_MIN_FEEDBACK_MS`, som SyncBanner: «Sender…» skal rekke å synes. */
const RETRY_MIN_FEEDBACK_MS = 500;
/** Ni ruter i bredden: én halvdel per rad. */
const COLUMNS = 9;
const CELL_ORDER: SyncCellState[] = ['sent', 'pending', 'quarantined', 'empty'];

function cellTone(state: SyncCellState, c: ThemeColors): { bg: string; fg: string; mark: string } {
  switch (state) {
    case 'sent':
      return { bg: c.primarySoft, fg: c.primary, mark: c.primary };
    case 'pending':
      return { bg: c.warningSoft, fg: c.warningText, mark: c.warning };
    case 'quarantined':
      return { bg: c.dangerSoft, fg: c.danger, mark: c.danger };
    case 'empty':
      return { bg: c.surface2, fg: c.muted, mark: c.muted };
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

export function SyncSheet({
  open,
  state,
  scoredHoles,
  holes,
  online,
  sunlight,
  onGoToHole,
  onRetried,
  onClose,
}: {
  open: boolean;
  state: RoundSyncState;
  scoredHoles: ReadonlySet<number>;
  /** Spillets egne hull (`gameHoleNumbers`); køen og slagene gjelder bare dem. */
  holes: readonly number[];
  /** Telefonen melder selv at den er på nett (`useDeviceOnline`). */
  online: boolean;
  sunlight: boolean;
  /** «Tast hull N på nytt»: gå til hullet. */
  onGoToHole: (hole: number) => void;
  /** Draina etter «Prøv å sende nå» er ferdig: les køen på nytt. */
  onRetried: () => void;
  onClose: () => void;
}) {
  const { colors, hole, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [retrying, setRetrying] = useState(false);
  if (!open) return null;

  const quarantined = state.quarantinedHoles.length > 0;
  const retakeHoles = state.quarantinedHoles.filter((n) => !state.quarantineLockedHoles.includes(n));
  const pending = state.pendingScoreCount + state.pendingTeeShotCount > 0;
  const waitingForNetwork = !online || state.lastErrorIsNetwork;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    await Promise.all([
      drainQueue('prøv å sende nå').catch(() => undefined),
      new Promise((r) => setTimeout(r, RETRY_MIN_FEEDBACK_MS)),
    ]);
    setRetrying(false);
    onRetried();
  };

  const cells = holes.map((n) => ({ hole: n, state: syncCellState(n, state, scoredHoles) }));
  const present = CELL_ORDER.filter((s) => cells.some((cell) => cell.state === s));
  // Sollys: hvite flater med svart kant, som resten av hullsiden.
  const edge = sunlight ? { borderWidth: hole.borderW, borderColor: colors.border } : null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View
        style={[styles.backdrop, { backgroundColor: sheetScrim(colors, scheme) }]}
        testID="sync-sheet-modal"
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          onAccessibilityTap={onClose}
          testID="sync-sheet-backdrop"
          accessibilityRole="button"
          accessibilityLabel="Lukk"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bg,
              shadowColor: sheetShadowColor(scheme),
              paddingBottom: SHEET_BOTTOM + insets.bottom,
            },
          ]}
          testID="sync-sheet"
        >
          <View style={[styles.handle, { backgroundColor: sheetGrabber(scheme) }]} />
          <View>
            <Text
              style={[styles.title, { color: quarantined ? colors.danger : colors.text }]}
              accessibilityRole="header"
              testID="sync-sheet-title"
            >
              {quarantined ? quarantineHolesText(state.quarantinedHoles) : SYNC_CHIP_TEXT.sheetTitle}
            </Text>
            {pending || !quarantined ? (
              <Text style={[styles.body, { color: colors.muted }]} testID="sync-sheet-body">
                {pending
                  ? `${online ? '' : `${SYNC_CHIP_TEXT.noCoverage} `}${pendingText({
                      // Slagene nevner bare hull med slag; står bare utslagsvalg
                      // igjen, er det de hullene.
                      holes: state.pendingScoreCount > 0 ? state.pendingScoreHoles : state.pendingHoles,
                      pendingScoreCount: state.pendingScoreCount,
                      pendingTeeShotCount: state.pendingTeeShotCount,
                      waitingForNetwork,
                    })}`
                  : `${online ? '' : `${SYNC_CHIP_TEXT.noCoverage} `}${SYNC_CHIP_TEXT.allSent}`}
              </Text>
            ) : null}
          </View>

          {state.quarantineLockedHoles.length > 0 ? (
            <Text style={[styles.body, { color: colors.muted }]} testID="sync-sheet-locked">
              {SYNC_BANNER_TEXT.quarantineLockedHint}
            </Text>
          ) : null}
          {/* Et låst hull får ingen lenke: å taste det på nytt hjelper ikke (#2211). */}
          {retakeHoles.length > 0 ? (
            <View style={styles.retakes}>
              {retakeHoles.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => onGoToHole(n)}
                  style={styles.retake}
                  testID={`sync-sheet-retake-${n}`}
                  accessibilityRole="link"
                >
                  <Text style={[styles.retakeText, { color: colors.danger }]}>{retakeHoleText(n)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.grid} testID="sync-grid">
            {chunk(cells, COLUMNS).map((row) => (
              <View key={row[0].hole} style={styles.gridRow}>
                <View
                  style={styles.numbers}
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                >
                  {row.map((cell) => (
                    <Text key={cell.hole} style={[styles.number, { color: colors.muted }]}>
                      {cell.hole}
                    </Text>
                  ))}
                  {padRow(row.length)}
                </View>
                <View style={styles.cells} accessibilityRole="list">
                  {row.map((cell) => {
                    const tone = cellTone(cell.state, colors);
                    return (
                      <View
                        key={cell.hole}
                        style={[styles.cell, { backgroundColor: tone.bg }, edge]}
                        testID={`sync-cell-${cell.hole}-${cell.state}`}
                        accessible
                        accessibilityLabel={cellA11yLabel(cell.hole, cell.state)}
                      >
                        <Text style={[styles.cellMark, { color: sunlight ? colors.text : tone.fg }]}>
                          {SYNC_CELL_TEXT[cell.state].mark}
                        </Text>
                      </View>
                    );
                  })}
                  {padRow(row.length)}
                </View>
              </View>
            ))}
          </View>

          <View
            style={styles.legend}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            testID="sync-legend"
          >
            {present.map((s) => (
              <Text key={s} style={[styles.legendText, { color: colors.muted }]} testID={`sync-legend-${s}`}>
                <Text style={{ color: cellTone(s, colors).mark, fontFamily: FONTS.sansSemiBold }}>
                  {SYNC_CELL_TEXT[s].mark}
                </Text>{' '}
                {SYNC_CELL_TEXT[s].label}
              </Text>
            ))}
          </View>

          {/* Løftet om at slagene blir liggende og sendes, gjelder bare det som venter.
              Karantene sendes aldri av seg selv. */}
          {pending ? (
            <View style={[styles.noteBox, { backgroundColor: colors.trackBg }, edge]} testID="sync-sheet-note">
              <Text style={[styles.note, { color: colors.muted }]}>{SYNC_CHIP_TEXT.keepGoing}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            {pending ? (
              <Pressable
                onPress={() => void retry()}
                disabled={retrying}
                style={[
                  styles.action,
                  { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: sunlight ? hole.borderW : 1 },
                  retrying && styles.disabled,
                ]}
                testID="sync-sheet-retry"
                accessibilityRole="button"
                accessibilityState={{ disabled: retrying }}
              >
                <Text style={[styles.actionText, { color: colors.primary }]}>
                  {retrying ? SYNC_BANNER_TEXT.retrying : SYNC_CHIP_TEXT.retryNow}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              style={[styles.action, { backgroundColor: colors.primary }]}
              testID="sync-sheet-continue"
              accessibilityRole="button"
            >
              <Text style={[styles.actionText, { color: colors.onPrimary }]}>{SYNC_CHIP_TEXT.continueRound}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Tomme plasser så en kort rad (et ni-hulls segment) holder rutenes bredde. */
function padRow(length: number) {
  return Array.from({ length: COLUMNS - length }, (_, i) => <View key={`pad-${i}`} style={styles.pad} />);
}

/** Artboardets linjehøyde 1,45 på teksten og forklaringen. */
const BODY_LINE = interLine(14, 14 * 1.45, { multiline: true });
const NOTE_LINE = interLine(13, 13 * 1.45, { multiline: true });

/** Luften under arket, over systemlinja (`paddingBottom` settes i komponenten). */
const SHEET_BOTTOM = 24;

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  // Artboardet: 22 i hjørnene, 10/20 rundt og 14 mellom delene.
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 14,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  handle: { width: 40, height: 5, borderRadius: 999, alignSelf: 'center' },
  title: { ...fraunces(600, 22) },
  // 4 over teksten (artboardet) i tillegg til linjeboksens egen margin.
  body: { ...BODY_LINE, marginTop: BODY_LINE.marginTop + 4, fontFamily: FONTS.sans },
  retakes: { gap: 0 },
  retake: { minHeight: TAP, justifyContent: 'center' },
  retakeText: { fontSize: 14, fontFamily: FONTS.sansSemiBold, textDecorationLine: 'underline' },
  grid: { gap: 8 },
  gridRow: { gap: 4 },
  numbers: { flexDirection: 'row', gap: 4 },
  number: { flex: 1, textAlign: 'center', fontSize: 10, fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  cells: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cellMark: { fontSize: 13, fontFamily: FONTS.sansSemiBold },
  pad: { flex: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  legendText: { fontSize: 12, fontFamily: FONTS.sans },
  noteBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  note: { ...NOTE_LINE, fontFamily: FONTS.sans },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  disabled: { opacity: 0.5 },
});
