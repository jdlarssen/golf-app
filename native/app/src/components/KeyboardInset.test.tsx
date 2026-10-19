// KeyboardInset (Type B): appen tegner kant til kant på Android (Expo-malen setter
// `edgeToEdgeEnabled=true`, og valget finnes ikke lenger), og da krymper ikke
// vinduet når tastaturet kommer opp (#1954 Del B: e-postfeltet for invitasjon lå
// under tastaturet på startbilletten). Her låses at roten krymper med det
// tastaturet faktisk dekker av den, at den slipper når tastaturet går ned, at
// den ikke trekker fra to ganger når systemet selv har krympet vinduet, og at
// den står urørt på iOS.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, Platform, Text } from 'react-native';
import { KeyboardInset } from './KeyboardInset';

type KeyboardEvent = { endCoordinates: { height: number; screenY: number } };
type Listener = (e: KeyboardEvent) => void;

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

async function layoutRoot(height: number) {
  await fireEvent(screen.getByTestId('keyboard-inset'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 412, height } },
  });
}

async function renderInset() {
  return render(
    <KeyboardInset>
      <Text>Innhold</Text>
    </KeyboardInset>,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

it('på Android krymper roten med det tastaturet dekker, og slipper når tastaturet går ned', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const { listeners, removed } = captureKeyboardListeners();
  const { unmount } = await renderInset();
  // Kant til kant: roten går helt ned (914 dp), og tastaturets topp står på 578 dp.
  await layoutRoot(914);

  expect(paddingBottom()).toBe(0);
  await act(async () => listeners.keyboardDidShow({ endCoordinates: { height: 312, screenY: 578 } }));
  expect(paddingBottom()).toBe(336);
  await act(async () => listeners.keyboardDidHide({ endCoordinates: { height: 0, screenY: 914 } }));
  expect(paddingBottom()).toBe(0);
  expect(screen.getByText('Innhold')).toBeTruthy();

  await unmount();
  expect(removed.sort()).toEqual(['keyboardDidHide', 'keyboardDidShow']);
});

it('på Android legger roten ingen luft til når systemet selv har krympet vinduet', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const { listeners } = captureKeyboardListeners();
  await renderInset();
  // Vinduet er allerede krympet til tastaturets topp (adjustResize uten kant til kant).
  await layoutRoot(578);

  await act(async () => listeners.keyboardDidShow({ endCoordinates: { height: 312, screenY: 578 } }));
  expect(paddingBottom()).toBe(0);
});

it('på iOS lytter roten ikke på tastaturet og legger ingen luft under innholdet', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const { listeners } = captureKeyboardListeners();
  await renderInset();
  await layoutRoot(874);

  expect(Object.keys(listeners)).toEqual([]);
  expect(paddingBottom()).toBe(0);
});

// iOS-søsknene til B1: på iOS krymper ikke vinduet heller, og der gjør RN selv
// det KeyboardInset gjør på Android: med `automaticallyAdjustKeyboardInsets`
// måler ScrollView-en hvor mye tastaturet dekker den og ruller feltet fram.
// Startbilletten (invitasjon), venner, rediger profil og veiviseren manglet den,
// og e-postfeltet for invitasjon lå under tastaturet i simulatoren. Hver skjerm
// med et tekstfelt skal ha de felles egenskapene på rullefeltet sitt.
describe('rullefeltet på skjermer med tekstfelt', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const screens = path.join(__dirname, '..', 'screens');
  // Felt via komponenter: OrganiserSection (startbilletten) og stegene i veiviseren.
  const viaComponents: Record<string, string> = {
    'GameHome.tsx': 'game-home-screen',
    'CreateGame.tsx': 'create-screen',
  };
  const direct = fs
    .readdirSync(screens)
    .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
    .filter((f) => fs.readFileSync(path.join(screens, f), 'utf8').includes('<TextInput'));

  it('finner skjermene med egne tekstfelt', () => {
    expect(direct.sort()).toEqual(['CompleteProfile.tsx', 'EditProfile.tsx', 'Friends.tsx', 'Login.tsx']);
  });

  it.each([...direct, ...Object.keys(viaComponents)])('%s sprer KEYBOARD_SCROLL_PROPS på rullefeltet med feltene', (file) => {
    const src = fs.readFileSync(path.join(screens, file), 'utf8');
    const openers = [...src.matchAll(/<ScrollView\b[^>]*>/g)].map((m) => m[0]);
    const withProps = openers.filter((o) => o.includes('{...KEYBOARD_SCROLL_PROPS}'));
    expect(withProps.length).toBeGreaterThan(0);
    if (viaComponents[file]) {
      expect(withProps.some((o) => o.includes(`testID="${viaComponents[file]}"`))).toBe(true);
    }
  });
});
