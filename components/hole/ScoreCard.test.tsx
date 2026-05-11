import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ScoreCard, type ScoreCardProps } from './ScoreCard';

// jsdom doesn't implement setPointerCapture; stub it so pointer flows don't throw.
beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});

const baseProps: ScoreCardProps = {
  playerId: 'p1',
  name: 'Alice Andersen',
  initial: 'A',
  extraStrokes: 0,
  score: null,
  par: 4,
  confirmed: false,
  mode: 'swipe',
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
  it('unset + swipe mode shows swipe helper', () => {
    setup({ score: null, mode: 'swipe', confirmed: false });
    expect(screen.getByText('Tap = par. Sveip for +/−.')).toBeInTheDocument();
  });

  it('unset + buttons mode shows buttons helper', () => {
    setup({ score: null, mode: 'buttons', confirmed: false });
    expect(screen.getByText('Tap kort = par. Bruk − / +.')).toBeInTheDocument();
  });

  it('confirmed shows Bekreftet helper', () => {
    setup({ score: 4, confirmed: true });
    expect(screen.getByText('Bekreftet')).toBeInTheDocument();
  });

  it('score set but not confirmed shows adjusted helper', () => {
    setup({ score: 5, confirmed: false });
    expect(
      screen.getByText('Justert · tap igjen for å bekrefte'),
    ).toBeInTheDocument();
  });

  it('confirmed border color differs from unconfirmed', () => {
    const { card: unconfirmed, unmount } = setup({ confirmed: false });
    const unconfirmedBorder = unconfirmed.style.borderColor;
    unmount();
    const { card: confirmed } = setup({ confirmed: true });
    expect(confirmed.style.borderColor).not.toBe(unconfirmedBorder);
  });
});

describe('ScoreCard — delta pill', () => {
  it('renders E when score equals par', () => {
    setup({ score: 4, par: 4 });
    expect(screen.getByTestId('delta-pill').textContent).toBe('E');
  });

  it('renders +2 when score is par+2', () => {
    setup({ score: 6, par: 4 });
    expect(screen.getByTestId('delta-pill').textContent).toBe('+2');
  });

  it('renders em-dash when unset', () => {
    setup({ score: null });
    expect(screen.getByTestId('delta-pill').textContent).toBe('—');
  });
});

describe('ScoreCard — swipe interaction', () => {
  it('tap (down then up, no movement) calls onSetScore with par', () => {
    const { card, onSetScore } = setup({ score: null, par: 4, mode: 'swipe' });
    fireEvent.pointerDown(card, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(card, { clientY: 100, pointerId: 1 });
    expect(onSetScore).toHaveBeenCalledWith('p1', 4);
  });

  it('swipe up (dy=-20) calls onSetScore with par+1', () => {
    const { card, onSetScore } = setup({ score: null, par: 4, mode: 'swipe' });
    fireEvent.pointerDown(card, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(card, { clientY: 80, pointerId: 1 });
    expect(onSetScore).toHaveBeenCalledWith('p1', 5);
  });

  it('swipe down (dy=+20) calls onSetScore with par-1', () => {
    const { card, onSetScore } = setup({ score: null, par: 4, mode: 'swipe' });
    fireEvent.pointerDown(card, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(card, { clientY: 120, pointerId: 1 });
    expect(onSetScore).toHaveBeenCalledWith('p1', 3);
  });

  it('swipe up clamps at 12 when score is already 12', () => {
    const { card, onSetScore } = setup({ score: 12, par: 4, mode: 'swipe' });
    fireEvent.pointerDown(card, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientY: 70, pointerId: 1 });
    fireEvent.pointerUp(card, { clientY: 70, pointerId: 1 });
    expect(onSetScore).toHaveBeenCalledWith('p1', 12);
  });

  it('swipe down clamps at 1 when score is already 1', () => {
    const { card, onSetScore } = setup({ score: 1, par: 4, mode: 'swipe' });
    fireEvent.pointerDown(card, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(card, { clientY: 130, pointerId: 1 });
    expect(onSetScore).toHaveBeenCalledWith('p1', 1);
  });

  it('movement in dead zone (|dy| between 8 and 16) does not fire', () => {
    const { card, onSetScore } = setup({ score: null, par: 4, mode: 'swipe' });
    fireEvent.pointerDown(card, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientY: 112, pointerId: 1 });
    fireEvent.pointerUp(card, { clientY: 112, pointerId: 1 });
    expect(onSetScore).not.toHaveBeenCalled();
  });
});

describe('ScoreCard — long-press', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onLongPress after 500ms with no movement', () => {
    const { card, onLongPress } = setup({ mode: 'swipe' });
    fireEvent.pointerDown(card, { clientY: 100, pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledWith('p1');
  });

  it('cancels long-press on movement > 4px', () => {
    const { card, onLongPress } = setup({ mode: 'swipe' });
    fireEvent.pointerDown(card, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientY: 110, pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});

describe('ScoreCard — buttons mode', () => {
  it('tap on card body calls onSetScore with par', () => {
    const { card, onSetScore } = setup({
      score: null,
      par: 4,
      mode: 'buttons',
    });
    fireEvent.click(card);
    expect(onSetScore).toHaveBeenCalledWith('p1', 4);
  });

  it('+ button on unset score calls onSetScore with par+1', () => {
    const { onSetScore } = setup({ score: null, par: 4, mode: 'buttons' });
    fireEvent.click(screen.getByLabelText('+1'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 5);
  });

  it('− button on unset score calls onSetScore with par-1', () => {
    const { onSetScore } = setup({ score: null, par: 4, mode: 'buttons' });
    fireEvent.click(screen.getByLabelText('-1'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 3);
  });

  it('+ button from existing score calls onSetScore with score+1', () => {
    const { onSetScore } = setup({ score: 5, par: 4, mode: 'buttons' });
    fireEvent.click(screen.getByLabelText('+1'));
    expect(onSetScore).toHaveBeenCalledWith('p1', 6);
  });

  it('⋯ button calls onLongPress and does not also fire card tap', () => {
    const { onSetScore, onLongPress } = setup({
      score: null,
      par: 4,
      mode: 'buttons',
    });
    fireEvent.click(screen.getByLabelText('Velg spesifikk score'));
    expect(onLongPress).toHaveBeenCalledWith('p1');
    expect(onSetScore).not.toHaveBeenCalled();
  });

  it('stepper buttons do not fire when disabled', () => {
    const { onSetScore, onLongPress } = setup({
      score: null,
      par: 4,
      mode: 'buttons',
      disabled: true,
    });
    fireEvent.click(screen.getByLabelText('+1'));
    fireEvent.click(screen.getByLabelText('-1'));
    fireEvent.click(screen.getByLabelText('Velg spesifikk score'));
    expect(onSetScore).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });
});

describe('ScoreCard — disabled', () => {
  it('swipe tap does not call onSetScore when disabled', () => {
    const { card, onSetScore } = setup({
      score: null,
      par: 4,
      mode: 'swipe',
      disabled: true,
    });
    fireEvent.pointerDown(card, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(card, { clientY: 100, pointerId: 1 });
    expect(onSetScore).not.toHaveBeenCalled();
  });

  it('swipe gesture does not call onSetScore when disabled', () => {
    const { card, onSetScore } = setup({
      score: null,
      par: 4,
      mode: 'swipe',
      disabled: true,
    });
    fireEvent.pointerDown(card, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(card, { clientY: 80, pointerId: 1 });
    expect(onSetScore).not.toHaveBeenCalled();
  });
});

// Keep `within` referenced even if unused so future tests can grow with it.
void within;
