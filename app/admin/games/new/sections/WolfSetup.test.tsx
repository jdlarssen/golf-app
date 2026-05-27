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

// Én Type C render-test per docs/test-discipline.md — bekrefter at WolfSetup
// rendrer scoring-toggle, 4 rotation-slots, og shuffle-knappen disabled når
// <4 spillere er valgt. Detalj-poeng (point-tabellen) testes i scoring-laget,
// ikke her.

describe('WolfSetup', () => {
  it('rendrer scoring-toggle, 4 slots med spiller-labels, og enabler shuffle ved 4 spillere', () => {
    const onScoringChange = vi.fn();
    const onShuffle = vi.fn();

    const wolfOrder = [
      p('u1', 'Ola'),
      p('u2', 'Kari'),
      p('u3', 'Per'),
      p('u4', 'Liv'),
    ];

    render(
      <WolfSetup
        scoring="net"
        onScoringChange={onScoringChange}
        wolfOrder={wolfOrder}
        onShuffle={onShuffle}
      />,
    );

    // Scoring-toggle viser begge alternativer.
    expect(screen.getByText('Med handicap (netto)')).toBeInTheDocument();
    expect(screen.getByText('Brutto')).toBeInTheDocument();

    // 4 slots med nickname-labels og hull-numre.
    expect(screen.getByTestId('wolf-slot-1')).toHaveTextContent('Ola');
    expect(screen.getByTestId('wolf-slot-1')).toHaveTextContent('Hull 1, 5, 9, 13');
    expect(screen.getByTestId('wolf-slot-2')).toHaveTextContent('Kari');
    expect(screen.getByTestId('wolf-slot-2')).toHaveTextContent('Hull 2, 6, 10, 14');
    expect(screen.getByTestId('wolf-slot-3')).toHaveTextContent('Per');
    expect(screen.getByTestId('wolf-slot-4')).toHaveTextContent('Liv');

    // Shuffle-knapp enabled — call onShuffle ved klikk.
    const shuffleBtn = screen.getByTestId('wolf-shuffle');
    expect(shuffleBtn).not.toBeDisabled();
    fireEvent.click(shuffleBtn);
    expect(onShuffle).toHaveBeenCalledTimes(1);

    // Bytt scoring via radio.
    const grossRadio = screen.getByRole('radio', { name: /brutto/i });
    fireEvent.click(grossRadio);
    expect(onScoringChange).toHaveBeenCalledWith('gross');
  });

  it('disabler shuffle og viser placeholder-rader når <4 spillere er valgt', () => {
    render(
      <WolfSetup
        scoring="net"
        onScoringChange={vi.fn()}
        wolfOrder={[p('u1', 'Ola'), p('u2', 'Kari')]}
        onShuffle={vi.fn()}
      />,
    );

    // Shuffle disabled fordi vi har færre enn 4.
    expect(screen.getByTestId('wolf-shuffle')).toBeDisabled();

    // Slot 1-2 har spillere, slot 3-4 har placeholder.
    expect(screen.getByTestId('wolf-slot-1')).toHaveTextContent('Ola');
    expect(screen.getByTestId('wolf-slot-3')).toHaveTextContent(
      'Velg en spiller',
    );
    expect(screen.getByTestId('wolf-slot-4')).toHaveTextContent(
      'Velg en spiller',
    );
  });
});
