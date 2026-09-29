// #2255: stubben under perforeringen på startbilletten — det spilleren skal
// gjøre nå.
//
// Hvilken stubb som tegnes, avgjør `ticketStub` (`lib/gameTicket.ts`), med de
// samme grenene og i samme rekkefølge som `PrimarySection` på spillets side
// hadde før billetten. Her er bare drakten og ordlyden ny. testID-ene er de
// samme som før, så skjermtestene beviser de samme grenene.
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { undoSelfWithdraw } from '../../data/withdrawSelf';
import { GATE_LINK_LABEL, gameWebPath, gateMessage } from '../../lib/formatGate';
import { mapSearchUrl, type TicketStub as TicketStubModel } from '../../lib/gameTicket';
import { HOME_TEXT, continueOnHole } from '../../lib/homeCopy';
import { WITHDRAW_SELF, describeSelfWithdrawFailure } from '../../lib/rosterCopy';
import { TICKET_TEXT, playedLine } from '../../lib/ticketCopy';
import type { ScreenProps } from '../../navigation';
import { FONTS, useTheme } from '../../theme';
import { WebLinkButton } from '../WebLinkButton';
import { WaitingRoom } from './WaitingRoom';

type Navigate = ScreenProps<'GameHome'>['navigation']['navigate'];

export function TicketStub({
  stub,
  gameId,
  courseName,
  teeOffAt,
  flightCta,
  onChanged,
  onNavigate,
}: {
  stub: TicketStubModel;
  gameId: string;
  /** Til «Vis på kart». Uten bane står ikke knappen. */
  courseName: string | null;
  teeOffAt: string | null;
  /**
   * #2200: knappen til scorekortet når mitt kort er levert og makkerkort jeg
   * har ført, står igjen. `null` = ingen knapp.
   */
  flightCta: string | null;
  /** Hent bundelen på nytt: etter «Angre trekk», og fra venterommet (#2219). */
  onChanged: () => void | Promise<void>;
  onNavigate: Navigate;
}) {
  const { colors, ui } = useTheme();

  switch (stub.kind) {
    case 'gated':
      return (
        <View style={styles.block} testID="format-gate">
          <Text style={ui.body}>{gateMessage(stub.reason)}</Text>
          {/* #1891: uten knappen er setningen en blindvei. */}
          <WebLinkButton label={GATE_LINK_LABEL} path={gameWebPath(gameId)} testID="format-gate-link" />
        </View>
      );
    case 'notPlayer':
      return (
        <View style={styles.block} testID="not-a-player">
          <Text style={ui.body}>{TICKET_TEXT.notPlayer}</Text>
        </View>
      );
    case 'withdrawn':
      return <WithdrawnStub gameId={gameId} bySelf={stub.bySelf} onChanged={onChanged} />;
    case 'draft':
      return (
        <View style={styles.block} testID="ticket-draft">
          <Text style={ui.body}>{TICKET_TEXT.draft}</Text>
        </View>
      );
    case 'scheduled':
      return (
        <View style={styles.block}>
          <Text style={[styles.kicker, { color: colors.primary }]} testID="ticket-registered">
            {TICKET_TEXT.registered}
          </Text>
          <WaitingRoom gameId={gameId} teeOffAt={teeOffAt} onChanged={onChanged} />
          {courseName ? <MapButton courseName={courseName} /> : null}
        </View>
      );
    case 'finished':
      return (
        <View style={styles.block} testID="finished-banner">
          {stub.result ? (
            <View style={styles.resultRow}>
              {/* Gull er medalje: bare egen seier (DESIGN.md). Som på Hjem er
                  gullet en skive, ikke tekstfarge — gull tekst på hvitt har for
                  svak kontrast. */}
              {stub.result.isWin ? (
                <View
                  style={[styles.gold, { backgroundColor: colors.accent }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  testID="ticket-result-gold"
                />
              ) : null}
              <Text style={[styles.result, { color: colors.text }]} testID="ticket-result">
                {stub.result.text}
              </Text>
            </View>
          ) : (
            <Text style={ui.body}>{TICKET_TEXT.finishedNoResult}</Text>
          )}
          <Pressable
            accessibilityRole="button"
            style={ui.button}
            onPress={() => onNavigate('Leaderboard', { gameId })}
            testID="ticket-board"
          >
            <Text style={ui.buttonText}>{HOME_TEXT.board}</Text>
          </Pressable>
        </View>
      );
    case 'active':
      return (
        <ActiveStub
          stub={stub}
          gameId={gameId}
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
  flightCta,
  onNavigate,
}: {
  stub: Extract<TicketStubModel, { kind: 'active' }>;
  gameId: string;
  flightCta: string | null;
  onNavigate: Navigate;
}) {
  const { colors, ui } = useTheme();
  const flightButton = flightCta ? (
    <Pressable
      accessibilityRole="button"
      style={ui.button}
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
          <Text style={ui.body}>
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
    <View style={styles.block}>
      <Text style={[ui.body, ui.num]} testID="ticket-played">
        {playedLine(stub.played, stub.total)}
      </Text>
      {/* Linja sier det samme som teksten over, så skjermleseren hopper over den. */}
      <View
        style={[styles.track, { backgroundColor: colors.border }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="ticket-progress"
      >
        <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: colors.primary }]} />
      </View>
      <Pressable accessibilityRole="button" style={ui.button} onPress={onPress} testID="primary-cta">
        <Text style={ui.buttonText}>{label}</Text>
      </Pressable>
    </View>
  );
}

/**
 * «Vis på kart»: banenavnet som søk i kartappen. Feiler åpningen, står en rolig
 * setning under knappen i stedet for en dialog.
 */
function MapButton({ courseName }: { courseName: string }) {
  const { ui } = useTheme();
  const [failed, setFailed] = useState(false);
  const open = useCallback(async () => {
    try {
      await Linking.openURL(mapSearchUrl(courseName, Platform.OS));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [courseName]);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        style={ui.buttonSecondary}
        onPress={() => void open()}
        testID="view-on-map"
      >
        <Text style={ui.buttonSecondaryText}>{TICKET_TEXT.viewOnMap}</Text>
      </Pressable>
      {failed ? (
        <Text style={ui.error} testID="view-on-map-failed">
          {TICKET_TEXT.mapFailed}
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
  const { ui } = useTheme();
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
      <Text style={ui.body}>
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
  kicker: {
    fontSize: 13,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gold: { width: 14, height: 14, borderRadius: 7 },
  result: { flexShrink: 1, fontSize: 22, fontFamily: FONTS.serifScore, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
