// KeyboardInset (#1954 Del B): the keyboard must never cover the field you type in.
//
// Android 15+ draws the app edge to edge (enforced from API 35). From then on
// `windowSoftInputMode=adjustResize` no longer shrinks the window when the
// keyboard opens: the window stays full height and the keyboard is drawn on top
// of it. On the emulator the e-mail field for invitations on the start ticket
// sat under the keyboard (window frame 0–2400 px with the keyboard shown).
//
// This restores what adjustResize used to do, in one place for the whole app:
// the root shrinks by the keyboard's height. A shorter ScrollView then scrolls
// the focused field into view on its own (Android's ScrollView does that when
// its size changes), so no screen needs its own keyboard code.
//
// RN reports the height above the system bar (`imeInsets.bottom -
// barInsets.bottom`, ReactRootView), while the root reaches the bottom edge of
// the screen. The bottom safe-area inset is that bar, so it is added back.
//
// iOS is left alone: the window never resized there, and the screens with
// fields move their content themselves (`automaticallyAdjustKeyboardInsets`).
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function KeyboardInset({ children }: { children: ReactNode }) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { bottom } = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <View
      testID="keyboard-inset"
      style={{ flex: 1, paddingBottom: keyboardHeight > 0 ? keyboardHeight + bottom : 0 }}
    >
      {children}
    </View>
  );
}
