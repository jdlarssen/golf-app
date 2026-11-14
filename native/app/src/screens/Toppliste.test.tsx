// #2259 PR 2: Topplista. Type C — tilstandene skjermen kan være i, og det bare en
// render kan bekrefte: fanene som faner med valgt-tilstand, medaljer og «Du»-raden,
// lederkortet, «Din plass» i alle tre variantene, tom sesong, «Prøv igjen» og
// birdie-fanen når bare den feilet. Utregningen er låst i `lib/toppliste.test.ts`
// (Type A), så her sjekkes ingen tall utover det som står på skjermen.

/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AeresbrettView } from '../../../../lib/stats/appAeresbrettView';
import { fetchAeresbrett } from '../data/aeresbrett';
import type { ScreenProps } from '../navigation';
import { Toppliste } from './Toppliste';
import { bottomPadding, setBottomInset } from '../test/safeAreaMock';

jest.mock('../data/aeresbrett', () => ({ fetchAeresbrett: jest.fn() }));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());

const fetchMock = fetchAeresbrett as jest.Mock;

const row = (place: number, name: string, count: number, isViewer = false) => ({
  place,
  name,
  initials: name.slice(0, 2).toUpperCase(),
  count,
  isViewer,
});

const VIEW: AeresbrettView = {
  seasonYear: 2026,
  seasonOver: false,
  boards: {
    wins: {
      rows: [row(1, 'Marte L.', 6), row(2, 'Jonas B.', 5), row(3, 'Ingrid S.', 4), row(4, 'Sigrid A.', 1, true)],
      me: { place: 4, count: 1, toTop5: null },
      leader: null,
    },
    birdies: { rows: [row(1, 'Jonas B.', 14)], me: { place: 9, count: 3, toTop5: 4 } },
    rounds: { rows: [row(1, 'Per K.', 31)], me: null },
  },
};

async function renderScreen(selfInitials?: string) {
  const route = { params: selfInitials ? { selfInitials } : undefined };
  await render(<Toppliste {...({ navigation: {}, route } as unknown as ScreenProps<'Toppliste'>)} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Toppliste', () => {
  it('shows the heading and the tabs while it loads, with the list as flat shapes', async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    await renderScreen();

    expect(screen.getByText('Toppliste')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByTestId('toppliste-skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('toppliste-list')).toBeNull();
  });

  it('shows the board: tabs as tabs, medals on 1–3, your own row marked «Du», and the leader', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: VIEW });
    await renderScreen();

    expect(await screen.findByTestId('toppliste-list')).toBeTruthy();
    expect(screen.getByTestId('toppliste-subtitle')).toHaveTextContent('Hele Tørny · sesongen 2026', { exact: false });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.props.accessibilityState.selected)).toEqual([true, false, false]);
    expect(screen.getByRole('tab', { name: 'Seire' })).toBeTruthy();

    expect(screen.getByLabelText('1. plass, Marte L., 6 seire')).toBeTruthy();
    expect(screen.getByLabelText('4. plass, Sigrid A., 1 seier, deg')).toBeTruthy();
    expect(screen.getByTestId('toppliste-row-3')).toHaveTextContent('Du', { exact: false });
    expect(screen.getByTestId('toppliste-row-0')).not.toHaveTextContent('Du', { exact: false });

    expect(screen.getByTestId('toppliste-leader')).toHaveTextContent('Leder sesongenMarte L.6seire', { exact: false });
    expect(screen.getByTestId('toppliste-you')).toHaveTextContent('Du er på 4. plass1 seier', { exact: false });
  });

  it('switches tab and moves «Din plass» with it', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: VIEW });
    await renderScreen();
    await screen.findByTestId('toppliste-list');

    await fireEvent.press(screen.getByRole('tab', { name: 'Birdies' }));
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityState.selected)).toEqual([false, true, false]);
    expect(screen.getByTestId('toppliste-you')).toHaveTextContent('Du er på 9. plass3 birdier · 4 birdier til topp 5', { exact: false });
    expect(screen.getByLabelText('1. plass, Jonas B., 14 birdier')).toBeTruthy();

    await fireEvent.press(screen.getByRole('tab', { name: 'Runder' }));
    expect(screen.getByTestId('toppliste-you')).toHaveTextContent('Ingen runder ennåSpill en runde, så er du med.', { exact: false });
  });

  it('takes your initials from the profile when you are outside the list', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: VIEW });
    await renderScreen('SA');
    await screen.findByTestId('toppliste-list');

    await fireEvent.press(screen.getByRole('tab', { name: 'Birdies' }));
    expect(screen.getByTestId('toppliste-you')).toHaveTextContent(/^SA/, { exact: false });
  });

  it('has no leader card when the top is shared', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      view: {
        ...VIEW,
        boards: {
          ...VIEW.boards,
          wins: { rows: [row(1, 'Marte L.', 5), row(1, 'Jonas B.', 5)], me: null, leader: null },
        },
      },
    });
    await renderScreen();

    await screen.findByTestId('toppliste-list');
    expect(screen.queryByTestId('toppliste-leader')).toBeNull();
    expect(screen.getByTestId('toppliste-you')).toHaveTextContent('Ingen seire ennå', { exact: false });
  });

  it('calls the leader «Årets spiller» and drops «til topp 5» when the season is over', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      view: {
        ...VIEW,
        seasonYear: 2025,
        seasonOver: true,
        boards: { ...VIEW.boards, wins: { ...VIEW.boards.wins, me: { place: 7, count: 1, toTop5: 2 } } },
      },
    });
    await renderScreen();

    await screen.findByTestId('toppliste-list');
    expect(screen.getByTestId('toppliste-leader')).toHaveTextContent('Årets spiller 2025', { exact: false });
    expect(screen.getByTestId('toppliste-you')).toHaveTextContent('Du er på 7. plass1 seier', { exact: false });
    expect(screen.getByTestId('toppliste-you')).not.toHaveTextContent('til topp 5', { exact: false });
  });

  it('shows the empty season as one card, with no tabs and no «Din plass»', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      view: {
        seasonYear: null,
        seasonOver: false,
        boards: {
          wins: { rows: [], me: null, leader: null },
          birdies: { rows: [], me: null },
          rounds: { rows: [], me: null },
        },
      },
    });
    await renderScreen();

    expect(await screen.findByTestId('toppliste-empty')).toHaveTextContent(
      'Ingen runder ennåVinneren av den første står her.',
    );
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByTestId('toppliste-you')).toBeNull();
  });

  it('says «Du er uten nett» offline, with no tabs, and tries again', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    fetchMock.mockResolvedValueOnce({ ok: true, view: VIEW });
    await renderScreen();

    expect(await screen.findByTestId('toppliste-offline')).toHaveTextContent(
      'Du er uten nettKoble til og prøv igjen.Prøv igjen',
    );
    expect(screen.getByTestId('toppliste-subtitle')).toHaveTextContent('Hele Tørny', { exact: false });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('toppliste-offline-retry'));
    expect(await screen.findByTestId('toppliste-list')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('says it could not fetch the list when the call fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, reason: 'failed' });
    await renderScreen();

    expect(await screen.findByTestId('toppliste-failed')).toHaveTextContent(
      'Fikk ikke hentet topplistaPrøv igjen om litt.Prøv igjen',
    );
  });

  it('keeps the tabs when only the birdies failed, and says so on that tab alone', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: { ...VIEW, boards: { ...VIEW.boards, birdies: null } } });
    await renderScreen();
    await screen.findByTestId('toppliste-list');

    await fireEvent.press(screen.getByRole('tab', { name: 'Birdies' }));
    expect(screen.getByTestId('toppliste-birdies-failed')).toHaveTextContent(
      'Fikk ikke hentet birdieneSeire og runder virker som vanlig.Prøv igjen',
    );
    expect(screen.queryByTestId('toppliste-you')).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: 'Runder' }));
    expect(screen.getByTestId('toppliste-list')).toBeTruthy();
  });

  // #1954 D3: med tre knapper på Android ligger navigasjonslinja over bunnen av
  // skjermen. Innholdet skal ende over den, med samme luft som før.
  it('legger systemlinja til bunnluften', async () => {
    setBottomInset(48);
    try {
      fetchMock.mockResolvedValue({ ok: true, view: VIEW });
      await renderScreen();
      await screen.findByTestId('toppliste-list');
      expect(bottomPadding('toppliste-screen')).toBe(32 + 48);
    } finally {
      setBottomInset(0);
    }
  });
});
