// #2754 (Type C): Stripa slik spilleren møter den. Hooken har egne tester; her
// gjelder det hva som står på skjermen, hva som er en knapp, og at hver knapp kan
// leses opp med navn og antall.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { ReactionFailure, ReactionRowState, ReactionTarget } from '../../lib/useGameReactions';
import { TAP } from '../../theme';
import { ReactionsContext, type ReactionsContextValue } from './ReactionsProvider';
import { ReactableRow, ReactionHint, ReactionPlate, ReactionStrip, reactionsSpoken } from './RowReactions';

const MARTE: ReactionTarget = { userId: 'marte', name: 'Marte' };

function context(
  rows: Record<string, ReactionRowState>,
  overrides: Partial<ReactionsContextValue> = {},
): ReactionsContextValue {
  return {
    loaded: true,
    canReact: true,
    showHint: false,
    target: null,
    failure: null as ReactionFailure | null,
    getRow: (userId) => rows[userId] ?? { counts: {}, mine: [] },
    openFor: jest.fn(),
    close: jest.fn(),
    toggle: jest.fn(),
    onRowOpened: jest.fn(),
    ...overrides,
  };
}

const renderWith = (value: ReactionsContextValue | null, children: React.ReactNode) =>
  render(<ReactionsContext.Provider value={value}>{children}</ReactionsContext.Provider>);

describe('skiltet', () => {
  it('viser de tre største og summen av alle', async () => {
    await renderWith(
      context({ marte: { counts: { '👏': 8, '🔥': 5, '🐦': 3, '⛳': 2, '💪': 1 }, mine: [] } }),
      <ReactionPlate userId="marte" />,
    );
    expect(screen.getByText('👏🔥🐦', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('19', { includeHiddenElements: true })).toBeTruthy();
  });

  it('tegner ingenting uten reaksjoner og uten provider', async () => {
    await renderWith(context({}), <ReactionPlate userId="marte" />);
    expect(screen.queryByTestId('reaction-plate-marte', { includeHiddenElements: true })).toBeNull();
    await renderWith(null, <ReactionPlate userId="marte" />);
    expect(screen.queryByTestId('reaction-plate-marte', { includeHiddenElements: true })).toBeNull();
  });
});

describe('raden', () => {
  const row = <ReactableRow target={MARTE} label="1. plass" testID="row"><Text>Marte</Text></ReactableRow>;

  it('er én knapp som åpner stripa, og et trykk lagrer ingenting', async () => {
    const value = context({ marte: { counts: { '👏': 3, '🔥': 2 }, mine: [] } });
    await renderWith(value, row);
    const button = screen.getByRole('button');
    expect(button.props.accessibilityLabel).toBe('1. plass. Reaksjoner: Klappe 3, Ild 2');
    expect(button.props.accessibilityHint).toBe('Reaksjoner til Marte');
    await fireEvent.press(button);
    expect(value.openFor).toHaveBeenCalledWith(MARTE);
    expect(value.toggle).not.toHaveBeenCalled();
  });

  it('er ingen knapp for den som ikke kan reagere, men tallene leses opp', async () => {
    await renderWith(
      context({ marte: { counts: { '👏': 3 }, mine: [] } }, { canReact: false }),
      row,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('row').props.accessibilityLabel).toBe('1. plass. Reaksjoner: Klappe 3');
  });

  it('er ingen knapp uten provider', async () => {
    await renderWith(null, row);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('hjelpelinja', () => {
  it('står bare når hooken sier det', async () => {
    await renderWith(context({}, { showHint: true }), <ReactionHint />);
    expect(screen.getByTestId('reaction-hint')).toBeTruthy();
    await renderWith(context({}), <ReactionHint />);
    expect(screen.queryByTestId('reaction-hint')).toBeNull();
  });
});

describe('stripa', () => {
  const rows = { marte: { counts: { '👏': 3, '🔥': 2 }, mine: ['🔥'] } } as Record<string, ReactionRowState>;

  it('har tittel og seks knapper med navn og antall, minst 44 pt', async () => {
    await renderWith(context(rows, { target: MARTE }), <ReactionStrip bottom={20} />);
    expect(screen.getByTestId('reaction-strip-title').props.children).toBe('Reaksjoner til Marte');
    expect(screen.getByTestId('reaction-button-clap').props.accessibilityLabel).toBe(
      'Reager med Klappe (3 reaksjoner)',
    );
    expect(screen.getByTestId('reaction-button-fire').props.accessibilityLabel).toBe(
      'Fjern Ild-reaksjon (2 i alt)',
    );
    expect(screen.getByTestId('reaction-button-fire').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId('reaction-button-laugh').props.accessibilityLabel).toBe('Reager med Latter');
    for (const key of ['clap', 'fire', 'laugh', 'strong', 'golf', 'birdie']) {
      const { height, minWidth } = screen.getByTestId(`reaction-button-${key}`).props.style.reduce(
        (all: object, part: object) => ({ ...all, ...part }),
        {},
      );
      expect(height).toBeGreaterThanOrEqual(TAP);
      expect(minWidth).toBeGreaterThanOrEqual(TAP);
    }
  });

  it('et trykk gir reaksjonen til raden, og stripa lukkes med krysset', async () => {
    const value = context(rows, { target: MARTE });
    await renderWith(value, <ReactionStrip bottom={20} />);
    await fireEvent.press(screen.getByTestId('reaction-button-golf'));
    expect(value.toggle).toHaveBeenCalledWith('marte', '⛳');
    await fireEvent.press(screen.getByTestId('reaction-strip-close'));
    expect(value.close).toHaveBeenCalled();
  });

  it('sier fra om manglende dekning og om nekt, med hver sin tekst', async () => {
    await renderWith(context(rows, { target: MARTE, failure: 'save' }), <ReactionStrip bottom={20} />);
    expect(screen.getByTestId('reaction-strip-error').props.children).toBe(
      'Fikk ikke lagret reaksjonen. Prøv igjen når du har dekning.',
    );
    await renderWith(context(rows, { target: MARTE, failure: 'denied' }), <ReactionStrip bottom={20} />);
    expect(screen.getByTestId('reaction-strip-error').props.children).toBe(
      'Du kan ikke reagere i denne runden.',
    );
  });

  it('tegner ingenting når ingen rad er valgt', async () => {
    await renderWith(context(rows), <ReactionStrip bottom={20} />);
    expect(screen.queryByTestId('reaction-strip')).toBeNull();
  });
});

describe('reactionsSpoken', () => {
  it('leser i palettens rekkefølge, og sier ingenting uten reaksjoner', () => {
    expect(reactionsSpoken({ '🐦': 1, '👏': 2 })).toBe('Reaksjoner: Klappe 2, Birdie 1');
    expect(reactionsSpoken({})).toBeNull();
  });
});
