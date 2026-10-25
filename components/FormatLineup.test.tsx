import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FormatLineup } from './FormatLineup';
import { FormatLineupFigure, cardFigure, helperFigure, rowFigure, type LineupFigure } from './FormatLineupFigure';
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
    { kind: 'teams', teams: 1, size: 4 },
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
    expect(overlaps(helperFigure(lineup))).toBe(false);
  });

  // #2328: the format helper's result card draws the artboard's 64 × 30
  // figure; the wizard's card and row figures keep their sizes.
  it('formatvelgeren, ett lag à 4: artboardets fire prikker i 64 × 30', () => {
    const figure = helperFigure({ kind: 'teams', teams: 1, size: 4 });
    expect([figure.width, figure.height, figure.viewBox]).toEqual([64, 30, '0 0 64 30']);
    expect(figure.dots.map((d) => [d.cx, d.cy, d.r])).toEqual([
      [8, 15, 7],
      [24, 15, 7],
      [40, 15, 7],
      [56, 15, 7],
    ]);
    expect(figure.transform).toBeUndefined();
  });

  it.each(LINEUPS)('formatvelgeren: hver figur står i 64 × 30: %j', (lineup) => {
    const figure = helperFigure(lineup);
    expect([figure.width, figure.height]).toEqual([64, 30]);
  });

  it('formatvelgeren, 2 mot 2: radfiguren skalert, rendret i 64 × 30', () => {
    const { getByTestId } = render(
      <FormatLineupFigure lineup={{ kind: 'sides', perSide: 2 }} variant="helper" versusLabel="mot" />,
    );
    const svg = getByTestId('format-lineup');
    expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['64', '30']);
    expect(svg.querySelector('g')).toHaveAttribute('transform');
    expect(svg.querySelectorAll('circle')).toHaveLength(4);
  });

  // #2328: the format helper's Texas for 5–12 has no count, so it draws one
  // team at the default size, as the artboard does.
  it.each([3, 4])('ett lag à %i: like mange skogsgrønne prikker', (size) => {
    const figure = rowFigure({ kind: 'teams', teams: 1, size });
    expect(figure.dots).toHaveLength(size);
    for (const dot of figure.dots) expect(dot.color).toBe('var(--primary)');
  });

  it.each([2, 3, 4])('Wolf med %i motspillere: ingen prikk til venstre for 31.5', (opponents) => {
    const figure = rowFigure({ kind: 'wolf', opponents });
    const [, ...rest] = figure.dots;
    for (const dot of rest) expect(dot.cx - dot.r).toBeGreaterThanOrEqual(31.5);
    for (const dot of figure.dots) expect(dot.cx + dot.r).toBeLessThanOrEqual(44);
  });
});
