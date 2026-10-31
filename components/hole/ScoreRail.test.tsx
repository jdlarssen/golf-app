import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ScoreRail, type RailOption } from './ScoreRail';

// Type C: roles, the six buttons, aria-pressed and the live region. The
// numbers on the buttons belong to the A tests in lib/scorecard/scoreRail.test.ts.
// #2735: a button shows the number and the term against par, nothing more.
const options: RailOption[] = [
  { strokes: 3, term: 'birdie' },
  { strokes: 4, term: 'par' },
  { strokes: 5, term: 'bogey' },
  { strokes: 6, term: 'doubleBogey' },
  { strokes: 7, term: 'over' },
];

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
    expect(picks.map((b) => b.textContent)).toEqual([
      '3Birdie',
      '4Par',
      '5Bogey',
      '6Dobbeltbogey',
      '7+3',
    ]);
    expect(picks[1].getAttribute('aria-label')).toBe('Sett 4 slag for Marte: Par');
    expect(within(rail).getByTestId('score-rail-skip')).toBeInTheDocument();
    // #2635: the strokes stand on their own line, with the full meaning for
    // the screen reader; the heading is the name alone.
    expect(within(rail).getByTestId('score-rail-heading').textContent).toBe('Marte');
    expect(within(rail).getByTestId('score-rail-strokes').textContent).toBe('Får 1 slagfår 1 slag på hullet');
    const live = within(rail).getByTestId('score-rail-announcement');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toContain('Marte');

    // Everyone scored: one line, no buttons, the live region stays mounted.
    rerender(
      <ScoreRail
        active={null}
        par={4}
        options={options}
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
