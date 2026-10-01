// #2265 PR 2: Kavalkaden mens den laster, som webbens rute-skjelett
// (`app/[locale]/kavalkade/loading.tsx`): overskriften, fane-raden og kortene i
// skinna, uten ventetekst. Første åpning etter slippet venter på modellen før
// raden skrives, så dette er skjermen spilleren ser en liten stund julaften.
//
// Toppstripa er navigatorens (`kickerHeader`) og står alt, så skjelettet
// begynner under den. Formene glinser som webbens `.sk`: en lys stripe sveiper
// over på 1,8 s, forskjøvet per form. Med «Reduser bevegelse» står de stille.
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
  type DimensionValue,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';

/** Kortet i skinna: 88 % av innholdsbredden, som `w-[88%]` på webben. */
export const CARD_SHARE_OF_WIDTH = 0.88;
/** Sidemargen på webben (`AppShell`, `px-5`). */
export const PAGE_GUTTER = 20;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** Én form, som webbens `Skeleton`: lin-grunn og en glans som sveiper over. */
function Bone({
  width,
  height,
  radius = 6,
  delay,
  still,
  flex,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
  delay: number;
  still: boolean;
  flex?: number;
}) {
  const { colors } = useTheme();
  const [boneWidth, setBoneWidth] = useState(0);
  // Én verdi per form, laget én gang (`useState` med fabrikk, ikke en ref).
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (still || boneWidth === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, boneWidth, delay, progress]);

  // `background-size: 220%` fra `background-position: 100%` til `-120%`.
  const sweep = boneWidth * 2.2;
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-(sweep - boneWidth), (sweep - boneWidth) * 1.2],
  });

  return (
    <View
      onLayout={(event) => setBoneWidth(event.nativeEvent.layout.width)}
      style={{
        width,
        flex,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: colors.skeleton,
      }}
    >
      {still || boneWidth === 0 ? null : (
        <Animated.View style={[styles.sweep, { width: sweep, transform: [{ translateX }] }]}>
          <Svg width={sweep} height={height}>
            <Defs>
              <LinearGradient id="sk" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.skeleton} />
                <Stop offset="0.5" stopColor={colors.skeletonTint} />
                <Stop offset="1" stopColor={colors.skeleton} />
              </LinearGradient>
            </Defs>
            <Rect width={sweep} height={height} fill="url(#sk)" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

export function KavalkadeSkeleton() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const still = useReducedMotion();
  const cardWidth = (width - PAGE_GUTTER * 2) * CARD_SHARE_OF_WIDTH;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="kavalkade-skeleton"
    >
      <Bone width={160} height={28} delay={30} still={still} />
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        <Bone flex={1} height={20} delay={60} still={still} />
        <Bone flex={1} height={20} delay={90} still={still} />
      </View>
      <View style={styles.rail}>
        <Bone width={cardWidth} height={256} radius={16} delay={120} still={still} />
        <Bone width={cardWidth} height={256} radius={16} delay={180} still={still} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  rail: { flexDirection: 'row', gap: 16, marginTop: 16, overflow: 'hidden' },
});
