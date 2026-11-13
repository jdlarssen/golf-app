import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  NassauView,
  type NassauPlayerInfo,
  type NassauViewProps,
} from './NassauView';
import { AFTER_13, fours, nassauResult } from '@/lib/leaderboard/__fixtures__/nassauResult';

const PLAYERS = new Map<string, NassauPlayerInfo>([
  ['meg', { name: 'Sigrid Aas', nickname: null }],
  ['marte', { name: 'Marte Lie', nickname: null }],
  ['jonas', { name: 'Jonas Berg', nickname: 'Jonken' }],
  ['kari', { name: 'Kari Holm', nickname: null }],
]);

function props(overrides: Partial<NassauViewProps> = {}): NassauViewProps {
  return {
    gameId: 'g1',
    gameName: 'Lørdagsrunden',
    result: nassauResult(AFTER_13),
    playersById: PLAYERS,
    scoreVisibility: 'live',
    gameStatus: 'active',
    holesPlayed: 13,
    backHref: '/games/g1',
    ...overrides,
  };
}

const card = (key: string) => screen.getByTestId(`nassau-card-${key}`);

describe('NassauView — three matches as three cards (#2327)', () => {
  it('shows a card per match and opens the list of the match being played', () => {
    render(<NassauView {...props({ viewerUserId: 'meg' })} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Tre kamper i én' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist', { name: 'Tre kamper' })).getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(card('front9')).toHaveTextContent('Avgjort');
    expect(card('back9')).toHaveTextContent('av 9 hull');
    expect(card('total18')).toHaveTextContent('av 18 hull');

    // Back 9 is under way, so its card is selected and its list is the one shown.
    expect(card('back9')).toHaveAttribute('aria-selected', 'true');
    expect(card('front9')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toContainElement(screen.getByTestId('nassau-section-back9'));
    expect(screen.queryByTestId('nassau-section-front9')).toBeNull();
    expect(screen.getByText('Trykk på en kamp for å se hele lista')).toBeInTheDocument();
  });

  it('switches the list by tap and by arrow key', () => {
    render(<NassauView {...props()} />);

    fireEvent.click(card('front9'));
    expect(card('front9')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('nassau-section-front9')).toBeInTheDocument();
    expect(screen.queryByTestId('nassau-section-back9')).toBeNull();

    fireEvent.keyDown(card('front9'), { key: 'ArrowRight' });
    expect(card('back9')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('nassau-section-back9')).toBeInTheDocument();
  });

  it('gives gold only to the winner of a decided match', () => {
    render(<NassauView {...props()} />);

    // Front 9 is decided: its winner has the medal on the card and the gold row.
    expect(card('front9').querySelector('svg')).not.toBeNull();
    // Back 9 and the total are under way: a leader, no medal, no gold row.
    expect(card('back9').querySelector('svg')).toBeNull();
    expect(card('total18').querySelector('svg')).toBeNull();
    const back9 = screen.getByTestId('nassau-section-back9');
    expect(within(back9).getAllByRole('listitem').some((li) => li.dataset.winner)).toBe(false);
    expect(back9.querySelector('svg')).toBeNull();

    fireEvent.click(card('front9'));
    const front9 = screen.getByTestId('nassau-section-front9');
    expect(within(front9).getAllByRole('listitem').filter((li) => li.dataset.winner)).toHaveLength(1);
  });

  it('a match is decided only when every player has finished it', () => {
    // Everyone but kari has finished the front 9: the engine has a winner,
    // the card still says the match is under way and shows no medal.
    const result = nassauResult({ ...AFTER_13, kari: [5, 4, 5, 4, 4, 4, 4] });
    render(<NassauView {...props({ result })} />);
    expect(card('front9')).not.toHaveTextContent('Avgjort');
    expect(card('front9').querySelector('svg')).toBeNull();
  });

  it('shows the viewer’s line only to a player', () => {
    const { unmount } = render(<NassauView {...props({ viewerUserId: 'meg' })} />);
    expect(card('front9')).toHaveTextContent(/Du er nummer 3, \d+ slag bak/);
    expect(card('back9')).toHaveTextContent(/Du leder/);
    // The viewer's own row is marked and named «Deg».
    const mine = screen.getByTestId('nassau-row-meg');
    expect(mine.dataset.viewer).toBe('true');
    expect(mine).toHaveTextContent('Deg');
    unmount();

    render(<NassauView {...props({ viewerUserId: null })} />);
    for (const key of ['front9', 'back9', 'total18']) {
      expect(card(key)).not.toHaveTextContent(/Du /);
    }
    expect(screen.getByTestId('nassau-row-meg')).toHaveTextContent('Sigrid Aas');
  });

  it('says when one player can take all three, and where a player can stop it', () => {
    const { unmount } = render(<NassauView {...props({ viewerUserId: 'meg' })} />);
    expect(screen.getByTestId('nassau-sweep-line')).toHaveTextContent(
      'Marte kan ta alle tre. Du kan stoppe det på back 9.',
    );
    unmount();

    // A spectator gets the first sentence only.
    const spectator = render(<NassauView {...props({ viewerUserId: null })} />);
    expect(screen.getByTestId('nassau-sweep-line')).toHaveTextContent(/^Marte kan ta alle tre\.$/);
    spectator.unmount();

    render(<NassauView {...props({ viewerUserId: 'marte' })} />);
    expect(screen.getByTestId('nassau-sweep-line')).toHaveTextContent(/^Du kan ta alle tre\.$/);
  });

  it('has no sweep line when the decided match ended tied', () => {
    const result = nassauResult({ a: fours(10), b: fours(10), c: [5, ...fours(9)] });
    render(<NassauView {...props({ result })} />);
    expect(screen.queryByTestId('nassau-sweep-line')).toBeNull();
    fireEvent.click(card('front9'));
    expect(screen.getByTestId('nassau-section-front9-push')).toBeInTheDocument();
  });

  it('a finished game opens on the total, with the title as h2 under the podium', () => {
    const result = nassauResult({ meg: fours(18), marte: [3, ...fours(17)], jonas: fours(18) });
    render(
      <NassauView {...props({ result, gameStatus: 'finished', holesPlayed: 18, chromeless: true })} />,
    );
    expect(card('total18')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Tre kamper i én' })).toBeInTheDocument();
    expect(screen.queryByTestId('nassau-sweep-line')).toBeNull();
  });

  it('keeps the waiting room in a reveal game mid-round', () => {
    render(<NassauView {...props({ scoreVisibility: 'reveal' })} />);
    expect(screen.getByTestId('nassau-reveal-hidden')).toHaveTextContent(
      'Resultatene avsløres etter runden',
    );
    expect(screen.queryByTestId('nassau-sections')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('shows the waiting box for a match nobody has started', () => {
    render(<NassauView {...props({ result: nassauResult({ meg: fours(5), marte: fours(5) }) })} />);
    fireEvent.click(card('back9'));
    expect(screen.getByTestId('nassau-section-back9-pending')).toHaveTextContent(
      'Venter på spilte hull',
    );
  });

  it('#2625: a net-to-par game labels the list «mot par»', () => {
    render(<NassauView {...props({ result: nassauResult(AFTER_13, 'net_to_par') })} />);
    const back9 = screen.getByTestId('nassau-section-back9');
    expect(within(back9).getByText('mot par')).toBeInTheDocument();
    expect(within(back9).queryByText('netto slag')).toBeNull();
  });
});
