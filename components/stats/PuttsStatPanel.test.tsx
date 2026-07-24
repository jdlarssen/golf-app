import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PuttsStatPanel } from './PuttsStatPanel';
import type { PuttsStats } from '@/lib/stats/puttsStats';

/**
 * Type-C: ett render-test for putte-panelet (#939, #1290). Bekrefter at PPH
 * alltid vises, at snitt/beste/runder dukker opp når en runde kvalifiserer, og
 * at statuslinja (nesten/tom) vises ellers. Ingen tall re-asserteres fra
 * `computePuttsStats` sin egen Type-A-suite — vi sjekker bare at det vi gir inn
 * faktisk rendres.
 */

const labels = {
  heading: 'Putte-snitt',
  subtitle: 'Putter per hull fra første hull du fører.',
  pphLabel: 'PPH',
  avgLabel: 'Snitt',
  bestLabel: 'Beste',
  roundsLabel: 'Runder',
};

describe('PuttsStatPanel', () => {
  it('renders nothing when the player has never recorded a putt', () => {
    const stats: PuttsStats = {
      pph: null,
      holesCounted: 0,
      roundsCounted: 0,
      avgPuttsPerRound: null,
      bestRoundPutts: null,
      nearMiss: { partialRounds: 0, missingHoles: 0 },
    };
    const { container } = render(
      <PuttsStatPanel
        stats={stats}
        pphDisplay=""
        avgDisplay=""
        statusLabel=""
        {...labels}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders PPH plus average, best and round count when a round qualifies', () => {
    const stats: PuttsStats = {
      pph: 1.9,
      holesCounted: 54,
      roundsCounted: 3,
      avgPuttsPerRound: 31.5,
      bestRoundPutts: 29,
      nearMiss: { partialRounds: 0, missingHoles: 0 },
    };
    render(
      <PuttsStatPanel
        stats={stats}
        pphDisplay="1,9"
        avgDisplay="31,5"
        statusLabel=""
        {...labels}
      />,
    );
    expect(screen.getByText('PPH')).toBeInTheDocument();
    expect(screen.getByText('1,9')).toBeInTheDocument();
    expect(screen.getByText('31,5')).toBeInTheDocument();
    expect(screen.getByText('29')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows PPH and the status line, but no average cell, when no round qualifies', () => {
    const stats: PuttsStats = {
      pph: 2,
      holesCounted: 17,
      roundsCounted: 0,
      avgPuttsPerRound: null,
      bestRoundPutts: null,
      nearMiss: { partialRounds: 1, missingHoles: 1 },
    };
    render(
      <PuttsStatPanel
        stats={stats}
        pphDisplay="2,0"
        avgDisplay=""
        statusLabel="Nesten! Du mangler putt på 1 hull i 1 runde."
        {...labels}
      />,
    );
    expect(screen.getByText('PPH')).toBeInTheDocument();
    expect(screen.getByText('2,0')).toBeInTheDocument();
    expect(
      screen.getByText('Nesten! Du mangler putt på 1 hull i 1 runde.'),
    ).toBeInTheDocument();
    // The gated cells should not appear until a full round qualifies.
    expect(screen.queryByText('Snitt')).not.toBeInTheDocument();
  });
});
