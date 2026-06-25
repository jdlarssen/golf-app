import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HistorikkTabs } from './HistorikkTabs';

// Type C — én render-test for fane-bytteren (#940). Verifiserer kun
// interaksjonen (default = Statistikk, klikk → Runder); innholdet i hver fane
// er server-produsert og testes ikke her. Labels resolves fra messages/no.json
// via global vitest.setup-mocken.
describe('HistorikkTabs', () => {
  it('defaults to Statistikk and switches to Runder on click', () => {
    render(
      <HistorikkTabs
        statsContent={<div>STATS_CONTENT</div>}
        roundsContent={<div>ROUNDS_CONTENT</div>}
      />,
    );

    // Default: Statistikk-fanen aktiv, kun stats-innhold montert.
    expect(
      screen.getByRole('tab', { name: 'Statistikk' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('STATS_CONTENT')).toBeInTheDocument();
    expect(screen.queryByText('ROUNDS_CONTENT')).not.toBeInTheDocument();

    // Klikk «Runder» → bytter aktiv fane og montert innhold.
    fireEvent.click(screen.getByRole('tab', { name: 'Runder' }));
    expect(
      screen.getByRole('tab', { name: 'Runder' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('ROUNDS_CONTENT')).toBeInTheDocument();
    expect(screen.queryByText('STATS_CONTENT')).not.toBeInTheDocument();
  });
});
