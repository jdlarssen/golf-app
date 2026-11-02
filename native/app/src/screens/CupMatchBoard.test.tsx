// #2752: tavla til en ferdig kamp (Type C). Selve tavla er testet i `Leaderboard`; her
// låses overskriften, hva som går videre til tavla, og feilene.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { render, screen } from '@testing-library/react-native';
import { fetchCupMatchBoard } from '../data/cupBoard';
import type { ScreenProps } from '../navigation';
import { CupMatchBoard } from './CupMatchBoard';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/cupBoard', () => ({ fetchCupMatchBoard: jest.fn() }));
jest.mock('../session', () => ({ useSession: () => ({ userId: 'meg' }) }));
jest.mock('../lib/soloBoard', () => ({ hasSoloBoard: () => false, soloBoardFor: () => null }));
jest.mock('../lib/teamBoard', () => ({ hasTeamBoard: () => false, teamBoardFor: () => null }));
jest.mock('../lib/roster', () => ({ toRoster: () => [] }));
jest.mock('../lib/teamPlay', () => ({ foldLocalScores: (scores: unknown) => scores }));
const mockBody = jest.fn();
jest.mock('./Leaderboard', () => ({
  LeaderboardBody: (props: { scores: unknown[] }) => {
    mockBody(props);
    const { Text: RNText } = require('react-native') as typeof import('react-native');
    return <RNText testID="board-body">{props.scores.length}</RNText>;
  },
}));

async function renderBoard() {
  await render(
    <CupMatchBoard
      {...({
        navigation: {},
        route: {
          key: 'b',
          name: 'CupMatchBoard',
          params: { cupId: 'cup-1', gameId: 'g', label: 'Singel 2', names: 'Tapp mot Kari' },
        },
      } as unknown as ScreenProps<'CupMatchBoard'>)}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CupMatchBoard', () => {
  it('viser hvem som spilte, «Sluttresultat» og tavla med slagene', async () => {
    const scores = [{ id: 's' }];
    (fetchCupMatchBoard as jest.Mock).mockResolvedValue({
      ok: true,
      bundle: { game: { gameMode: 'singles_matchplay' }, players: [] },
      scores,
    });
    await renderBoard();

    expect(fetchCupMatchBoard).toHaveBeenCalledWith('cup-1', 'g');
    expect(await screen.findByTestId('cup-board-names')).toHaveTextContent('Tapp mot Kari');
    expect(screen.getByText('Sluttresultat')).toBeTruthy();
    expect(screen.getByTestId('board-body')).toHaveTextContent('1');
  });

  it('en kamp serveren ikke gir: en setning, uten «Prøv igjen»', async () => {
    (fetchCupMatchBoard as jest.Mock).mockResolvedValue({ ok: false, reason: 'not_found' });
    await renderBoard();

    expect(await screen.findByTestId('cup-board-failed')).toHaveTextContent(/Tavla åpner når kampen er ferdig\./);
    expect(screen.queryByTestId('cup-board-retry')).toBeNull();
    expect(mockBody).not.toHaveBeenCalled();
  });

  it('uten nett: «Prøv igjen»', async () => {
    (fetchCupMatchBoard as jest.Mock).mockResolvedValue({ ok: false, reason: 'offline' });
    await renderBoard();
    expect(await screen.findByTestId('cup-board-retry')).toBeTruthy();
    expect(screen.getByTestId('cup-board-failed')).toHaveTextContent(/Sjekk nettet/);
  });

  it('en feil hos serveren ber deg ikke sjekke nettet', async () => {
    (fetchCupMatchBoard as jest.Mock).mockResolvedValue({ ok: false, reason: 'load_failed' });
    await renderBoard();
    expect(await screen.findByTestId('cup-board-retry')).toBeTruthy();
    expect(screen.getByTestId('cup-board-failed')).toHaveTextContent(/^Fikk ikke tak i tavla\. Prøv igjen\.Prøv igjen$/);
  });
});
