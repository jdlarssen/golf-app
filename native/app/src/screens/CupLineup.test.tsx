// #2752: kapteinuttaket (Type C). Reglene og hemmeligheten står på serveren. Her låses hva
// skjermen viser for hver rolle, hva den sender, at `slots: null` aldri blir en tom
// oppstilling, og at et svar som kommer lar skjermen vise det som faktisk er.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AppCupLineupSession, AppCupLineupView } from '../../../../lib/cup/appCupLineupView';
import {
  fetchCupLineup,
  openCupLineupSession,
  retryCupLineupReveal,
  setCupPlannedMatchCount,
  submitCupLineup,
  unlockCupLineup,
} from '../data/cupSetup';
import type { ScreenProps } from '../navigation';
import { CupLineup } from './CupLineup';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/cupSetup', () => ({
  fetchCupLineup: jest.fn(),
  setCupPlannedMatchCount: jest.fn(async () => ({ ok: true })),
  openCupLineupSession: jest.fn(async () => ({ ok: true })),
  submitCupLineup: jest.fn(async () => ({ ok: true })),
  unlockCupLineup: jest.fn(async () => ({ ok: true })),
  retryCupLineupReveal: jest.fn(async () => ({ ok: true })),
}));
// `run` er å forlate skjermen og komme tilbake: oppryddingen først, så lesingen.
const mockFocus: { run: (() => void) | null; cleanup: (() => void) | void } = { run: null, cleanup: undefined };
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => (() => void) | void) => {
    mockFocus.run = () => {
      mockFocus.cleanup?.();
      mockFocus.cleanup = callback();
    };
    require('react').useEffect(() => {
      mockFocus.cleanup = callback();
    }, [callback]);
  },
}));

const P = (userId: string, displayName: string) => ({ userId, displayName, hcpIndex: 12 });
const session = (over: Partial<AppCupLineupSession> = {}): AppCupLineupSession => ({
  id: 'okt',
  sessionIndex: 0,
  format: 'foursomes_matchplay',
  slotCount: 1,
  revealedAt: null,
  teams: [
    { teamNumber: 1, submittedAt: null, slots: [] },
    { teamNumber: 2, submittedAt: null, slots: null },
  ],
  ...over,
});
const view = (over: Partial<AppCupLineupView> = {}): AppCupLineupView => ({
  role: 'captain',
  myTeam: 1,
  cupName: 'Klubbmesterskapet',
  cupStatus: 'active',
  team1Name: 'Team Nord',
  team2Name: 'Team Sør',
  bothCaptains: true,
  hasDefaultWeights: true,
  plannedMatchCount: 4,
  pointsToWin: 2.5,
  matchCount: 0,
  pendingSlotCount: 1,
  squads: {
    team1: [P('ola', 'Ola'), P('tapp', 'Tapp'), P('kari', 'Kari')],
    team2: [P('per', 'Per'), P('anne', 'Anne'), P('dag', 'Dag')],
    unassigned: [],
  },
  sessions: [session()],
  ...over,
});
const organizer = (over: Partial<AppCupLineupView> = {}) => view({ role: 'organizer', myTeam: null, ...over });
const answer = (value: AppCupLineupView) => (fetchCupLineup as jest.Mock).mockResolvedValue({ ok: true, view: value });

async function renderScreen() {
  const navigation = {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    getState: () => ({ index: 2, routes: [{ name: 'Home' }, { name: 'Cup', params: { cupId: 'cup-1' } }, { name: 'CupLineup', params: { cupId: 'cup-1' } }] }),
  };
  await render(
    <CupLineup {...({ navigation, route: { key: 'l', name: 'CupLineup', params: { cupId: 'cup-1' } } } as unknown as ScreenProps<'CupLineup'>)} />,
  );
  return navigation;
}

const pick = async (prefix: string, slot: number, seat: number, id: string) => {
  await fireEvent.press(screen.getByTestId(`cup-lineup-pick-${prefix}-${slot}-${seat}`));
  await fireEvent.press(screen.getByTestId(`cup-lineup-picker-${prefix}-${slot}-${seat}-${id}`));
};

beforeEach(() => {
  jest.clearAllMocks();
  answer(view());
});

describe('før tavla', () => {
  it('uten rolle: en setning, uten «Prøv igjen»', async () => {
    (fetchCupLineup as jest.Mock).mockResolvedValue({ ok: false, reason: 'not_allowed' });
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-failed')).toHaveTextContent('Du har ikke tilgang til dette uttaket.');
    expect(screen.queryByTestId('cup-lineup-retry')).toBeNull();
  });

  it('en feil hos serveren: «Prøv igjen», uten å skylde på nettet', async () => {
    (fetchCupLineup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'load_failed' });
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-failed')).toHaveTextContent('Fikk ikke tak i cupen. Prøv igjen.Prøv igjen');
    await fireEvent.press(screen.getByTestId('cup-lineup-retry'));
    expect(screen.getByTestId('cup-lineup-screen')).toBeTruthy();
  });

  it('en ny lesing som feiler, sier hva, og det du har valgt står', async () => {
    await renderScreen();
    await pick('0-1', 0, 0, 'ola');
    (fetchCupLineup as jest.Mock).mockResolvedValue({ ok: false, reason: 'offline' });
    await act(async () => mockFocus.run?.());
    expect(screen.getByTestId('cup-lineup-stale')).toHaveTextContent(/Sjekk nettet/);
    expect(screen.getByTestId('cup-lineup-pick-0-1-0-0')).toHaveTextContent('Ola');
  });
});

describe('kapteinen', () => {
  it('ser ingen av arrangørens kort', async () => {
    await renderScreen();
    expect(screen.queryByTestId('cup-lineup-planned')).toBeNull();
    expect(screen.queryByTestId('cup-lineup-open-card')).toBeNull();
    expect(screen.queryByTestId('cup-lineup-delete-0')).toBeNull();
  });

  it('motstanderens uttak er skjult, aldri en tom oppstilling', async () => {
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-hidden-0-2')).toHaveTextContent('Skjult til begge lag har levert.');
    expect(screen.queryByTestId('cup-lineup-editor-0-2')).toBeNull();
    expect(screen.queryByTestId('cup-lineup-slots-0-2')).toBeNull();
  });

  it('motstanderen har levert: det står, men ikke hvem', async () => {
    answer(view({ sessions: [session({ teams: [{ teamNumber: 1, submittedAt: null, slots: [] }, { teamNumber: 2, submittedAt: 'nå', slots: null }] })] }));
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-team-0-2')).toHaveTextContent('Team SørLevertSkjult til begge lag har levert.');
  });

  it('fyller plassene, kan ikke velge samme spiller to ganger, og leverer', async () => {
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-submit-0-1')).toBeDisabled();
    await pick('0-1', 0, 0, 'ola');
    await fireEvent.press(screen.getByTestId('cup-lineup-pick-0-1-0-1'));
    expect(screen.getByTestId('cup-lineup-picker-0-1-0-1-ola')).toBeDisabled();
    expect(screen.queryByTestId('cup-lineup-picker-0-1-0-1-per')).toBeNull();
    await fireEvent.press(screen.getByTestId('cup-lineup-picker-0-1-0-1-tapp'));

    await fireEvent.press(screen.getByTestId('cup-lineup-submit-0-1'));
    expect(submitCupLineup).toHaveBeenCalledWith('cup-1', 'okt', 1, [{ slotIndex: 0, userIds: ['ola', 'tapp'] }]);
    expect(fetchCupLineup).toHaveBeenCalledTimes(2);
  });

  it('en plass kan tømmes igjen', async () => {
    await renderScreen();
    await pick('0-1', 0, 0, 'ola');
    await fireEvent.press(screen.getByTestId('cup-lineup-pick-0-1-0-0'));
    await fireEvent.press(screen.getByTestId('cup-lineup-picker-0-1-0-0-clear'));
    expect(screen.getByTestId('cup-lineup-pick-0-1-0-0')).toHaveTextContent('Velg spiller');
  });

  it('to trykk før skjermen er tegnet på nytt: ett kall', async () => {
    let finish: (value: { ok: true }) => void = () => {};
    (submitCupLineup as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderScreen();
    await pick('0-1', 0, 0, 'ola');
    await pick('0-1', 0, 1, 'tapp');
    const button = screen.getByTestId('cup-lineup-submit-0-1');
    await act(async () => {
      button.props.onClick?.({ preventDefault() {} });
      button.props.onClick?.({ preventDefault() {} });
    });
    expect(submitCupLineup).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('cup-lineup-editor-0-1').props.pointerEvents).toBe('none');
    await act(async () => finish({ ok: true }));
    expect(screen.getByTestId('cup-lineup-editor-0-1').props.pointerEvents).toBe('auto');
  });

  it('et nei står i laget sitt, over knappen, og det du valgte står', async () => {
    (submitCupLineup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'lineup_not_in_squad' });
    await renderScreen();
    await pick('0-1', 0, 0, 'ola');
    await pick('0-1', 0, 1, 'tapp');
    await fireEvent.press(screen.getByTestId('cup-lineup-submit-0-1'));
    expect(screen.getByTestId('cup-lineup-error-0-1')).toHaveTextContent('En av spillerne er ikke på laget ditt.');
    expect(screen.getByTestId('cup-lineup-pick-0-1-0-0')).toHaveTextContent('Ola');
  });

  it('svaret gikk tapt, og uttaket kom fram: lista står, og feilen sier hva appen vet', async () => {
    (submitCupLineup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'network' });
    await renderScreen();
    await pick('0-1', 0, 0, 'ola');
    await pick('0-1', 0, 1, 'tapp');
    answer(
      view({
        sessions: [
          session({
            teams: [
              { teamNumber: 1, submittedAt: 'nå', slots: [{ slotIndex: 0, seat: 1, userId: 'ola' }, { slotIndex: 0, seat: 2, userId: 'tapp' }] },
              { teamNumber: 2, submittedAt: null, slots: null },
            ],
          }),
        ],
      }),
    );
    await fireEvent.press(screen.getByTestId('cup-lineup-submit-0-1'));
    expect(screen.getByTestId('cup-lineup-slots-0-1')).toHaveTextContent('1. Ola / Tapp');
    expect(screen.queryByTestId('cup-lineup-submit-0-1')).toBeNull();
    expect(screen.getByTestId('cup-lineup-error-0-1')).toHaveTextContent(/Sjekk nettet/);
  });

  it('levert: låst, og ingen «Lås opp» for kapteinen', async () => {
    answer(
      view({
        sessions: [
          session({
            teams: [
              { teamNumber: 1, submittedAt: 'nå', slots: [{ slotIndex: 0, seat: 1, userId: 'ola' }, { slotIndex: 0, seat: 2, userId: 'tapp' }] },
              { teamNumber: 2, submittedAt: null, slots: null },
            ],
          }),
        ],
      }),
    );
    await renderScreen();
    expect(screen.queryByTestId('cup-lineup-submit-0-1')).toBeNull();
    expect(screen.queryByTestId('cup-lineup-unlock-0-1')).toBeNull();
  });

  it('ingen økter: det står', async () => {
    answer(view({ sessions: [] }));
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-empty')).toHaveTextContent('Arrangøren har ikke åpnet noen økt ennå.');
  });
});

describe('arrangøren', () => {
  const both = { teams: [{ teamNumber: 1 as const, submittedAt: 'nå', slots: [{ slotIndex: 0, seat: 1 as const, userId: 'ola' }, { slotIndex: 0, seat: 2 as const, userId: 'tapp' }] }, { teamNumber: 2 as const, submittedAt: 'nå', slots: [{ slotIndex: 0, seat: 1 as const, userId: 'per' }, { slotIndex: 0, seat: 2 as const, userId: 'anne' }] }] as AppCupLineupSession['teams'] };

  it('mangler en kaptein: sier det, og åpner spillerlista', async () => {
    answer(organizer({ bothCaptains: false, sessions: [], cupStatus: 'draft' }));
    const navigation = await renderScreen();
    expect(screen.getByTestId('cup-lineup-needs-captains')).toBeTruthy();
    expect(screen.queryByTestId('cup-lineup-open-card')).toBeNull();
    await fireEvent.press(screen.getByTestId('cup-lineup-open-players'));
    expect(navigation.navigate).toHaveBeenCalledWith('CupParticipants', { cupId: 'cup-1' });
  });

  it('en startet cup uten kaptein: setningen står, men ingen dør til en låst liste', async () => {
    answer(organizer({ bothCaptains: false, sessions: [], cupStatus: 'active' }));
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-needs-captains')).toBeTruthy();
    expect(screen.queryByTestId('cup-lineup-open-players')).toBeNull();
  });

  it('et nei på antallet står i kortet, over knappen', async () => {
    (setCupPlannedMatchCount as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'lineup_planned_total' });
    answer(organizer({ plannedMatchCount: null, sessions: [] }));
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('cup-lineup-planned-input'), '1');
    await fireEvent.press(screen.getByTestId('cup-lineup-planned-save'));
    expect(screen.getByTestId('cup-lineup-planned-error')).toBeTruthy();
    expect(screen.queryByTestId('cup-lineup-error')).toBeNull();
    expect(screen.queryByTestId('cup-lineup-open-error')).toBeNull();
  });

  it('et nei på økta står i kortet, over knappen', async () => {
    (openCupLineupSession as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'too_many_matches' });
    answer(organizer({ sessions: [] }));
    await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-lineup-open'));
    expect(screen.getByTestId('cup-lineup-open-error')).toBeTruthy();
    expect(screen.queryByTestId('cup-lineup-error')).toBeNull();
  });

  it('er kortet borte etter lesingen, står neiet øverst', async () => {
    (openCupLineupSession as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'save_failed' });
    answer(organizer({ sessions: [] }));
    await renderScreen();
    answer(organizer({ sessions: [], bothCaptains: false }));
    await fireEvent.press(screen.getByTestId('cup-lineup-open'));
    expect(screen.getByTestId('cup-lineup-error')).toHaveTextContent('Klarte ikke å lagre. Prøv igjen.');
  });

  it('en gammel feil er borte når du kommer tilbake til skjermen', async () => {
    (openCupLineupSession as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'too_many_matches' });
    answer(organizer({ sessions: [] }));
    await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-lineup-open'));
    expect(screen.getByTestId('cup-lineup-open-error')).toBeTruthy();
    await act(async () => mockFocus.run?.());
    expect(screen.queryByTestId('cup-lineup-open-error')).toBeNull();
  });

  it('planlagt antall: viser målet før lagring, og sender tallet', async () => {
    answer(organizer({ plannedMatchCount: null, pointsToWin: null, sessions: [] }));
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-planned-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('cup-lineup-planned-input'), '28');
    expect(screen.getByTestId('cup-lineup-planned-target')).toHaveTextContent('28 kamper gir et poengmål på 14,5');
    await fireEvent.press(screen.getByTestId('cup-lineup-planned-save'));
    expect(setCupPlannedMatchCount).toHaveBeenCalledWith('cup-1', '28');
  });

  it('et tall under gulvet gir ikke noe mål å vise', async () => {
    answer(organizer({ plannedMatchCount: null, matchCount: 5, pendingSlotCount: 1, sessions: [] }));
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('cup-lineup-planned-input'), '4');
    expect(screen.queryByTestId('cup-lineup-planned-target')).toBeNull();
  });

  it('vektet cup: ingen spørsmål om antall, og økta kan åpnes', async () => {
    answer(organizer({ hasDefaultWeights: false, plannedMatchCount: null, sessions: [] }));
    await renderScreen();
    expect(screen.queryByTestId('cup-lineup-planned')).toBeNull();
    expect(screen.getByTestId('cup-lineup-open')).toBeEnabled();
  });

  it('uten planlagt antall kan ingen økt åpnes', async () => {
    answer(organizer({ plannedMatchCount: null, sessions: [] }));
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-open')).toBeDisabled();
    expect(screen.getByTestId('cup-lineup-needs-planned')).toBeTruthy();
  });

  it('åpner en økt: antallet følger formatet og stallen, og kan skrus ned', async () => {
    answer(organizer({ sessions: [] }));
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-slot-count')).toHaveTextContent('1');
    await fireEvent.press(screen.getByTestId('cup-lineup-format-singles_matchplay'));
    expect(screen.getByTestId('cup-lineup-slot-count')).toHaveTextContent('3');
    expect(screen.getByTestId('cup-lineup-slot-plus')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('cup-lineup-slot-minus'));
    await fireEvent.press(screen.getByTestId('cup-lineup-open'));
    expect(openCupLineupSession).toHaveBeenCalledWith('cup-1', 'singles_matchplay', 2);
  });

  it('for små lag: sier det, og økta kan ikke åpnes', async () => {
    answer(organizer({ sessions: [], squads: { team1: [P('ola', 'Ola')], team2: [P('per', 'Per')], unassigned: [] } }));
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-squad-too-small')).toBeTruthy();
    expect(screen.getByTestId('cup-lineup-open')).toBeDisabled();
  });

  it('ser begge lag før avdekking, og kan fylle og låse opp begge', async () => {
    answer(organizer({ sessions: [session({ teams: [{ teamNumber: 1, submittedAt: null, slots: [] }, { ...both.teams[1] }] })] }));
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-editor-0-1')).toBeTruthy();
    expect(screen.getByTestId('cup-lineup-slots-0-2')).toHaveTextContent('1. Per / Anne');
    await fireEvent.press(screen.getByTestId('cup-lineup-unlock-0-2'));
    expect(unlockCupLineup).toHaveBeenCalledWith('cup-1', 'okt', 2);
  });

  it('«Slett økten» åpner bekreftelsen og sletter ingenting selv', async () => {
    answer(organizer({ sessions: [session({ teams: [both.teams[0], { teamNumber: 2, submittedAt: null, slots: [] }] })] }));
    const navigation = await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-lineup-delete-0'));
    expect(navigation.navigate).toHaveBeenCalledWith('CupDeleteSession', {
      cupId: 'cup-1',
      sessionId: 'okt',
      format: 'foursomes_matchplay',
      slotCount: 1,
      delivered: 1,
    });
  });

  it('begge har levert, og kampene mangler: «Prøv igjen», med feilen over knappen', async () => {
    (retryCupLineupReveal as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'lineup_squad_changed' });
    answer(organizer({ sessions: [session(both)] }));
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-stuck-0')).toHaveTextContent(/kampene mangler/);
    await fireEvent.press(screen.getByTestId('cup-lineup-retry-0'));
    expect(retryCupLineupReveal).toHaveBeenCalledWith('cup-1', 'okt');
    expect(screen.getByTestId('cup-lineup-error-0')).toHaveTextContent(/Lagene er endret/);
  });

  it('avdekket: begge lag står, uten knappene', async () => {
    answer(organizer({ sessions: [session({ ...both, revealedAt: 'nå' })] }));
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-session-0')).toHaveTextContent(/Avdekket/);
    expect(screen.getByTestId('cup-lineup-slots-0-1')).toHaveTextContent('1. Ola / Tapp');
    expect(screen.getByTestId('cup-lineup-slots-0-2')).toHaveTextContent('1. Per / Anne');
    expect(screen.queryByTestId('cup-lineup-retry-0')).toBeNull();
    expect(screen.queryByTestId('cup-lineup-delete-0')).toBeNull();
    expect(screen.queryByTestId('cup-lineup-unlock-0-1')).toBeNull();
  });

  it('økta er borte: feilen står øverst', async () => {
    (retryCupLineupReveal as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'save_failed' });
    answer(organizer({ sessions: [session(both)] }));
    await renderScreen();
    answer(organizer({ sessions: [] }));
    await fireEvent.press(screen.getByTestId('cup-lineup-retry-0'));
    expect(screen.getByTestId('cup-lineup-error')).toHaveTextContent('Klarte ikke å lagre. Prøv igjen.');
  });

  it('en spiller som har forlatt lista, står med reserveordet', async () => {
    answer(organizer({ sessions: [session({ ...both, teams: [{ teamNumber: 1, submittedAt: 'nå', slots: [{ slotIndex: 0, seat: 1, userId: 'borte' }] }, both.teams[1]] })] }));
    await renderScreen();
    expect(screen.getByTestId('cup-lineup-slots-0-1')).toHaveTextContent('1. Ukjent spiller');
  });
});
