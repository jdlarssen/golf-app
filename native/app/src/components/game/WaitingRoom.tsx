// native/app/src/components/game/WaitingRoom.tsx
// #2219: venterommet på spill-hjem mens runden er planlagt.
//
// Før sto det en fast setning her, og skjermen hentet spillet bare når den fikk
// fokus. Den som sto på spill-hjem ved tee-off, ble stående på «ikke startet»
// til hen gikk ut og inn igjen. Nå åpner venterommet seg selv, på to veier:
//
// - **Realtime:** en UPDATE på spillets rad (arrangøren starter, eller cron ved
//   tee-off) henter bundelen på nytt. Det samme gjør en kanal som er tilbake
//   etter et brudd, for et Postgres-endringsvarsel spilles aldri av på nytt
//   (#2093). Samme topic som webbens `GameStartListener`.
// - **Klokka:** nedtellingen tikker hvert 30. sekund. Er tee-off passert, henter
//   hvert tikk bundelen. Det er reserven hvis realtime ligger nede: cron starter
//   runden innen omtrent ett minutt.
//
// Venterommet lover ikke noe varsel. Appen har ingen push om at runden starter.
//
// #2255: venterommet står i stubben på startbilletten og har stubbens drakt,
// ikke et eget banner. Oppførselen er den samme.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { subscribeGameStatus } from '../../data/realtime';
import { waitingRoomView } from '../../lib/waitingRoom';
import { useTheme } from '../../theme';

/** Samme takt som webbens `ScheduledWaitingRoom`. */
const TICK_MS = 30_000;

export function WaitingRoom({
  gameId,
  teeOffAt,
  onChanged,
}: {
  gameId: string;
  teeOffAt: string | null;
  /** Hent bundelen på nytt. Spill-hjem tegner deretter den nye statusen. */
  onChanged: () => void | Promise<void>;
}) {
  const { ui } = useTheme();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (waitingRoomView(teeOffAt, at).teeOffPassed) void onChanged();
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [teeOffAt, onChanged]);

  useEffect(
    () =>
      subscribeGameStatus(gameId, {
        onUpdate: () => {
          void onChanged();
        },
        onResubscribed: () => {
          void onChanged();
        },
      }),
    [gameId, onChanged],
  );

  const view = waitingRoomView(teeOffAt, now);

  return (
    <View style={styles.room} testID="waiting-room">
      <Text style={ui.body}>{view.headline}</Text>
      {view.countdown ? (
        <Text style={[ui.muted, ui.num]} testID="waiting-room-countdown">
          {view.countdown}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  room: { gap: 4 },
});
