// KeyboardInset (#1954 Del B): the keyboard must never cover the field you type in.
//
// The app draws edge to edge on every Android version: the Expo SDK 57 prebuild
// template sets `edgeToEdgeEnabled=true` in gradle.properties, and Expo removed
// the option to turn it off (`withEdgeToEdge`). Edge to edge,
// `windowSoftInputMode=adjustResize` no longer shrinks the window when the
// keyboard opens: the window stays full height and the keyboard is drawn on top
// of it. On the emulator (API 36) the e-mail field for invitations on the start
// ticket sat under the keyboard (window frame 0–2400 px with the keyboard shown).
//
// This restores what adjustResize used to do, in one place for the whole app:
// the root shrinks by the part of it the keyboard actually covers. A shorter
// ScrollView then scrolls the focused field into view on its own (Android's
// ScrollView does that when its size changes), so no screen needs its own
// keyboard code.
//
// The overlap is measured, not assumed: the root's bottom edge (its own layout)
// minus the keyboard's top edge (`endCoordinates.screenY`, the bottom of the
// visible display frame in ReactRootView). Should a window still be resized by
// the system, the root already ends at the keyboard and the overlap is 0, so the
// keyboard is never subtracted twice. The root is the first view under the
// window, so its layout and the screen share the same origin.
//
// iOS gets the same measurement from RN itself: the window does not resize there
// either, and with `automaticallyAdjustKeyboardInsets` the ScrollView measures how
// much of it the keyboard covers and scrolls the focused field into view
// (RCTScrollViewComponentView `_keyboardWillChangeFrame`). A root inset would not
// scroll the field there, so the root is left alone on iOS and every screen with a
// text field spreads KEYBOARD_SCROLL_PROPS on its ScrollView. Android ignores the
// prop, so the two never add up.
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, View, type LayoutChangeEvent } from 'react-native';

/**
 * Spread on the ScrollView of every screen with a text field (iOS keeps the
 * focused field above the keyboard; Android ignores it and uses KeyboardInset).
 */
export const KEYBOARD_SCROLL_PROPS = { automaticallyAdjustKeyboardInsets: true } as const;

export function KeyboardInset({ children }: { children: ReactNode }) {
  const [rootBottom, setRootBottom] = useState(0);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardTop(e.endCoordinates.screenY);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    setRootBottom(y + height);
  };

  const covered = keyboardTop === null ? 0 : Math.max(0, rootBottom - keyboardTop);

  return (
    <View testID="keyboard-inset" onLayout={onLayout} style={{ flex: 1, paddingBottom: covered }}>
      {children}
    </View>
  );
}
