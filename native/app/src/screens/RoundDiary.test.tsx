// #2265: Rundedagboka. Type C — tilstandene skjermen kan være i, og
// koblingene bare en render kan bekrefte: undertittelen fra siste sesong,
// poengene som kommer inn etter hvert, veien til statistikken, tomteksten og
// feillinja med «Prøv igjen». Tallene er Type A (`lib/roundHistory.test.ts`),
// og kortet og lista har sine egne tester.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { fetchKavalkadeStatus } from '../data/kavalkade';
import { fetchRoundHistory } from '../data/roundHistory';
import { fetchRoundPoints } from '../data/roundPoints';
import { HISTORY_TEXT } from '../lib/historyCopy';
import type { ScreenProps } from '../navigation';
import { historyRound, localIso } from '../test/historyFixtures';
import { RoundDiary } from './RoundDiary';

jest.mock('../supabase', () => require('../test/supabaseMock'));
// #2201: merk-lest har sin egen test; manuell mock i lib/__mocks__/.
jest.mock('../lib/useMarkVisitRead');
jest.mock('../session', () => ({ useSession: () => ({ userId: 'me' }) }));
jest.mock('../data/roundHistory', () => ({ fetchRoundHistory: jest.fn() }));
jest.mock('../data/roundPoints', () => ({ fetchRoundPoints: jest.fn() }));
jest.mock('../data/kavalkade', () => ({ fetchKavalkadeStatus: jest.fn() }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

const fetchRoundHistoryMock = fetchRoundHistory as jest.Mock;
const fetchRoundPointsMock = fetchRoundPoints as jest.Mock;
const fetchKavalkadeStatusMock = fetchKavalkadeStatus as jest.Mock;
const navigate = jest.fn();

async function renderScreen() {
  await render(
    <RoundDiary
      {...({ navigation: { navigate }, route: { params: undefined } } as unknown as ScreenProps<'RoundDiary'>)}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchKavalkadeStatusMock.mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('RoundDiary', () => {
  it('opens on the diary: the season line, the form card, the months and the way to the statistics', async () => {
    fetchRoundHistoryMock.mockResolvedValue([
      historyRound({ gameId: 'sb', date: localIso(8, 19), gameMode: 'stableford' }),
      historyRound({ gameId: 'sp', date: localIso(8, 12) }),
      historyRound({ gameId: 'old', date: localIso(5, 1, 12, 0, 2025) }),
    ]);
    fetchRoundPointsMock.mockResolvedValue(38);

    await renderScreen();

    expect(await screen.findByTestId('round-diary-subtitle')).toHaveTextContent('2 runder i 2026');
    expect(screen.getByTestId('form-card')).toBeTruthy();
    expect(screen.getByText('september')).toBeTruthy();
    expect(screen.getByText('juni 2025')).toBeTruthy();
    // Poengene regnes bare for formatene der tavla viser poeng, og kommer inn
    // når de er regnet.
    expect(await screen.findByText('Byneset North · Stableford · 38 p')).toBeTruthy();
    expect(fetchRoundPointsMock).toHaveBeenCalledTimes(1);
    expect(fetchRoundPointsMock).toHaveBeenCalledWith('sb', 'stableford', 'me');

    await fireEvent.press(screen.getByTestId('diary-row-sp'));
    expect(navigate).toHaveBeenCalledWith('Leaderboard', { gameId: 'sp' });
    await fireEvent.press(screen.getByTestId('round-diary-see-stats'));
    expect(navigate).toHaveBeenCalledWith('RoundStats');
  });

  it('shows the web’s empty text without finished rounds', async () => {
    fetchRoundHistoryMock.mockResolvedValue([]);
    await renderScreen();

    expect(await screen.findByTestId('round-diary-empty')).toHaveTextContent(HISTORY_TEXT.emptyState);
    expect(screen.queryByTestId('form-card')).toBeNull();
  });

  it('shows an error line with «Prøv igjen» offline, and tries again', async () => {
    fetchRoundHistoryMock.mockRejectedValueOnce(new Error('offline'));
    fetchRoundHistoryMock.mockResolvedValueOnce([historyRound({ gameId: 'sp' })]);
    await renderScreen();

    expect(await screen.findByTestId('round-diary-error')).toHaveTextContent(HISTORY_TEXT.loadFailed);
    await fireEvent.press(screen.getByTestId('round-diary-retry'));
    expect(await screen.findByTestId('diary-row-sp')).toBeTruthy();
    expect(screen.queryByTestId('round-diary-error')).toBeNull();
  });

  // Eierens svar 4 (01.10): raden står mellom undertittelen og formkortet fra
  // 24. desember, og for admin før datoen. Serveren svarer `canOpen`.
  it('shows the Kavalkade row under the subtitle when it is open, and opens it', async () => {
    fetchRoundHistoryMock.mockResolvedValue([historyRound({ gameId: 'sp' })]);
    fetchKavalkadeStatusMock.mockResolvedValue({ year: 2026, slot: 'link', canOpen: true, hasRound: true });
    await renderScreen();

    const row = await screen.findByTestId('round-diary-kavalkade');
    expect(row).toHaveTextContent('🎄Kavalkaden 2026Golfåret ditt og gjengens, kort for kort.');
    expect(row.props.accessibilityLabel).toBe('Kavalkaden 2026. Golfåret ditt og gjengens, kort for kort.');
    await fireEvent.press(row);
    expect(navigate).toHaveBeenCalledWith('Kavalkade');
  });

  it('has no Kavalkade row before it opens, or without an answer', async () => {
    fetchRoundHistoryMock.mockResolvedValue([historyRound({ gameId: 'sp' })]);
    fetchKavalkadeStatusMock.mockResolvedValue({ year: 2026, slot: 'teaser', canOpen: false, hasRound: true });
    await renderScreen();
    expect(await screen.findByTestId('diary-row-sp')).toBeTruthy();
    expect(screen.queryByTestId('round-diary-kavalkade')).toBeNull();
  });
});
