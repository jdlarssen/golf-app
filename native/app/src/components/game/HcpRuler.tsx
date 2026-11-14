// #2297: linjalen i arket «Oppdater handicap» (`Hcp-forslag-ark-B-*`).
//
// En horisontal `ScrollView` som snapper på hver tidel (12 pt). Midtstreken står
// fast; tallet under den er verdien. Prikken er det som står lagret. Hele tall har
// lang strek og tall under, x,5 en middels strek, resten korte. Plussiden heter
// «+1», «+2» osv.
//
// Merkene tegnes i `Svg`, men i biter på 100 tidel (1200 pt), ikke i én bredde på
// 7000 pt: en så bred flate blir enten blank eller dyr på iOS. Bitene ligger side
// om side i en beholder med nøyaktig innholdsbredde, så høyeste scroll er 54.
//
// Verdien regnes fra `contentOffset.x`. Utenfra (VoiceOver, feltet) flyttes
// linjalen med `scrollTo`, men ikke mens fingeren drar: effekten flytter først når
// målet er mer enn et halvt trinn unna der linjalen står.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { handicapRulerValueText, HANDICAP_SHEET_TEXT } from '../../lib/handicapCopy';
import {
  hcpChange,
  hcpToOffset,
  offsetToHcp,
  RULER_TICK_PT,
  rulerSteps,
} from '../../lib/hcpRuler';
import { FONTS, useTheme } from '../../theme';

const HEIGHT = 64;
/** Tideler per svg-bit: 100 = ti hele tall = 1200 pt. */
const CHUNK_TENTHS = 100;
const CHUNK_WIDTH = CHUNK_TENTHS * RULER_TICK_PT;
/** Luft på hver side i en bit, så en strek eller en tosifret etikett på kanten ikke klippes. */
const EDGE = RULER_TICK_PT;
const SLACK = RULER_TICK_PT / 2 + 0.5;

const mod = (n: number, m: number) => ((n % m) + m) % m;
const label = (whole: number) => (whole < 0 ? `+${-whole}` : String(whole));

export function HcpRuler({
  value,
  stored,
  min,
  onChange,
  onStep,
}: {
  value: number;
  /** Det som står lagret: prikken. */
  stored: number;
  /** Nederste stopp (`rulerMin`). */
  min: number;
  onChange: (value: number) => void;
  /** VoiceOver: ±1 tidel. Eieren av verdien klemmer og setter den. */
  onStep: (deltaTenths: number) => void;
}) {
  const { colors } = useTheme();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width - 40);
  const scrollRef = useRef<ScrollView>(null);
  // Startposisjonen leses én gang. Resten flyttes med `scrollTo` i effekten under: en styrt
  // `contentOffset` ville lagt posisjonen inn i native midt i en dra eller et glid.
  const [initialOffset] = useState(() => hcpToOffset(value, min));
  const x = useRef(initialOffset);
  const latest = useRef(value);

  const pad = width / 2;
  const steps = rulerSteps(min);
  const tenthsMin = Math.round(min * 10);

  useEffect(() => {
    latest.current = value;
    const target = hcpToOffset(value, min);
    if (Math.abs(x.current - target) > SLACK) {
      scrollRef.current?.scrollTo({ x: target, animated: false });
      x.current = target;
    }
  }, [value, min, width]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    x.current = event.nativeEvent.contentOffset.x;
    const next = offsetToHcp(x.current, min);
    if (next !== latest.current) onChange(next);
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && next !== width) setWidth(next);
  };

  const chunks = useMemo(() => {
    const result: { key: number; major: string; half: string; minor: string; labels: { x: number; text: string }[] }[] = [];
    for (let start = 0; start <= steps; start += CHUNK_TENTHS) {
      let major = '';
      let half = '';
      let minor = '';
      const labels: { x: number; text: string }[] = [];
      for (let i = start; i < Math.min(start + CHUNK_TENTHS, steps + 1); i++) {
        const tenth = tenthsMin + i;
        const at = EDGE + (i - start) * RULER_TICK_PT;
        if (mod(tenth, 10) === 0) {
          major += `M${at} 8V32`;
          labels.push({ x: at, text: label(tenth / 10) });
        } else if (mod(tenth, 5) === 0) {
          half += `M${at} 8V24`;
        } else {
          minor += `M${at} 8V18`;
        }
      }
      result.push({ key: start, major, half, minor, labels });
    }
    return result;
  }, [steps, tenthsMin]);

  const change = hcpChange(stored, value);
  const dotLeft = pad + hcpToOffset(stored, min) - 3.5;
  const contentWidth = 2 * pad + steps * RULER_TICK_PT;

  return (
    <View
      style={styles.root}
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={HANDICAP_SHEET_TEXT.rulerLabel}
      accessibilityValue={{ text: handicapRulerValueText(value, change) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') onStep(1);
        if (event.nativeEvent.actionName === 'decrement') onStep(-1);
      }}
      testID="hcp-ruler"
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        snapToInterval={RULER_TICK_PT}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentOffset={{ x: initialOffset, y: 0 }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        testID="hcp-ruler-scroll"
      >
        <View style={{ width: contentWidth, height: HEIGHT, overflow: 'hidden' }}>
          {chunks.map((chunk) => (
            <Svg
              key={chunk.key}
              width={CHUNK_WIDTH + 2 * EDGE}
              height={HEIGHT}
              style={{ position: 'absolute', top: 0, left: pad - EDGE + chunk.key * RULER_TICK_PT }}
            >
              {chunk.minor ? <Path d={chunk.minor} stroke={colors.muted} strokeWidth={1} /> : null}
              {chunk.half ? <Path d={chunk.half} stroke={colors.muted} strokeWidth={1.2} /> : null}
              {chunk.major ? <Path d={chunk.major} stroke={colors.text} strokeWidth={1.5} /> : null}
              {chunk.labels.map((tick) => (
                <SvgText
                  key={tick.text}
                  x={tick.x}
                  y={56}
                  textAnchor="middle"
                  fontSize={12}
                  fontFamily={FONTS.sansSemiBold}
                  fill={colors.muted}
                >
                  {tick.text}
                </SvgText>
              ))}
            </Svg>
          ))}
          <View
            style={[styles.dot, { left: dotLeft, backgroundColor: colors.muted }]}
            testID="hcp-ruler-stored"
          />
        </View>
      </ScrollView>
      <View
        pointerEvents="none"
        style={[styles.center, { left: pad - 1.5, backgroundColor: colors.primary }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: HEIGHT },
  dot: { position: 'absolute', top: 36.5, width: 7, height: 7, borderRadius: 3.5 },
  center: { position: 'absolute', top: 2, width: 3, height: 38, borderRadius: 1.5 },
});
