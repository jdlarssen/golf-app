import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoleStrip } from './HoleStrip';

describe('HoleStrip', () => {
  it('renders 18 hole cells', () => {
    const { container } = render(<HoleStrip gameId="g1" currentHole={1} />);
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(18);
    for (let n = 1; n <= 18; n++) {
      expect(screen.getByText(String(n))).toBeInTheDocument();
    }
  });

  it('each cell links to /games/{gameId}/holes/{N}', () => {
    const { container } = render(<HoleStrip gameId="abc" currentHole={5} />);
    const links = container.querySelectorAll('a');
    links.forEach((link, idx) => {
      const n = idx + 1;
      expect(link.getAttribute('href')).toBe(`/games/abc/holes/${n}`);
    });
  });

  it('current hole cell uses strong-surface background', () => {
    const { container } = render(<HoleStrip gameId="g1" currentHole={7} />);
    const links = container.querySelectorAll('a');
    const currentLink = links[6];
    const chip = currentLink.querySelector('span') as HTMLElement;
    expect(chip.style.background).toContain('var(--surface-strong)');
    expect(chip.style.color).toBe('var(--bg-tint)');
  });

  it('completed cells (N < currentHole) use --hole-completed-bg', () => {
    const { container } = render(<HoleStrip gameId="g1" currentHole={5} />);
    const links = container.querySelectorAll('a');
    const completedChip = links[0].querySelector('span') as HTMLElement;
    expect(completedChip.style.background).toBe('var(--hole-completed-bg)');
    expect(completedChip.style.border).toContain('var(--border)');
  });

  it('future cells (N > currentHole) use transparent background', () => {
    const { container } = render(<HoleStrip gameId="g1" currentHole={3} />);
    const links = container.querySelectorAll('a');
    const futureChip = links[10].querySelector('span') as HTMLElement;
    expect(futureChip.style.background).toBe('transparent');
  });

  it('marks current cell with aria-current=page', () => {
    const { container } = render(<HoleStrip gameId="g1" currentHole={9} />);
    const links = container.querySelectorAll('a');
    expect(links[8].getAttribute('aria-current')).toBe('page');
    expect(links[0].getAttribute('aria-current')).toBeNull();
  });
});
