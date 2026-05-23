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
};

function setup(overrides: Partial<ScoreCardProps> = {}) {
  const onSetScore = vi.fn();
  const onLongPress = vi.fn();
  const props: ScoreCardProps = {
    ...baseProps,
    onSetScore,
    onLongPress,
    ...overrides,
  };
  const utils = render(<ScoreCard {...props} />);
  const card = utils.container.querySelector('[role="button"]') as HTMLElement;
  return { ...utils, card, onSetScore, onLongPress };
}

describe('ScoreCard — rendering', () => {
  it('renders player name and avatar initial', () => {
    setup({ name: 'Alice Andersen', initial: 'A' });
    expect(screen.getByText('Alice Andersen')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders +N SLAG badge when extraStrokes > 0', () => {
    setup({ extraStrokes: 2 });
    expect(screen.getByText('+2 SLAG')).toBeInTheDocument();
  });

  it('omits +N SLAG badge when extraStrokes is 0', () => {
    setup({ extraStrokes: 0 });
    expect(screen.queryByText(/SLAG/)).not.toBeInTheDocument();
  });

  it('omits +N SLAG badge when hideNetto is true even with extraStrokes > 0', () => {
    setup({ extraStrokes: 2, hideNetto: true });
    expect(screen.queryByText(/SLAG/)).not.toBeInTheDocument();
  });

  it('renders +N SLAG badge when hideNetto is false and extraStrokes > 0', () => {
    setup({ extraStrokes: 2, hideNetto: false });
    expect(screen.getByText('+2 SLAG')).toBeInTheDocument();
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
});

describe('ScoreCard — helper text', () => {
  it('unset shows buttons helper', () => {
    setup({ score: null });
    expect(screen.getByText('Tap kort = par. Bruk − / +.')).toBeInTheDocument();
  });

  it('viser «Netto X» når score er satt med positive ekstra slag', () => {
    setup({ score: 5, extraStrokes: 2 });
    expect(screen.getByText('Netto 3')).toBeInTheDocument();
  });

  it('viser «Netto X» når score er satt uten ekstra slag (X = score)', () => {
    setup({ score: 5, extraStrokes: 0 });
    expect(screen.getByText('Netto 5')).toBeInTheDocument();
  });

  it('viser «Netto X» med høyere X for plus-golfere (negative ekstra slag)', () => {
    setup({ score: 5, extraStrokes: -1 });
    expect(screen.getByText('Netto 6')).toBeInTheDocument();
  });

  it('viser «Netto X» med X = par når score = par og extraStrokes = 0', () => {
    setup({ score: 4, par: 4, extraStrokes: 0 });
    expect(screen.getByText('Netto 4')).toBeInTheDocument();
  });

  it('skjuler netto-tekst når hideNetto er true (reveal-active)', () => {
    setup({ score: 5, extraStrokes: 2, hideNetto: true });
    expect(screen.queryByText(/Netto/)).not.toBeInTheDocument();
    expect(screen.queryByText('Bekreftet')).not.toBeInTheDocument();
  });

  it('beholder helper-div i DOM når hideNetto skjuler netto-tekst (reveal-active layout-pin)', () => {
    setup({ score: 5, extraStrokes: 2, hideNetto: true });
    const helper = screen.getByTestId('helper-text');
    expect(helper).toBeInTheDocument();
    expect(helper.textContent).toBe('');
  });

  it('viser «Netto X · N poeng» når stablefordPoints er satt', () => {
    setup({ score: 4, par: 4, extraStrokes: 0, stablefordPoints: 2 });
    expect(screen.getByText('Netto 4 · 2 poeng')).toBeInTheDocument();
  });

  it('viser kun «Netto X» når stablefordPoints er null (best-ball)', () => {
    setup({ score: 4, par: 4, extraStrokes: 0, stablefordPoints: null });
    expect(screen.getByText('Netto 4')).toBeInTheDocument();
    expect(screen.queryByText(/poeng/)).not.toBeInTheDocument();
  });

  it('viser «Netto X · 0 poeng» for stableford med double-bogey', () => {
    setup({ score: 6, par: 4, extraStrokes: 0, stablefordPoints: 0 });
    expect(screen.getByText('Netto 6 · 0 poeng')).toBeInTheDocument();
  });

  it('skjuler stableford-poeng når hideNetto er true (reveal-modus)', () => {
    setup({
      score: 4,
      par: 4,
      extraStrokes: 0,
      stablefordPoints: 2,
      hideNetto: true,
    });
    expect(screen.queryByText(/poeng/)).not.toBeInTheDocument();
  });

  it('viser instruksjon-tekst når score er null uavhengig av extraStrokes', () => {
    setup({ score: null, extraStrokes: 3 });
    expect(screen.getByText('Tap kort = par. Bruk − / +.')).toBeInTheDocument();
    expect(screen.queryByText(/Netto/)).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByLabelText('+1'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 5);
  });

  it('− button on unset score calls onSetScore with par-1', () => {
    const { onSetScore } = setup({ score: null, par: 4 });
    fireEvent.click(screen.getByLabelText('-1'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 3);
  });

  it('+ button from existing score calls onSetScore with score+1', () => {
    const { onSetScore } = setup({ score: 5, par: 4 });
    fireEvent.click(screen.getByLabelText('+1'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 6);
  });

  it('+ button clamps at 15', () => {
    const { onSetScore } = setup({ score: 15, par: 4 });
    fireEvent.click(screen.getByLabelText('+1'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 15);
  });

  it('− button clamps at 1', () => {
    const { onSetScore } = setup({ score: 1, par: 4 });
    fireEvent.click(screen.getByLabelText('-1'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 1);
  });

  it('⋯ button calls onLongPress and does not also fire card tap', () => {
    const { onSetScore, onLongPress } = setup({ score: null, par: 4 });
    fireEvent.click(screen.getByLabelText('Velg spesifikk score'));
    expect(onLongPress).toHaveBeenCalledWith('p1');
    expect(onSetScore).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByLabelText('+1'));
    fireEvent.click(screen.getByLabelText('-1'));
    fireEvent.click(screen.getByLabelText('Velg spesifikk score'));
    expect(onSetScore).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
