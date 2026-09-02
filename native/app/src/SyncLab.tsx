// Native N2 (#1823): Sync-lab — spike-flata som gjør datalaget synlig.
//
// #1833: fargene kommer fra `useTheme()` som ellers i appen — layouten står
// igjen i det statiske arket nederst.
//
// Ingen polish, samme stil som N1: velg nyeste aktive spill spilleren er med i,
// vis hull 1–3 med −/+ på slag, og la statuslinja fortelle hva kø, drain og
// realtime driver med. Tapping drainer med vilje IKKE: køen skal være synlig
// før den tømmes, akkurat som på web (der skriver aldri trigger en drain).
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// Delt kilde: hvilke kø-elementer som «teller» for ett spill er webbens regel
// (#1370), ikke en ny en.
import { isActiveForGame } from '../../../lib/sync/queueScope';
import {
  getDb,
  listConflictsForGame,
  listQueue,
  listScoresForGame,
  type LocalScore,
} from './data/db';
import { subscribeGameScores, type RealtimeStatus } from './data/realtime';
import { seedGameScores } from './data/seedScores';
import { startSyncTriggers } from './data/syncTriggers';
import { drainQueue, getLastDrain, type DrainLog } from './data/syncWorker';
import { writeScore } from './data/writeScore';
import { supabase } from './supabase';
import { FONTS, TAP, useTheme } from './theme';

const HOLES = [1, 2, 3];
const MAX_STROKES = 15;

type Phase = 'laster' | 'klar' | 'tomt' | 'feil';

function clockOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function SyncLab({
  userId,
  onBack,
}: {
  userId: string;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('laster');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [game, setGame] = useState<{ id: string; name: string } | null>(null);
  const [scores, setScores] = useState<LocalScore[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [drain, setDrain] = useState<DrainLog | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStatus>('kobler til');
  const [busy, setBusy] = useState(false);

  const gameId = game?.id ?? null;

  const refresh = useCallback(async () => {
    if (!gameId) return;
    const db = await getDb();
    // Sekvensielt: én forbindelse, én setning om gangen.
    const rows = await listScoresForGame(db, gameId);
    const queue = await listQueue(db);
    const conflicts = await listConflictsForGame(db, gameId);
    setScores(rows);
    setQueueCount(queue.filter((item) => isActiveForGame(item, gameId)).length);
    setConflictCount(conflicts.length);
    setDrain(getLastDrain());
  }, [gameId]);

  // Finn nyeste AKTIVE spill spilleren er med i — vanlig RLS-lesing, ingen
  // provisjonering. To spørringer i stedet for en embed: fasongen på svaret er
  // da utvilsom.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: memberships, error: membershipError } = await supabase
        .from('game_players')
        .select('game_id')
        .eq('user_id', userId)
        .is('withdrawn_at', null);
      if (cancelled) return;
      if (membershipError) throw new Error(membershipError.message);

      const ids = (memberships ?? []).map((row) => row.game_id);
      if (ids.length === 0) {
        setPhase('tomt');
        return;
      }

      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('id, name, created_at')
        .in('id', ids)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (gamesError) throw new Error(gamesError.message);

      const found = games?.[0];
      if (!found) {
        setPhase('tomt');
        return;
      }
      setGame({ id: found.id, name: found.name });
      setPhase('klar');
    })().catch((err: unknown) => {
      if (cancelled) return;
      setErrorText(err instanceof Error ? err.message : String(err));
      setPhase('feil');
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Realtime + drain-triggere + statusoppfriskning, alt bundet til spillet.
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    const stopTriggers = startSyncTriggers();
    const unsubscribe = subscribeGameScores(gameId, {
      onStatus: (status) => {
        if (!cancelled) setRealtime(status);
      },
      onMerge: () => {
        void refresh();
      },
    });
    // N3: samme seed som resten av appen bruker (`seedGameScores`) — den henter
    // alle synlige hull, ikke bare 1–3, og lar RLS avgjøre hva som er synlig.
    void seedGameScores(gameId)
      .catch(() => {
        // Klarer vi ikke lese serververdiene, starter laben bare på lokal
        // tilstand — det er ikke verdt å stoppe skjermen for.
      })
      .then(() => refresh());
    const interval = setInterval(() => {
      void refresh();
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubscribe();
      stopTriggers();
    };
  }, [gameId, refresh]);

  const scoreFor = (holeNumber: number): LocalScore | undefined =>
    scores.find(
      (row) => row.holeNumber === holeNumber && row.userId === userId,
    );

  const adjust = async (holeNumber: number, delta: number) => {
    if (!gameId || busy) return;
    setBusy(true);
    try {
      const current = scoreFor(holeNumber)?.strokes ?? 0;
      const next = Math.min(MAX_STROKES, Math.max(1, current + delta));
      await writeScore({
        gameId,
        userId,
        holeNumber,
        strokes: next,
        enteredBy: userId,
      });
      await refresh();
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await drainQueue('knapp');
      await refresh();
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const screenStyle = [styles.screen, { backgroundColor: colors.bg }];
  const bodyStyle = [styles.body, { color: colors.text }];
  const cardStyle = [styles.card, { backgroundColor: colors.surface }];
  const stepStyle = [styles.step, { backgroundColor: colors.primary }];
  const stepTextStyle = [styles.stepText, { color: colors.onPrimary }];
  const errorStyle = [styles.error, { color: colors.danger }];

  if (phase === 'laster') {
    return (
      <View style={screenStyle} testID="sync-lab-screen">
        <ActivityIndicator color={colors.primary} />
        <Text style={bodyStyle}>Finner et aktivt spill …</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={screenStyle} testID="sync-lab-screen">
      <Text style={[styles.title, { color: colors.text }]}>Sync-lab</Text>

      {phase === 'tomt' ? (
        <Text style={bodyStyle} testID="empty-state">
          Ingen aktive spill på staging. Start et spill der og åpne laben på nytt.
        </Text>
      ) : null}

      {phase === 'feil' ? (
        <Text style={errorStyle} testID="lab-error">
          {errorText}
        </Text>
      ) : null}

      {phase === 'klar' && game ? (
        <>
          <Text style={bodyStyle}>Spill</Text>
          <Text style={[styles.value, { color: colors.text }]} testID="game-name">
            {game.name}
          </Text>

          <View style={cardStyle}>
            {HOLES.map((holeNumber) => {
              const row = scoreFor(holeNumber);
              return (
                <View style={styles.holeRow} key={holeNumber}>
                  <Text style={[styles.holeLabel, { color: colors.text }]}>
                    Hull {holeNumber}
                  </Text>
                  <Pressable
                    style={stepStyle}
                    onPress={() => void adjust(holeNumber, -1)}
                    testID={`hole-${holeNumber}-minus`}
                  >
                    <Text style={stepTextStyle}>−</Text>
                  </Pressable>
                  <Text
                    style={[styles.strokes, { color: colors.text }]}
                    testID={`hole-${holeNumber}-strokes`}
                  >
                    {row?.strokes ?? '—'}
                  </Text>
                  <Pressable
                    style={stepStyle}
                    onPress={() => void adjust(holeNumber, 1)}
                    testID={`hole-${holeNumber}-plus`}
                  >
                    <Text style={stepTextStyle}>+</Text>
                  </Pressable>
                  <Text
                    style={[styles.synced, { color: colors.muted }]}
                    testID={`hole-${holeNumber}-synced`}
                  >
                    {row ? (row.serverUpdatedAt ? 'synket' : 'venter') : ''}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={cardStyle}>
            <Text style={bodyStyle} testID="queue-count">
              I kø: {queueCount}
            </Text>
            <Text style={bodyStyle} testID="last-drain">
              Siste synk:{' '}
              {drain
                ? `${clockOf(drain.at)} (${drain.reason}) — ${drain.pushed} sendt, ${drain.rejected} overskrevet, ${drain.errored} feil, ${drain.abandoned} gitt opp`
                : 'ingen ennå'}
            </Text>
            <Text style={bodyStyle} testID="realtime-status">
              Realtime: {realtime}
            </Text>
            <Text style={bodyStyle} testID="conflict-count">
              Konfliktvarsler: {conflictCount}
            </Text>
          </View>

          <Pressable
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => void syncNow()}
            disabled={busy}
            testID="sync-now"
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
              {busy ? 'Jobber …' : 'Synk nå'}
            </Text>
          </Pressable>

          {errorText ? (
            <Text style={errorStyle} testID="lab-error">
              {errorText}
            </Text>
          ) : null}
        </>
      ) : null}

      <Pressable style={styles.buttonSecondary} onPress={onBack} testID="lab-back">
        <Text style={[styles.buttonSecondaryText, { color: colors.primary }]}>
          Tilbake
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// Kun layout og typografi her — fargene settes inline fra paletten.
// `fontWeight` er byttet mot familienavn: expo-font registrerer ett snitt per
// familie, så en vekt oppå Inter Regular gjør ingenting.
const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: FONTS.serifScore,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: { fontSize: 16, fontFamily: FONTS.sans },
  value: { fontSize: 22, fontFamily: FONTS.serifScore },
  card: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    gap: 8,
  },
  holeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  holeLabel: { fontSize: 16, fontFamily: FONTS.sans, width: 72 },
  step: {
    width: TAP,
    height: TAP,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 22, fontFamily: FONTS.sansBold },
  strokes: {
    fontSize: 22,
    fontFamily: FONTS.serifScore,
    width: 36,
    textAlign: 'center',
  },
  synced: { fontSize: 13, fontFamily: FONTS.sans, flexShrink: 1 },
  button: {
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { fontSize: 16, fontFamily: FONTS.sansSemiBold },
  buttonSecondary: { padding: 12, alignItems: 'center' },
  buttonSecondaryText: { fontSize: 15, fontFamily: FONTS.sans },
  error: { fontSize: 15, fontFamily: FONTS.sans, textAlign: 'center' },
});
