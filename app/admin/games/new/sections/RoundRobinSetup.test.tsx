import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoundRobinSetup } from './RoundRobinSetup';
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

// Én Type C render-test per docs/test-discipline.md — bekrefter at
// RoundRobinSetup rendrer 4 slotter med spillerlabels og rotasjons-forklaring,
// og viser placeholder-rader når <4 spillere er valgt. Scoring-logikk og
// partner-matching testes i roundRobin.test.ts (Type A).

describe('RoundRobinSetup', () => {
  it('rendrer 4 slots med spillerlabels og rotasjonsinformasjon', () => {
    const roundRobinOrder = [
      p('u1', 'Ola'),
      p('u2', 'Kari'),
      p('u3', 'Per'),
      p('u4', 'Liv'),
    ];

    render(<RoundRobinSetup roundRobinOrder={roundRobinOrder} />);

    // 4 slotter med spiller-labels.
    expect(screen.getByTestId('round-robin-slot-1')).toHaveTextContent('Ola');
    expect(screen.getByTestId('round-robin-slot-2')).toHaveTextContent('Kari');
    expect(screen.getByTestId('round-robin-slot-3')).toHaveTextContent('Per');
    expect(screen.getByTestId('round-robin-slot-4')).toHaveTextContent('Liv');

    // Slot A har slot-label A.
    expect(screen.getByTestId('round-robin-slot-1')).toHaveTextContent('A');

    // Forklaringstekst for rotasjonen er synlig.
    expect(screen.getByText(/rotasjon/i)).toBeInTheDocument();
  });

  it('viser placeholder-rader når <4 spillere er valgt', () => {
    render(
      <RoundRobinSetup
        roundRobinOrder={[p('u1', 'Ola'), p('u2', 'Kari')]}
      />,
    );

    // Slot 1 og 2 har spillere, slot 3 og 4 har placeholder.
    expect(screen.getByTestId('round-robin-slot-1')).toHaveTextContent('Ola');
    expect(screen.getByTestId('round-robin-slot-2')).toHaveTextContent('Kari');
    expect(screen.getByTestId('round-robin-slot-3')).toHaveTextContent(
      'Velg en spiller',
    );
    expect(screen.getByTestId('round-robin-slot-4')).toHaveTextContent(
      'Velg en spiller',
    );
  });
});
