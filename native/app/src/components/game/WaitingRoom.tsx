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
//
// #2204: er tee-off passert og runden står fast, sier venterommet hvorfor i
// stedet for «Starter snart». Sperren hentes bare etter tee-off, én gang per ny
// bundel (altså høyst én gang per tikk), og et svar som kommer etter at
// bundelen er byttet ut, kastes.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { GameBundle } from '../../data/gameBundle';
import { subscribeGameStatus } from '../../data/realtime';
import { fetchStartBlock } from '../../data/startBlock';
import { waitingRoomView, type WaitingRoomBlock } from '../../lib/waitingRoom';
import { FONTS, useTheme } from '../../theme';

/** Samme takt som webbens `ScheduledWaitingRoom`. */
const TICK_MS = 30_000;

export function WaitingRoom({
  gameId,
  teeOffAt,
  onChanged,
  bundle,
}: {
  gameId: string;
  teeOffAt: string | null;
  /** Hent bundelen på nytt. Spill-hjem tegner deretter den nye statusen. */
  onChanged: () => void | Promise<void>;
  /** #2204: til sperren etter tee-off. Uten bundel teller venterommet ned som før. */
  bundle?: GameBundle;
}) {
  const { colors, ui } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const [block, setBlock] = useState<WaitingRoomBlock>(null);
  const teeOffPassed = waitingRoomView(teeOffAt, now).teeOffPassed;

  useEffect(() => {
    if (!teeOffPassed || !bundle) return;
    let cancelled = false;
    void fetchStartBlock(bundle).then((next) => {
      if (!cancelled) setBlock(next);
    });
    return () => {
      cancelled = true;
    };
  }, [teeOffPassed, bundle]);

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

  const view = waitingRoomView(teeOffAt, now, block);

  return (
    <View style={styles.room} testID="waiting-room">
      <Text style={[styles.headline, { color: colors.muted }]}>{view.headline}</Text>
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
  /** Brødtekst i billetten er 13 pt i muted, som i designet (#2255). */
  headline: { fontSize: 13, fontFamily: FONTS.sans },
});
