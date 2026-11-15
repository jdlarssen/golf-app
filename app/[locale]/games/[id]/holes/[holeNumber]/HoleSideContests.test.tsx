import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fake, resetServer, server } from '@/tests/sideClaimsServer';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { SideClaim } from '@/lib/games/sideClaims';
import type { HoleContest } from '@/lib/games/sideContest';

// #2283 (part D3) — Type B: which rows the hole shows, in which order, with
// which names. The cards themselves are tested in `SideContestEntry.test.tsx`
// and `GirContestEntry.test.tsx`; this is the wiring between the hole's props
// (`HoleClientProps.sideContest`) and them.
vi.mock('./sideClaimActions', () => ({
  recordSideClaim: (...args: Parameters<typeof fake.recordSideClaim>) => fake.recordSideClaim(...args),
  recordGirClaims: (...args: Parameters<typeof fake.recordGirClaims>) => fake.recordGirClaims(...args),
}));
vi.mock('@/lib/games/sideClaims', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/games/sideClaims')>()),
  readHoleClaims: (...args: Parameters<typeof fake.readHoleClaims>) => fake.readHoleClaims(...args),
}));
vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => ({ fake: 'browser-client' }) }));

import { HoleSideContests } from './HoleSideContests';
import type { HoleSideContestProps, SideContestPlayer } from './holeClientProps';

const FLIGHT: SideContestPlayer[] = [
  { userId: 'me', name: 'Ola Nordmann', shortName: 'Ola', initial: 'ON', teamNumber: 1, withdrawn: false },
  { userId: 'jonas', name: 'Jonas Berg', shortName: 'Jonas', initial: 'JB', teamNumber: 1, withdrawn: false },
  { userId: 'marte', name: 'Marte Lie', shortName: 'Marte', initial: 'ML', teamNumber: 2, withdrawn: false },
  { userId: 'tore', name: 'Tore Lunde', shortName: 'Tore', initial: 'TL', teamNumber: 2, withdrawn: false },
  { userId: 'kari', name: 'Kari Nilsen', shortName: 'Kari', initial: 'KN', teamNumber: 2, withdrawn: true },
];

const CTP: HoleContest = { category: 'closest_to_pin', source: 'cup', points: 2 };
const LD: HoleContest = { category: 'longest_drive', source: 'cup', points: 1 };
const GIR: HoleContest = { category: 'gir', source: 'cup', points: 1.5, maxPerTeam: 2 };

function sideContest(overrides: Partial<HoleSideContestProps> = {}): HoleSideContestProps {
  return {
    contests: [CTP, LD, GIR],
    canReport: true,
    // The server's snapshot: nobody has reported, so no read goes out on mount.
    claims: { failed: false, side: [], gir: [] },
    players: FLIGHT,
    // Everyone in the game: the flight, and Siri, who played in another flight.
    names: { ...Object.fromEntries(FLIGHT.map((p) => [p.userId, p.shortName])), siri: 'Siri' },
    ...overrides,
  };
}

function renderRows(props: { gameMode?: GameMode; par?: number; sideContest?: HoleSideContestProps } = {}) {
  return render(
    <HoleSideContests
      gameId="game-1"
      holeNumber={5}
      gameMode={props.gameMode ?? 'best_ball'}
      par={props.par ?? 4}
      myUserId="me"
      sideContest={props.sideContest ?? sideContest()}
    />,
  );
}

beforeEach(() => {
  resetServer();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('HoleSideContests', () => {
  it('shows a row per contest on the hole in the order closest to pin, longest drive, GIR, 8 px apart', () => {
    renderRows();
    const wrapper = screen.getByTestId('side-contests');
    expect(within(wrapper).getAllByRole('button').map((b) => b.getAttribute('data-testid'))).toEqual([
      'side-contest-closest_to_pin',
      'side-contest-longest_drive',
      'side-contest-gir',
    ]);
    // The rows' own subtitles: the cup's points before anything is reported.
    expect(screen.getByTestId('side-contest-closest_to_pin-subtitle')).toHaveTextContent('+2 p til laget');
    expect(screen.getByTestId('side-contest-longest_drive-subtitle')).toHaveTextContent('+1 p til laget');
    expect(screen.getByTestId('side-contest-gir-subtitle')).toHaveTextContent('+1,5 p per GIR');
    expect(wrapper.className).toContain('gap-2');
  });

  it('shows only the rows the hole has', () => {
    renderRows({ sideContest: sideContest({ contests: [CTP, GIR] }) });
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('data-testid'))).toEqual([
      'side-contest-closest_to_pin',
      'side-contest-gir',
    ]);
  });

  it('shows nothing when the hole has no contest', () => {
    const { container } = renderRows({ sideContest: sideContest({ contests: [] }) });
    expect(container).toBeEmptyDOMElement();
  });

  it('a game’s own side contest says «Sidekonkurranse», and opens a sheet with the flight’s names', () => {
    renderRows({
      sideContest: sideContest({
        contests: [{ category: 'longest_drive', source: 'game' }],
        claims: { failed: false, side: [], gir: undefined },
      }),
    });
    expect(screen.getByTestId('side-contest-longest_drive-subtitle')).toHaveTextContent('Sidekonkurranse');
    fireEvent.click(screen.getByTestId('side-contest-longest_drive'));
    expect(screen.getByText('Sidekonkurranse · hull 5')).toBeInTheDocument();
    // «Deg» for yourself with your own initials, full names for the rest, nobody who has withdrawn.
    const section = screen.getByRole('region', { name: 'Hvem i flighten slo lengst ut på fairway?' });
    expect(within(section).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'ONDeg',
      'JBJonas Berg',
      'MLMarte Lie',
      'TLTore Lunde',
      'Ingen på fairway',
    ]);
  });

  it('names a winner who has since withdrawn, from the name lookup', () => {
    const reported: SideClaim = {
      category: 'closest_to_pin',
      holeNumber: 5,
      winnerUserId: 'kari',
      distanceM: 2,
      enteredBy: 'kari',
      updatedAt: '2026-11-15T10:00:01Z',
    };
    renderRows({
      sideContest: sideContest({ contests: [CTP], claims: { failed: false, side: [reported], gir: undefined } }),
    });
    expect(screen.getByTestId('side-contest-closest_to_pin-subtitle')).toHaveTextContent('Kari · 2,0 m');
    fireEvent.click(screen.getByTestId('side-contest-closest_to_pin'));
    // «Lagret av Kari», and no line for her.
    expect(screen.getByTestId('side-contest-closest_to_pin-sheet-status')).toHaveTextContent(
      'Lagret av Kari. Alle i kampen kan endre.',
    );
    expect(screen.queryByTestId('side-contest-closest_to_pin-line-kari')).toBeNull();
  });

  it('names whoever saved from the whole game, also someone who is no longer in my flight (#2891)', () => {
    // Siri saved this before she moved to another flight: no line for her here, but the status names her.
    const reported: SideClaim = {
      category: 'closest_to_pin',
      holeNumber: 5,
      winnerUserId: 'siri',
      distanceM: 1.5,
      enteredBy: 'siri',
      updatedAt: '2026-11-15T10:00:01Z',
    };
    renderRows({
      sideContest: sideContest({ contests: [CTP], claims: { failed: false, side: [reported], gir: undefined } }),
    });
    expect(screen.getByTestId('side-contest-closest_to_pin-subtitle')).toHaveTextContent('Siri · 1,5 m');
    fireEvent.click(screen.getByTestId('side-contest-closest_to_pin'));
    expect(screen.getByTestId('side-contest-closest_to_pin-sheet-status')).toHaveTextContent(
      'Lagret av Siri. Alle i kampen kan endre.',
    );
    expect(screen.queryByTestId('side-contest-closest_to_pin-line-siri')).toBeNull();
  });

  it('says only «Lagret.» when the saver is not in the game at all', () => {
    const reported: SideClaim = {
      category: 'closest_to_pin',
      holeNumber: 5,
      winnerUserId: null,
      distanceM: null,
      enteredBy: 'stranger',
      updatedAt: '2026-11-15T10:00:01Z',
    };
    renderRows({
      sideContest: sideContest({ contests: [CTP], claims: { failed: false, side: [reported], gir: undefined } }),
    });
    fireEvent.click(screen.getByTestId('side-contest-closest_to_pin'));
    expect(screen.getByTestId('side-contest-closest_to_pin-sheet-status')).toHaveTextContent(/^Lagret\. Alle i kampen kan endre\.$/);
  });

  it('GIR: one line per player who is still in, and «Deg» for yourself', () => {
    renderRows({ sideContest: sideContest({ contests: [GIR] }) });
    fireEvent.click(screen.getByTestId('side-contest-gir'));
    const section = screen.getByRole('region', { name: 'Hvem var på greenen på to slag? Trykk på alle som traff.' });
    expect(within(section).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'ONDeg',
      'JBJonas Berg',
      'MLMarte Lie',
      'TLTore Lunde',
      'Ingen traff greenen',
    ]);
    expect(screen.getByTestId('side-contest-gir-sheet-status')).toHaveTextContent(
      'Svaret deles med kampen. Hvert lag får poeng for høyst 2.',
    );
  });

  it('GIR in the foursomes family: one line per side, with the sides’ short names', () => {
    renderRows({ gameMode: 'foursomes_matchplay', sideContest: sideContest({ contests: [GIR] }) });
    fireEvent.click(screen.getByTestId('side-contest-gir'));
    const section = screen.getByRole('region', { name: /Hvem var på greenen/ });
    expect(within(section).getAllByRole('button').map((b) => b.textContent)).toEqual([
      // Side 1: you and Jonas; side 2: Marte and Tore (Kari has withdrawn).
      'ONJBDeg og Jonas',
      'MLTLMarte og Tore',
      'Ingen traff greenen',
    ]);
    expect(screen.getByTestId('side-contest-gir-sheet-status')).toHaveTextContent(
      'Svaret deles med kampen. Laget spiller én ball, så det teller én gang.',
    );
  });

  it('the cup sheet carries the points in the kicker', () => {
    renderRows({ sideContest: sideContest({ contests: [CTP] }) });
    fireEvent.click(screen.getByTestId('side-contest-closest_to_pin'));
    expect(screen.getByText('Sidepoeng · hull 5 · +2 p til laget')).toBeInTheDocument();
  });

  it('a first snapshot that failed is read at once, and the row says «Fikk ikke hentet» until a read succeeds', async () => {
    server.failReads = 1;
    renderRows({ sideContest: sideContest({ contests: [CTP], claims: { failed: true, side: undefined, gir: undefined } }) });
    await act(async () => undefined);
    expect(fake.readHoleClaims).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('side-contest-closest_to_pin-subtitle')).toHaveTextContent('Fikk ikke hentet. Prøver igjen.');
  });

  it('offline the rows are locked', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    renderRows({ sideContest: sideContest({ contests: [CTP, GIR] }) });
    expect(screen.getByTestId('side-contest-closest_to_pin')).toBeDisabled();
    expect(screen.getByTestId('side-contest-gir')).toBeDisabled();
    expect(screen.getByTestId('side-contest-gir-subtitle')).toHaveTextContent('Uten nett. Meld inn senere.');
  });
});
