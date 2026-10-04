// #2255: stubben under perforeringen på startbilletten — det spilleren skal
// gjøre nå.
//
// Hvilken stubb som tegnes, avgjør `ticketStub` (`lib/gameTicket.ts`), med de
// samme grenene og i samme rekkefølge som `PrimarySection` på spillets side
// hadde før billetten. Her er bare drakten og ordlyden ny. testID-ene er de
// samme som før, så skjermtestene beviser de samme grenene.
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GameBundle } from '../../data/gameBundle';
import { undoSelfWithdraw } from '../../data/withdrawSelf';
import { GATE_LINK_LABEL, gameWebPath, gateMessage } from '../../lib/formatGate';
import { addToCalendar } from '../../lib/addToCalendar';
import {
  mapSearchUrl,
  type CalendarEvent,
  type TicketStub as TicketStubModel,
} from '../../lib/gameTicket';
import { HOME_TEXT, continueOnHole } from '../../lib/homeCopy';
import { WITHDRAW_SELF, describeSelfWithdrawFailure } from '../../lib/rosterCopy';
import { TICKET_TEXT, playedLine } from '../../lib/ticketCopy';
import type { ScreenProps } from '../../navigation';
import { FONTS, fraunces, useTheme } from '../../theme';
import { withSystemArrows } from '../SystemArrow';
import { WebLinkButton } from '../WebLinkButton';
import { WaitingRoom } from './WaitingRoom';

type Navigate = ScreenProps<'GameHome'>['navigation']['navigate'];

export function TicketStub({
  stub,
  gameId,
  courseName,
  teeOffAt,
  calendarEvent,
  runningTotal = null,
  flightCta,
  onChanged,
  onNavigate,
  bundle,
}: {
  stub: TicketStubModel;
  gameId: string;
  /** Til «Vis på kart». Uten bane står ikke knappen. */
  courseName: string | null;
  teeOffAt: string | null;
  /** Til «Legg til i kalender». `null` uten tee-off, og da står ikke knappen. */
  calendarEvent: CalendarEvent | null;
  /**
   * Tallet til høyre for fremdriften, som «15 p» (eierens svar a). Tavlas
   * total for meg, i samme enhet som helten på Hjem. `null` = ikke noe tall.
   */
  runningTotal?: string | null;
  /**
   * #2200: knappen til scorekortet når mitt kort er levert og makkerkort jeg
   * har ført, står igjen. `null` = ingen knapp.
   */
  flightCta: string | null;
  /** Hent bundelen på nytt: etter «Angre trekk», og fra venterommet (#2219). */
  onChanged: () => void | Promise<void>;
  onNavigate: Navigate;
  /** #2204: venterommet sier hvorfor runden står fast etter tee-off. */
  bundle?: GameBundle;
}) {
  const { colors, ui } = useTheme();

  switch (stub.kind) {
    case 'gated':
      return (
        <View style={styles.block} testID="format-gate">
          <Text style={[styles.text, { color: colors.muted }]}>{gateMessage(stub.reason)}</Text>
          {/* #1891: uten knappen er setningen en blindvei. */}
          <WebLinkButton label={GATE_LINK_LABEL} path={gameWebPath(gameId)} testID="format-gate-link" />
        </View>
      );
    case 'notPlayer':
      return (
        <View style={styles.block} testID="not-a-player">
          <Text style={[styles.text, { color: colors.muted }]}>{TICKET_TEXT.notPlayer}</Text>
        </View>
      );
    case 'withdrawn':
      return <WithdrawnStub gameId={gameId} bySelf={stub.bySelf} onChanged={onChanged} />;
    case 'draft':
      return (
        <View style={styles.block} testID="ticket-draft">
          <Text style={[styles.text, { color: colors.muted }]}>{TICKET_TEXT.draft}</Text>
        </View>
      );
    case 'scheduled':
      return (
        <View style={styles.block}>
          <Text style={[styles.registered, { color: colors.text }]} testID="ticket-registered">
            {TICKET_TEXT.registered}
          </Text>
          <WaitingRoom
            gameId={gameId}
            teeOffAt={teeOffAt}
            onChanged={onChanged}
            bundle={bundle}
          />
          <ScheduledActions calendarEvent={calendarEvent} courseName={courseName} />
        </View>
      );
    case 'finished':
      return (
        <View style={styles.block} testID="finished-banner">
          {stub.result ? (
            // Gull er medalje: bare egen seier (DESIGN.md), og da ett merke,
            // medaljen i teksten. `accentText` er gullets lesbare tone.
            <Text
              style={[styles.result, { color: stub.result.isWin ? colors.accentText : colors.text }]}
              testID="ticket-result"
            >
              {stub.result.text}
            </Text>
          ) : (
            <Text style={[styles.text, { color: colors.muted }]}>{TICKET_TEXT.finishedNoResult}</Text>
          )}
          <Pressable
            accessibilityRole="button"
            style={[ui.button, styles.cta]}
            onPress={() => onNavigate('Leaderboard', { gameId })}
            testID="ticket-board"
          >
            <Text style={ui.buttonText}>{withSystemArrows(HOME_TEXT.board, '600')}</Text>
          </Pressable>
        </View>
      );
    case 'active':
      return (
        <ActiveStub
          stub={stub}
          gameId={gameId}
          runningTotal={runningTotal}
          flightCta={flightCta}
          onNavigate={onNavigate}
        />
      );
    case 'none':
      return null;
  }
}

function ActiveStub({
  stub,
  gameId,
  runningTotal,
  flightCta,
  onNavigate,
}: {
  stub: Extract<TicketStubModel, { kind: 'active' }>;
  gameId: string;
  runningTotal: string | null;
  flightCta: string | null;
  onNavigate: Navigate;
}) {
  const { colors, ui } = useTheme();
  const flightButton = flightCta ? (
    <Pressable
      accessibilityRole="button"
      style={[ui.button, styles.cta]}
      onPress={() => onNavigate('Scorecard', { gameId })}
      testID="deliver-flight-cta"
    >
      <Text style={ui.buttonText}>{flightCta}</Text>
    </Pressable>
  ) : null;

  if (stub.state === 'submitted_pending_approval' || stub.state === 'submitted_approved') {
    return (
      <View style={styles.block}>
        {flightButton}
        <View testID="submitted-banner">
          <Text style={[styles.text, { color: colors.muted }]}>
            {stub.state === 'submitted_pending_approval'
              ? TICKET_TEXT.submittedPending
              : TICKET_TEXT.submittedApproved}
          </Text>
        </View>
      </View>
    );
  }

  const [label, onPress] =
    stub.state === 'ready_to_submit'
      ? [TICKET_TEXT.reviewAndSubmit, () => onNavigate('Scorecard', { gameId })]
      : [
          stub.state === 'not_started' ? TICKET_TEXT.startRound : continueOnHole(stub.nextHole),
          () => onNavigate('Hole', { gameId, holeNumber: stub.nextHole }),
        ];
  const share = stub.total > 0 ? Math.min(1, stub.played / stub.total) : 0;

  return (
    <View style={[styles.block, styles.progress]}>
      <View style={styles.playedRow}>
        {/* Vanlige tall, som i designet: tabellsiffer er for talloner (DESIGN.md). */}
        <Text style={[styles.played, { color: colors.muted }]} testID="ticket-played">
          {playedLine(stub.played, stub.total)}
        </Text>
        {runningTotal ? (
          <Text style={[styles.total, { color: colors.text }]} testID="ticket-total">
            {runningTotal}
          </Text>
        ) : null}
      </View>
      {/* Linja sier det samme som teksten over, så skjermleseren hopper over den. */}
      <View
        style={[styles.track, { backgroundColor: colors.trackBg }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="ticket-progress"
      >
        <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: colors.primary }]} />
      </View>
      <Pressable
        accessibilityRole="button"
        style={[ui.button, styles.cta, styles.progressCta]}
        onPress={onPress}
        testID="primary-cta"
      >
        <Text style={ui.buttonText}>{withSystemArrows(label, '600')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * «Legg til i kalender» og «Vis på kart», side om side. Hver knapp står bare
 * når den har noe å gjøre: kalenderen trenger en tee-off, kartet en bane.
 * Feiler en av dem, står en rolig setning under raden i stedet for en dialog.
 */
function ScheduledActions({
  calendarEvent,
  courseName,
}: {
  calendarEvent: CalendarEvent | null;
  courseName: string | null;
}) {
  const { ui } = useTheme();
  const [notice, setNotice] = useState<string | null>(null);

  const openCalendar = useCallback(async (event: CalendarEvent) => {
    const result = await addToCalendar(event);
    setNotice(
      result.ok
        ? null
        : result.reason === 'denied'
          ? TICKET_TEXT.calendarDenied
          : TICKET_TEXT.calendarFailed,
    );
  }, []);

  const openMap = useCallback(async (name: string) => {
    try {
      await Linking.openURL(mapSearchUrl(name, Platform.OS));
      setNotice(null);
    } catch {
      setNotice(TICKET_TEXT.mapFailed);
    }
  }, []);

  if (!calendarEvent && !courseName) return null;
  return (
    <View style={styles.actions}>
      <View style={styles.actionRow}>
        {calendarEvent ? (
          <Pressable
            accessibilityRole="button"
            // Lengst tekst, så litt mer plass: «Legg til i kalender» står da
            // på én linje på en 390 pt-telefon.
            style={[ui.buttonSecondary, styles.action, styles.actionWide]}
            onPress={() => void openCalendar(calendarEvent)}
            testID="add-to-calendar"
          >
            <Text style={[ui.buttonSecondaryText, styles.actionText]}>{TICKET_TEXT.addToCalendar}</Text>
          </Pressable>
        ) : null}
        {courseName ? (
          <Pressable
            accessibilityRole="button"
            style={[ui.buttonSecondary, styles.action]}
            onPress={() => void openMap(courseName)}
            testID="view-on-map"
          >
            <Text style={[ui.buttonSecondaryText, styles.actionText]}>{TICKET_TEXT.viewOnMap}</Text>
          </Pressable>
        ) : null}
      </View>
      {notice ? (
        <Text style={ui.error} testID="scheduled-action-notice">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Trukket (#1917, #2358): bare den som trakk seg selv kan angre. Går via
 * `DELETE /api/games/[id]/withdraw-self`, aldri en skriving (vakt (c) i
 * `guard_game_players_self_update` nekter appen å røre `withdrawn_at`).
 * `onChanged()` uansett utfall: bundelen er fasiten for hva skjermen viser
 * etterpå.
 */
function WithdrawnStub({
  gameId,
  bySelf,
  onChanged,
}: {
  gameId: string;
  bySelf: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const { colors, ui } = useTheme();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const undoWithdraw = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await undoSelfWithdraw(gameId);
      setNotice(result.ok ? null : describeSelfWithdrawFailure(result.reason, 'undo'));
    } catch {
      setNotice(describeSelfWithdrawFailure('withdraw_failed', 'undo'));
    } finally {
      await onChanged();
      setBusy(false);
    }
  }, [gameId, onChanged]);

  return (
    <View style={styles.block} testID="withdrawn-banner">
      <Text style={[styles.text, { color: colors.muted }]}>
        {bySelf ? WITHDRAW_SELF.withdrawnBySelf : WITHDRAW_SELF.withdrawnByOrganiser}
      </Text>
      {bySelf ? (
        <Pressable
          style={ui.buttonSecondary}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          testID="withdrawn-undo"
          onPress={() =>
            Alert.alert(WITHDRAW_SELF.undoTitle, WITHDRAW_SELF.undoBody, [
              { text: 'Avbryt', style: 'cancel' },
              { text: WITHDRAW_SELF.undoCta, onPress: () => void undoWithdraw() },
            ])
          }
        >
          <Text style={ui.buttonSecondaryText}>{WITHDRAW_SELF.undoLabel}</Text>
        </Pressable>
      ) : null}
      {notice ? (
        <Text style={ui.error} testID="withdrawn-undo-notice">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  /**
   * Fremdriften mens runden pågår, som i designet: 12 pt mellom teksten,
   * linja og knappen, og 4 pt ekstra over knappen (16 pt fra linja).
   */
  progress: { gap: 12 },
  progressCta: { marginTop: 4 },
  /** Brødtekst i stubben: 13 pt i muted, som i designet. */
  text: { fontSize: 13, lineHeight: 18, fontFamily: FONTS.sans },
  registered: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  result: { ...fraunces(600, 22), fontVariant: ['tabular-nums'] },
  /** Hovedknappen i billetten er høyere enn appens 44 pt, som i designet. */
  cta: { minHeight: 52 },
  // Teksten og poengene midtstilt mot hverandre, som i designet (`align-items: center`).
  playedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  played: { flexShrink: 1, fontSize: 13, fontFamily: FONTS.sans },
  total: { ...fraunces(600, 16), fontVariant: ['tabular-nums'] },
  actions: { gap: 6 },
  actionRow: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, paddingHorizontal: 8, paddingVertical: 8 },
  actionWide: { flex: 1.4 },
  actionText: { textAlign: 'center' },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 999 },
});
