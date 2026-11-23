// #2928: den delte knappen (Type A). Låser at ingenting endres i ro, hvor
// trykk-stilen havner, at Android får ripplen i stedet, og at `feedback="none"`
// ikke viser noe. Trykket tilstand settes med `testOnly_pressed`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react-native';
import { Platform, processColor, StyleSheet, Text, type ViewStyle } from 'react-native';
import { PALETTES } from '../theme';
import { PRESSED, Tap } from './Tap';

const colors = PALETTES.light;
const square = StyleSheet.create({ box: { width: 40, height: 44 } }).box;
const round = StyleSheet.create({ pill: { width: 40, height: 44, borderRadius: 22 } }).pill;
const list = [square, { backgroundColor: '#FFFFFF' }];
const fromState = ({ pressed }: { pressed: boolean }): ViewStyle => (pressed ? { width: 41 } : { width: 40 });

let platform: jest.ReplaceProperty<typeof Platform.OS> | undefined;
afterEach(() => platform?.restore());

const styleOf = () => screen.getByTestId('tap').props.style;
const hostProps = () => screen.getByTestId('tap').props;

async function tap(props: Partial<Parameters<typeof Tap>[0]>) {
  await render(
    <Tap testID="tap" onPress={() => {}} {...props}>
      <Text>Knapp</Text>
    </Tap>,
  );
}

describe('Tap i ro', () => {
  it.each([
    ['verdi', square],
    ['liste', list],
  ])('sender stilen videre uendret på iOS (%s)', async (_kind, style) => {
    await tap({ style });
    expect(styleOf()).toBe(style);
  });

  it('sender funksjonens svar videre uendret på iOS', async () => {
    await tap({ style: fromState });
    expect(styleOf()).toEqual({ width: 40 });
  });

  it('legger ingenting til på iOS, heller ikke med runde hjørner', async () => {
    await tap({ style: round });
    expect(styleOf()).toBe(round);
  });

  it.each([
    ['verdi', square],
    ['liste', list],
  ])('sender en firkantet stil videre uendret på Android (%s)', async (_kind, style) => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    await tap({ style });
    expect(styleOf()).toBe(style);
  });

  it('sender funksjonens svar videre uendret på Android', async () => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    await tap({ style: fromState });
    expect(styleOf()).toEqual({ width: 40 });
  });

  it('klipper bare runde hjørner, og bare på Android', async () => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    await tap({ style: round });
    expect(styleOf()).toEqual([round, { overflow: 'hidden' }]);
  });

  it('lar en knapp som setter overflow selv, beholde den på Android', async () => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    const own = [round, { overflow: 'visible' as const }];
    await tap({ style: own });
    expect(styleOf()).toBe(own);
  });
});

describe('Tap trykket inn', () => {
  it('legger trykk-stilen sist på iOS', async () => {
    await tap({ style: list, testOnly_pressed: true });
    expect(styleOf()).toEqual([list, { opacity: 0.6 }]);
    expect(PRESSED).toEqual({ opacity: 0.6 });
  });

  it('legger trykk-stilen sist etter funksjonens svar på iOS', async () => {
    await tap({ style: fromState, testOnly_pressed: true });
    expect(styleOf()).toEqual([{ width: 41 }, PRESSED]);
  });

  it('gir ingen ripple på iOS', async () => {
    await tap({ style: square, testOnly_pressed: true });
    expect(hostProps().nativeForegroundAndroid).toBeUndefined();
    expect(hostProps().nativeBackgroundAndroid).toBeUndefined();
  });

  it('bruker ripplen i forgrunnen på Android, uten iOS-stilen', async () => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    await tap({ style: square, testOnly_pressed: true });
    expect(hostProps().nativeForegroundAndroid).toMatchObject({
      type: 'RippleAndroid',
      color: processColor(colors.pressRipple),
      borderless: false,
    });
    expect(styleOf()).toBe(square);
  });

  it('lar kallets egen ripple vinne på Android', async () => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    await tap({ style: square, android_ripple: { color: '#FF0000', borderless: true } });
    expect(hostProps().nativeBackgroundAndroid).toMatchObject({
      color: processColor('#FF0000'),
      borderless: true,
    });
    expect(hostProps().nativeForegroundAndroid).toBeUndefined();
  });
});

describe('Tap med feedback="none"', () => {
  it('viser ingen trykk-stil på iOS', async () => {
    await tap({ style: square, feedback: 'none', testOnly_pressed: true });
    expect(styleOf()).toBe(square);
  });

  it('har ingen ripple og ingen klipp på Android', async () => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    await tap({ style: round, feedback: 'none', testOnly_pressed: true });
    expect(hostProps().nativeForegroundAndroid).toBeUndefined();
    expect(hostProps().nativeBackgroundAndroid).toBeUndefined();
    expect(styleOf()).toBe(round);
  });
});

describe('Tap.tsx', () => {
  it('bruker ikke Animated', () => {
    const src = readFileSync(join(__dirname, 'Tap.tsx'), 'utf8');
    expect(src).not.toMatch(/import[^;]*\bAnimated\b[^;]*from/);
    expect(src).not.toMatch(/\bAnimated\./);
  });
});
