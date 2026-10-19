// KeyboardInset (Type B): på Android 15+ tegner appen kant til kant, og da
// krymper ikke vinduet lenger når tastaturet kommer opp (#1954 Del B: e-postfeltet
// for invitasjon lå under tastaturet på startbilletten). Her låses at roten
// krymper med tastaturets høyde pluss systemlinja under det på Android, slipper
// når tastaturet går ned, og står urørt på iOS, der skjermene selv flytter
// innholdet (`automaticallyAdjustKeyboardInsets`).
import { act, render, screen } from '@testing-library/react-native';
import { Keyboard, Platform, Text } from 'react-native';
import { KeyboardInset } from './KeyboardInset';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}));

type Listener = (e: { endCoordinates: { height: number } }) => void;

function captureKeyboardListeners() {
  const listeners: Record<string, Listener> = {};
  const removed: string[] = [];
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: Listener) => {
    listeners[event] = cb;
    return { remove: () => removed.push(event) };
  }) as unknown as typeof Keyboard.addListener);
  return { listeners, removed };
}

function paddingBottom() {
  const style = screen.getByTestId('keyboard-inset').props.style as { paddingBottom?: number };
  return style.paddingBottom ?? 0;
}

afterEach(() => {
  jest.restoreAllMocks();
});

it('på Android krymper roten med tastaturet og systemlinja, og slipper når tastaturet går ned', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const { listeners, removed } = captureKeyboardListeners();
  const { unmount } = await render(
    <KeyboardInset>
      <Text>Innhold</Text>
    </KeyboardInset>,
  );

  expect(paddingBottom()).toBe(0);
  await act(async () => listeners.keyboardDidShow({ endCoordinates: { height: 300 } }));
  expect(paddingBottom()).toBe(324);
  await act(async () => listeners.keyboardDidHide({ endCoordinates: { height: 0 } }));
  expect(paddingBottom()).toBe(0);
  expect(screen.getByText('Innhold')).toBeTruthy();

  await unmount();
  expect(removed.sort()).toEqual(['keyboardDidHide', 'keyboardDidShow']);
});

it('på iOS lytter roten ikke på tastaturet og legger ingen luft under innholdet', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const { listeners } = captureKeyboardListeners();
  await render(
    <KeyboardInset>
      <Text>Innhold</Text>
    </KeyboardInset>,
  );

  expect(Object.keys(listeners)).toEqual([]);
  expect(paddingBottom()).toBe(0);
});
