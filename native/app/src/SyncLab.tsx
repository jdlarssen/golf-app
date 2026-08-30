// Native N2 (#1823): Sync-lab — spike-flata som gjør datalaget synlig.
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
import {
  mergeServerScore,
  subscribeGameScores,
  type RealtimeStatus,
} from './data/realtime';
import { startSyncTriggers } from './data/syncTriggers';
import { drainQueue, getLastDrain, type DrainLog } from './data/syncWorker';
import { writeScore } from './data/writeScore';
import { currentDeviceUserId, supabase } from './supabase';

const HOLES = [1, 2, 3];
const MAX_HOLE = HOLES[HOLES.length - 1]!;
const MAX_STROKES = 15;

type Phase = 'laster' | 'klar' | 'tomt' | 'feil';

function clockOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Hent gjeldende serververdier for hull 1–3 én gang ved åpning, gjennom SAMME
 * merge realtime bruker — da er start-tilstanden ekte og LWW-regelen er den
 * eneste som noen gang skriver server-data inn i den lokale basen.
 */
async function seedFromServer(gameId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('scores')
    .select(
      'game_id, user_id, hole_number, strokes, putts, entered_by, client_updated_at, updated_at',
    )
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .lte('hole_number', MAX_HOLE);
  if (error || !data) return;
  const currentUserId = await currentDeviceUserId();
  for (const row of data) {
    await mergeServerScore(
      {
        gameId: row.game_id,
        userId: row.user_id,
        holeNumber: row.hole_number,
        strokes: row.strokes,
        putts: row.putts ?? null,
        enteredBy: row.entered_by,
        clientUpdatedAt: row.client_updated_at,
        serverUpdatedAt: row.updated_at,
      },
      currentUserId,
    );
  }
}

export function SyncLab({
  userId,
  onBack,
}: {
  userId: string;
  onBack: () => void;
}) {
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
    void seedFromServer(gameId, userId)
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
  }, [gameId, userId, refresh]);

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

  if (phase === 'laster') {
    return (
      <View style={styles.screen} testID="sync-lab-screen">
        <ActivityIndicator color="#1B4332" />
        <Text style={styles.body}>Finner et aktivt spill …</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      testID="sync-lab-screen"
    >
      <Text style={styles.title}>Sync-lab</Text>

      {phase === 'tomt' ? (
        <Text style={styles.body} testID="empty-state">
          Ingen aktive spill på staging. Start et spill der og åpne laben på nytt.
        </Text>
      ) : null}

      {phase === 'feil' ? (
        <Text style={styles.error} testID="lab-error">
          {errorText}
        </Text>
      ) : null}

      {phase === 'klar' && game ? (
        <>
          <Text style={styles.body}>Spill</Text>
          <Text style={styles.value} testID="game-name">
            {game.name}
          </Text>

          <View style={styles.card}>
            {HOLES.map((holeNumber) => {
              const row = scoreFor(holeNumber);
              return (
                <View style={styles.holeRow} key={holeNumber}>
                  <Text style={styles.holeLabel}>Hull {holeNumber}</Text>
                  <Pressable
                    style={styles.step}
                    onPress={() => void adjust(holeNumber, -1)}
                    testID={`hole-${holeNumber}-minus`}
                  >
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text
                    style={styles.strokes}
                    testID={`hole-${holeNumber}-strokes`}
                  >
                    {row?.strokes ?? '—'}
                  </Text>
                  <Pressable
                    style={styles.step}
                    onPress={() => void adjust(holeNumber, 1)}
                    testID={`hole-${holeNumber}-plus`}
                  >
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                  <Text
                    style={styles.synced}
                    testID={`hole-${holeNumber}-synced`}
                  >
                    {row ? (row.serverUpdatedAt ? 'synket' : 'venter') : ''}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.body} testID="queue-count">
              I kø: {queueCount}
            </Text>
            <Text style={styles.body} testID="last-drain">
              Siste synk:{' '}
              {drain
                ? `${clockOf(drain.at)} (${drain.reason}) — ${drain.pushed} sendt, ${drain.rejected} overskrevet, ${drain.errored} feil, ${drain.abandoned} gitt opp`
                : 'ingen ennå'}
            </Text>
            <Text style={styles.body} testID="realtime-status">
              Realtime: {realtime}
            </Text>
            <Text style={styles.body} testID="conflict-count">
              Konfliktvarsler: {conflictCount}
            </Text>
          </View>

          <Pressable
            style={styles.button}
            onPress={() => void syncNow()}
            disabled={busy}
            testID="sync-now"
          >
            <Text style={styles.buttonText}>
              {busy ? 'Jobber …' : 'Synk nå'}
            </Text>
          </Pressable>

          {errorText ? (
            <Text style={styles.error} testID="lab-error">
              {errorText}
            </Text>
          ) : null}
        </>
      ) : null}

      <Pressable style={styles.buttonSecondary} onPress={onBack} testID="lab-back">
        <Text style={styles.buttonSecondaryText}>Tilbake</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: '#F8F6F0',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1B4332',
    textAlign: 'center',
    marginBottom: 16,
  },
  body: { fontSize: 16, color: '#1B4332' },
  value: { fontSize: 22, fontWeight: '700', color: '#1B4332' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    gap: 8,
  },
  holeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  holeLabel: { fontSize: 16, color: '#1B4332', width: 72 },
  step: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1B4332',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  strokes: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1B4332',
    width: 36,
    textAlign: 'center',
  },
  synced: { fontSize: 13, color: '#1B4332', flexShrink: 1 },
  button: {
    backgroundColor: '#1B4332',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  buttonSecondary: { padding: 12, alignItems: 'center' },
  buttonSecondaryText: { color: '#1B4332', fontSize: 15 },
  error: { color: '#B00020', fontSize: 15, textAlign: 'center' },
});
