import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LeagueStandingsTable } from './LeagueStandingsTable';
import type { LeagueStandings } from '@/lib/league/types';
import type { LeagueParticipant, LeagueRoundView } from '@/lib/league/getLigaSnapshot';

beforeEach(() => cleanup());

const participants: LeagueParticipant[] = [
  { userId: 'A', name: 'Alice', nickname: null, acceptedAt: '2026-06-01', hasPlayed: false },
  { userId: 'B', name: 'Bob', nickname: null, acceptedAt: '2026-06-01', hasPlayed: false },
];

const mkRound = (id: string, sequence: number): LeagueRoundView => ({
  id,
  sequence,
  label: `Runde ${sequence}`,
  courseId: null,
  teeBoxId: null,
  opensAt: '2026-06-01',
  closesAt: '2026-06-08',
  originalClosesAt: '2026-06-08',
  windowOverriddenAt: null,
  flaggedFlights: 0,
  flightCount: 1,
});
const rounds: LeagueRoundView[] = [mkRound('r1', 1), mkRound('r2', 2)];

// Hand-built points standings — render only; the numbers come from compute (tested there).
// Two rounds so a per-round points value is distinct from the season total.
const standings: LeagueStandings = {
  rows: [
    {
      userId: 'A', value: 5, roundsPlayed: 2, ranked: true, rank: 1,
      perRound: [
        { roundId: 'r1', value: 3, points: 2, penalised: false, deliveredOutsideWindow: false },
        { roundId: 'r2', value: 1, points: 3, penalised: false, deliveredOutsideWindow: false },
      ],
    },
    {
      userId: 'B', value: 3, roundsPlayed: 2, ranked: true, rank: 2,
      perRound: [
        { roundId: 'r1', value: 7, points: 1, penalised: false, deliveredOutsideWindow: false },
        { roundId: 'r2', value: 5, points: 2, penalised: false, deliveredOutsideWindow: false },
      ],
    },
  ],
};

describe('LeagueStandingsTable — points model', () => {
  it('renders a "Poeng" column and shows per-round points (not to-par)', () => {
    render(
      <LeagueStandingsTable
        rows={standings.rows}
        rounds={rounds}
        participants={participants}
        standingsModel="points"
        bestNCount={null}
      />,
    );
    // Header column reads "Poeng", not "Totalt"/"Snitt".
    expect(screen.getByText('Poeng')).toBeInTheDocument();
    expect(screen.queryByText('Totalt')).toBeNull();

    // Alice's r1 cell shows her points (2), not her to-par (+3); total column shows 5.
    const aliceRow = screen.getAllByTestId('liga-standings-row')[0];
    expect(within(aliceRow).getByText('2')).toBeInTheDocument();
    expect(within(aliceRow).getByText('5')).toBeInTheDocument();
    expect(within(aliceRow).queryByText('+3')).toBeNull();
  });
});

// #452 Fase 4: stableford uses a non-points model (Total) but the per-round value
// IS raw points → must render as plain numbers, never mot-par "+32"/"E".
describe('LeagueStandingsTable — stableford (pointsBased) under the total model', () => {
  const sfRows: LeagueStandings['rows'] = [
    {
      userId: 'A', value: 60, roundsPlayed: 2, ranked: true, rank: 1,
      perRound: [
        { roundId: 'r1', value: 32, points: null, penalised: false, deliveredOutsideWindow: false },
        { roundId: 'r2', value: 28, points: null, penalised: false, deliveredOutsideWindow: false },
      ],
    },
    {
      userId: 'B', value: 30, roundsPlayed: 1, ranked: true, rank: 2,
      perRound: [
        { roundId: 'r1', value: 30, points: null, penalised: false, deliveredOutsideWindow: false },
        { roundId: 'r2', value: 0, points: null, penalised: true, deliveredOutsideWindow: false },
      ],
    },
  ];

  it('shows raw points in cells + total; a penalised missed round reads "0", not "E"', () => {
    render(
      <LeagueStandingsTable
        rows={sfRows}
        rounds={rounds}
        participants={participants}
        standingsModel="total"
        bestNCount={null}
        pointsBased
      />,
    );
    const aliceRow = screen.getAllByTestId('liga-standings-row')[0];
    expect(within(aliceRow).getByText('32')).toBeInTheDocument(); // not "+32"
    expect(within(aliceRow).getByText('60')).toBeInTheDocument();
    expect(within(aliceRow).queryByText('+32')).toBeNull();

    const bobRow = screen.getAllByTestId('liga-standings-row')[1];
    expect(within(bobRow).getByText('0')).toBeInTheDocument(); // missed round = 0 points
    expect(within(bobRow).queryByText('E')).toBeNull();
  });
});
