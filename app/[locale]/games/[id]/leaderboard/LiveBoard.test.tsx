import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LiveBoard, type SoloBoardProps } from './LiveBoard';
import type { TeamBoardProps, TeamBoardRowData } from './TeamBoardRows';
import type { LiveBoard as LiveBoardData, LiveBoardRow } from '@/lib/leaderboard/liveBoard';

// Type C (#2253): the board's structure — the viewer's row, collapsing, the
// strip. The numbers are fed in ready; lib/leaderboard/liveBoard.test.ts owns
// how they are computed.

function rows(count: number): LiveBoardRow[] {
  return Array.from({ length: count }, (_, i) => ({
    userId: `u${i + 1}`,
    name: `Spiller ${i + 1}`,
    nickname: null,
    rank: i + 1,
    tied: false,
    total: 20 - i,
    holesPlayed: 7,
    movement: 0,
    recent: ['par', 'under', 'over1'],
    recentHoles: [],
  }));
}

function props(overrides: Partial<SoloBoardProps> = {}, board?: Partial<LiveBoardData>): SoloBoardProps {
  return {
    gameName: 'Lørdagsrunden',
    status: 'active',
    statusLabel: 'Planlagt',
    formatLabel: 'Stableford',
    flights: 3,
    board: { unit: 'points', holesPlayed: 7, rows: rows(9), ...board },
    viewerUserId: 'u9',
    strip: { kind: 'hole', holeNumber: 7, href: '/games/g1/holes/7' },
    backHref: '/games/g1',
    testId: 'stableford-leaderboard',
    ...overrides,
  };
}

const boardItems = () => within(screen.getByTestId('stableford-leaderboard')).queryAllByRole('listitem');

describe('LiveBoard', () => {
  it('collapses to the top five plus the viewer’s own row, and expands on tap', () => {
    render(<LiveBoard {...props()} />);

    // Five rows, the «…» gap (hidden from screen readers) and the viewer.
    expect(boardItems()).toHaveLength(6);
    const own = boardItems()[5];
    expect(within(own).getByText('Spiller 9')).toBeInTheDocument();
    expect(within(own).getByText('Du')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vis alle 9 spillere' }));
    expect(boardItems()).toHaveLength(9);
    expect(screen.getByRole('button', { name: 'Vis færre' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows everyone and no toggle with six players or fewer', () => {
    render(<LiveBoard {...props({}, { rows: rows(6) })} />);

    expect(boardItems()).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /Vis alle/ })).not.toBeInTheDocument();
  });

  it.each([
    [{ kind: 'hole', holeNumber: 7, href: '/games/g1/holes/7' } as const, 'Hull 7', '/games/g1/holes/7'],
    [{ kind: 'submit', href: '/games/g1/submit' } as const, 'Lever scorekort', '/games/g1/submit'],
  ])('the strip links on: %s', (strip, label, href) => {
    render(<LiveBoard {...props({ strip })} />);

    expect(screen.getByText('Din runde')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  });

  it('the strip has no button after delivery, and is gone without a strip or on public views', () => {
    const { rerender } = render(<LiveBoard {...props({ strip: { kind: 'none' } })} />);
    expect(screen.getByText('Din runde')).toBeInTheDocument();
    expect(screen.queryByTestId('board-strip-action')).not.toBeInTheDocument();

    rerender(<LiveBoard {...props({ strip: null })} />);
    expect(screen.queryByText('Din runde')).not.toBeInTheDocument();

    // Spectate/embed: no viewer, so neither a strip nor a «Du» row.
    rerender(<LiveBoard {...props({ viewerUserId: '' })} />);
    expect(screen.queryByText('Din runde')).not.toBeInTheDocument();
    expect(screen.queryByText('Du')).not.toBeInTheDocument();
  });

  it('net to par shows signed numbers and «E» under the NETTO heading', () => {
    const toPar = rows(2).map((r, i) => ({ ...r, total: i === 0 ? -2 : 0 }));
    render(<LiveBoard {...props({}, { unit: 'toPar', rows: toPar })} />);

    expect(screen.getByText('Netto')).toBeInTheDocument();
    expect(within(boardItems()[0]).getByText('−2')).toBeInTheDocument();
    expect(within(boardItems()[1]).getByText('E')).toBeInTheDocument();
  });

  it('on the live link (#2286) the plates follow the player and the pick card shows', () => {
    const { rerender } = render(<LiveBoard {...props({ viewerUserId: '', followToken: 'tok' })} />);

    expect(screen.getByTestId('follow-pick')).toBeInTheDocument();
    const links = screen.getAllByTestId('board-follow-link');
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveAttribute('href', '/spectate/tok?folg=u1');

    // Without followToken (the signed-in board, the embed): no card, no links.
    rerender(<LiveBoard {...props({ viewerUserId: '' })} />);
    expect(screen.queryByTestId('follow-pick')).not.toBeInTheDocument();
    expect(screen.queryByTestId('board-follow-link')).not.toBeInTheDocument();
  });

  it('without a reactions provider the plate is not a button', () => {
    render(<LiveBoard {...props()} />);

    expect(screen.queryByRole('button', { name: /Reaksjoner til/ })).not.toBeInTheDocument();
  });
});

// #2712, #2850 (Type B, owner 12.11): a league flight has no place, alone or
// with others, during the round too.
describe('LiveBoard — a league flight (#2712, #2850)', () => {
  const alone = (leagueFlight: boolean, count = 1) =>
    props({ viewerUserId: 'u1' }, { rows: rows(count), leagueFlight });

  it('a flight of two: no rank, no leader gold, and the strip says the score', () => {
    render(<LiveBoard {...alone(true, 2)} />);
    for (const place of screen.getAllByTestId('board-place')) {
      expect(place).not.toHaveAttribute('data-leader');
    }
    const strip = screen.getByTestId('board-strip');
    expect(strip.textContent).toContain('poeng');
    expect(strip.textContent).not.toMatch(/plass/);
  });

  it('two outside a league keep their places', () => {
    render(<LiveBoard {...alone(false, 2)} />);
    expect(screen.getByTestId('board-strip').textContent).toContain('1. plass');
  });

  it('no rank, no leader gold, and the strip says the score', () => {
    render(<LiveBoard {...alone(true)} />);
    const place = screen.getByTestId('board-place');
    expect(place).not.toHaveAttribute('data-leader');
    expect(place.textContent).not.toContain('1');
    const strip = screen.getByTestId('board-strip');
    expect(strip.textContent).toContain('20 poeng');
    expect(strip.textContent).not.toMatch(/plass/);
  });

  it('a field of one outside a league keeps its place', () => {
    render(<LiveBoard {...alone(false)} />);
    expect(screen.getByTestId('board-place')).toHaveAttribute('data-leader', 'true');
    expect(screen.getByTestId('board-strip').textContent).toContain('1. plass');
  });
});

// Type C (#2316): the team board's structure, fed ready like the solo board.
// `teamLiveBoard.test.ts` owns how the numbers are computed.
describe('LiveBoard — team board (#2316)', () => {
  const team = (n: number, overrides: Partial<TeamBoardRowData> = {}): TeamBoardRowData => ({
    teamNumber: n,
    name: `Lag ${n}`,
    rank: n,
    tied: false,
    total: 38 + n,
    holesPlayed: 11,
    movement: 0,
    recent: ['under', 'par', 'over1'],
    tones: [],
    initials: ['MH', 'JL'],
    members: 'Marte og Jonas',
    you: false,
    ...overrides,
  });

  function teamProps(overrides: Partial<TeamBoardProps> = {}, rowsOverride?: TeamBoardRowData[]): TeamBoardProps {
    return {
      kind: 'team',
      gameName: 'Firmagolfen',
      status: 'active',
      statusLabel: 'Planlagt',
      formatLine: 'Texas scramble · 4 lag à 2 · netto',
      board: {
        unit: 'net',
        displayUnit: 'net',
        holesPlayed: 11,
        firstHalf: null,
        rows: rowsOverride ?? [
          team(3, { rank: 1, total: 39 }),
          team(1, { rank: 2, total: 40, you: true, movement: 1, members: 'Deg og Marte' }),
          team(4, { rank: 3, holesPlayed: 10, total: 42 }),
          team(2, { rank: 4, total: 44 }),
        ],
      },
      strip: {
        rank: 2,
        tied: false,
        gap: 1,
        leaderName: 'Lag 3',
        inPoints: false,
        ofHoles: null,
        action: { kind: 'hole', holeNumber: 12, href: '/games/g1/holes/12' },
      },
      holeCard: null,
      backHref: '/games/g1',
      testId: 'team-leaderboard',
      ...overrides,
    };
  }

  const teamRows = () => screen.getAllByTestId('board-row');

  it('shows the header, the leader’s gold and initials, and the viewer’s team marked «Ditt lag»', () => {
    render(<LiveBoard {...teamProps()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Lagtavla' })).toBeInTheDocument();
    expect(screen.getByTestId('board-pill')).toHaveTextContent('Live · etter 11 hull');
    expect(screen.getByText('Texas scramble · 4 lag à 2 · netto')).toBeInTheDocument();

    const [first, second, third] = teamRows();
    expect(first).toHaveAttribute('data-leader', 'true');
    expect(within(first).getByTestId('team-initials')).toHaveTextContent('MHJL');
    expect(within(second).getByText('Ditt lag')).toBeInTheDocument();
    expect(within(second).getByText('Deg og Marte')).toBeInTheDocument();
    // Only the leader and the viewer's team carry the arrow and the dots.
    expect(within(second).getByTestId('board-movement')).toHaveAttribute('data-movement', '1');
    // The leader has not moved: no dash is drawn, the screen reader still hears it.
    expect(within(first).queryByTestId('board-movement')).not.toBeInTheDocument();
    expect(first.querySelector('.sr-only')?.textContent).toContain('Uendret siden forrige hull');
    expect(within(third).queryByTestId('board-dot')).not.toBeInTheDocument();
    expect(within(third).getByText('hull 10')).toBeInTheDocument();
  });

  it('has no reaction button and no link on a team row', () => {
    render(<LiveBoard {...teamProps()} />);

    expect(screen.queryByRole('button', { name: /Reaksjoner/ })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('team-leaderboard')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('reads a row out as team, place, movement, last holes, holes played and members', () => {
    render(<LiveBoard {...teamProps()} />);

    const spoken = teamRows()[1].querySelector('.sr-only')?.textContent ?? '';
    expect(spoken).toBe(
      'Lag 1. 2. plass. 40 slag netto. Opp 1 plass siden forrige hull. Siste hull: under par, par, bogey. 11 hull spilt. Dette er laget ditt. Deg og Marte',
    );
  });

  it('the strip says the place and the gap, and links to the next hole', () => {
    render(<LiveBoard {...teamProps()} />);

    expect(screen.getByText('Laget ditt')).toBeInTheDocument();
    expect(screen.getByTestId('board-strip').textContent).toContain('2. plass · 1 slag bak Lag 3');
    expect(screen.getByRole('link', { name: 'Hull 12' })).toHaveAttribute('href', '/games/g1/holes/12');
  });

  it('has no strip without one, as on spectate and embed', () => {
    render(<LiveBoard {...teamProps({ strip: null })} />);

    expect(screen.queryByTestId('board-strip')).not.toBeInTheDocument();
  });

  it('team stableford names its points, and shamble its gross', () => {
    const { rerender } = render(
      <LiveBoard {...teamProps({ board: { ...teamProps().board, unit: 'points', displayUnit: 'points' } })} />,
    );
    expect(within(teamRows()[0]).getByText('poeng')).toBeInTheDocument();

    rerender(<LiveBoard {...teamProps({ board: { ...teamProps().board, displayUnit: 'gross' } })} />);
    expect(within(teamRows()[0]).getByText('brutto')).toBeInTheDocument();
    expect(teamRows()[0].querySelector('.sr-only')?.textContent).toContain('39 slag brutto');
  });

  it('collapses past six teams to the top five plus the viewer’s own', () => {
    const many = Array.from({ length: 9 }, (_, i) => team(i + 1, { rank: i + 1, you: i === 8 }));
    render(<LiveBoard {...teamProps({}, many)} />);

    expect(teamRows()).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Vis alle 9 lag' }));
    expect(teamRows()).toHaveLength(9);
  });

  it('best ball’s first half draws every hole, hides the rest and locks the back nine', () => {
    const tones = ['par', 'under', 'par', 'over1', 'par', 'par', 'unset', 'unset', 'unset'] as const;
    render(
      <LiveBoard
        {...teamProps(
          {
            board: {
              unit: 'net',
              displayUnit: 'net',
              holesPlayed: 6,
              rows: [team(1, { holesPlayed: 6, tones: [...tones], recent: [], movement: null })],
              firstHalf: { holes: 9, shown: { from: 1, to: 9 }, hidden: { from: 10, to: 18 }, last: 18 },
            },
          },
          undefined,
        )}
      />,
    );

    expect(screen.getByText('Hull 1–9')).toBeInTheDocument();
    expect(screen.getByText('Hull 10–18 er skjult')).toBeInTheDocument();
    const row = teamRows()[0];
    expect(within(row).getAllByTestId('board-dot')).toHaveLength(9);
    expect(within(row).getByText('6 av 9')).toBeInTheDocument();
    expect(within(row).getByTestId('board-hidden-holes')).toBeInTheDocument();
    expect(screen.getByTestId('team-lock-card')).toHaveTextContent('Vi sees ved hull 18');
  });
});
