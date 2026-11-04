// #2756: et kort drys i gull over resultatet første gang det åpnes. Konfetti er
// orkestratorens valg etter eierens fullmakt 04.11 («hvis du mener det er god
// ui/ux så ta med det»). Nettets farger, ingen animasjonspakke. Tar ikke imot
// trykk, er skjult for skjermleseren og fyrer aldri ved redusert bevegelse.
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { claimConfetti } from '../../lib/resultConfetti';

const COLORS = ['#C9A961', '#D7BC78', '#B89446', '#F0EDE5'];
const PIECES = 36;
/** Det lengste drysset, med forsinkelse: halvannet sekund. */
const MAX_MS = 1500;

type Piece = {
  left: string;
  width: number;
  height: number;
  color: string;
  delay: number;
  duration: number;
  dx: number;
  dy: number;
  turn: string;
  progress: Animated.Value;
};

function makePieces(): Piece[] {
  return Array.from({ length: PIECES }, (_, index) => {
    const delay = Math.random() * 200;
    return {
      left: `${Math.random() * 100}%`,
      width: 3 + Math.random() * 3,
      height: 6 + Math.random() * 6,
      color: COLORS[index % COLORS.length],
      delay,
      duration: 1000 + Math.random() * (MAX_MS - 1000 - delay),
      dx: (Math.random() - 0.5) * 60,
      dy: 140 + Math.random() * 200,
      turn: `${(Math.random() - 0.5) * 540}deg`,
      progress: new Animated.Value(0),
    };
  });
}

export function ResultConfetti({ gameId, endedAt }: { gameId: string; endedAt: string | null }) {
  const [fire, setFire] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const reduced = await AccessibilityInfo.isReduceMotionEnabled().catch(() => true);
      if (reduced || !alive) return;
      if ((await claimConfetti(gameId, endedAt)) && alive) setFire(true);
    })();
    return () => {
      alive = false;
    };
  }, [gameId, endedAt]);

  const pieces = useMemo(() => (fire ? makePieces() : []), [fire]);

  useEffect(() => {
    if (pieces.length === 0) return;
    const run = Animated.parallel(
      pieces.map((piece) =>
        Animated.timing(piece.progress, {
          toValue: 1,
          delay: piece.delay,
          duration: piece.duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    );
    run.start(({ finished }) => {
      if (finished) setFire(false);
    });
    return () => run.stop();
  }, [pieces]);

  if (!fire) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.overlay}
      testID="result-confetti"
    >
      {pieces.map((piece, index) => (
        <Animated.View
          key={index}
          style={{
            position: 'absolute',
            top: -16,
            left: piece.left as `${number}%`,
            width: piece.width,
            height: piece.height,
            borderRadius: 1,
            backgroundColor: piece.color,
            opacity: piece.progress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: piece.progress.interpolate({ inputRange: [0, 1], outputRange: [0, piece.dx] }) },
              { translateY: piece.progress.interpolate({ inputRange: [0, 1], outputRange: [0, piece.dy] }) },
              { rotate: piece.progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', piece.turn] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
});
