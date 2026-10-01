import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FormatLineup, cardFigure, rowFigure, type LineupFigure } from './FormatLineup';
import type { FormatLineup as Lineup } from '@/lib/wizard/formatLineup';

// #2260: the dot figures on the format cards. One render test (Type C), plus
// the contract's check for every derived figure: no two dots overlap, and in
// Wolf no dot reaches into «mot».

describe('FormatLineup', () => {
  it('kortet, 2 mot 2: to petrol, «mot», to terrakotta, skjult for skjermleser', () => {
    const { getByTestId } = render(
      <FormatLineup lineup={{ kind: 'sides', perSide: 2 }} variant="card" />,
    );
    const svg = getByTestId('format-lineup');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '104');
    const fills = Array.from(svg.querySelectorAll('circle')).map((c) => c.style.fill);
    expect(fills).toEqual([
      'var(--player-a)',
      'var(--player-a)',
      'var(--player-b)',
      'var(--player-b)',
    ]);
    expect(svg.querySelector('text')).toHaveTextContent('mot');
  });

  const LINEUPS: Lineup[] = [
    { kind: 'solo', players: 1 },
    { kind: 'solo', players: 4 },
    { kind: 'solo', players: 9 },
    { kind: 'pot', players: 2 },
    { kind: 'pot', players: 4 },
    { kind: 'wolf', opponents: 2 },
    { kind: 'wolf', opponents: 3 },
    { kind: 'wolf', opponents: 4 },
    { kind: 'sides', perSide: 1 },
    { kind: 'sides', perSide: 2 },
    { kind: 'sides', perSide: 4 },
    { kind: 'teams', teams: 1, size: 2 },
    { kind: 'teams', teams: 3, size: 2 },
    { kind: 'teamSizes', sizes: [2, 4] },
  ];

  function overlaps(figure: LineupFigure): boolean {
    const { dots } = figure;
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const d = Math.hypot(dots[i].cx - dots[j].cx, dots[i].cy - dots[j].cy);
        if (d < dots[i].r + dots[j].r) return true;
      }
    }
    return false;
  }

  it.each(LINEUPS)('ingen prikker overlapper: %j', (lineup) => {
    expect(overlaps(rowFigure(lineup))).toBe(false);
    expect(overlaps(cardFigure(lineup))).toBe(false);
  });

  it.each([2, 3, 4])('Wolf med %i motspillere: ingen prikk til venstre for 31.5', (opponents) => {
    const figure = rowFigure({ kind: 'wolf', opponents });
    const [, ...rest] = figure.dots;
    for (const dot of rest) expect(dot.cx - dot.r).toBeGreaterThanOrEqual(31.5);
    for (const dot of figure.dots) expect(dot.cx + dot.r).toBeLessThanOrEqual(44);
  });
});
