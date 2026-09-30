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
import { themeFor } from '../../theme';
import { PUTTS_LABEL, ScoreRail, railStrokesLine, type ScoreRailProps } from './ScoreRail';

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
