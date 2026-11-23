// native/app/src/components/Tap.tsx
// #2928: appens eneste knapp-primitiv. En tynn innpakning rundt `Pressable` med
// de samme props, som viser at trykket tok: på iOS legges trykk-stilen sist mens
// knappen holdes inne, og på Android er ripplen trykk-tilstanden. I ro sendes
// stilen videre uendret, så ingenting ser annerledes ut før man trykker.
//
// Ingen `Animated`: tilstanden skifter med en gang, så redusert bevegelse er
// oppfylt uten mer kode. Lint-regelen i `eslint.config.mjs` forbyr `Pressable`
// fra `react-native` utenfor denne fila, så nye knapper får trykkrespons uten at
// noen må huske det.
import type { ComponentProps } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';

type PressableProps = ComponentProps<typeof Pressable>;

export type TapProps = PressableProps & {
  /**
   * `'none'`: ingen ripple og ingen trykk-stil. Bare for bakteppet bak et ark og
   * usynlige trykkflater, der et blink ville sett ut som en feil.
   */
  feedback?: 'press' | 'none';
};

type TapStyle = PressableProps['style'];

/**
 * Trykk-stilen på iOS, lagt sist i stilen mens knappen holdes inne: hele
 * knappen dempes (eierens valg B, #2928: «B, dempet knapp»).
 */
export const PRESSED: ViewStyle = { opacity: 0.6 };

const RADIUS_KEY = /^border\w*Radius$/;

/**
 * Android tegner ripplen som et rektangel. Har knappen runde hjørner, klipper
 * `overflow: 'hidden'` den til hjørnene (RN 0.86 klipper forgrunnen sammen med
 * barna i `ReactViewGroup.dispatchDraw`). Setter knappen `overflow` selv, vinner den.
 */
export function androidClip(style: StyleProp<ViewStyle>): StyleProp<ViewStyle> {
  const flat = StyleSheet.flatten(style);
  if (!flat || flat.overflow != null) return style;
  const rounded = Object.entries(flat).some(
    ([key, value]) => RADIUS_KEY.test(key) && value != null && value !== 0 && value !== '0%',
  );
  return rounded ? [style, CLIP] : style;
}

const CLIP: ViewStyle = { overflow: 'hidden' };

function resolve(style: TapStyle, state: PressableStateCallbackType): StyleProp<ViewStyle> {
  return typeof style === 'function' ? style(state) : style;
}

export function Tap({ feedback = 'press', style, android_ripple, ...rest }: TapProps) {
  const { colors } = useTheme();

  if (feedback === 'none') {
    return <Pressable {...rest} style={style} android_ripple={android_ripple} />;
  }

  if (Platform.OS === 'android') {
    return (
      <Pressable
        {...rest}
        android_ripple={android_ripple ?? { color: colors.pressRipple, foreground: true }}
        style={(state) => androidClip(resolve(style, state))}
      />
    );
  }

  return (
    <Pressable
      {...rest}
      android_ripple={android_ripple}
      style={(state) => {
        const base = resolve(style, state);
        return state.pressed ? [base, PRESSED] : base;
      }}
    />
  );
}
