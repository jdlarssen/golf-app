// #2752: ett øktkort i uttaket: status per lag, kapteinens valg, og arrangørens nødluker.
// Nettets `SessionCard`, `TeamPanel`, `SlotList` og `LineupEditor`. `slots: null` betyr «ikke
// synlig for deg», aldri «tomt», så panelet sier det og viser ingen tom oppstilling.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  AppCupLineupPlayer,
  AppCupLineupSession,
  AppCupLineupTeam,
  AppCupLineupView,
} from '../../../../../../lib/cup/appCupLineupView';
import { canRetryReveal, opponentHiddenLabel } from '../../../../../../lib/cup/lineupReveal';
import { seatsPerSlot, type LineupSlotRow } from '../../../../../../lib/cup/lineupValidation';
import { FORMAT_LABELS } from '../../../lib/cupGenerateCopy';
import { LINEUP_TEXT } from '../../../lib/cupLineupCopy';
import { formatMessage } from '../../../lib/kavalkadeCopy';
import { FONTS, fraunces, interLine, useTheme, withAlpha } from '../../../theme';
import { PlayerPicker, PlayerSlot } from '../PlayerPicker';

export type LineupActions = {
  onSubmit: (sessionId: string, team: 1 | 2, slots: { slotIndex: number; userIds: string[] }[]) => void;
  onUnlock: (sessionId: string, team: 1 | 2) => void;
  onRetry: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
};

export function LineupSessionCard({
  view,
  session,
  busy,
  error,
  errorTeam,
  actions,
}: {
  view: AppCupLineupView;
  session: AppCupLineupSession;
  busy: boolean;
  /** Feilen fra siste handling, når den gjaldt denne økta. */
  error: string | null;
  /** Lagets rute feilen hører til. `null`: kortet selv. */
  errorTeam: 1 | 2 | null;
  actions: LineupActions;
}) {
  const { colors, ui } = useTheme();
  const organizer = view.role === 'organizer';
  const revealed = session.revealedAt !== null;
  const stuck = canRetryReveal({
    revealedAt: session.revealedAt,
    team1SubmittedAt: session.teams[0].submittedAt,
    team2SubmittedAt: session.teams[1].submittedAt,
  });
  const cardError = errorTeam === null ? error : null;

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`cup-lineup-session-${session.sessionIndex}`}
    >
      <View style={styles.cardHead}>
        <View style={styles.cardTitle}>
          <Text style={[styles.format, { color: colors.text }]}>{FORMAT_LABELS[session.format]}</Text>
          <Text style={ui.muted}>{formatMessage(LINEUP_TEXT.slotSummary, { count: session.slotCount })}</Text>
        </View>
        <Pill on={revealed} text={revealed ? LINEUP_TEXT.revealed : LINEUP_TEXT.waiting} />
      </View>

      {session.teams.map((team) => (
        <TeamPanel
          key={team.teamNumber}
          view={view}
          session={session}
          team={team}
          busy={busy}
          error={errorTeam === team.teamNumber ? error : null}
          actions={actions}
        />
      ))}

      {organizer && stuck ? (
        <View
          style={[
            styles.stuck,
            { backgroundColor: withAlpha(colors.accent, 0.14), borderColor: withAlpha(colors.accent, 0.5) },
          ]}
          testID={`cup-lineup-stuck-${session.sessionIndex}`}
        >
          <Text style={[styles.stuckHeading, { color: colors.text }]}>{LINEUP_TEXT.retryHeading}</Text>
          <Text style={[styles.stuckBody, { color: colors.text }]}>{LINEUP_TEXT.retryHelper}</Text>
        </View>
      ) : null}

      {/* Feilen står rett over knappene som ga den (#2087). */}
      {cardError ? <LineupError message={cardError} testID={`cup-lineup-error-${session.sessionIndex}`} /> : null}

      {organizer && stuck ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          style={[ui.button, busy && styles.dimmed]}
          onPress={() => actions.onRetry(session.id)}
          testID={`cup-lineup-retry-${session.sessionIndex}`}
        >
          <Text style={ui.buttonText}>{LINEUP_TEXT.retryButton}</Text>
        </Pressable>
      ) : null}

      {organizer && !revealed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          style={[ui.buttonSecondary, busy && styles.dimmed]}
          onPress={() => actions.onDelete(session.id)}
          testID={`cup-lineup-delete-${session.sessionIndex}`}
        >
          <Text style={ui.buttonSecondaryText}>{LINEUP_TEXT.deleteSession}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TeamPanel({
  view,
  session,
  team,
  busy,
  error,
  actions,
}: {
  view: AppCupLineupView;
  session: AppCupLineupSession;
  team: AppCupLineupTeam;
  busy: boolean;
  error: string | null;
  actions: LineupActions;
}) {
  const { colors, ui } = useTheme();
  const { teamNumber } = team;
  const organizer = view.role === 'organizer';
  const teamName = teamNumber === 1 ? view.team1Name : view.team2Name;
  const squad = teamNumber === 1 ? view.squads.team1 : view.squads.team2;
  const submitted = team.submittedAt !== null;
  const revealed = session.revealedAt !== null;
  const canEdit = !revealed && !submitted && (organizer || view.myTeam === teamNumber);
  const prefix = `${session.sessionIndex}-${teamNumber}`;

  return (
    <View style={[styles.panel, { borderColor: colors.border }]} testID={`cup-lineup-team-${prefix}`}>
      <View style={styles.panelHead}>
        <Text style={[styles.teamName, { color: colors.text }]} numberOfLines={1}>
          {teamName}
        </Text>
        <Pill on={submitted} text={submitted ? LINEUP_TEXT.submitted : LINEUP_TEXT.notSubmitted} />
      </View>

      {team.slots === null ? (
        <Text style={ui.muted} testID={`cup-lineup-hidden-${prefix}`}>
          {
            LINEUP_TEXT[
              opponentHiddenLabel({
                revealedAt: session.revealedAt,
                team1SubmittedAt: session.teams[0].submittedAt,
                team2SubmittedAt: session.teams[1].submittedAt,
              })
            ]
          }
        </Text>
      ) : canEdit ? (
        <LineupEditor
          // Valgene er lokal state seedet fra serveren. Endrer kladden seg der (arrangøren
          // leverte og låste opp), skal de gamle valgene ikke stå igjen.
          key={`${session.id}-${teamNumber}-${team.slots.map((s) => `${s.slotIndex}.${s.seat}.${s.userId}`).join('|')}`}
          session={session}
          teamNumber={teamNumber}
          squad={squad}
          initial={team.slots}
          busy={busy}
          error={error}
          onSubmit={(slots) => actions.onSubmit(session.id, teamNumber, slots)}
        />
      ) : (
        <SlotList view={view} slots={team.slots} slotCount={session.slotCount} testID={`cup-lineup-slots-${prefix}`} />
      )}

      {/* Skjemaet har feilen over sin egen knapp. Uten det står den over «Lås opp». */}
      {!(canEdit && team.slots !== null) && error ? <LineupError message={error} testID={`cup-lineup-error-${prefix}`} /> : null}

      {organizer && submitted && !revealed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          style={[ui.buttonSecondary, busy && styles.dimmed]}
          onPress={() => actions.onUnlock(session.id, teamNumber)}
          testID={`cup-lineup-unlock-${prefix}`}
        >
          <Text style={ui.buttonSecondaryText}>{LINEUP_TEXT.unlock}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SlotList({
  view,
  slots,
  slotCount,
  testID,
}: {
  view: AppCupLineupView;
  slots: readonly LineupSlotRow[];
  slotCount: number;
  testID: string;
}) {
  const { colors } = useTheme();
  const everyone = [...view.squads.team1, ...view.squads.team2, ...view.squads.unassigned];
  const nameOf = (userId: string) => everyone.find((p) => p.userId === userId)?.displayName ?? LINEUP_TEXT.unknownPlayer;
  return (
    <View style={styles.list} testID={testID}>
      {Array.from({ length: slotCount }, (_, slotIndex) => (
        <Text key={slotIndex} style={[styles.listRow, { color: colors.text }]}>
          {`${slotIndex + 1}. ${
            slots
              .filter((s) => s.slotIndex === slotIndex)
              .map((s) => nameOf(s.userId))
              .join(' / ') || '—'
          }`}
        </Text>
      ))}
    </View>
  );
}

function LineupEditor({
  session,
  teamNumber,
  squad,
  initial,
  busy,
  error,
  onSubmit,
}: {
  session: AppCupLineupSession;
  teamNumber: 1 | 2;
  squad: readonly AppCupLineupPlayer[];
  initial: readonly LineupSlotRow[];
  busy: boolean;
  error: string | null;
  onSubmit: (slots: { slotIndex: number; userIds: string[] }[]) => void;
}) {
  const { colors, ui } = useTheme();
  const seats = seatsPerSlot(session.format);
  const [picks, setPicks] = useState<string[][]>(() =>
    Array.from({ length: session.slotCount }, (_, slotIndex) =>
      Array.from(
        { length: seats },
        (_, seat) => initial.find((s) => s.slotIndex === slotIndex && s.seat === seat + 1)?.userId ?? '',
      ),
    ),
  );
  const [open, setOpen] = useState<string | null>(null);
  const chosen = new Set(picks.flat().filter(Boolean));
  const complete = picks.every((slot) => slot.every(Boolean));
  const nameOf = (userId: string) => squad.find((p) => p.userId === userId)?.displayName ?? '';
  const prefix = `${session.sessionIndex}-${teamNumber}`;
  const rows = squad.map((p) => ({ id: p.userId, name: p.displayName }));
  const disabled = busy || !complete;

  const setPick = (slotIndex: number, seat: number, userId: string) => {
    setPicks((prev) =>
      prev.map((slot, i) => (i === slotIndex ? slot.map((value, j) => (j === seat ? userId : value)) : slot)),
    );
  };

  return (
    // Under innsendingen: det som er sendt, skal ikke kunne endres på skjermen.
    <View pointerEvents={busy ? 'none' : 'auto'} style={styles.editor} testID={`cup-lineup-editor-${prefix}`}>
      {picks.map((slot, slotIndex) => (
        <View key={slotIndex} style={styles.editorRow}>
          <Text style={[styles.slotNumber, { color: colors.muted }]}>{`${slotIndex + 1}.`}</Text>
          <View style={styles.editorSeats}>
            {slot.map((value, seat) => {
              const key = `${slotIndex}:${seat}`;
              return (
                <View key={seat} style={styles.editorSeat}>
                  <PlayerSlot
                    name={nameOf(value)}
                    placeholder={LINEUP_TEXT.pickPlayer}
                    open={open === key}
                    label={formatMessage(LINEUP_TEXT.seatLabel, { slot: slotIndex + 1, seat: seat + 1 })}
                    onPress={() => setOpen(open === key ? null : key)}
                    testID={`cup-lineup-pick-${prefix}-${slotIndex}-${seat}`}
                  />
                  {open === key ? (
                    <PlayerPicker
                      players={rows}
                      current={value || null}
                      clearLabel={LINEUP_TEXT.pickPlayer}
                      isDisabled={(id) => chosen.has(id) && id !== value}
                      onChoose={(id) => {
                        setOpen(null);
                        setPick(slotIndex, seat, id);
                      }}
                      testID={`cup-lineup-picker-${prefix}-${slotIndex}-${seat}`}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
      {error ? <LineupError message={error} testID={`cup-lineup-error-${prefix}`} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        style={[ui.button, disabled && styles.dimmed]}
        onPress={() => onSubmit(picks.map((userIds, slotIndex) => ({ slotIndex, userIds })))}
        testID={`cup-lineup-submit-${prefix}`}
      >
        <Text style={ui.buttonText}>{LINEUP_TEXT.submitButton}</Text>
      </Pressable>
      {complete ? null : <Text style={ui.muted}>{LINEUP_TEXT.fillAllSlots}</Text>}
    </View>
  );
}

function Pill({ on, text }: { on: boolean; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: on ? colors.primarySoft : colors.bg, borderColor: on ? colors.primarySoft : colors.border }]}>
      <Text style={[styles.pillText, { color: on ? colors.primary : colors.muted }]}>{text}</Text>
    </View>
  );
}

function LineupError({ message, testID }: { message: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.error, { color: colors.danger }]} testID={testID}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, marginTop: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { flex: 1, minWidth: 0, gap: 2 },
  format: { ...fraunces(500, 18, 24) },
  panel: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamName: { flex: 1, minWidth: 0, ...interLine(14, 18), fontFamily: FONTS.sansSemiBold },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { ...interLine(11, 15), fontFamily: FONTS.sansSemiBold },
  list: { gap: 4 },
  listRow: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  editor: { gap: 8 },
  editorRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  slotNumber: { ...interLine(13, 18), fontFamily: FONTS.sans, minWidth: 18, paddingTop: 13 },
  editorSeats: { flex: 1, minWidth: 0, gap: 6 },
  editorSeat: { gap: 2 },
  stuck: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  stuckHeading: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sansSemiBold },
  stuckBody: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  dimmed: { opacity: 0.45 },
});
