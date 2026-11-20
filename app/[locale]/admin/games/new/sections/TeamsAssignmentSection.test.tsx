import { describe, it, expect } from 'vitest';
import { useEffect } from 'react';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { TeamsAssignmentSection, teamsAssignmentParts } from './TeamsAssignmentSection';
import { useGameFormState, type GameFormState } from '../useGameFormState';
import type { CourseOption, PlayerOption } from '../GameForm';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { TeamSize } from '../TeamSizeSelector';

// Type B render-test (#2148): the team grid grows with the selected players,
// up to the player cap, instead of stopping at four teams.

const COURSES: CourseOption[] = [
  {
    id: 'course-a',
    name: 'Bane A',
    tee_boxes: [
      { id: 'tee-a1', name: 'Gul', has_mens: true, has_ladies: true, has_juniors: true },
    ],
  },
];

const PLAYERS: PlayerOption[] = Array.from({ length: 40 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Spiller ${i + 1}`,
  nickname: null,
  hcp_index: 18,
  email: `p${i + 1}@example.test`,
  pending: false,
  gender: null,
  level: 'normal',
}));

let latest: GameFormState;

function Harness({ onState }: { onState: (state: GameFormState) => void }) {
  const state = useGameFormState({ players: PLAYERS, courses: COURSES });
  useEffect(() => onState(state));
  return <TeamsAssignmentSection state={state} players={PLAYERS} hideNumbering />;
}

function setup(mode: GameMode, teamSize: TeamSize, count: number) {
  render(
    <Harness
      onState={(state) => {
        latest = state;
      }}
    />,
  );
  act(() => latest.handleModeChange(mode));
  act(() => latest.handleTeamSizeChange(teamSize));
  act(() => {
    for (let i = 0; i < count; i++) latest.togglePlayer(`p${i + 1}`);
  });
}

describe('TeamsAssignmentSection — rutenettet vokser med valgte spillere (#2148)', () => {
  it('Texas à 2 med 10 valgte viser fem lagkort', () => {
    setup('texas_scramble', 2, 10);
    expect(screen.getByText('Lag 5')).toBeInTheDocument();
    expect(screen.queryByText('Lag 6')).toBeNull();
  });

  it('Texas à 4 med 40 valgte viser ti lagkort, og teksten sier ti lag', () => {
    setup('texas_scramble', 4, 40);
    expect(screen.getByText('Lag 10')).toBeInTheDocument();
    expect(screen.queryByText('Lag 11')).toBeNull();
    expect(screen.getByText(/Inntil 10 lag à 4 spillere/)).toBeInTheDocument();
  });

  it('best ball med 12 spillere trukket: seks par, flight-valg til og med 3', () => {
    setup('best_ball', 2, 12);
    act(() => latest.drawRandomTeams());
    expect(screen.getAllByText('Lag 6').length).toBeGreaterThan(0);
    expect(screen.queryByText('Lag 7')).toBeNull();
    const flightSelects = screen
      .getAllByRole('combobox')
      .filter((el) => within(el).queryByText('Flight 1') !== null);
    expect(flightSelects).toHaveLength(12);
    for (const select of flightSelects) {
      expect(within(select).getByText('Flight 3')).toBeInTheDocument();
      expect(within(select).queryByText('Flight 4')).toBeNull();
    }
    // Standard-flight følger to par per flight: lag 5 og 6 står i flight 3.
    expect(flightSelects.map((el) => (el as HTMLSelectElement).value).sort()).toEqual([
      '1', '1', '1', '1', '2', '2', '2', '2', '3', '3', '3', '3',
    ]);

    // #2210: the creator edit page may not see every rostered player (users
    // RLS). A selected id missing from `players` must not crash the flight
    // picker; its row is skipped.
    const { container } = render(
      <TeamsAssignmentSection
        state={latest}
        players={PLAYERS.filter((p) => p.id !== 'p1')}
        hideNumbering
      />,
    );
    const partialFlightSelects = within(container)
      .getAllByRole('combobox')
      .filter((el) => within(el).queryByText('Flight 1') !== null);
    expect(partialFlightSelects).toHaveLength(11);
  });

  it('13 lag à 3 trukket, så byttet til à 4: alle 13 lagkort står, ingen spillere skjules', () => {
    setup('shamble', 3, 39);
    act(() => latest.drawRandomTeams());
    act(() => latest.handleTeamSizeChange(4));
    expect(screen.getByTestId('team-card-13')).toBeInTheDocument();
    expect(screen.queryByTestId('team-card-14')).toBeNull();
  });
});

// Type A (#2437): the publish guard checks every selected player's category in
// every format, so the M/D/J list must render wherever players are picked.
// Best ball carries the toggle in its flights part instead.
describe('TeamsAssignmentSection — lag-matchplay har sider (#2436)', () => {
  it('fourball med fire valgte har overskriften Sider, ikke Lag', () => {
    setup('fourball_matchplay', 2, 4);
    expect(screen.getByRole('heading', { name: 'Sider' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Lag' })).not.toBeInTheDocument();
  });
});

describe('teamsAssignmentParts — tee per spiller (#2437)', () => {
  function partsFor(mode: GameMode, pick: number) {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => result.current.handleModeChange(mode));
    act(() => {
      for (let i = 0; i < pick; i++) result.current.togglePlayer(`p${i + 1}`);
    });
    return teamsAssignmentParts(result.current);
  }

  it.each([
    'wolf',
    'nassau',
    'skins',
    'bingo_bango_bongo',
    'nines',
    'round_robin',
    'acey_deucey',
    'stableford',
    'solo_strokeplay',
  ] as const)('%s med én valgt spiller viser tee per spiller', (mode) => {
    expect(partsFor(mode, 1).tee).toBe(true);
  });

  it('best ball har velgeren i flights-delen, ikke i tee-lista', () => {
    expect(partsFor('best_ball', 1).tee).toBe(false);
  });

  it('ingen valgte spillere gir ingen tee-liste', () => {
    expect(partsFor('skins', 0).tee).toBe(false);
  });
});

// Type B (#2456): teams and sides are filled by tapping — the player first, then
// the team. A tile is a button named after the player (`aria-pressed`); a team
// with room gets one «Flytt <navn> til lag N» button.
describe('TeamsAssignmentSection — lagene fordeles med trykk (#2456)', () => {
  const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
  const pressedState = (name: string) =>
    screen.getByRole('button', { name }).getAttribute('aria-pressed');
  const cardOf = (team: number) => within(screen.getByTestId(`team-card-${team}`));

  /** Eight players on four full pairs: p1+p2 lag 1, p3+p4 lag 2, … */
  function fullBestBall() {
    setup('best_ball', 2, 8);
    act(() => {
      for (let i = 0; i < 8; i++) {
        latest.assignPlayerToSlot(Math.floor(i / 2) + 1, i % 2, `p${i + 1}`);
      }
    });
  }

  it('lag- og side-delen har ingen nedtrekkslister', () => {
    setup('best_ball', 2, 4);
    expect(screen.queryByTestId('team-card-1')?.querySelector('select')).toBeNull();
    expect(screen.getByTestId('team-card-1')).toBeInTheDocument();
  });

  it('«Uten lag» viser alle valgte uten lag og forsvinner når alle har lag', () => {
    setup('best_ball', 2, 4);
    expect(screen.getByText('Uten lag')).toBeInTheDocument();
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByRole('button', { name: `Spiller ${n}` })).toBeInTheDocument();
    }
    act(() => latest.drawRandomTeams());
    expect(screen.queryByText('Uten lag')).toBeNull();
  });

  it('trykk på en spiller, så på laget, flytter spilleren dit', () => {
    setup('best_ball', 2, 4);
    tap('Spiller 1');
    expect(pressedState('Spiller 1')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Flytt Spiller 1 til lag 2' }));
    expect(latest.teamByPlayer.p1).toBe(2);
    expect(latest.flightByPlayer.p1).toBe(latest.teamDefaultFlight(2));
    // Ingen er valgt etterpå, og spilleren står på laget.
    expect(pressedState('Spiller 1')).toBe('false');
    expect(cardOf(2).getByRole('button', { name: 'Spiller 1' })).toBeInTheDocument();
  });

  it('flight vises på lagkortet for best ball', () => {
    setup('best_ball', 2, 8);
    expect(cardOf(1).getByText('Flight 1')).toBeInTheDocument();
    expect(cardOf(3).getByText('Flight 2')).toBeInTheDocument();
  });

  it('fullt lag og spillerens eget lag får ingen «Flytt hit»', () => {
    setup('best_ball', 2, 8);
    act(() => {
      latest.assignPlayerToSlot(1, 0, 'p1');
      latest.assignPlayerToSlot(2, 0, 'p2');
      latest.assignPlayerToSlot(2, 1, 'p3');
    });
    tap('Spiller 1');
    // Eget lag (1) og fullt lag (2): ingen. Lag 3 og 4 er tomme: «Flytt hit».
    expect(screen.queryByRole('button', { name: 'Flytt Spiller 1 til lag 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Flytt Spiller 1 til lag 2' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Flytt Spiller 1 til lag 3' })).toBeInTheDocument();
    expect(screen.getByTestId('team-card-2').className).not.toContain('border-dashed');
    expect(screen.getByTestId('team-card-3').className).toContain('border-dashed');
  });

  it('åtte spillere på fire fulle lag: trykk på to spillere bytter dem, og flighten følger laget', () => {
    fullBestBall();
    expect(screen.queryByText('Uten lag')).toBeNull();
    tap('Spiller 1');
    // Ingen «Flytt hit»: alle lag er fulle. Spillerne på andre lag er byttemål.
    expect(screen.queryByText('Flytt hit')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Bytt Spiller 1 med Spiller 2' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bytt Spiller 1 med Spiller 6' }));
    expect(latest.teamByPlayer.p1).toBe(3);
    expect(latest.teamByPlayer.p6).toBe(1);
    expect(latest.flightByPlayer.p1).toBe(2);
    expect(latest.flightByPlayer.p6).toBe(1);
    expect(cardOf(3).getByRole('button', { name: 'Spiller 1' })).toBeInTheDocument();
    expect(cardOf(1).getByRole('button', { name: 'Spiller 6' })).toBeInTheDocument();
  });

  it('et trykk på en spiller på et annet lag bytter alltid, også når det er plass', () => {
    setup('best_ball', 2, 4);
    act(() => {
      latest.assignPlayerToSlot(1, 0, 'p1');
      latest.assignPlayerToSlot(2, 0, 'p2');
    });
    tap('Spiller 1');
    expect(screen.getByRole('button', { name: 'Flytt Spiller 1 til lag 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bytt Spiller 1 med Spiller 2' }));
    expect(latest.teamByPlayer.p1).toBe(2);
    expect(latest.teamByPlayer.p2).toBe(1);
  });

  it('trykk på valgt spiller, «Avbryt» og Esc slipper valget', () => {
    setup('best_ball', 2, 4);
    tap('Spiller 1');
    expect(screen.getByRole('status')).toHaveTextContent('Spiller 1 er valgt.');
    tap('Spiller 1');
    expect(pressedState('Spiller 1')).toBe('false');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    tap('Spiller 1');
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }));
    expect(pressedState('Spiller 1')).toBe('false');

    tap('Spiller 1');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(pressedState('Spiller 1')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Avbryt' })).toBeNull();
  });

  it('trykk på en annen spiller uten lag eller på samme lag velger den i stedet', () => {
    setup('best_ball', 2, 4);
    act(() => {
      latest.assignPlayerToSlot(1, 0, 'p1');
      latest.assignPlayerToSlot(1, 1, 'p2');
    });
    tap('Spiller 1');
    tap('Spiller 2');
    expect(pressedState('Spiller 2')).toBe('true');
    expect(screen.getByRole('button', { name: 'Spiller 1' })).toHaveAttribute('aria-pressed', 'false');
    tap('Spiller 3');
    expect(pressedState('Spiller 3')).toBe('true');
    expect(latest.teamByPlayer.p2).toBe(1);
  });

  it('«Trekk tilfeldig» og «Tøm lag» virker som før', () => {
    setup('best_ball', 2, 4);
    const draw = screen.getByTestId('draw-random-teams');
    expect(draw).not.toHaveAttribute('aria-pressed');
    fireEvent.click(draw);
    expect(Object.keys(latest.teamByPlayer)).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Tøm lag' }));
    expect(latest.teamByPlayer).toEqual({});
    expect(screen.getByText('Uten lag')).toBeInTheDocument();
  });

  it('singles matchplay: «Uten side», flytt og bytte med to trykk', () => {
    setup('singles_matchplay', 2, 2);
    expect(screen.getByText('Uten side')).toBeInTheDocument();
    expect(screen.queryByText('Uten lag')).toBeNull();
    tap('Spiller 1');
    expect(screen.getByRole('status')).toHaveTextContent('Trykk på siden Spiller 1 skal til.');
    fireEvent.click(screen.getByRole('button', { name: 'Flytt Spiller 1 til side 1' }));
    tap('Spiller 2');
    fireEvent.click(screen.getByRole('button', { name: 'Flytt Spiller 2 til side 2' }));
    expect(screen.queryByText('Uten side')).toBeNull();
    expect(latest.teamByPlayer).toEqual({ p1: 1, p2: 2 });

    tap('Spiller 1');
    fireEvent.click(screen.getByRole('button', { name: 'Bytt Spiller 1 med Spiller 2' }));
    expect(latest.teamByPlayer).toEqual({ p1: 2, p2: 1 });
  });

  it('stripa ber om en spiller å bytte med når ingen lag kan ta imot, ellers om laget', () => {
    fullBestBall();
    tap('Spiller 1');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Spiller 1 er valgt. Trykk på spilleren Spiller 1 skal bytte med.',
    );
    expect(screen.getByRole('status')).not.toHaveTextContent('Trykk på laget');
    fireEvent.keyDown(document, { key: 'Escape' });

    // Én plass blir ledig: lag 1 kan ta imot en spiller fra et annet lag.
    act(() => latest.assignPlayerToSlot(1, 1, ''));
    tap('Spiller 3');
    expect(screen.getByRole('status')).toHaveTextContent('Trykk på laget Spiller 3 skal til.');
  });

  it('stripa ber om bytte også for en spiller uten side når begge sidene er fylt', () => {
    setup('singles_matchplay', 2, 3);
    tap('Spiller 1');
    fireEvent.click(screen.getByRole('button', { name: 'Flytt Spiller 1 til side 1' }));
    tap('Spiller 2');
    fireEvent.click(screen.getByRole('button', { name: 'Flytt Spiller 2 til side 2' }));
    tap('Spiller 3');
    expect(screen.getByRole('status')).toHaveTextContent('Trykk på spilleren Spiller 3 skal bytte med.');
    fireEvent.click(screen.getByRole('button', { name: 'Bytt Spiller 3 med Spiller 1' }));
    expect(latest.teamByPlayer).toEqual({ p2: 2, p3: 1 });
  });

  it('singles matchplay med begge sider fylt: stripa ber om å bytte', () => {
    setup('singles_matchplay', 2, 2);
    tap('Spiller 1');
    fireEvent.click(screen.getByRole('button', { name: 'Flytt Spiller 1 til side 1' }));
    tap('Spiller 2');
    fireEvent.click(screen.getByRole('button', { name: 'Flytt Spiller 2 til side 2' }));
    tap('Spiller 1');
    expect(screen.getByRole('status')).toHaveTextContent('Trykk på spilleren Spiller 1 skal bytte med.');
  });

  it('lag-matchplay: sidekortene virker som lagkortene', () => {
    setup('fourball_matchplay', 2, 4);
    expect(screen.getByText('Uten side')).toBeInTheDocument();
    tap('Spiller 1');
    fireEvent.click(screen.getByRole('button', { name: 'Flytt Spiller 1 til side 2' }));
    expect(latest.teamByPlayer.p1).toBe(2);
    expect(screen.queryByText(/Flight/)).toBeNull();
  });

  it('scramble à 3: ett «Flytt hit» per kort med plass, og spilleren havner på laget', () => {
    setup('texas_scramble', 3, 6);
    tap('Spiller 1');
    fireEvent.click(screen.getByRole('button', { name: 'Flytt Spiller 1 til lag 1' }));
    tap('Spiller 2');
    expect(screen.getAllByText('Flytt hit')).toHaveLength(1 + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Flytt Spiller 2 til lag 1' }));
    expect(latest.playersByTeam[1]).toEqual(['p1', 'p2']);
  });
});

// Type B (#2456): a tile and the strip name a player by first name, and by full
// name only where two picked players share one (#2286).
describe('TeamsAssignmentSection — fornavn på brikkene (#2456)', () => {
  const NAMED: PlayerOption[] = [
    ['n1', 'Marte Lien'],
    ['n2', 'Jonas Berg'],
    ['n3', 'Jonas Rud'],
    ['n4', 'Eirik Dal'],
  ].map(([id, name]) => ({
    id,
    name,
    nickname: null,
    hcp_index: 18,
    email: `${id}@example.test`,
    pending: false,
    gender: null,
    level: 'normal' as const,
  }));

  function NamedHarness() {
    const state = useGameFormState({ players: NAMED, courses: COURSES });
    useEffect(() => {
      latest = state;
    });
    return <TeamsAssignmentSection state={state} players={NAMED} hideNumbering />;
  }

  it('fornavn der det er entydig, fullt navn der to deler fornavn; aria-navnet er alltid fullt', () => {
    render(<NamedHarness />);
    act(() => latest.handleModeChange('best_ball'));
    act(() => {
      for (const p of NAMED) latest.togglePlayer(p.id);
    });
    const marte = screen.getByRole('button', { name: 'Marte Lien' });
    expect(marte).toHaveTextContent('Marte');
    expect(marte).not.toHaveTextContent('Lien');
    expect(screen.getByRole('button', { name: 'Jonas Berg' })).toHaveTextContent('Jonas Berg');
    expect(screen.getByRole('button', { name: 'Jonas Rud' })).toHaveTextContent('Jonas Rud');

    fireEvent.click(marte);
    expect(screen.getByRole('status')).toHaveTextContent('Marte er valgt.');
    expect(
      screen.getByRole('button', { name: 'Flytt Marte Lien til lag 1' }),
    ).toBeInTheDocument();
  });
});

// Type B (#2478): «Jevne lag» deals the players by handicap index, the cards
// show each player's index and the team's sum (or average when the teams differ
// in size), and a line under the buttons says how far apart the teams are.
describe('TeamsAssignmentSection — «Jevne lag» (#2478)', () => {
  // The artboard's eight (`Nyttspill-forslag-jevne-lag-lys`), then eleven more
  // for the 4/4/3 case, and two invitees without a finished profile.
  const ARTBOARD: [string, string, number][] = [
    ['ida', 'Ida Moen', 4.2],
    ['jonas', 'Jonas Berg', 9.4],
    ['sondre', 'Sondre Aas', 12.1],
    ['kari', 'Kari Lund', 15.8],
    ['marte', 'Marte Lien', 18.4],
    ['eirik', 'Eirik Dahl', 21.0],
    ['tone', 'Tone Vik', 24.3],
    ['anders', 'Anders Moe', 26.0],
  ];
  const HCP_PLAYERS: PlayerOption[] = [
    ...ARTBOARD.map(([id, name, hcp]) => ({ id, name, hcp }) as const),
    ...Array.from({ length: 11 }, (_, i) => ({ id: `e${i + 1}`, name: `Elleve ${i + 1}`, hcp: 2 * (i + 1) })),
  ].map(({ id, name, hcp }) => ({
    id,
    name,
    nickname: null,
    hcp_index: hcp,
    email: `${id}@example.test`,
    pending: false,
    gender: null,
    level: 'normal' as const,
  }));
  const PENDING: PlayerOption = {
    id: 'ventende',
    name: null,
    nickname: null,
    hcp_index: 54,
    email: 'ventende@example.test',
    pending: true,
    gender: null,
    level: 'normal',
  };
  const ALL = [...HCP_PLAYERS, PENDING];

  function BalanceHarness() {
    const state = useGameFormState({ players: ALL, courses: COURSES });
    useEffect(() => {
      latest = state;
    });
    return <TeamsAssignmentSection state={state} players={ALL} hideNumbering />;
  }

  function setupWith(mode: GameMode, teamSize: TeamSize, ids: string[]) {
    render(<BalanceHarness />);
    act(() => latest.handleModeChange(mode));
    act(() => latest.handleTeamSizeChange(teamSize));
    act(() => {
      for (const id of ids) latest.togglePlayer(id);
    });
  }

  const artboardIds = ARTBOARD.map(([id]) => id);
  const elevenIds = Array.from({ length: 11 }, (_, i) => `e${i + 1}`);
  const balanceButton = () => screen.queryByRole('button', { name: 'Jevne lag' });
  const line = () => screen.getByTestId('balance-line');
  const cardOf = (team: number) => screen.getByTestId(`team-card-${team}`);

  it.each([
    ['best_ball', 2, 4],
    ['stableford', 2, 4],
    ['texas_scramble', 2, 4],
    ['ambrose', 2, 4],
    ['florida_scramble', 3, 6],
    ['shamble', 3, 6],
    ['patsome', 2, 4],
    ['fourball_matchplay', 2, 4],
  ] as const)('%s har «Jevne lag» først i knapperekka', (mode, teamSize, count) => {
    setupWith(mode, teamSize, artboardIds.slice(0, count));
    const button = balanceButton();
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(button?.parentElement?.firstElementChild).toBe(button);
  });

  it('singles matchplay har ikke «Jevne lag»', () => {
    setupWith('singles_matchplay', 2, artboardIds.slice(0, 2));
    expect(balanceButton()).toBeNull();
  });

  it.each([
    ['patsome', 4],
    ['fourball_matchplay', 4],
  ] as const)('%s har «Jevne lag», men ingen «Trekk tilfeldig»', (mode, count) => {
    setupWith(mode, 2, artboardIds.slice(0, count));
    expect(balanceButton()).toBeEnabled();
    expect(screen.queryByTestId('draw-random-teams')).toBeNull();
    // «Tøm lag» first shows once someone has a team.
    expect(screen.queryByRole('button', { name: 'Tøm lag' })).toBeNull();
    fireEvent.click(balanceButton()!);
    expect(screen.getByRole('button', { name: 'Tøm lag' })).toBeInTheDocument();
  });

  it('tegningens åtte i best ball: lagene, «Sum HCP» per kort og forskjellen 4,0', () => {
    setupWith('best_ball', 2, artboardIds);
    expect(line()).toBeEmptyDOMElement();
    fireEvent.click(balanceButton()!);
    expect(latest.teamByPlayer).toEqual({
      ida: 1, anders: 1, jonas: 2, tone: 2, sondre: 3, eirik: 3, kari: 4, marte: 4,
    });
    expect(within(cardOf(1)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP30,2');
    expect(within(cardOf(2)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP33,7');
    expect(within(cardOf(3)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP33,1');
    expect(within(cardOf(4)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP34,2');
    // Each tile carries the player's index.
    expect(within(cardOf(1)).getByRole('button', { name: 'Ida Moen' })).toHaveTextContent('4,2');
    expect(line()).toHaveTextContent(
      'Den beste spiller med den svakeste, og så videre. Det skiller 4,0 i samlet handicap mellom sterkeste og svakeste lag.',
    );
    expect(line()).toHaveAttribute('aria-live', 'polite');

    // Another press gives the same teams.
    fireEvent.click(balanceButton()!);
    expect(within(cardOf(1)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP30,2');
  });

  it('et bytte endrer tallene, og forklaringen forsvinner', () => {
    setupWith('best_ball', 2, artboardIds);
    fireEvent.click(balanceButton()!);
    // Ida (lag 1) bytter med Jonas (lag 2): 9,4 + 26,0 = 35,4 og 4,2 + 24,3 = 28,5.
    fireEvent.click(screen.getByRole('button', { name: 'Ida Moen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bytt Ida Moen med Jonas Berg' }));
    expect(within(cardOf(1)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP35,4');
    expect(line()).toHaveTextContent(
      'Det skiller 6,9 i samlet handicap mellom sterkeste og svakeste lag.',
    );
    expect(line()).not.toHaveTextContent('Den beste spiller');
  });

  it('11 à 4 i Texas: lagene blir 4/4/3, kortene viser snitt og linja snitthandicap', () => {
    setupWith('texas_scramble', 4, elevenIds);
    fireEvent.click(balanceButton()!);
    expect([1, 2, 3].map((t) => latest.playersByTeam[t].length)).toEqual([4, 4, 3]);
    expect(within(cardOf(1)).getByTestId('team-hcp')).toHaveTextContent('Snitt HCP12,5');
    expect(within(cardOf(2)).getByTestId('team-hcp')).toHaveTextContent('Snitt HCP12,5');
    expect(within(cardOf(3)).getByTestId('team-hcp')).toHaveTextContent('Snitt HCP10,7');
    expect(line()).toHaveTextContent(
      'Den beste spiller med den svakeste, og så videre. Det skiller 1,8 i snitthandicap mellom sterkeste og svakeste lag.',
    );
  });

  it('fourball: beste og svakeste på side 1, og linja sier «mellom sidene»', () => {
    setupWith('fourball_matchplay', 2, ['ida', 'jonas', 'sondre', 'anders']);
    fireEvent.click(balanceButton()!);
    expect(latest.teamByPlayer).toEqual({ ida: 1, anders: 1, jonas: 2, sondre: 2 });
    expect(within(cardOf(1)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP30,2');
    expect(within(cardOf(2)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP21,5');
    expect(line()).toHaveTextContent(
      'Den beste og den svakeste spiller på samme side. Det skiller 8,7 i samlet handicap mellom sidene.',
    );
  });

  it('patsome med seks: tre lag etter slangen', () => {
    setupWith('patsome', 2, artboardIds.slice(0, 6));
    fireEvent.click(balanceButton()!);
    expect(latest.teamByPlayer).toEqual({
      ida: 1, eirik: 1, jonas: 2, marte: 2, sondre: 3, kari: 3,
    });
    expect(within(cardOf(3)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP27,9');
  });

  it('en invitert uten fullført profil viser «–», fordeles til slutt og regnes ikke med', () => {
    setupWith('fourball_matchplay', 2, ['ida', 'jonas', 'sondre', 'ventende']);
    fireEvent.click(balanceButton()!);
    // 4,2 → side 1, 9,4 og 12,1 → side 2; den ventende tar plassen på side 1.
    expect(latest.teamByPlayer).toEqual({ ida: 1, ventende: 1, jonas: 2, sondre: 2 });
    expect(within(cardOf(1)).getByRole('button', { name: 'ventende@example.test' })).toHaveTextContent('–');
    // Orchestrator's choice after review: a side with a player without an index
    // has no sum, so there is nothing to compare and no explanation either.
    expect(within(cardOf(1)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP–');
    expect(within(cardOf(2)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP21,5');
    expect(line()).toHaveTextContent(
      /^1 spiller er ikke regnet med fordi profilen ikke er fullført\.$/,
    );
  });

  it('best ball med 8 der én venter: forskjellen regnes mellom de tre fullt regnede lagene', () => {
    setupWith('best_ball', 2, [...artboardIds.filter((id) => id !== 'anders'), 'ventende']);
    fireEvent.click(balanceButton()!);
    expect(latest.teamByPlayer).toEqual({
      ida: 1, ventende: 1, jonas: 2, tone: 2, sondre: 3, eirik: 3, kari: 4, marte: 4,
    });
    expect(within(cardOf(1)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP–');
    expect(within(cardOf(2)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP33,7');
    // 34,2 − 33,1 among teams 2–4; no explanation while someone is not counted.
    expect(line()).toHaveTextContent(
      /^Det skiller 1,1 i samlet handicap mellom sterkeste og svakeste lag\. 1 spiller er ikke regnet med fordi profilen ikke er fullført\.$/,
    );
  });

  it('kortene viser tallene også etter «Trekk tilfeldig» og flytt med trykk', () => {
    setupWith('best_ball', 2, artboardIds.slice(0, 4));
    fireEvent.click(screen.getByTestId('draw-random-teams'));
    for (const team of [1, 2]) {
      expect(within(cardOf(team)).getByTestId('team-hcp')).toHaveTextContent(/^Sum HCP\d+,\d$/);
    }
    // «Uten lag»-brikkene viser ikke indeksen.
    fireEvent.click(screen.getByRole('button', { name: 'Tøm lag' }));
    expect(screen.getByRole('button', { name: 'Ida Moen' })).not.toHaveTextContent('4,2');
    fireEvent.click(screen.getByRole('button', { name: 'Ida Moen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Flytt Ida Moen til lag 2' }));
    expect(within(cardOf(2)).getByTestId('team-hcp')).toHaveTextContent('Sum HCP4,2');
    expect(within(cardOf(1)).queryByTestId('team-hcp')).toBeNull();
    // Bare ett lag har spillere: ingen linje.
    expect(line()).toBeEmptyDOMElement();
  });

  it.each([
    ['patsome', 5],
    ['fourball_matchplay', 3],
  ] as const)('%s med %i spillere: knappen er av', (mode, count) => {
    setupWith(mode, 2, artboardIds.slice(0, count));
    expect(balanceButton()).toBeDisabled();
  });
});
