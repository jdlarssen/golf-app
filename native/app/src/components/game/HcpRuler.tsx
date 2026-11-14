// #2297: linjalen i «Oppdater handicap» (tegningen `Hcp-forslag-ark-B-linjal`).
//
// En horisontal ScrollView med et merke per tidel, 12 pt fra hverandre, og
// `snapToInterval` på samme mål. Midtstreken og tallet over den står fast;
// merkene og prikken for det lagrede tallet ruller.
//
// **Hvem eier posisjonen.** Fingeren gjør det. Tallet regnes fra
// `contentOffset.x` i `onScroll` og sendes opp med `onChange`, men det går
// aldri tilbake ned som en posisjon: ingen styrt `contentOffset` og ingen
// effekt som ruller etter `value`. En slik effekt kjører etter at React har
// tegnet, og da har fingeren flyttet seg videre. Den ruller linjalen tilbake
// til en eldre posisjon midt i et dra eller et kast (evaluatoren, runde 1 og 2).
// Bare to ting ruller linjalen fra koden:
//  1. Startposisjonen, én gang, når innholdet har fått bredden sin
//     (`contentOffset` er også satt, men Android bruker den ikke før layout).
//  2. VoiceOver og TalkBack (`increment`/`decrement`), som ruller i samme
//     handling som de endrer tallet.
// Når feltet «Skriv inn tallet» er brukt, monterer arket linjalen på nytt, og
// da gjelder punkt 1 igjen.
//
// Merkene tegnes i Svg-biter på 100 tideler (1200 pt), ikke som én flate på
// 7400 pt (det er større enn en tekstur kan være på iOS) og ikke som 620
// View-er. Tallene under de hele merkene er vanlig tekst: react-native-svg
// finner ikke Inter-snittene appen laster, og tegnet dem i feil vekt.
import { memo, useRef, useState, type ComponentRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { HCP_MAX } from '../../../../../lib/users/profileInput';
import { HANDICAP_TEXT } from '../../lib/handicapCopy';
import {
  hcpToOffset,
  offsetToHcp,
  RULER_STEP,
  rulerSteps,
  stepHcp,
} from '../../lib/hcpRuler';
import { browserBaseline, FONTS, interLine, useTheme, type ThemeColors } from '../../theme';

/** Høyden på linjalen i tegningen. */
const HEIGHT = 64;
const CHUNK = 100;
const DOT = 7;
/** Tallene står med grunnlinja 56 pt ned, som `<text y="56">` i tegningen. */
const LABEL_BASELINE = 56;
const LABEL_WIDTH = 40;

const ACTIONS = [{ name: 'increment' as const }, { name: 'decrement' as const }];

export function HcpRuler({
  value,
  min,
  stored,
  onChange,
  disabled = false,
  accessibilityValueText,
}: {
  value: number;
  /** Linjalens nedre ende (`rulerMin`). */
  min: number;
  /** Det lagrede tallet, som prikken under merkene. */
  stored: number;
  onChange: (value: number) => void;
  /** Lagringen pågår: linjalen står stille, også for skjermleseren. */
  disabled?: boolean;
  /** «13,8, 0,4 lavere enn sist». */
  accessibilityValueText: string;
}) {
  const { colors } = useTheme();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  // Startverdien, og bare den: objektet er det samme ved hver render, så
  // ScrollView sender det aldri til native igjen.
  const [startOffset] = useState(() => ({ x: hcpToOffset(value, min), y: 0 }));
  const positioned = useRef(false);
  // Det siste tallet linjalen har meldt. `onScroll` melder bare et nytt tall,
  // og en VoiceOver-handling som ruller, gir derfor ingen ekstra melding. Det
  // er også tallet arket viser: mens linjalen står, endres det bare herfra.
  const reported = useRef(value);

  const report = (next: number) => {
    if (next === reported.current) return;
    reported.current = next;
    onChange(next);
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Et kast som fortsatt glir når «Lagre» trykkes, skal ikke flytte tallet
    // som lagres.
    if (disabled) return;
    report(offsetToHcp(event.nativeEvent.contentOffset.x, min));
  };

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (disabled) return;
    const delta = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    const next = stepHcp(reported.current, delta, min);
    scrollRef.current?.scrollTo({ x: hcpToOffset(next, min), animated: false });
    report(next);
  };

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const onContentSizeChange = () => {
    if (positioned.current) return;
    positioned.current = true;
    scrollRef.current?.scrollTo({ x: startOffset.x, animated: false });
  };

  const pad = width / 2;
  const dotX = pad + hcpToOffset(stored, min);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={HANDICAP_TEXT.rulerLabel}
      accessibilityValue={{ min: Math.round(min * 10), max: HCP_MAX * 10, text: accessibilityValueText }}
      accessibilityActions={ACTIONS}
      onAccessibilityAction={onAccessibilityAction}
      style={styles.ruler}
      onLayout={onLayout}
      testID="hcp-ruler"
    >
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          scrollEnabled={!disabled}
          showsHorizontalScrollIndicator={false}
          contentOffset={startOffset}
          snapToInterval={RULER_STEP}
          snapToAlignment="start"
          decelerationRate="normal"
          scrollEventThrottle={16}
          onScroll={onScroll}
          onContentSizeChange={onContentSizeChange}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          testID="hcp-ruler-scroll"
        >
          <View style={{ width: width + rulerSteps(min) * RULER_STEP, height: HEIGHT }}>
            <Ticks min={min} pad={pad} colors={colors} />
            <View
              style={[styles.dot, { left: dotX - DOT / 2, backgroundColor: colors.muted }]}
              testID="hcp-ruler-dot"
            />
          </View>
        </ScrollView>
      ) : null}
      {/* Midtstreken: 3 pt med runde ender fra y 2 til 40, som i tegningen. */}
      <View
        pointerEvents="none"
        style={[styles.center, { left: pad - 1.5, backgroundColor: colors.primary }]}
      />
    </View>
  );
}

/** Merket for tidel nummer `tenths` (signert, −80 er +8,0). */
function tickKind(tenths: number): 'whole' | 'half' | 'tenth' {
  const rest = Math.abs(tenths % 10);
  return rest === 0 ? 'whole' : rest === 5 ? 'half' : 'tenth';
}

/** Tallet under et helt merke: «+1» på plussiden, «0» og «14» ellers. */
export function tickLabel(tenths: number): string {
  const whole = Math.round(tenths / 10);
  return whole < 0 ? `+${-whole}` : `${whole}`;
}

const Ticks = memo(function Ticks({
  min,
  pad,
  colors,
}: {
  min: number;
  pad: number;
  colors: ThemeColors;
}) {
  const steps = rulerSteps(min);
  const first = Math.round(min * 10);
  const chunks: number[] = [];
  for (let start = 0; start <= steps; start += CHUNK) chunks.push(start);
  const labels: { i: number; text: string }[] = [];
  for (let i = 0; i <= steps; i += 1) {
    if (tickKind(first + i) === 'whole') labels.push({ i, text: tickLabel(first + i) });
  }
  return (
    <>
      {chunks.map((start) => {
        const end = Math.min(steps, start + CHUNK - 1);
        // Én pt på hver side, så den ytterste streken ikke klippes.
        const svgWidth = (end - start) * RULER_STEP + 2;
        const marks = [];
        for (let i = start; i <= end; i += 1) {
          const kind = tickKind(first + i);
          const x = (i - start) * RULER_STEP + 1;
          marks.push(
            <Line
              key={i}
              x1={x}
              y1={8}
              x2={x}
              y2={kind === 'whole' ? 32 : kind === 'half' ? 24 : 18}
              stroke={kind === 'whole' ? colors.text : colors.muted}
              strokeWidth={kind === 'whole' ? 1.5 : kind === 'half' ? 1.2 : 1}
            />,
          );
        }
        return (
          <Svg
            key={start}
            width={svgWidth}
            height={HEIGHT}
            style={[styles.chunk, { left: pad + start * RULER_STEP - 1 }]}
          >
            {marks}
          </Svg>
        );
      })}
      {labels.map(({ i, text }) => (
        <Text
          key={`t${i}`}
          style={[styles.label, { left: pad + i * RULER_STEP - LABEL_WIDTH / 2, color: colors.muted }]}
        >
          {text}
        </Text>
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  ruler: { height: HEIGHT },
  chunk: { position: 'absolute', top: 0 },
  // Inter 600 12 pt, med grunnlinja på 56 (`interLine` gir nettleserens linjeboks).
  label: {
    position: 'absolute',
    top: LABEL_BASELINE - browserBaseline('inter', 12, 15),
    width: LABEL_WIDTH,
    ...interLine(12, 15),
    fontFamily: FONTS.sansSemiBold,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  dot: { position: 'absolute', top: 40 - DOT / 2, width: DOT, height: DOT, borderRadius: DOT / 2 },
  center: { position: 'absolute', top: 0.5, width: 3, height: 41, borderRadius: 1.5 },
});
