import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoleStrip } from './HoleStrip';

const NONE: ReadonlySet<number> = new Set();

describe('HoleStrip', () => {
  it('renders 18 hole cells', () => {
    const { container } = render(
      <HoleStrip gameId="g1" currentHole={1} scoredHoles={NONE} />,
    );
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(18);
    for (let n = 1; n <= 18; n++) {
      expect(screen.getByText(String(n))).toBeInTheDocument();
    }
    // #1353: hvert hull-mål er ≥44px bredt OG høyt (appens egen treffflate-regel).
    links.forEach((link) => {
      expect((link as HTMLElement).style.minWidth).toBe('44px');
      expect((link as HTMLElement).style.minHeight).toBe('44px');
    });
  });

  it('each cell links to /games/{gameId}/holes/{N}', () => {
    const { container } = render(
      <HoleStrip gameId="abc" currentHole={5} scoredHoles={NONE} />,
    );
    const links = container.querySelectorAll('a');
    links.forEach((link, idx) => {
      const n = idx + 1;
      expect(link.getAttribute('href')).toBe(`/games/abc/holes/${n}`);
    });
  });

  it('current hole cell uses strong-surface background', () => {
    const { container } = render(
      <HoleStrip gameId="g1" currentHole={7} scoredHoles={NONE} />,
    );
    const links = container.querySelectorAll('a');
    const currentLink = links[6];
    const chip = currentLink.querySelector('span') as HTMLElement;
    expect(chip.style.background).toContain('var(--surface-strong)');
    expect(chip.style.color).toBe('var(--bg-tint)');
  });

  it('scored cells use --hole-completed-bg; holes behind you without a score get the dashed warning frame (#1352)', () => {
    // Holes 1-2 entered, 3-4 skipped, standing on 5.
    const { container } = render(
      <HoleStrip gameId="g1" currentHole={5} scoredHoles={new Set([1, 2])} />,
    );
    const links = container.querySelectorAll('a');
    const scoredChip = links[0].querySelector('span') as HTMLElement;
    expect(scoredChip.style.background).toBe('var(--hole-completed-bg)');
    expect(scoredChip.style.border).toContain('var(--border)');
    expect(links[0].getAttribute('aria-label')).toBe('Hull 1 – score ført');

    const missedChip = links[2].querySelector('span') as HTMLElement;
    expect(missedChip.style.background).toBe('transparent');
    expect(missedChip.style.border).toBe('1px dashed var(--warning)');
    // The number itself stays readable — state is carried by frame + label.
    expect(missedChip.style.color).toBe('var(--text)');
    expect(links[2].getAttribute('aria-label')).toBe('Hull 3 – mangler score');
  });

  it('future cells (N > currentHole) use transparent background', () => {
    const { container } = render(
      <HoleStrip gameId="g1" currentHole={3} scoredHoles={NONE} />,
    );
    const links = container.querySelectorAll('a');
    const futureChip = links[10].querySelector('span') as HTMLElement;
    expect(futureChip.style.background).toBe('transparent');
    // No dashed frame: a hole you haven't reached yet isn't «missing».
    expect(futureChip.style.border).not.toContain('dashed');
  });

  it('marks current cell with aria-current=page', () => {
    const { container } = render(
      <HoleStrip gameId="g1" currentHole={9} scoredHoles={NONE} />,
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
    // Own holes read from the score set (1-2 entered → scored); sibling holes
    // keep the positional derivation (#1352 has no score data for them).
    const hole1Chip = links[0].querySelector('span') as HTMLElement;
    expect(hole1Chip.style.background).toBe('var(--hole-completed-bg)');
    const hole10Chip = links[9].querySelector('span') as HTMLElement;
    expect(hole10Chip.style.background).toBe('transparent');
  });
});
