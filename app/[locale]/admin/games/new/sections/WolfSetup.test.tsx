import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WolfSetup } from './WolfSetup';
import type { PlayerOption } from '../GameForm';

function p(id: string, nickname: string | null = null, name: string = id): PlayerOption {
  return {
    id,
    name,
    nickname,
    hcp_index: 12,
    email: `${id}@test.no`,
    pending: false,
    gender: 'mens',
    level: 'normal',
  };
}

// Render-tester per docs/test-discipline.md — bekrefter at WolfSetup rendrer
// scoring-toggle, dynamisk antall rotation-slots (3-5, #465), R-basert hull-
// fordeling + trailing-note. Detalj-poeng (point-tabellen) testes i scoring-
// laget, ikke her.

describe('WolfSetup', () => {
  it('4 spillere → 4 slots, R=16 hull-fordeling, trailing 17–18, shuffle enabled', () => {
    const onScoringChange = vi.fn();
    const onShuffle = vi.fn();

    render(
      <WolfSetup
        scoring="net"
        onScoringChange={onScoringChange}
        wolfOrder={[p('u1', 'Ola'), p('u2', 'Kari'), p('u3', 'Per'), p('u4', 'Liv')]}
        onShuffle={onShuffle}
      />,
    );

    expect(screen.getByText('Med handicap (netto)')).toBeInTheDocument();
    expect(screen.getByText('Brutto')).toBeInTheDocument();

    expect(screen.getByTestId('wolf-slot-1')).toHaveTextContent('Ola');
    expect(screen.getByTestId('wolf-slot-1')).toHaveTextContent('Hull 1, 5, 9, 13');
    expect(screen.getByTestId('wolf-slot-2')).toHaveTextContent('Hull 2, 6, 10, 14');
    expect(screen.getByTestId('wolf-slot-4')).toHaveTextContent('Liv');
    expect(screen.queryByTestId('wolf-slot-5')).toBeNull();
    expect(screen.getByTestId('wolf-trailing-note')).toHaveTextContent('17');

    const shuffleBtn = screen.getByTestId('wolf-shuffle');
    expect(shuffleBtn).not.toBeDisabled();
    fireEvent.click(shuffleBtn);
    expect(onShuffle).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('radio', { name: /brutto/i }));
    expect(onScoringChange).toHaveBeenCalledWith('gross');
  });

  it('5 spillere → 5 slots, R=15 hull-fordeling, trailing 16–18', () => {
    render(
      <WolfSetup
        scoring="net"
        onScoringChange={vi.fn()}
        wolfOrder={[p('u1'), p('u2'), p('u3'), p('u4'), p('u5')]}
        onShuffle={vi.fn()}
      />,
    );

    expect(screen.getByTestId('wolf-slot-5')).toBeInTheDocument();
    expect(screen.getByTestId('wolf-slot-1')).toHaveTextContent('Hull 1, 6, 11');
    expect(screen.getByTestId('wolf-trailing-note')).toHaveTextContent('16');
    expect(screen.getByTestId('wolf-shuffle')).not.toBeDisabled();
  });

  it('3 spillere → 3 slots, ingen trailing-note (hele runden roterer)', () => {
    render(
      <WolfSetup
        scoring="net"
        onScoringChange={vi.fn()}
        wolfOrder={[p('u1'), p('u2'), p('u3')]}
        onShuffle={vi.fn()}
      />,
    );

    expect(screen.getByTestId('wolf-slot-3')).toBeInTheDocument();
    expect(screen.queryByTestId('wolf-slot-4')).toBeNull();
    expect(screen.getByTestId('wolf-slot-1')).toHaveTextContent('Hull 1, 4, 7, 10, 13, 16');
    expect(screen.queryByTestId('wolf-trailing-note')).toBeNull();
  });

  it('færre enn 3 valgt → hint vises, ingen slots, shuffle disabled', () => {
    render(
      <WolfSetup
        scoring="net"
        onScoringChange={vi.fn()}
        wolfOrder={[]}
        onShuffle={vi.fn()}
      />,
    );

    expect(screen.getByTestId('wolf-rotation-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('wolf-slot-1')).toBeNull();
    expect(screen.getByTestId('wolf-shuffle')).toBeDisabled();
  });
});
