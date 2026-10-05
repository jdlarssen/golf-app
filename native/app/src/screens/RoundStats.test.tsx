// #2265: statistikken bak Rundedagboka. Type C — seksjonene i webbens
// rekkefølge, årsvalget i «Sesongen din», og at putte-seksjonen bare står for
// den som har ført en putt. Tallene er Type A (`lib/roundHistory.test.ts` og
// `lib/stats/*`).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { fetchRoundHistory } from '../data/roundHistory';
import { HISTORY_TEXT } from '../lib/historyCopy';
import type { ScreenProps } from '../navigation';
import { historyRound, localIso } from '../test/historyFixtures';
import { RoundStats } from './RoundStats';

jest.mock('../supabase', () => require('../test/supabaseMock'));
// #2201: merk-lest har sin egen test; manuell mock i lib/__mocks__/.
jest.mock('../lib/useMarkVisitRead');
jest.mock('../session', () => ({ useSession: () => ({ userId: 'me' }) }));
jest.mock('../data/roundHistory', () => ({ fetchRoundHistory: jest.fn() }));

const fetchRoundHistoryMock = fetchRoundHistory as jest.Mock;

async function renderScreen() {
  await render(
    <RoundStats {...({ navigation: {}, route: {} } as unknown as ScreenProps<'RoundStats'>)} />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RoundStats', () => {
  it('shows the sections in the web’s order, and switches the season year', async () => {
    fetchRoundHistoryMock.mockResolvedValue([
      historyRound({ gameId: 'a', date: localIso(8, 19), differential: 12.1, putts: Array(18).fill(2) }),
      historyRound({ gameId: 'b', date: localIso(8, 12), differential: 13.4, completeBrutto: 90, brutto: 90 }),
      historyRound({ gameId: 'c', date: localIso(5, 1, 12, 0, 2025), completeBrutto: 95, brutto: 95 }),
    ]);
    await renderScreen();

    expect(await screen.findByTestId('stats-my')).toBeTruthy();
    const order = [
      'stats-my',
      'stats-handicap-form',
      'stats-season',
      'stats-streak',
      'stats-achievements',
      'stats-putts',
      'stats-courses',
    ];
    // Rekkefølgen i treet er rekkefølgen på skjermen.
    const tree = JSON.stringify(screen.toJSON());
    const positions = order.map((id) => tree.indexOf(`"testID":"${id}"`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    const numbers = screen.getByTestId('stats-season-numbers');
    expect(within(numbers).getByLabelText(`${HISTORY_TEXT.seasonColRounds}: 2, +1`)).toBeTruthy();
    const lastYear = screen.getByTestId('stats-season-year-2025');
    expect(lastYear.props.accessibilityRole).toBe('tab');
    await fireEvent.press(lastYear);
    expect(
      within(screen.getByTestId('stats-season-numbers')).getByLabelText(
        `${HISTORY_TEXT.seasonColRounds}: 1`,
      ),
    ).toBeTruthy();
  });

  it('leaves out the putts for a player who never entered one, and the handicap form under two rounds', async () => {
    fetchRoundHistoryMock.mockResolvedValue([historyRound({ gameId: 'a', differential: 12.1 })]);
    await renderScreen();

    expect(await screen.findByTestId('stats-my')).toBeTruthy();
    expect(screen.queryByTestId('stats-putts')).toBeNull();
    expect(screen.queryByTestId('stats-handicap-form')).toBeNull();
  });
});
