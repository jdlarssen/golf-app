// native/app/src/components/game/OrganiserSection.tsx
// Native N6b (#1855): arrangørens del av spill-hjem — rosteret før start, og
// frafall etter.
//
// **Arrangør = `games.created_by`.** Ingen admin-flagg noe sted i appen.
// Sekretariatets overstyringer bor på nettsiden; appen er arrangør-flaten.
//
// **Reglene er delte, monteringen er lokal.** Om lag skal fordeles i det hele
// tatt svarer `needsTeamAssignment`; om flighter må deles svarer
// `needsFlightAssignment`; om formatet i det hele tatt kjenner frafall svarer
// `supportsWithdrawal`. Ingen av de tre spørsmålene besvares på nytt her, og
// selve skrivingene ligger i `data/rosterActions.ts` med RLS som ekte port.
//
// **Statisk `ui`/`COLORS`, ikke `useTheme()`.** GameHome er statisk, og #1866
// (lys/mørk) er et utsatt eier-valg — nye flater følger flertallet til det er
// avgjort, ellers vokser gapet som skal lukkes.
//
// ⚠️ **Arrangørens EGEN rad er låst for lag, flight og frafall (#1868).**
// `guard_game_players_self_update` (0147) slipper bare service-role og
// `is_admin()` forbi på egen rad, og appen skriver alltid under RLS. Knappene
// vises derfor ikke der; {@link OWN_ROW_LOCKED_NOTE} står i stedet. En knapp
// som garantert svarer «du har ikke lov» er verre enn ingen knapp.
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  MAX_FLIGHT_SIZE,
  needsFlightAssignment,
} from '../../../../../lib/games/flightScope';
import {
  expectedTeamSize,
  needsTeamAssignment,
  type TeamPlayer,
} from '../../../../../lib/games/teamScope';
import {
  supportsWithdrawal,
  type GameMode,
} from '../../../../../lib/scoring/modes/types';
import { fetchRosterCandidates, type RosterCandidate } from '../../data/createGame';
import type { BundlePlayer, GameBundle } from '../../data/gameBundle';
import {
  addPlayerToGame,
  removePlayerFromGame,
  setPlayerFlight,
  setPlayerTeam,
  undoWithdrawPlayer,
  withdrawPlayer,
  type RosterActionResult,
} from '../../data/rosterActions';
import { startRoundNow } from '../../data/startGame';
import { displayName } from '../../lib/display';
import { CUP_NOTE } from '../../lib/endGameCopy';
import {
  describeRosterFailure,
  describeStartRefusal,
  OWN_ROW_LOCKED_NOTE,
} from '../../lib/rosterCopy';
import { COLORS, TAP, ui } from '../../theme';

/** `game_players`-formen de delte lag-/flight-reglene leser. */
function toTeamPlayers(players: readonly BundlePlayer[]): TeamPlayer[] {
  return players.map((p) => ({
    user_id: p.userId,
    team_number: p.teamNumber,
    flight_number: p.flightNumber,
    withdrawn_at: p.withdrawnAt,
  }));
}

/** Bekreft før en skriving som er vanskelig å angre. */
function confirmThen(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  Alert.alert(title, message, [
    { text: 'Avbryt', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export function OrganiserSection({
  bundle,
  userId,
  onChanged,
  onFinish,
}: {
  bundle: GameBundle;
  userId: string;
  /** Hent bundelen på nytt. Kalles etter HVER skriving, også de som feilet. */
  onChanged: () => void | Promise<void>;
  /**
   * Åpne avslutt-flaten (N6c, #1856).
   *
   * Sendes inn i stedet for at seksjonen navigerer selv: den kjenner ingen
   * ruter i dag, og avslutningen skal ikke være grunnen til at den begynner.
   */
  onFinish: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<RosterCandidate[] | null>(null);
  const [candidatesFailed, setCandidatesFailed] = useState(false);
  const [search, setSearch] = useState('');

  const { game } = bundle;

  /**
   * Kjør én roster-skriving.
   *
   * Bundelen hentes på nytt uansett utfall: et avslag betyr som regel at
   * virkeligheten har flyttet seg siden forrige henting (noen andre startet
   * runden, la til en spiller, fylte laget). Å bare vise feilen og la den
   * gamle lista stå ville latt arrangøren trykke videre på noe som ikke finnes.
   */
  const run = useCallback(
    async (write: () => Promise<RosterActionResult>) => {
      setBusy(true);
      setNotice(null);
      try {
        const result = await write();
        setNotice(
          result.ok
            ? null
            : describeRosterFailure(result.reason, result.message),
        );
      } catch {
        setNotice(describeRosterFailure('db'));
      } finally {
        await onChanged();
        setBusy(false);
      }
    },
    [onChanged],
  );

  /**
   * «Start runden nå».
   *
   * ⚠️ `{ ok: true }` med `alreadyRunning: true` er SUKSESS (#502): cron-sweepen
   * på tee-off, nettsidens knapp eller E1-fallbacken rakk status-flippen først.
   * Runden er i gang — som er nøyaktig det arrangøren trykket for. Her finnes
   * det derfor ingen gren som viser en feilmelding for det utfallet.
   */
  const start = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await startRoundNow(game.id);
      setNotice(result.ok ? 'Runden er i gang.' : describeStartRefusal(result));
    } catch {
      setNotice(describeStartRefusal({ ok: false, reason: 'db_game' }));
    } finally {
      await onChanged();
      setBusy(false);
    }
  }, [game.id, onChanged]);

  const openPicker = useCallback(() => {
    setPicking(true);
    if (candidates !== null) return;
    setCandidatesFailed(false);
    void fetchRosterCandidates()
      .then(setCandidates)
      .catch(() => setCandidatesFailed(true));
  }, [candidates]);

  const scheduled = game.status === 'scheduled';
  const active = game.status === 'active';
  // Utkast har ingen roster å drifte, og et ferdig spill er lesevisning —
  // avslutningen er alt gjort, og gjenåpning er admin-only på nettsiden.
  // Ingen seksjon der.
  if (!scheduled && !active) return null;

  const mode = game.gameMode as GameMode;
  const teamSize = expectedTeamSize(
    game.modeConfig as { team_size?: number } | null,
  );
  const teamPlayers = toTeamPlayers(bundle.players);
  const activeCount = teamPlayers.filter((p) => p.withdrawn_at == null).length;
  // Lag- og flight-kontrollene vises kun når de DELTE reglene sier at noe
  // mangler. Er alle fordelt, er det ingenting som blokkerer starten, og en
  // omfordeling i etterkant hører hjemme på nettsiden (der arrangørens egen rad
  // også kan flyttes — se #1868).
  const showTeams = scheduled && needsTeamAssignment(mode, teamSize, teamPlayers);
  const showFlights = scheduled && needsFlightAssignment(mode, teamPlayers);
  const teamCount = Math.max(1, Math.ceil(activeCount / teamSize));
  const flightCount = Math.max(1, Math.ceil(activeCount / MAX_FLIGHT_SIZE));
  const canWithdraw = active && supportsWithdrawal(mode);
  // Cup-runder avsluttes fra nettsiden: cup-flyten eier de avledede kampene og
  // demper per-spill-varslene. `finishRound` avviser dem uansett — men en knapp
  // som garantert svarer «nei» er verre enn en setning som sier hvor det gjøres.
  const isCupGame = game.tournamentId !== null;
  // Noten forklarer ÉN ting nå: at trekk-knappen mangler på egen rad. Lag og
  // flight er ikke lenger sperret der — migrasjon 0168 ga arrangøren samme
  // unntak på egen rad som de alt hadde på andres (#1855/#1868). Vakt (c)
  // står, så «trekk deg selv» er fortsatt web-veien, akkurat som på nettsiden.
  const showOwnRowNote =
    canWithdraw && bundle.players.some((p) => p.userId === userId);

  const chosen = new Set(bundle.players.map((p) => p.userId));
  const query = search.trim().toLowerCase();
  const pickable = (candidates ?? [])
    .filter((c) => !chosen.has(c.id))
    .filter((c) => (query ? displayName(c).toLowerCase().includes(query) : true));

  return (
    <View testID="organiser-section">
      <Text style={ui.sectionTitle}>Arrangør</Text>

      <View style={ui.card}>
        {bundle.players.map((player) => {
          const isMe = player.userId === userId;
          return (
            <View
              key={player.userId}
              style={styles.playerBlock}
              testID={`organiser-row-${player.userId}`}
            >
              <View style={styles.headerRow}>
                <Text style={ui.body}>
                  {displayName(player)}
                  {isMe ? ' (deg)' : ''}
                </Text>
                <Text
                  style={ui.muted}
                  testID={`organiser-accepted-${player.userId}`}
                >
                  {player.acceptedAt ? 'Bekreftet' : 'Ikke bekreftet'}
                </Text>
              </View>

              {showTeams ? (
                <ChipRow
                  label="Lag"
                  count={teamCount}
                  selected={player.teamNumber}
                  disabled={busy}
                  testIDPrefix={`organiser-team-${player.userId}`}
                  onPick={(n) => void run(() => setPlayerTeam(game.id, player.userId, n))}
                />
              ) : null}

              {showFlights ? (
                <ChipRow
                  label="Flight"
                  count={flightCount}
                  selected={player.flightNumber}
                  disabled={busy}
                  testIDPrefix={`organiser-flight-${player.userId}`}
                  onPick={(n) => void run(() => setPlayerFlight(game.id, player.userId, n))}
                />
              ) : null}

              {scheduled ? (
                // Ingen vakt mot å fjerne seg selv — hverken webbens action
                // eller RLS har en, og to flater med hver sin regel er verre
                // enn regelen selv.
                <Pressable
                  style={[ui.buttonSecondary, styles.rowButton]}
                  disabled={busy}
                  testID={`organiser-remove-${player.userId}`}
                  onPress={() =>
                    confirmThen(
                      'Fjern spilleren?',
                      `Du tar ${displayName(player)} ut av runden.`,
                      'Fjern',
                      () => void run(() => removePlayerFromGame(game.id, player.userId)),
                    )
                  }
                >
                  <Text style={ui.buttonSecondaryText}>Fjern</Text>
                </Pressable>
              ) : null}

              {canWithdraw && !isMe && player.withdrawnAt == null ? (
                <Pressable
                  style={[ui.buttonSecondary, styles.rowButton]}
                  disabled={busy}
                  testID={`organiser-withdraw-${player.userId}`}
                  onPress={() =>
                    confirmThen(
                      'Trekk spilleren?',
                      `${displayName(player)} teller ikke med i resultatene. Slagene blir liggende.`,
                      'Trekk',
                      () => void run(() => withdrawPlayer(game.id, player.userId)),
                    )
                  }
                >
                  <Text style={ui.buttonSecondaryText}>Trekk</Text>
                </Pressable>
              ) : null}

              {canWithdraw && !isMe && player.withdrawnAt != null ? (
                <Pressable
                  style={[ui.buttonSecondary, styles.rowButton]}
                  disabled={busy}
                  testID={`organiser-undo-withdraw-${player.userId}`}
                  onPress={() =>
                    confirmThen(
                      'Angre frafallet?',
                      `${displayName(player)} teller med i resultatene igjen.`,
                      'Angre',
                      () => void run(() => undoWithdrawPlayer(game.id, player.userId)),
                    )
                  }
                >
                  <Text style={ui.buttonSecondaryText}>Angre trekk</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      {showOwnRowNote ? (
        <Text style={ui.muted} testID="organiser-own-row-note">
          {OWN_ROW_LOCKED_NOTE}
        </Text>
      ) : null}

      {scheduled ? (
        <Pressable
          style={ui.buttonSecondary}
          disabled={busy}
          testID="organiser-add-toggle"
          onPress={() => (picking ? setPicking(false) : openPicker())}
        >
          <Text style={ui.buttonSecondaryText}>
            {picking ? 'Lukk listen' : 'Legg til spiller'}
          </Text>
        </Pressable>
      ) : null}

      {scheduled && picking ? (
        <View style={ui.card} testID="organiser-candidates">
          <TextInput
            style={ui.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Søk etter navn"
            placeholderTextColor={COLORS.muted}
            autoCorrect={false}
            testID="organiser-candidate-search"
          />
          {candidatesFailed ? (
            <Text style={ui.muted}>
              Fikk ikke hentet spillerlisten. Sjekk nettet og prøv igjen.
            </Text>
          ) : candidates === null ? (
            <ActivityIndicator color={COLORS.forest} />
          ) : pickable.length === 0 ? (
            <Text style={ui.muted}>
              Ingen flere å velge her. Nye folk inviterer du fra nettsiden.
            </Text>
          ) : (
            pickable.map((candidate) => (
              <Pressable
                key={candidate.id}
                style={[ui.buttonSecondary, styles.rowButton]}
                disabled={busy}
                testID={`organiser-candidate-${candidate.id}`}
                onPress={() => void run(() => addPlayerToGame(game.id, candidate.id))}
              >
                <Text style={ui.buttonSecondaryText}>{displayName(candidate)}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {scheduled ? (
        <Pressable
          style={ui.button}
          disabled={busy}
          testID="organiser-start"
          onPress={() => void start()}
        >
          <Text style={ui.buttonText}>Start runden nå</Text>
        </Pressable>
      ) : null}

      {active && !isCupGame ? (
        <Pressable
          style={ui.button}
          disabled={busy}
          testID="organiser-finish"
          onPress={onFinish}
        >
          <Text style={ui.buttonText}>Avslutt runden</Text>
        </Pressable>
      ) : null}

      {active && isCupGame ? (
        <Text style={ui.muted} testID="organiser-cup-note">
          {CUP_NOTE}
        </Text>
      ) : null}

      {notice ? (
        <Text style={ui.muted} testID="organiser-notice">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

/** Én rad med tall-valg — lag eller flight. */
function ChipRow({
  label,
  count,
  selected,
  disabled,
  testIDPrefix,
  onPick,
}: {
  label: string;
  count: number;
  selected: number | null;
  disabled: boolean;
  testIDPrefix: string;
  onPick: (value: number) => void;
}) {
  return (
    <View style={styles.chipRow}>
      <Text style={ui.muted}>{label}</Text>
      {Array.from({ length: count }, (_, i) => i + 1).map((value) => (
        <Pressable
          key={value}
          style={[styles.chip, selected === value && styles.chipOn]}
          disabled={disabled}
          testID={`${testIDPrefix}-${value}`}
          onPress={() => onPick(value)}
        >
          <Text style={[ui.body, ui.num, selected === value && styles.chipOnText]}>
            {value}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  playerBlock: { gap: 6, paddingVertical: 4 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowButton: { alignSelf: 'flex-start', paddingHorizontal: 20 },
  chipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: TAP,
    minHeight: TAP,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: COLORS.forest, borderColor: COLORS.forest },
  chipOnText: { color: COLORS.card },
});
