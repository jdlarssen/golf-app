import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScoreCard, type ScoreCardProps } from './ScoreCard';

const baseProps: ScoreCardProps = {
  playerId: 'p1',
  name: 'Alice Andersen',
  initial: 'A',
  extraStrokes: 0,
  score: null,
  par: 4,
  onSetScore: vi.fn(),
  onLongPress: vi.fn(),
  onClear: vi.fn(),
};

function setup(overrides: Partial<ScoreCardProps> = {}) {
  const onSetScore = vi.fn();
  const onLongPress = vi.fn();
  const onClear = vi.fn();
  const props: ScoreCardProps = {
    ...baseProps,
    onSetScore,
    onLongPress,
    onClear,
    ...overrides,
  };
  const utils = render(<ScoreCard {...props} />);
  const card = utils.getByTestId('score-card');
  return { ...utils, card, onSetScore, onLongPress, onClear };
}

describe('ScoreCard — rendering', () => {
  it('renders player name and avatar initial', () => {
    setup({ name: 'Alice Andersen', initial: 'A' });
    expect(screen.getByText('Alice Andersen')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  // #2635: the rail's words — «Får 2 slag», and «Mister 1 slag» for a plus handicap.
  it('renders the strokes badge in the rail\'s words, also for a plus handicap', () => {
    const { rerender } = setup({ extraStrokes: 2 });
    expect(screen.getByTestId('score-card-strokes').textContent).toBe('Får 2 slag');
    rerender(<ScoreCard {...baseProps} extraStrokes={-1} />);
    expect(screen.getByTestId('score-card-strokes').textContent).toBe('Mister 1 slag');
  });

  it('omits the strokes badge when extraStrokes is 0', () => {
    setup({ extraStrokes: 0 });
    expect(screen.queryByTestId('score-card-strokes')).not.toBeInTheDocument();
  });

  it('renders ? when initial is null', () => {
    setup({ initial: null });
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('shows par as ghost when score is null', () => {
    setup({ score: null, par: 5 });
    const big = screen.getByTestId('score-number');
    expect(big.textContent).toBe('5');
  });

  it('shows score when set', () => {
    setup({ score: 6, par: 4 });
    const big = screen.getByTestId('score-number');
    expect(big.textContent).toBe('6');
  });

  it('kortet bærer ingen role selv — de fire knappene inni er synlige for skjermlesere (#1387)', () => {
    const { card } = setup({ score: 6, par: 4 });
    expect(card.getAttribute('role')).toBeNull();
    // Angre, +, − og ⋯. Med role="button" på kortet ble disse presentasjonelle.
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });
});

describe('ScoreCard — helper text', () => {
  it('unset shows buttons helper', () => {
    setup({ score: null });
    expect(screen.getByText('Trykk kort = par. Bruk − / +.')).toBeInTheDocument();
  });

  // #2735 (the owner's answer): while strokes are entered the card shows only
  // gross. A set score leaves the line empty, but the div stays so the layout
  // does not jump.
  it('viser ingen netto-linje når score er satt, heller ikke med slag på hullet', () => {
    setup({ score: 5, extraStrokes: 2 });
    const helper = screen.getByTestId('helper-text');
    expect(helper).toBeInTheDocument();
    expect(helper.textContent).toBe('');
    expect(screen.queryByText(/Netto|poeng/)).not.toBeInTheDocument();
  });

  it('viser instruksjon-tekst når score er null uavhengig av extraStrokes', () => {
    const { rerender } = setup({ score: null, extraStrokes: 3 });
    expect(screen.getByText('Trykk kort = par. Bruk − / +.')).toBeInTheDocument();
    expect(screen.queryByText(/Netto/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('score-card-submitted')).toBeNull();

    // #2211: a flight-mate who has submitted — locked card, «Levert» by the
    // name, and no «tap = par» on a card you cannot tap.
    rerender(
      <ScoreCard {...baseProps} score={null} extraStrokes={3} disabled submitted />,
    );
    expect(screen.queryByText('Trykk kort = par. Bruk − / +.')).toBeNull();
    expect(screen.getByTestId('score-card-submitted')).toBeInTheDocument();
  });

  it('confirmed border color (score satt) differs from unconfirmed (score null)', () => {
    const { card: unconfirmed, unmount } = setup({ score: null });
    const unconfirmedBorder = unconfirmed.style.borderColor;
    unmount();
    const { card: confirmed } = setup({ score: 4 });
    expect(confirmed.style.borderColor).not.toBe(unconfirmedBorder);
  });
});

describe('ScoreCard — score shape', () => {
  it('does not render delta-pill anymore', () => {
    const { queryByTestId } = setup({ score: 6, par: 4 });
    expect(queryByTestId('delta-pill')).not.toBeInTheDocument();
  });

  it('renders SVG circle around stortall for birdie (1 under par)', () => {
    const { container } = setup({ score: 3, par: 4 });
    const svg = container.querySelector('[data-testid="score-shape"] svg');
    expect(svg?.querySelectorAll('circle').length).toBe(1);
  });

  it('renders SVG double-circle around stortall for eagle (2+ under par)', () => {
    const { container } = setup({ score: 2, par: 4 });
    const svg = container.querySelector('[data-testid="score-shape"] svg');
    expect(svg?.querySelectorAll('circle').length).toBe(2);
  });

  it('renders SVG rect around stortall for bogey (1 over par)', () => {
    const { container } = setup({ score: 5, par: 4 });
    const svg = container.querySelector('[data-testid="score-shape"] svg');
    expect(svg?.querySelectorAll('rect').length).toBe(1);
  });

  it('renders SVG double-rect around stortall for double-bogey or worse (2+ over)', () => {
    const { container } = setup({ score: 6, par: 4 });
    const svg = container.querySelector('[data-testid="score-shape"] svg');
    expect(svg?.querySelectorAll('rect').length).toBe(2);
  });

  it('renders no SVG decoration for par score', () => {
    const { container } = setup({ score: 4, par: 4 });
    const svg = container.querySelector('[data-testid="score-shape"] svg');
    expect(svg).toBeNull();
  });

  it('renders no SVG decoration for unset (null) score', () => {
    const { container } = setup({ score: null, par: 4 });
    const svg = container.querySelector('[data-testid="score-shape"] svg');
    expect(svg).toBeNull();
  });
});

describe('ScoreCard — interaction', () => {
  it('tap on card body calls onSetScore with par', () => {
    const { card, onSetScore } = setup({ score: null, par: 4 });
    fireEvent.click(card);
    expect(onSetScore).toHaveBeenCalledWith('p1', 4);
  });

  it('tap on card body is a no-op when a score is already set', () => {
    const { card, onSetScore } = setup({ score: 6, par: 4 });
    fireEvent.click(card);
    expect(onSetScore).not.toHaveBeenCalled();
  });

  it('+ button on unset score calls onSetScore with par+1', () => {
    const { onSetScore } = setup({ score: null, par: 4 });
    fireEvent.click(screen.getByLabelText('+1 for Alice Andersen'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 5);
  });

  it('− button on unset score calls onSetScore with par-1', () => {
    const { onSetScore } = setup({ score: null, par: 4 });
    fireEvent.click(screen.getByLabelText('-1 for Alice Andersen'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 3);
  });

  it('+ button from existing score calls onSetScore with score+1', () => {
    const { onSetScore } = setup({ score: 5, par: 4 });
    fireEvent.click(screen.getByLabelText('+1 for Alice Andersen'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 6);
  });

  it('+ button clamps at 15', () => {
    const { onSetScore } = setup({ score: 15, par: 4 });
    fireEvent.click(screen.getByLabelText('+1 for Alice Andersen'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 15);
  });

  it('− button clamps at 1', () => {
    const { onSetScore } = setup({ score: 1, par: 4 });
    fireEvent.click(screen.getByLabelText('-1 for Alice Andersen'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 1);
  });

  it('⋯ button calls onLongPress and does not also fire card tap', () => {
    const { onSetScore, onLongPress } = setup({ score: null, par: 4 });
    fireEvent.click(screen.getByLabelText('Velg spesifikk score for Alice Andersen'));
    expect(onLongPress).toHaveBeenCalledWith('p1');
    expect(onSetScore).not.toHaveBeenCalled();
  });

  it('Angre link is hidden when no score is set', () => {
    setup({ score: null, par: 4 });
    expect(screen.queryByText('Angre')).toBeNull();
  });

  it('Angre link appears when a score is set', () => {
    setup({ score: 6, par: 4 });
    expect(screen.getByText('Angre')).toBeInTheDocument();
  });

  it('Angre link calls onClear and does not also fire card tap', () => {
    const { onClear, onSetScore } = setup({ score: 6, par: 4 });
    fireEvent.click(screen.getByText('Angre'));
    expect(onClear).toHaveBeenCalledWith('p1');
    expect(onSetScore).not.toHaveBeenCalled();
  });
});

describe('ScoreCard — tap targets', () => {
  it('+ and − steppers render at ≥44×44px (glove-friendly, #944)', () => {
    setup({ score: 5, par: 4 });
    for (const label of ['+1 for Alice Andersen', '-1 for Alice Andersen']) {
      const btn = screen.getByLabelText(label);
      expect(parseInt(btn.style.width, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(btn.style.height, 10)).toBeGreaterThanOrEqual(44);
    }
  });

  it('⋯ button has a ≥44px touch target', () => {
    setup({ score: 5, par: 4 });
    const more = screen.getByLabelText('Velg spesifikk score for Alice Andersen');
    expect(parseInt(more.style.width, 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(more.style.height, 10)).toBeGreaterThanOrEqual(44);
  });
});

describe('ScoreCard — disabled', () => {
  it('tap on card does not call onSetScore when disabled', () => {
    const { card, onSetScore } = setup({
      score: null,
      par: 4,
      disabled: true,
    });
    fireEvent.click(card);
    expect(onSetScore).not.toHaveBeenCalled();
  });

  it('stepper buttons do not fire when disabled', () => {
    const { onSetScore, onLongPress } = setup({
      score: null,
      par: 4,
      disabled: true,
    });
    fireEvent.click(screen.getByLabelText('+1 for Alice Andersen'));
    fireEvent.click(screen.getByLabelText('-1 for Alice Andersen'));
    fireEvent.click(screen.getByLabelText('Velg spesifikk score for Alice Andersen'));
    expect(onSetScore).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('Angre link is hidden when disabled even if a score is set', () => {
    setup({ score: 6, par: 4, disabled: true });
    expect(screen.queryByText('Angre')).toBeNull();
  });
});
