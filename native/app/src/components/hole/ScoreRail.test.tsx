// #2252: den ene render-testen (Type C) for skinna. Tallene og navnene på
// resultatene kommer fra kalleren og fra delt kode (scoreRail, railPoints),
// så her er det formen: knappene har temaets høyde, et trykk sender tallet,
// rettingen dukker opp først når det står en score, og skinna krymper når
// alle har score. #2385: navnet står alene med slagene til høyre, par er
// forslaget før noen score står, de tonede knappene har ingen kant, «Annet»
// har underlinja, og nederste rad har putte-valget og «Neste».
// `railStrokesLine` er en ren funksjon (Type A).
import { fireEvent, render, screen } from '@testing-library/react-native';
import source from '../../../../../messages/no.json';
import { SUNLIGHT_THEME, ThemeScope, themeFor } from '../../theme';
import { setBottomInset } from '../../test/safeAreaMock';
import { PUTTS_LABEL, ScoreRail, railStrokesLine, type ScoreRailProps } from './ScoreRail';

jest.mock('react-native-safe-area-context', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock-fabrikken heises over importene
  require('../../test/safeAreaMock').safeAreaMock(),
);

function props(over: Partial<ScoreRailProps> = {}): ScoreRailProps {
  return {
    active: { seatId: 'p1', name: 'Marte', extraStrokes: 1, score: null, putts: null },
    par: 4,
    options: [
      { strokes: 3, term: 'birdie', points: 4, netto: 2 },
      { strokes: 4, term: 'par', points: 3, netto: 3 },
      { strokes: 8, term: 'over', points: 0, netto: 7 },
    ],
    display: 'points',
    puttsTracking: false,
    puttsAvailable: true,
    skipTo: 'Tore',
    otherTop: '8+',
    otherHint: '8+ eller stryk',
    onPick: jest.fn(),
    onOther: jest.fn(),
    onStep: jest.fn(),
    onUndo: jest.fn(),
    onSkip: jest.fn(),
    onPutts: jest.fn(),
    onPuttsToggle: jest.fn(),
    ...over,
  };
}

describe('ScoreRail', () => {
  it('tegner knappene med resultat, sender trykkene videre, og krymper når alle har score', async () => {
    const onPick = jest.fn();
    const onStep = jest.fn();
    const onPuttsToggle = jest.fn();
    const { rerender } = await render(<ScoreRail {...props({ onPick, onPuttsToggle })} />);

    expect(screen.getByTestId('score-rail-heading').props.children).toBe('Marte');
    expect(screen.getByTestId('score-rail-strokes')).toBeTruthy();
    expect(screen.getByTestId('score-rail-skip')).toBeTruthy();
    expect(screen.getByTestId('rail-option-4-detail').props.children).toBe('Par · 3 p');
    expect(screen.getByTestId('rail-option-8-detail').props.children).toBe('+4 · 0 p');
    expect(screen.getByTestId('rail-option-4')).toHaveStyle({
      height: themeFor('light').hole.railButton,
    });
    expect(screen.getByLabelText('Sett 3 slag for Marte: Birdie, 4 poeng')).toBeTruthy();
    // Uten score er det ingenting å rette, og par er forslaget.
    expect(screen.queryByTestId('rail-undo')).toBeNull();
    expect(screen.getByTestId('rail-option-4')).toHaveStyle({ borderWidth: 2 });
    expect(screen.getByTestId('rail-option-3')).toHaveStyle({ borderWidth: 0 });
    expect(screen.getByTestId('rail-other-hint').props.children).toBe('8+ eller stryk');
    await fireEvent.press(screen.getByTestId('rail-putts-toggle'));
    expect(onPuttsToggle).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('rail-option-3'));
    expect(onPick).toHaveBeenCalledWith(3);

    await rerender(
      <ScoreRail
        {...props({
          onStep,
          display: 'plain',
          puttsTracking: true,
          active: { seatId: 'p1', name: 'Marte', extraStrokes: 1, score: 4, putts: null },
        })}
      />,
    );
    expect(screen.getByTestId('rail-option-4-detail').props.children).toBe('Par');
    expect(screen.getByTestId('rail-option-4')).toBeSelected();
    await fireEvent.press(screen.getByTestId('rail-step-up'));
    expect(onStep).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('rail-undo')).toBeTruthy();
    expect(screen.getByTestId('rail-putts')).toBeTruthy();

    await rerender(<ScoreRail {...props({ active: null, options: [] })} />);
    expect(screen.getByTestId('score-rail-all-scored')).toBeTruthy();
    expect(screen.queryByTestId('rail-other')).toBeNull();
  });
});

it('putter på: designets «1», «2» og «3+», og stepperen går ned til 0 for en chip-in', async () => {
  const onPutts = jest.fn();
  const active = { seatId: 'p1', name: 'Marte', extraStrokes: 1, score: 4, putts: null };
  const { rerender } = await render(<ScoreRail {...props({ puttsTracking: true, onPutts, active })} />);

  expect(screen.getByTestId('rail-putts-1')).toBeTruthy();
  expect(screen.getByTestId('rail-putts-2')).toBeTruthy();
  expect(screen.queryByTestId('rail-putts-0')).toBeNull();
  await fireEvent.press(screen.getByTestId('rail-putts-plus'));
  expect(onPutts).toHaveBeenLastCalledWith(3);
  expect(screen.getByTestId('rail-putts-stepper')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('rail-putts-minus'));
  expect(onPutts).toHaveBeenLastCalledWith(2);

  // En chip-in står i stepperen, og «−» stopper der.
  await rerender(<ScoreRail {...props({ puttsTracking: true, onPutts, active: { ...active, putts: 0 } })} />);
  expect(screen.getByTestId('rail-putts-minus')).toBeDisabled();
});

it('«Putter» er webbens ord tegn for tegn', () => {
  expect(PUTTS_LABEL).toBe(source.holes.putts.fieldLabel);
});

describe('railStrokesLine', () => {
  it.each([
    [1, 4, 'Får 1 slag her · netto par = 5'],
    [2, 3, 'Får 2 slag her · netto par = 5'],
    [0, 4, null],
    [-1, 4, null],
    [null, 4, null],
  ] as const)('%s slag på par %s gir %s', (extra, par, text) => {
    expect(railStrokesLine(extra, par)).toBe(text);
  });
});

// #1954 D3: arket står i bunnen av hullsiden. Med tre knapper på Android ligger
// navigasjonslinja over den nederste raden (putterne), og på iPhone
// hjemindikatoren. Designets 22 pt luft (Main) og sollysets 24 pt står over
// systemlinja, som bunnluften på de andre skjermene (`20 + insets.bottom`).
describe('bunnluften over systemlinja', () => {
  afterEach(() => setBottomInset(0));

  it('arket: 22 pt over navigasjonslinja', async () => {
    setBottomInset(48);
    await render(<ScoreRail {...props()} />);
    expect(screen.getByTestId('score-rail')).toHaveStyle({ paddingBottom: 22 + 48 });
  });

  it('sollys: 24 pt over navigasjonslinja', async () => {
    setBottomInset(48);
    await render(
      <ThemeScope theme={SUNLIGHT_THEME}>
        <ScoreRail {...props()} />
      </ThemeScope>,
    );
    expect(screen.getByTestId('score-rail')).toHaveStyle({ paddingBottom: 24 + 48 });
  });

  it('når alle har score, står den krympede skinna like høyt', async () => {
    setBottomInset(48);
    await render(<ScoreRail {...props({ active: null })} />);
    expect(screen.getByTestId('score-rail')).toHaveStyle({ paddingBottom: 22 + 48 });
  });
});
