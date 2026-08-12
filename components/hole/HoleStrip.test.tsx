import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoleStrip, holeCellState } from './HoleStrip';

// #1352: the strip used to read cell state from position alone, so a skipped
// hole behind you looked exactly like a played one. State now comes from the
// scored set; these cases pin the precedence.
describe('holeCellState (#1352)', () => {
  it('current wins over every other state, even when the hole has a score', () => {
    expect(holeCellState(7, 7, new Set([7]))).toBe('current');
    expect(holeCellState(7, 7, new Set())).toBe('current');
  });

  it('a scored hole is "scored" whether it lies behind or ahead of the current hole', () => {
    expect(holeCellState(2, 7, new Set([2]))).toBe('scored');
    expect(holeCellState(12, 7, new Set([12]))).toBe('scored');
  });

  it('"missed" is only for holes behind the current one without a score', () => {
    expect(holeCellState(3, 7, new Set([1, 2]))).toBe('missed');
    expect(holeCellState(3, 7, new Set([3]))).toBe('scored');
  });

  it('everything ahead without a score is "future"', () => {
    expect(holeCellState(8, 7, new Set())).toBe('future');
    expect(holeCellState(18, 1, new Set([1]))).toBe('future');
  });
});

describe('HoleStrip', () => {
  it('renders 18 hole cells', () => {
    const { container } = render(
      <HoleStrip gameId="g1" currentHole={1} scoredHoles={new Set()} />,
    );
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(18);
    for (let n = 1; n <= 18; n++) {
      expect(screen.getByText(String(n))).toBeInTheDocument();
    }
  });

  it('each cell links to /games/{gameId}/holes/{N}', () => {
    const { container } = render(
      <HoleStrip gameId="abc" currentHole={5} scoredHoles={new Set()} />,
    );
    const links = container.querySelectorAll('a');
    links.forEach((link, idx) => {
      const n = idx + 1;
      expect(link.getAttribute('href')).toBe(`/games/abc/holes/${n}`);
    });
  });

  it('current hole cell uses strong-surface background', () => {
    const { container } = render(
      <HoleStrip gameId="g1" currentHole={7} scoredHoles={new Set()} />,
    );
    const links = container.querySelectorAll('a');
    const currentLink = links[6];
    const chip = currentLink.querySelector('span') as HTMLElement;
    expect(chip.style.background).toContain('var(--surface-strong)');
    expect(chip.style.color).toBe('var(--bg-tint)');
  });

  it('scored cells use --hole-completed-bg; a skipped hole behind you gets the dashed warning outline (#1352)', () => {
    // Hole 1 played, hole 2 skipped, both behind the current hole.
    const { container } = render(
      <HoleStrip gameId="g1" currentHole={5} scoredHoles={new Set([1, 3, 4])} />,
    );
    const links = container.querySelectorAll('a');
    const scoredChip = links[0].querySelector('span') as HTMLElement;
    expect(scoredChip.style.background).toBe('var(--hole-completed-bg)');
    expect(scoredChip.style.border).toContain('var(--border)');
    expect(links[0].getAttribute('aria-label')).toBe('Hull 1, ferdig');

    const missedChip = links[1].querySelector('span') as HTMLElement;
    expect(missedChip.style.background).toBe('transparent');
    expect(missedChip.style.border).toBe('1px dashed var(--warning)');
    // Never accent gold — that is reserved for winners.
    expect(missedChip.style.color).toBe('var(--text)');
    expect(links[1].getAttribute('aria-label')).toBe('Hull 2, mangler score');
  });

  it('future cells (N > currentHole) use transparent background', () => {
    const { container } = render(
      <HoleStrip gameId="g1" currentHole={3} scoredHoles={new Set([1, 2])} />,
    );
    const links = container.querySelectorAll('a');
    const futureChip = links[10].querySelector('span') as HTMLElement;
    expect(futureChip.style.background).toBe('transparent');
  });

  it('marks current cell with aria-current=page', () => {
    const { container } = render(
      <HoleStrip gameId="g1" currentHole={9} scoredHoles={new Set()} />,
    );
    const links = container.querySelectorAll('a');
    expect(links[8].getAttribute('aria-current')).toBe('page');
    expect(links[0].getAttribute('aria-current')).toBeNull();
  });

  it('#1441: a back9 game with a `holes` prop renders only 10-18, and does not mark 1-9 as completed', () => {
    const back9 = Array.from({ length: 9 }, (_, i) => 10 + i);
    const { container } = render(
      <HoleStrip
        gameId="g1"
        currentHole={12}
        scoredHoles={new Set([10, 11])}
        holes={back9}
      />,
    );
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(9);
    expect(links[0].getAttribute('href')).toBe('/games/g1/holes/10');
    expect(links[8].getAttribute('href')).toBe('/games/g1/holes/18');
    for (let n = 1; n <= 9; n++) {
      expect(screen.queryByText(String(n))).not.toBeInTheDocument();
    }
  });

  it('#1466: a front9 game with a sibling renders the full 1-18 union, sibling holes link cross-game', () => {
    const front9 = Array.from({ length: 9 }, (_, i) => i + 1);
    const back9 = Array.from({ length: 9 }, (_, i) => 10 + i);
    const { container } = render(
      <HoleStrip
        gameId="front"
        currentHole={3}
        scoredHoles={new Set([1, 2])}
        holes={front9}
        sibling={{ gameId: 'back', holes: back9 }}
      />,
    );
    const links = container.querySelectorAll('a');
    // Union sorted ascending: 18 cells, one per hole 1..18.
    expect(links.length).toBe(18);
    for (let n = 1; n <= 18; n++) {
      expect(screen.getByText(String(n))).toBeInTheDocument();
    }
    // Own holes (1-9) link to this game; sibling holes (10-18) link across.
    expect(links[0].getAttribute('href')).toBe('/games/front/holes/1');
    expect(links[8].getAttribute('href')).toBe('/games/front/holes/9');
    expect(links[9].getAttribute('href')).toBe('/games/back/holes/10');
    expect(links[17].getAttribute('href')).toBe('/games/back/holes/18');
    // Hole 1-2 are scored on this host; 10-18 lie ahead.
    const hole1Chip = links[0].querySelector('span') as HTMLElement;
    expect(hole1Chip.style.background).toBe('var(--hole-completed-bg)');
    const hole10Chip = links[9].querySelector('span') as HTMLElement;
    expect(hole10Chip.style.background).toBe('transparent');
  });

  it('#1352 × #1466: sibling holes behind the current hole are never marked missing — this host has no scores for them', () => {
    const front9 = Array.from({ length: 9 }, (_, i) => i + 1);
    const back9 = Array.from({ length: 9 }, (_, i) => 10 + i);
    const { container } = render(
      <HoleStrip
        gameId="back"
        currentHole={12}
        scoredHoles={new Set([10, 11])}
        holes={back9}
        sibling={{ gameId: 'front', holes: front9 }}
      />,
    );
    const links = container.querySelectorAll('a');
    // Hole 1 is the sibling's, behind hole 12 and absent from our score set —
    // it keeps the played look instead of a false "mangler score".
    const hole1Chip = links[0].querySelector('span') as HTMLElement;
    expect(hole1Chip.style.background).toBe('var(--hole-completed-bg)');
    expect(links[0].getAttribute('aria-label')).toBe('Hull 1, ferdig');
  });
});
