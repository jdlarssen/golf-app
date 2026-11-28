// #2930: en rad som ruller sidelengs, med myke kanter der det er mer å se.
//
// Uten hint ser en rad som går ut av kanten ut som en feil, og den som har tre
// venneforslag tror to er alt. Her toner kanten mot flaten bak (`fadeColor`,
// standard `colors.bg`) der raden stopper. Høyre kant står når innholdet er
// bredere enn raden og raden ikke er rullet til enden; venstre kant står når
// raden er rullet. Får alt plass, tegnes ingenting, så samme komponent kan
// ligge på rader som sjelden ruller.
//
// `style` går til den ytre `View`; `contentContainerStyle`, `testID` og
// tilgjengelighets-props går til `ScrollView`, som før. Toningene tar aldri
// trykk og leses ikke opp.
import { useId, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme';

/** Bredden på toningen i kanten. */
export const EDGE_FADE_WIDTH = 24;
/** Slingringsmonn i målingene, så en brøkdel av en piksel ikke tenner en kant. */
const EPSILON = 1;

type Props = Omit<ScrollViewProps, 'horizontal'> & {
  /** Flaten bak raden. Standard `colors.bg`; i et kort er det `colors.surface`. */
  fadeColor?: string;
};

export function EdgeFadeScrollView({
  fadeColor,
  style,
  onLayout,
  onContentSizeChange,
  onScroll,
  children,
  ...rest
}: Props) {
  const { colors } = useTheme();
  const color = fadeColor ?? colors.bg;
  const [width, setWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [offset, setOffset] = useState(0);

  const overflows = contentWidth > width + EPSILON;
  const showLeft = overflows && offset > EPSILON;
  const showRight = overflows && offset + width < contentWidth - EPSILON;

  const handleLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
    onLayout?.(e);
  };
  const handleContentSize = (w: number, h: number) => {
    setContentWidth(w);
    onContentSizeChange?.(w, h);
  };
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setOffset(e.nativeEvent.contentOffset.x);
    onScroll?.(e);
  };

  return (
    <View style={style}>
      <ScrollView
        {...rest}
        horizontal
        onLayout={handleLayout}
        onContentSizeChange={handleContentSize}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
      {showLeft ? <Fade side="left" color={color} /> : null}
      {showRight ? <Fade side="right" color={color} /> : null}
    </View>
  );
}

function Fade({ side, color }: { side: 'left' | 'right'; color: string }) {
  // Hver rad har sin egen gradient-id, så to rader på samme skjerm ikke deler
  // definisjon.
  const id = `edge-fade-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const left = side === 'left';
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.fade, left ? styles.left : styles.right]}
      testID={`edge-fade-${side}`}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={left ? 1 : 0} />
            <Stop offset="1" stopColor={color} stopOpacity={left ? 0 : 1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', top: 0, bottom: 0, width: EDGE_FADE_WIDTH },
  left: { left: 0 },
  right: { right: 0 },
});
