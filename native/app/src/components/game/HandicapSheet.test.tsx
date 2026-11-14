// #2297: arket «Oppdater handicap» (Type C).
//
// Hva setningene SIER er låst i `handicapCopy.test.ts`, og regnestykket bak linjalen i
// `hcpRuler.test.ts`. Her låses koblingene: at linjalen er en justerbar kontroll som
// flytter «Lagre»-knappen, at feltet avviser det som ikke er et handicap, at uten nett
// og en lagringsfeil gir riktig linje, og at ✕ lukker uten å lagre.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, ScrollView } from 'react-native';
import type { ProfileSaveResult } from '../../data/profile';
import { HandicapSheet } from './HandicapSheet';

jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());

const mockOnline = { value: true };
jest.mock('../../lib/useDeviceOnline', () => ({ useDeviceOnline: () => mockOnline.value }));

// Tastaturets hendelser fanges i stedet for å sendes: `Keyboard` har ingen `emit` i jest.
const keyboardListeners: Record<string, () => void> = {};

const UPDATED = new Date(2026, 7, 22, 12).toISOString();

async function renderSheet(
  stored = 14.2,
  save: (signed: number) => Promise<ProfileSaveResult> = async () => ({ ok: true }),
) {
  const onSave = jest.fn(save);
  const onSaved = jest.fn();
  const onClose = jest.fn();
  await render(
    <HandicapSheet
      open
      stored={stored}
      updatedAt={UPDATED}
      onSave={onSave}
      onSaved={onSaved}
      onClose={onClose}
    />,
  );
  return { onSave, onSaved, onClose };
}

async function act1(name: 'increment' | 'decrement', times: number) {
  for (let i = 0; i < times; i++) {
    await fireEvent(screen.getByTestId('hcp-ruler'), 'accessibilityAction', {
      nativeEvent: { actionName: name },
    });
  }
}

beforeEach(() => {
  mockOnline.value = true;
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
    keyboardListeners[event] = cb;
    return { remove: () => undefined };
  }) as unknown as typeof Keyboard.addListener);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('arket', () => {
  it('har tittel, ✕ med «Lukk» og en justerbar linjal', async () => {
    await renderSheet();

    expect(screen.getByRole('header', { name: 'Oppdater handicap' })).toBeTruthy();
    expect(screen.getByTestId('handicap-sheet-subline')).toHaveTextContent('Sist oppdatert 22. august · 14,2');
    expect(screen.getByRole('button', { name: 'Lukk' })).toBeTruthy();
    const ruler = screen.getByRole('adjustable');
    expect(ruler).toHaveAccessibleName('Handicap');
    expect(ruler.props.accessibilityValue).toEqual({ text: '14,2' });
    // Uendret tall: ingen «fra sist»-linje, og «Lagre 14,2».
    expect(screen.queryByTestId('handicap-sheet-since')).toBeNull();
    expect(screen.getByRole('button', { name: 'Lagre 14,2' })).toBeTruthy();
  });

  it('fire «decrement» fra 14,2 gir «Lagre 13,8» og linja «0,4 fra sist»', async () => {
    await renderSheet();

    await act1('decrement', 4);

    expect(screen.getByRole('button', { name: 'Lagre 13,8' })).toBeTruthy();
    expect(screen.getByTestId('handicap-sheet-number')).toHaveTextContent('13,8');
    expect(screen.getByTestId('handicap-sheet-since')).toHaveAccessibleName('0,4 lavere enn sist');
    expect(screen.getByTestId('handicap-sheet-since')).toHaveTextContent('0,4 fra sist');
    expect(screen.getByRole('adjustable').props.accessibilityValue).toEqual({
      text: '13,8, 0,4 lavere enn sist',
    });
  });

  it('en kast på linjalen flytter tallet, og knappen følger', async () => {
    await renderSheet();

    // 14,2 ligger 222 trinn over bunnen (−8), 12 pt per trinn: å dra til 13,8 er 4 trinn tilbake.
    await fireEvent.scroll(screen.getByTestId('hcp-ruler-scroll', { includeHiddenElements: true }), {
      nativeEvent: { contentOffset: { x: (138 + 80) * 12, y: 0 } },
    });

    expect(screen.getByRole('button', { name: 'Lagre 13,8' })).toBeTruthy();
  });

  it('klemmer på 54', async () => {
    await renderSheet(53.9);
    await act1('increment', 5);
    expect(screen.getByRole('button', { name: 'Lagre 54,0' })).toBeTruthy();
  });

  it('et plusshandicap viser «+0,6» og lagrer det signert', async () => {
    const { onSave } = await renderSheet(0.4);

    await act1('decrement', 10);

    expect(screen.getByRole('button', { name: 'Lagre +0,6' })).toBeTruthy();
    expect(screen.getByRole('adjustable').props.accessibilityValue).toEqual({
      text: 'pluss 0,6, 1,0 lavere enn sist',
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Lagre +0,6' }));
    expect(onSave).toHaveBeenCalledWith(-0.6);
  });

  it('lagrer det som står, og melder fra når det gikk', async () => {
    const { onSave, onSaved } = await renderSheet();
    await act1('decrement', 4);

    await fireEvent.press(screen.getByRole('button', { name: 'Lagre 13,8' }));

    expect(onSave).toHaveBeenCalledWith(13.8);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('en lagringsfeil står under knappen med alert, og arket står med tallet', async () => {
    const { onSaved } = await renderSheet(14.2, async () => ({ ok: false, reason: 'update_failed' }));
    await act1('decrement', 4);

    await fireEvent.press(screen.getByRole('button', { name: 'Lagre 13,8' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Noe gikk galt. Prøv igjen.');
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Lagre 13,8' })).toBeTruthy();
  });

  it('en nettfeil fra ruta sier at lagring krever nett', async () => {
    await renderSheet(14.2, async () => ({ ok: false, reason: 'network' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Lagre 14,2' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Du trenger nett for å lagre.');
  });

  it('mens lagringen pågår står «Lagrer …», og ✕ lukker ikke', async () => {
    let finish: (result: ProfileSaveResult) => void = () => undefined;
    const { onClose, onSaved } = await renderSheet(
      14.2,
      () => new Promise<ProfileSaveResult>((resolve) => (finish = resolve)),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Lagre 14,2' }));

    const saving = screen.getByRole('button', { name: 'Lagrer …' });
    expect(saving).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Lukk' }));
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => finish({ ok: true }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('uten nett er «Lagre» grå, og linja sier hvorfor', async () => {
    mockOnline.value = false;
    const { onSave } = await renderSheet();

    const save = screen.getByRole('button', { name: 'Lagre 14,2' });
    expect(save).toBeDisabled();
    expect(screen.getByTestId('handicap-sheet-offline')).toHaveTextContent('Du trenger nett for å lagre.');
    await fireEvent.press(save);
    expect(onSave).not.toHaveBeenCalled();
    // Linjalen kan fortsatt dras.
    await act1('decrement', 1);
    expect(screen.getByTestId('handicap-sheet-number')).toHaveTextContent('14,1');
  });

  it('✕ og trykk utenfor lukker uten å lagre', async () => {
    const { onClose, onSave } = await renderSheet();

    await fireEvent.press(screen.getByRole('button', { name: 'Lukk' }));
    await fireEvent.press(screen.getByTestId('handicap-sheet-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('dra ned', () => {
  async function dragHead(from: number, to: number) {
    const head = screen.getByTestId('handicap-sheet-drag');
    await fireEvent(head, 'touchStart', { nativeEvent: { pageY: from } });
    await fireEvent(head, 'touchMove', { nativeEvent: { pageY: to } });
    await fireEvent(head, 'touchEnd', { nativeEvent: { pageY: to } });
  }

  it('lukker arket uten å lagre når hodet dras langt nok ned', async () => {
    const { onClose, onSave } = await renderSheet();

    await dragHead(100, 100 + 120);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([
    ['for kort', 100, 160],
    ['oppover', 100, 20],
  ])('lukker ikke når draget er %s', async (_label, from, to) => {
    const { onClose } = await renderSheet();

    await dragHead(from, to);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('lukker ikke mens lagringen pågår', async () => {
    const { onClose } = await renderSheet(14.2, () => new Promise<ProfileSaveResult>(() => undefined));
    await fireEvent.press(screen.getByRole('button', { name: 'Lagre 14,2' }));

    await dragHead(100, 300);

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('linjalen', () => {
  it('VoiceOver-trinn flytter linjalen med scrollTo, og fingeren gjør det aldri', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    // Jest-mocken kan alt være en mock med kall fra andre tester.
    scrollTo.mockClear();
    await renderSheet();

    await act1('decrement', 2);

    // 14,2 → 14,1 → 14,0: 220 og 218 trinn over −8, 12 pt per trinn.
    expect(scrollTo.mock.calls.map(([arg]) => arg)).toEqual([
      { x: 221 * 12, animated: false },
      { x: 220 * 12, animated: false },
    ]);

    scrollTo.mockClear();
    await fireEvent.scroll(screen.getByTestId('hcp-ruler-scroll', { includeHiddenElements: true }), {
      nativeEvent: { contentOffset: { x: 200 * 12, y: 0 }, contentSize: {}, layoutMeasurement: {} },
    });
    await fireEvent.scroll(screen.getByTestId('hcp-ruler-scroll', { includeHiddenElements: true }), {
      nativeEvent: { contentOffset: { x: 190 * 12, y: 0 }, contentSize: {}, layoutMeasurement: {} },
    });

    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.getByTestId('handicap-sheet-number')).toHaveTextContent('11,0');
  });

  it('får startposisjonen én gang, så en styrt contentOffset ikke hopper midt i en dra', async () => {
    await renderSheet();
    const scroll = () => screen.getByTestId('hcp-ruler-scroll', { includeHiddenElements: true });
    const before = scroll().props.contentOffset;
    // 14,2 ligger 222 trinn over −8: 222 × 12 pt.
    expect(before).toEqual({ x: 222 * 12, y: 0 });

    await act1('decrement', 4);

    expect(scroll().props.contentOffset).toEqual(before);
  });
});

describe('«Skriv inn tallet»', () => {
  async function openField(stored = 14.2) {
    const result = await renderSheet(stored);
    await fireEvent.press(screen.getByRole('button', { name: 'Skriv inn tallet' }));
    return result;
  }

  it('bytter linjalen ut med et felt som starter på tallet som står', async () => {
    await openField();

    expect(screen.getByLabelText('Nytt handicap').props.value).toBe('14,2');
    expect(screen.getByLabelText('Nytt handicap').props.keyboardType).toBe('decimal-pad');
    expect(screen.queryByTestId('hcp-ruler')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Skriv inn tallet' })).toBeNull();
  });

  it('«60» gir ugyldig-linja og en grå «Lagre» uten tall', async () => {
    const { onSave } = await openField();

    await fireEvent.changeText(screen.getByLabelText('Nytt handicap'), '60');

    expect(screen.getByRole('alert')).toHaveTextContent('Skriv et tall mellom 0 og 54.');
    const save = screen.getByRole('button', { name: 'Lagre' });
    expect(save).toBeDisabled();
    await fireEvent.press(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([
    ['13,8', 'Lagre 13,8', 13.8],
    ['13.8', 'Lagre 13,8', 13.8],
    ['+0,6', 'Lagre +0,6', -0.6],
  ])('«%s» gir «%s» og lagrer %p', async (typed, label, signed) => {
    const { onSave } = await openField();

    await fireEvent.changeText(screen.getByLabelText('Nytt handicap'), typed);
    await fireEvent.press(screen.getByRole('button', { name: label }));

    expect(onSave).toHaveBeenCalledWith(signed);
  });

  it('et plusshandicap over +8 har sin egen linje', async () => {
    await openField();

    await fireEvent.changeText(screen.getByLabelText('Nytt handicap'), '+9');

    expect(screen.getByRole('alert')).toHaveTextContent('Plusshandicap kan være opptil +8,0.');
  });

  it('når tastaturet lukkes, kommer linjalen tilbake på det skrevne tallet', async () => {
    await openField();
    await fireEvent.changeText(screen.getByLabelText('Nytt handicap'), '13,8');

    await act(async () => {
      keyboardListeners.keyboardDidHide?.();
    });

    expect(screen.getByRole('adjustable').props.accessibilityValue).toEqual({
      text: '13,8, 0,4 lavere enn sist',
    });
    expect(screen.getByRole('button', { name: 'Lagre 13,8' })).toBeTruthy();
  });

  it('når tastaturet lukkes med et ugyldig tall, står linjalen på siste gyldige', async () => {
    await openField();
    await fireEvent.changeText(screen.getByLabelText('Nytt handicap'), '13,8');
    await fireEvent.changeText(screen.getByLabelText('Nytt handicap'), '60');

    await act(async () => {
      keyboardListeners.keyboardDidHide?.();
    });

    expect(screen.getByRole('button', { name: 'Lagre 13,8' })).toBeTruthy();
  });
});
