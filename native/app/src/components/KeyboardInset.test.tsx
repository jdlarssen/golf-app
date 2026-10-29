// KeyboardInset (Type B): appen tegner kant til kant på Android (Expo-malen setter
// `edgeToEdgeEnabled=true`, og valget finnes ikke lenger), og da krymper ikke
// vinduet når tastaturet kommer opp (#1954 Del B: e-postfeltet for invitasjon lå
// under tastaturet på startbilletten). Her låses at roten krymper med det
// tastaturet faktisk dekker av den, at den slipper når tastaturet går ned, at
// den ikke trekker fra to ganger når systemet selv har krympet vinduet, at
// båndet under innholdet har appens bakgrunn, og at den står urørt på iOS.
/* eslint-disable @typescript-eslint/no-require-imports -- fs/path i vaktene under */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { Keyboard, Platform, Text } from 'react-native';
import { themeFor } from '../theme';
import { KeyboardInset, useKeyboardShown } from './KeyboardInset';

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

function rootStyle() {
  return screen.getByTestId('keyboard-inset').props.style as {
    paddingBottom?: number;
    backgroundColor?: string;
  };
}

function paddingBottom() {
  return rootStyle().paddingBottom ?? 0;
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
  // Vinduet er krympet til over tastaturets topp, og roten slutter 24 dp før den.
  await layoutRoot(554);

  await act(async () => listeners.keyboardDidShow({ endCoordinates: { height: 312, screenY: 578 } }));
  expect(paddingBottom()).toBe(0);
});

it('båndet under innholdet har appens bakgrunn, ikke vinduets', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  captureKeyboardListeners();
  await renderInset();
  expect(rootStyle().backgroundColor).toBe(themeFor('light').colors.bg);
});

it('på iOS lytter roten ikke på tastaturet og legger ingen luft under innholdet', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const { listeners } = captureKeyboardListeners();
  await renderInset();
  await layoutRoot(874);

  expect(Object.keys(listeners)).toEqual([]);
  expect(paddingBottom()).toBe(0);
});

// iOS løfter arket (KeyboardAvoidingView) på `keyboardWill…`, så luften må følge
// de samme hendelsene, ellers hopper arket 34 pt etter animasjonen. Android har
// bare `keyboardDid…`.
it.each([
  ['android', 'keyboardDidShow', 'keyboardDidHide'],
  ['ios', 'keyboardWillShow', 'keyboardWillHide'],
] as const)(
  'useKeyboardShown sier om tastaturet er oppe (%s: %s/%s), så bunnluften for systemlinja kan droppes',
  async (os, showEvent, hideEvent) => {
    jest.replaceProperty(Platform, 'OS', os);
    const { listeners } = captureKeyboardListeners();
    const { result } = await renderHook(() => useKeyboardShown());
    expect(Object.keys(listeners).sort()).toEqual([hideEvent, showEvent].sort());
    expect(result.current).toBe(false);
    await act(async () => listeners[showEvent]({ endCoordinates: { height: 312, screenY: 578 } }));
    expect(result.current).toBe(true);
    await act(async () => listeners[hideEvent]({ endCoordinates: { height: 0, screenY: 914 } }));
    expect(result.current).toBe(false);
  },
);

// Vaktene under leser kildekoden. På iOS krymper ikke vinduet heller, og der gjør
// RN selv det KeyboardInset gjør på Android: med `automaticallyAdjustKeyboardInsets`
// måler ScrollView-en hvor mye tastaturet dekker den og ruller feltet fram.
// Startbilletten (invitasjon), venner, rediger profil og veiviseren manglet den,
// og e-postfeltet for invitasjon lå under tastaturet i simulatoren.
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const SRC = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

function walkTsx(dir: string): string[] {
  return fs.readdirSync(path.join(SRC, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return walkTsx(rel);
    return e.name.endsWith('.tsx') && !e.name.includes('.test.') ? [rel] : [];
  });
}

/**
 * Every JSX `<ScrollView …>` opener, read up to its own `>` (tolerant of `=>` and
 * nested braces). A type argument such as `useRef<ScrollView>` is skipped: there
 * the `<` follows an identifier.
 */
function scrollViewOpeners(src: string): string[] {
  const out: string[] = [];
  let at = src.indexOf('<ScrollView');
  while (at !== -1) {
    if (/[\w$]/.test(src[at - 1] ?? '')) {
      at = src.indexOf('<ScrollView', at + 1);
      continue;
    }
    let depth = 0;
    let i = at + '<ScrollView'.length;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    out.push(src.slice(at, i + 1));
    at = src.indexOf('<ScrollView', i);
  }
  return out;
}

const isVertical = (opener: string) => !/\bhorizontal\b/.test(opener);
const spreads = (opener: string) => opener.includes('{...KEYBOARD_SCROLL_PROPS}');

// Hver komponent med et tekstfelt, og hvor feltet havner. En ny feltkomponent
// faller ut av testen under til den står her.
const FIELD_COMPONENTS: Record<string, { host: string; scrollTestID: string } | 'modal'> = {
  'components/game/OrganiserSection.tsx': { host: 'screens/GameHome.tsx', scrollTestID: 'game-home-screen' },
  'components/create/CourseStep.tsx': { host: 'screens/CreateGame.tsx', scrollTestID: 'create-screen' },
  'components/create/SetupStep.tsx': { host: 'screens/CreateGame.tsx', scrollTestID: 'create-screen' },
  'components/create/PlayersStep.tsx': { host: 'screens/CreateGame.tsx', scrollTestID: 'create-screen' },
  // Arket ligger i en Modal (eget vindu) med KeyboardAvoidingView rundt seg.
  'components/approve/RejectSheet.tsx': 'modal',
  // #2675: søkefeltet over medspillerlista og over markørvalget.
  'components/PickerSearch.tsx': { host: 'screens/LeagueRoundStart.tsx', scrollTestID: 'round-start-scroll' },
};

describe('rullefeltet på skjermer med tekstfelt', () => {
  const screensWithFields = walkTsx('screens').filter((f) => read(f).includes('<TextInput'));
  const componentsWithFields = walkTsx('components').filter((f) => read(f).includes('<TextInput'));

  it('finner skjermene med egne tekstfelt', () => {
    expect(screensWithFields.sort()).toEqual([
      'screens/CompleteProfile.tsx',
      'screens/EditProfile.tsx',
      'screens/Friends.tsx',
      'screens/Login.tsx',
    ]);
  });

  it('hver komponent med tekstfelt står i tabellen over', () => {
    expect(componentsWithFields.sort()).toEqual(Object.keys(FIELD_COMPONENTS).sort());
  });

  it('arket med avvisningsgrunnen holder seg over tastaturet selv', () => {
    const sheet = read('components/approve/RejectSheet.tsx');
    expect(sheet).toMatch(/<Modal\b/);
    expect(sheet).toMatch(/<KeyboardAvoidingView\b/);
  });

  const hosts = [
    ...screensWithFields,
    ...new Set(Object.values(FIELD_COMPONENTS).flatMap((v) => (v === 'modal' ? [] : [v.host]))),
  ];

  it.each(hosts)('%s sprer KEYBOARD_SCROLL_PROPS på alle vertikale rullefelt', (file) => {
    const vertical = scrollViewOpeners(read(file)).filter(isVertical);
    expect(vertical.length).toBeGreaterThan(0);
    expect(vertical.filter((o) => !spreads(o))).toEqual([]);
  });

  it.each(Object.entries(FIELD_COMPONENTS).filter(([, v]) => v !== 'modal'))(
    '%s havner i et rullefelt med KEYBOARD_SCROLL_PROPS',
    (_component, v) => {
      const { host, scrollTestID } = v as { host: string; scrollTestID: string };
      const target = scrollViewOpeners(read(host)).filter((o) => o.includes(`testID="${scrollTestID}"`));
      expect(target).toHaveLength(1);
      expect(spreads(target[0])).toBe(true);
    },
  );
});

// Markørvalget (`MarkerPicker`) har søkefeltet fra `PickerSearch` og står i
// scorekortets rullefelt (#2675).
it('scorekortet, der markørvalget har søkefelt, sprer KEYBOARD_SCROLL_PROPS på rullefeltet', () => {
  const target = scrollViewOpeners(read('screens/Scorecard.tsx')).filter((o) => o.includes('testID="scorecard-screen"'));
  expect(target).toHaveLength(1);
  expect(spreads(target[0])).toBe(true);
});

describe('Android-halvdelen: roten er pakket inn', () => {
  const app = fs.readFileSync(path.join(SRC, '..', 'App.tsx'), 'utf8');
  const wrapped = (inner: string) =>
    [...app.matchAll(/<KeyboardInset>([\s\S]*?)<\/KeyboardInset>/g)].some((m) => m[1].includes(inner));

  it('innloggingen står i KeyboardInset', () => {
    expect(wrapped('<Login />')).toBe(true);
  });

  it('navigatoren med alle skjermene står i KeyboardInset', () => {
    expect(wrapped('<RootNavigator />')).toBe(true);
  });
});
