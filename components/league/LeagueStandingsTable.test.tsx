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
  deliveredUserIds: [],
  inProgressUserIds: [],
  teeName: null,
  simOverride: {},
  simSettings: {},
  overriddenKeys: [],
  settingsLocked: true,
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

// #1378: the value comes before the rounds, the open round is marked by a dot only, and the
// rows without a rank stand in their own groups with no explanation text.
describe('LeagueStandingsTable — column order, open round and groups (#1378)', () => {
  const cell = (roundId: string, value: number | null) => ({
    roundId,
    value,
    points: value,
    penalised: false,
    deliveredOutsideWindow: false,
  });
  const mixedRows: LeagueStandings['rows'] = [
    { userId: 'A', value: 5, roundsPlayed: 2, ranked: true, rank: 1, perRound: [cell('r1', 2), cell('r2', 3)] },
    { userId: 'B', value: 3, roundsPlayed: 2, ranked: true, rank: 2, perRound: [cell('r1', 1), cell('r2', 2)] },
    // Has played, but skipped a closed round under «must play all».
    { userId: 'C', value: 4, roundsPlayed: 1, ranked: false, rank: null, perRound: [cell('r1', 4), cell('r2', null)] },
    // Has not played a round yet.
    { userId: 'D', value: 0, roundsPlayed: 0, ranked: false, rank: null, perRound: [] },
  ];
  const people: LeagueParticipant[] = [
    ...participants,
    { userId: 'C', name: 'Cathrine', nickname: null, acceptedAt: '2026-06-01', hasPlayed: false },
    { userId: 'D', name: 'Dag', nickname: null, acceptedAt: '2026-06-01', hasPlayed: false },
  ];
  const renderTable = (props: Partial<React.ComponentProps<typeof LeagueStandingsTable>> = {}) =>
    render(
      <LeagueStandingsTable
        rows={mixedRows}
        rounds={rounds}
        participants={people}
        standingsModel="points"
        bestNCount={null}
        openRoundId="r2"
        {...props}
      />,
    );

  it('puts the season value right after the player, before the round columns', () => {
    renderTable();
    const thead = screen.getByTestId('liga-standings').querySelector('thead') as HTMLElement;
    const heads = within(thead).getAllByRole('columnheader');
    expect(heads.map((h) => h.textContent)).toEqual(['#', 'Spiller', 'Poeng', 'R1', 'R2']);
    const aliceCells = within(screen.getAllByTestId('liga-standings-row')[0]).getAllByRole('cell');
    expect(aliceCells.map((c) => c.textContent)).toEqual(['1', 'Alice', '5', '2', '3']);
  });

  it('marks the open round with a dot in the header only, no background in the column', () => {
    renderTable();
    const openHead = screen.getByTestId('liga-standings-open-col');
    expect(openHead).toHaveTextContent('R2');
    expect(openHead.querySelector('.bg-live-dot')).not.toBeNull();
    expect(document.querySelectorAll('.bg-live-dot')).toHaveLength(1);
    expect(screen.getByTestId('liga-standings').innerHTML).not.toContain('bg-primary-soft');
  });

  it('no open round: no dot', () => {
    renderTable({ openRoundId: null });
    expect(screen.queryByTestId('liga-standings-open-col')).toBeNull();
    expect(document.querySelector('.bg-live-dot')).toBeNull();
  });

  it('draws a line between ordinary rows, none under the last row of a block or at a group heading', () => {
    renderTable();
    const rowsEls = screen.getAllByTestId('liga-standings-row');
    // Alice → Bob: a line. Bob ends the ranked block, Cathrine and Dag end theirs.
    expect(rowsEls.map((r) => r.className.includes('border-b'))).toEqual([true, false, false, false]);
    expect(screen.getByTestId('liga-standings-group-notRanked').className).not.toContain('border-b');
    expect(screen.getByTestId('liga-standings-group-notRankedYet').className).not.toContain('border-b');
  });

  it('puts the unranked rows in two groups with an empty rank cell and no dimming', () => {
    renderTable();
    const notRanked = screen.getByTestId('liga-standings-group-notRanked');
    const notRankedYet = screen.getByTestId('liga-standings-group-notRankedYet');
    expect(notRanked).toHaveTextContent('Ikke rangert');
    expect(notRanked).not.toHaveTextContent('ennå');
    expect(notRankedYet).toHaveTextContent('Ikke rangert ennå');

    const rowsInOrder = screen.getAllByTestId('liga-standings-row');
    expect(rowsInOrder.map((r) => within(r).getByText(/Alice|Bob|Cathrine|Dag/).textContent)).toEqual([
      'Alice', 'Bob', 'Cathrine', 'Dag',
    ]);
    // Group heading sits between the ranked rows and the group's rows.
    const order = [...document.querySelectorAll('[data-testid^="liga-standings-group-"], [data-testid="liga-standings-row"]')]
      .map((el) => el.getAttribute('data-testid'));
    expect(order).toEqual([
      'liga-standings-row', 'liga-standings-row',
      'liga-standings-group-notRanked', 'liga-standings-row',
      'liga-standings-group-notRankedYet', 'liga-standings-row',
    ]);

    const cathrine = rowsInOrder[2];
    expect(within(cathrine).getAllByRole('cell')[0]).toBeEmptyDOMElement();
    expect(within(cathrine).queryByText('–')).toBeNull();
    expect(cathrine.className).not.toContain('opacity');
    // The last row of each block ends without a line: the heading or the card edge closes it.
    expect(rowsInOrder[0].className).toContain('border-b');
    expect(rowsInOrder[1].className).not.toContain('border-b'); // last ranked row, a heading follows
    expect(rowsInOrder[2].className).not.toContain('border-b'); // alone in its group
    expect(rowsInOrder[3].className).not.toContain('border-b'); // last row of the table
    // An empty round cell shows only the dash.
    expect(within(cathrine).getByText('—')).toBeInTheDocument();
  });

  it('shows no group heading when everyone is ranked', () => {
    renderTable({ rows: mixedRows.slice(0, 2) });
    expect(document.querySelector('[data-testid^="liga-standings-group-"]')).toBeNull();
  });

  it('shows no explanation text for the dashes', () => {
    renderTable();
    expect(screen.queryByText(/har ikke spilt/i)).toBeNull();
    expect(document.querySelector('[title]')).toBeNull();
  });
});
