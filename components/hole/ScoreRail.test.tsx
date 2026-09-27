import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ScoreRail, type RailOption } from './ScoreRail';

// Type C: roles, the six buttons, aria-pressed and the live region. The
// numbers on the buttons belong to the A tests in lib/scorecard/scoreRail.test.ts.
const options: RailOption[] = [3, 4, 5, 6, 7].map((strokes) => ({
  strokes,
  term: 'par',
  points: null,
  netto: strokes - 1,
}));

const handlers = {
  onPick: vi.fn(),
  onOther: vi.fn(),
  onStep: vi.fn(),
  onUndo: vi.fn(),
  onSkip: vi.fn(),
  onPutts: vi.fn(),
};

describe('ScoreRail', () => {
  it('renders a labelled region with six buttons, the entered value pressed, and a polite live region', () => {
    const { rerender } = render(
      <ScoreRail
        active={{ playerId: 'u1', name: 'Marte', extraStrokes: 1, score: 5, putts: null }}
        par={4}
        options={options}
        display="netto"
        puttsTracking={false}
        skipTo="Tore"
        {...handlers}
      />,
    );

    const rail = screen.getByRole('region', { name: /Marte/ });
    const picks = within(rail).getAllByTestId('rail-option');
    expect(picks).toHaveLength(5);
    expect(within(rail).getByTestId('rail-other')).toBeInTheDocument();
    expect(picks.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
    ]);
    expect(within(rail).getByTestId('score-rail-skip')).toBeInTheDocument();
    const live = within(rail).getByTestId('score-rail-announcement');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toContain('Marte');

    // Everyone scored: one line, no buttons, the live region stays mounted.
    rerender(
      <ScoreRail
        active={null}
        par={4}
        options={options}
        display="netto"
        puttsTracking={false}
        skipTo={null}
        {...handlers}
      />,
    );
    expect(screen.queryAllByTestId('rail-option')).toHaveLength(0);
    expect(screen.getByTestId('score-rail-all-scored')).toBeInTheDocument();
    expect(screen.getByTestId('score-rail-announcement')).toBe(live);
  });
});
