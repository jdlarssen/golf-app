// #2297: arket «Oppdater handicap» (Type C).
//
// Ordene er låst i `handicapCopy.test.ts` og regnestykkene i `hcpRuler.test.ts`.
// Her låses det tegningene viser at arket GJØR: linjal og felt endrer knappen,
// ugyldig og uten nett gjør den grå, en feil blir stående i arket, og lukking
// (✕, hinnen, tilbake, dra ned) lagrer ingenting.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import type { ProfileSaveResult } from '../../data/profile';
import { HandicapSheet } from './HandicapSheet';

jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());

let mockOnline = true;
jest.mock('../../lib/useDeviceOnline', () => ({ useDeviceOnline: () => mockOnline }));

const UPDATED = '2026-08-22T12:00:00.000Z';

async function renderSheet({
  stored = 14.2,
  result = { ok: true } as ProfileSaveResult,
}: { stored?: number; result?: ProfileSaveResult | Promise<ProfileSaveResult> } = {}) {
  const onSave = jest.fn(() => Promise.resolve(result));
  const onSaved = jest.fn();
  const onCancel = jest.fn();
  await render(
    <HandicapSheet
      open
      stored={stored}
      updatedAt={UPDATED}
      onSave={onSave}
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  );
  return { onSave, onSaved, onCancel };
}

async function step(action: 'increment' | 'decrement', times: number) {
  for (let i = 0; i < times; i += 1) {
    await fireEvent(screen.getByTestId('hcp-ruler'), 'accessibilityAction', { nativeEvent: { actionName: action } });
  }
}

const save = () => screen.getByTestId('hcp-sheet-save');

beforeEach(() => {
  mockOnline = true;
});

describe('HandicapSheet', () => {
  it('har tittel, dato, ✕ og en justerbar linjal', async () => {
    await renderSheet();
    expect(screen.getByRole('header')).toHaveTextContent('Oppdater handicap');
    expect(screen.getByTestId('hcp-sheet-subtitle')).toHaveTextContent('Sist oppdatert 22. august · 14,2');
    expect(screen.getByLabelText('Lukk')).toBeTruthy();
    expect(screen.getByTestId('hcp-ruler').props.accessibilityRole).toBe('adjustable');
    expect(screen.getByTestId('hcp-sheet-number')).toHaveTextContent('14,2');
    expect(save()).toHaveTextContent('Lagre 14,2');
    // Uendret tall: ingen pil og ingen «fra sist».
    expect(screen.queryByTestId('hcp-sheet-from-last')).toBeNull();
  });

  it('fire tideler ned gir 13,8, «0,4 fra sist» og «Lagre 13,8»', async () => {
    const { onSave, onSaved } = await renderSheet();
    await step('decrement', 4);
    expect(screen.getByTestId('hcp-sheet-number')).toHaveTextContent('13,8');
    expect(screen.getByTestId('hcp-sheet-from-last')).toHaveTextContent('0,4 fra sist');
    expect(screen.getByTestId('hcp-ruler').props.accessibilityValue.text).toBe('13,8, 0,4 lavere enn sist');
    expect(save()).toHaveTextContent('Lagre 13,8');
    await fireEvent.press(save());
    expect(onSave).toHaveBeenCalledWith(13.8);
    expect(onSaved).toHaveBeenCalledWith(13.8);
  });

  it('feltet: ugyldig gjør knappen grå, gyldig tar linjalen med seg tilbake', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByText('Skriv inn tallet'));
    const field = screen.getByTestId('hcp-sheet-field');
    expect(field.props.value).toBe('14,2');
    expect(field.props.keyboardType).toBe('decimal-pad');
    // Linjalen og «Skriv inn tallet» er borte mens feltet er oppe.
    expect(screen.queryByTestId('hcp-ruler')).toBeNull();
    expect(screen.queryByText('Skriv inn tallet')).toBeNull();

    await fireEvent.changeText(field, '60');
    expect(screen.getByRole('alert')).toHaveTextContent('Skriv et tall mellom 0 og 54.');
    expect(save()).toHaveTextContent(/^Lagre$/);
    expect(save()).toBeDisabled();

    await fireEvent.changeText(field, '+9');
    expect(screen.getByRole('alert')).toHaveTextContent('Plusshandicap kan være opptil +8,0.');

    await fireEvent.changeText(field, '13.8');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('hcp-sheet-from-last')).toHaveTextContent('0,4 fra sist');
    expect(save()).toHaveTextContent('Lagre 13,8');
    expect(save()).not.toBeDisabled();

    await fireEvent(field, 'blur');
    expect(screen.getByTestId('hcp-sheet-number')).toHaveTextContent('13,8');
    expect(screen.getByTestId('hcp-ruler')).toBeTruthy();
  });

  it('et ugyldig felt som lukkes, lar linjalen stå på siste gyldige tall', async () => {
    await renderSheet();
    await step('decrement', 2);
    await fireEvent.press(screen.getByText('Skriv inn tallet'));
    await fireEvent.changeText(screen.getByTestId('hcp-sheet-field'), 'abc');
    await fireEvent(screen.getByTestId('hcp-sheet-field'), 'blur');
    expect(screen.getByTestId('hcp-sheet-number')).toHaveTextContent('14,0');
    expect(save()).toHaveTextContent('Lagre 14,0');
  });

  it('uten nett er «Lagre» grå og sier hvorfor', async () => {
    mockOnline = false;
    const { onSave } = await renderSheet();
    expect(save()).toBeDisabled();
    expect(screen.getByTestId('hcp-sheet-offline')).toHaveTextContent('Du trenger nett for å lagre.');
    // Linjalen kan fortsatt dras.
    await step('decrement', 1);
    expect(save()).toHaveTextContent('Lagre 14,1');
    await fireEvent.press(save());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('en feil står i arket, og arket blir stående', async () => {
    const { onSaved, onCancel } = await renderSheet({ result: { ok: false, reason: 'update_failed' } });
    await step('decrement', 4);
    await fireEvent.press(save());
    expect(screen.getByRole('alert')).toHaveTextContent('Noe gikk galt. Prøv igjen.');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(save()).toHaveTextContent('Lagre 13,8');
  });

  it('mens lagringen går står «Lagrer …», og arket kan ikke lukkes', async () => {
    let finish: (result: ProfileSaveResult) => void = () => undefined;
    const pending = new Promise<ProfileSaveResult>((resolve) => {
      finish = resolve;
    });
    const { onCancel, onSaved } = await renderSheet({ result: pending });
    await fireEvent.press(save());
    expect(save()).toHaveTextContent('Lagrer …');
    expect(save()).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Lukk'));
    await fireEvent.press(screen.getByTestId('hcp-sheet-backdrop'));
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => finish({ ok: true }));
    expect(onSaved).toHaveBeenCalledWith(14.2);
  });

  it('plusshandicap: ti tideler ned fra 0,4 gir «Lagre +0,6» og lagrer −0,6', async () => {
    const { onSave } = await renderSheet({ stored: 0.4 });
    await step('decrement', 10);
    expect(screen.getByTestId('hcp-sheet-number')).toHaveTextContent('+0,6');
    expect(screen.getByTestId('hcp-sheet-from-last')).toHaveTextContent('1,0 fra sist');
    expect(screen.getByTestId('hcp-ruler').props.accessibilityValue.text).toBe(
      'pluss 0,6, 1,0 lavere enn sist',
    );
    expect(save()).toHaveTextContent('Lagre +0,6');
    await fireEvent.press(save());
    expect(onSave).toHaveBeenCalledWith(-0.6);
  });

  it('✕, hinnen og tilbake på Android lukker uten å lagre', async () => {
    const { onCancel, onSave } = await renderSheet();
    await fireEvent.press(screen.getByLabelText('Lukk'));
    await fireEvent.press(screen.getByTestId('hcp-sheet-backdrop'));
    await fireEvent(screen.getByTestId('hcp-sheet-modal'), 'requestClose');
    await fireEvent(screen.getByTestId('hcp-sheet'), 'accessibilityEscape');
    expect(onCancel).toHaveBeenCalledTimes(4);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('dra ned fra toppen lukker; et kort eller oppover drag gjør det ikke', async () => {
    const { onCancel } = await renderSheet();
    const top = screen.getByTestId('hcp-sheet-top');
    const drag = async (from: number, to: number) => {
      await fireEvent(top, 'touchStart', { nativeEvent: { pageY: from } });
      await fireEvent(top, 'touchMove', { nativeEvent: { pageY: to } });
      await fireEvent(top, 'touchEnd', { nativeEvent: { pageY: to } });
    };
    await drag(400, 450);
    await drag(400, 300);
    expect(onCancel).not.toHaveBeenCalled();
    await drag(400, 520);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('HandicapSheet — tilbake fra feltet (iPhone har ingen Ferdig-tast)', () => {
  type Listener = () => void;
  let listeners: Record<string, Listener[]>;
  let dismiss: jest.SpyInstance;
  let addListener: jest.SpyInstance;

  beforeEach(() => {
    listeners = {};
    addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: Listener) => {
      (listeners[event] ??= []).push(cb);
      return { remove: () => (listeners[event] = (listeners[event] ?? []).filter((x) => x !== cb)) };
    }) as never);
    dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
  });
  afterEach(() => {
    addListener.mockRestore();
    dismiss.mockRestore();
  });

  const keyboardHides = () => act(async () => (listeners.keyboardDidHide ?? []).forEach((cb) => cb()));

  it('et trykk på arket utenfor feltet lukker tastaturet, og linjalen kommer tilbake på det skrevne tallet', async () => {
    await renderSheet();
    const sheet = screen.getByTestId('hcp-sheet-body');
    // Uten feltet tar arket ingen trykk: linjalen og knappene får sine.
    expect(sheet.props.onStartShouldSetResponder()).toBe(false);
    await fireEvent.press(screen.getByText('Skriv inn tallet'));
    await fireEvent.changeText(screen.getByTestId('hcp-sheet-field'), '13,8');
    expect(screen.getByTestId('hcp-sheet-body').props.onStartShouldSetResponder()).toBe(true);
    await fireEvent(screen.getByTestId('hcp-sheet-body'), 'responderRelease');
    expect(dismiss).toHaveBeenCalledTimes(1);
    // Tastaturet går ned (iOS etter dismiss, Android med tilbake uten blur).
    await keyboardHides();
    expect(screen.queryByTestId('hcp-sheet-field')).toBeNull();
    expect(screen.getByTestId('hcp-ruler')).toBeTruthy();
    expect(screen.getByTestId('hcp-sheet-number')).toHaveTextContent('13,8');
    expect(save()).toHaveTextContent('Lagre 13,8');
  });

  it('går tastaturet ned med et ugyldig felt, står linjalen på siste gyldige tall', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByText('Skriv inn tallet'));
    await fireEvent.changeText(screen.getByTestId('hcp-sheet-field'), '60');
    await keyboardHides();
    expect(screen.getByTestId('hcp-sheet-number')).toHaveTextContent('14,2');
  });

  it('et tomt felt viser ingen «fra sist»', async () => {
    await renderSheet();
    await step('decrement', 4);
    await fireEvent.press(screen.getByText('Skriv inn tallet'));
    expect(screen.getByTestId('hcp-sheet-from-last')).toHaveTextContent('0,4 fra sist');
    await fireEvent.changeText(screen.getByTestId('hcp-sheet-field'), '');
    expect(screen.queryByTestId('hcp-sheet-from-last')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(save()).toBeDisabled();
  });
});

describe('HandicapSheet — linjalen står stille mens lagringen pågår', () => {
  it('verken dra eller skjermleseren flytter tallet som lagres', async () => {
    const { onSave } = await renderSheet({ result: new Promise<ProfileSaveResult>(() => undefined) });
    await fireEvent(screen.getByTestId('hcp-ruler'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 350, height: 64 } },
    });
    await step('decrement', 4);
    await fireEvent.press(save());
    expect(onSave).toHaveBeenCalledWith(13.8);
    expect(screen.getByTestId('hcp-ruler-scroll', { includeHiddenElements: true }).props.scrollEnabled).toBe(false);
    await step('decrement', 2);
    expect(screen.getByTestId('hcp-sheet-number')).toHaveTextContent('13,8');
  });
});
