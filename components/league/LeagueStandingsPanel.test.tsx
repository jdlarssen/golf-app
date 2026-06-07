import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LeagueStandingsPanel } from './LeagueStandingsPanel';
import type { LeagueStandings, LeagueStandingsByScoring } from '@/lib/league/types';
import type { LeagueParticipant } from '@/lib/league/getLigaSnapshot';

beforeEach(() => cleanup());

const participants: LeagueParticipant[] = [
  { userId: 'A', name: 'Alice', nickname: null, acceptedAt: '2026-06-01', hasPlayed: false },
  { userId: 'B', name: 'Bob', nickname: null, acceptedAt: '2026-06-01', hasPlayed: false },
];

const row = (userId: string, rank: number): LeagueStandings['rows'][number] => ({
  userId,
  value: rank,
  roundsPlayed: 1,
  ranked: true,
  rank,
  perRound: [],
});

// Net ranks Alice first, gross ranks Bob first — so the visible top row tells
// us which table is being shown without re-asserting any scoring number.
const standings: LeagueStandingsByScoring = {
  net: { rows: [row('A', 1), row('B', 2)] },
  gross: { rows: [row('B', 1), row('A', 2)] },
};

const topName = () =>
  within(screen.getAllByTestId('liga-standings-row')[0]).getByText(/Alice|Bob/).textContent;

describe('LeagueStandingsPanel', () => {
  it('shows the Netto table by default and flips to Brutto via the toggle', () => {
    render(
      <LeagueStandingsPanel
        standings={standings}
        rounds={[]}
        participants={participants}
        standingsModel="total"
        bestNCount={null}
      />,
    );
    expect(topName()).toBe('Alice'); // net default

    fireEvent.click(screen.getByRole('radio', { name: 'Brutto' }));
    expect(topName()).toBe('Bob'); // gross
  });

  it('renders no toggle when the league scores only one metric', () => {
    render(
      <LeagueStandingsPanel
        standings={{ net: standings.net, gross: null }}
        rounds={[]}
        participants={participants}
        standingsModel="total"
        bestNCount={null}
      />,
    );
    expect(screen.queryByRole('radio', { name: 'Brutto' })).toBeNull();
    expect(topName()).toBe('Alice');
  });
});
