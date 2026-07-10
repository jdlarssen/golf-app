import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DemoGame } from './DemoGame';

// Type C — én render-test for prøvespill-demoen (#1042). Verifiserer struktur
// (banner, CTA inn i login, tavle med de 4 seed-spillerne) + at innmating av et
// slag oppdaterer tavla. IKKE stableford-tallene — de dekkes av lib/scoring
// (Type A) og lib/demo/seed (Type A). Labels resolves fra messages/no.json via
// vitest.setup-mocken.

describe('DemoGame', () => {
  it('rendrer demoen og re-ranker tavla når du taster et slag', () => {
    render(<DemoGame />);

    // Struktur: banner + CTA som peker inn i registreringen
    expect(screen.getByTestId('demo-banner')).toBeInTheDocument();
    const cta = screen.getByTestId('demo-cta').querySelector('a');
    expect(cta).toHaveAttribute('href', '/login?next=%2F');

    // Tavla har alle fire seed-spillerne, inkludert «Deg»
    const board = screen.getByTestId('stableford-leaderboard');
    expect(board.querySelectorAll('li')).toHaveLength(4);
    expect(within(board).getByText('Deg')).toBeInTheDocument();

    // Interaksjon: å taste et slag endrer tavla («se tavla flytte seg»)
    const before = board.textContent;
    fireEvent.click(screen.getByRole('button', { name: '+1' }));
    expect(board.textContent).not.toBe(before);

    // Eierskaps-effekt (#1173): å sette et navn bytter «Deg» på tavla til navnet.
    fireEvent.change(screen.getByTestId('demo-name-input'), {
      target: { value: 'Jørgen' },
    });
    expect(within(board).getByText('Jørgen')).toBeInTheDocument();
    expect(within(board).queryByText('Deg')).not.toBeInTheDocument();
  });
});
