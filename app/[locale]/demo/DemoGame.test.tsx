import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DemoGame } from './DemoGame';

// Type C — én render-test for prøvespill-demoen (#1042, ny hullside #2281).
// Verifiserer struktur (pill, stripe, tre rader, skinna med seks knapper), at et
// trykk endrer stripa og krymper skinna, og sluttvisningen med tavla og CTA inn
// i login. IKKE tallene — plass, gap og pil dekkes av lib/demo/standing (Type
// A), poengene av lib/scoring. Labels resolves fra messages/no.json via
// vitest.setup-mocken.

describe('DemoGame', () => {
  it('spiller tre hull med skinna, og sluttvisningen tar navnet med til tavla', () => {
    render(<DemoGame />);

    // Spilleskjermen: pill, stripe, tre rader, skinna med fem tall + «Annet».
    expect(screen.getByTestId('demo-pill')).toBeInTheDocument();
    const strip = screen.getByTestId('demo-standing');
    expect(strip).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByTestId('flight-row')).toHaveLength(1);
    expect(screen.getAllByTestId('demo-opponent-row')).toHaveLength(2);
    expect(screen.getAllByTestId('rail-option')).toHaveLength(5);
    expect(screen.getByTestId('rail-other')).toBeInTheDocument();
    expect(screen.getByTestId('demo-hint')).toBeInTheDocument();
    expect(screen.getByTestId('demo-skip')).toHaveAttribute('href', '/login?next=%2F');

    // Stripa folder ut tavla og lukker den igjen.
    fireEvent.click(strip);
    expect(strip).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('demo-board')).toBeInTheDocument();
    fireEvent.click(strip);
    expect(screen.queryByTestId('demo-board')).not.toBeInTheDocument();

    // Ett trykk: stripa endrer seg i samme render, boblen går, skinna krymper.
    for (let hole = 1; hole <= 3; hole++) {
      const before = strip.getAttribute('aria-label');
      fireEvent.click(screen.getAllByTestId('rail-option')[1]);
      if (hole === 1) expect(strip.getAttribute('aria-label')).not.toBe(before);
      expect(screen.queryByTestId('demo-hint')).not.toBeInTheDocument();
      expect(screen.queryAllByTestId('rail-option')).toHaveLength(0);
      fireEvent.click(screen.getByTestId(hole < 3 ? 'demo-next-hole' : 'demo-see-board'));
    }

    // Sluttvisningen: hele tavla, CTA inn i login, og navnet fra feltet på tavla.
    const board = screen.getByTestId('stableford-leaderboard');
    expect(board.querySelectorAll('li')).toHaveLength(3);
    const cta = screen.getByTestId('demo-cta');
    expect(within(cta).getByTestId('demo-continue')).toHaveAttribute('href', '/login?next=%2F');
    fireEvent.change(screen.getByTestId('demo-name-input'), { target: { value: 'Jørgen' } });
    expect(within(board).getByText('Jørgen')).toBeInTheDocument();
    expect(within(board).queryByText('Deg')).not.toBeInTheDocument();

    // «Spill på nytt» starter på hull 1 og beholder navnet.
    fireEvent.click(screen.getByTestId('demo-reset'));
    expect(screen.getByTestId('demo-hint')).toBeInTheDocument();
    expect(screen.getAllByTestId('rail-option')).toHaveLength(5);
    expect(window.localStorage.getItem('torny-demo-name')).toBe('Jørgen');
  });
});
