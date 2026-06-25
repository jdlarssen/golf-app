import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WagerStakeSetup } from './WagerStakeSetup';

// Én Type C render-test per docs/test-discipline.md — bekrefter at
// WagerStakeSetup rendrer kr-feltet med riktig enhet-label, kaller onChange
// med rå-verdien, og respekterer disabled. Oppgjørs-matematikken testes i
// lib/scoring/settlement.test.ts, ikke her.

describe('WagerStakeSetup', () => {
  it('rendrer kr-feltet med enhet-label og kaller onChange', () => {
    const onChange = vi.fn();
    render(<WagerStakeSetup value="" onChange={onChange} unitKey="skin" />);

    expect(screen.getByText('Penger på spill?')).toBeInTheDocument();
    expect(screen.getByText('kr per skin')).toBeInTheDocument();

    const input = screen.getByRole('spinbutton', { name: /kroner per enhet/i });
    fireEvent.change(input, { target: { value: '50' } });
    expect(onChange).toHaveBeenCalledWith('50');
  });

  it('bruker riktig enhet for nassau (seksjon) og respekterer disabled', () => {
    render(
      <WagerStakeSetup value="100" onChange={vi.fn()} unitKey="seksjon" disabled />,
    );
    expect(screen.getByText('kr per seksjon')).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: /kroner per enhet/i }),
    ).toBeDisabled();
  });
});
