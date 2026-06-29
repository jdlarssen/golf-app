import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PuttsStatPanel } from './PuttsStatPanel';
import type { PuttsStats } from '@/lib/stats/puttsStats';

/**
 * Type-C: ett render-test for putte-snitt-kortet (#939). Bekrefter at kortet
 * viser snitt/beste/runder når det finnes data, og tom-tilstanden ellers.
 * Ingen tall re-asserteres fra `computePuttsStats` sin egen Type-A-suite —
 * vi sjekker bare at det vi gir inn faktisk rendres.
 */

const labels = {
  heading: 'Putte-snitt',
  subtitle: 'Snitt putter per komplett runde.',
  avgLabel: 'Snitt',
  bestLabel: 'Beste',
  roundsLabel: 'Runder',
  emptyLabel: 'Før putter på en hel runde for å se snittet ditt.',
};

describe('PuttsStatPanel', () => {
  it('renders the average, best and round count when rounds qualify', () => {
    const stats: PuttsStats = {
      roundsCounted: 3,
      avgPuttsPerRound: 31.5,
      bestRoundPutts: 29,
    };
    render(<PuttsStatPanel stats={stats} avgDisplay="31,5" {...labels} />);
    expect(screen.getByText('Putte-snitt')).toBeInTheDocument();
    expect(screen.getByText('31,5')).toBeInTheDocument();
    expect(screen.getByText('29')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(
      screen.queryByText('Før putter på en hel runde for å se snittet ditt.'),
    ).not.toBeInTheDocument();
  });

  it('renders the empty state when no round qualifies', () => {
    const stats: PuttsStats = {
      roundsCounted: 0,
      avgPuttsPerRound: null,
      bestRoundPutts: null,
    };
    render(<PuttsStatPanel stats={stats} avgDisplay="" {...labels} />);
    expect(
      screen.getByText('Før putter på en hel runde for å se snittet ditt.'),
    ).toBeInTheDocument();
    // The stat labels should not appear in the empty state.
    expect(screen.queryByText('Snitt')).not.toBeInTheDocument();
  });
});
