// #2752: veiviseren for en cup (Type C). Reglene er serverens; her låses stegene, hva hvert
// steg sender, at et utkast hopper over navn og lag, og at serverens nei stopper steget.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AppCupSetupView } from '../../../../lib/cup/appCupSetupView';
import { createCup, fetchCupSetup, saveCupPlan, saveCupSideAwards } from '../data/cupSetup';
import type { ScreenProps } from '../navigation';
import { CreateCup } from './CreateCup';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../session', () => ({ useSession: () => ({ userId: 'meg' }) }));
jest.mock('../data/profile', () => ({ fetchOwnProfile: jest.fn(async () => ({ isAdmin: false })) }));
jest.mock('../data/createGame', () => ({
  fetchCourses: jest.fn(async () => [
    { id: 'bane', name: 'Stiklestad Golfbane', tees: [{ id: 'tee', name: 'Gul', hasMens: true, hasLadies: false, hasJuniors: false }] },
  ]),
}));
jest.mock('../data/cupSetup', () => ({
  createCup: jest.fn(async () => ({ ok: true, id: 'ny' })),
  fetchCupSetup: jest.fn(),
  saveCupPlan: jest.fn(async () => ({ ok: true })),
  saveCupSideAwards: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../components/cup/CupPlayersBody', () => ({
  CupPlayersBody: (props: { cupId: string; notice: string | null }) => {
    const { Text } = require('react-native') as typeof import('react-native');
    return <Text testID="players-body">{`${props.cupId} ${props.notice ?? ''}`}</Text>;
  },
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    require('react').useEffect(callback, [callback]);
  },
  usePreventRemove: (enabled: boolean, callback: (event: { data: { action: { type: string } } }) => void) => {
    mockPrevent.enabled = enabled;
    mockPrevent.callback = callback;
  },
}));

const mockPrevent: {
  enabled: boolean;
  callback: ((event: { data: { action: { type: string } } }) => void) | null;
} = { enabled: false, callback: null };

const draft = (over: Partial<AppCupSetupView> = {}): AppCupSetupView => ({
  id: 'utkast',
  name: 'Klubbmesterskapet',
  status: 'draft',
  team1Name: 'Team Nord',
  team2Name: 'Team Sør',
  plan: {
    courseId: 'bane',
    teeBoxId: 'tee',
    teeOffAt: null,
    presetId: 'singler',
    customSessions: null,
    strategy: 'random',
    bestBallAllowancePct: null,
  },
  sideAwards: [{ kind: 'ctp', holeNumber: 7, points: 1, winnerCount: 2 }],
  ...over,
});

async function renderWizard(params?: Record<string, unknown>) {
  const navigation = {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    dispatch: jest.fn(),
    setParams: jest.fn(),
    getState: () => ({
      index: 2,
      routes: [{ name: 'Home' }, { name: 'Cup', params: { cupId: 'utkast' } }, { name: 'CreateCup', params }],
    }),
  };
  await render(
    <CreateCup {...({ navigation, route: { key: 'c', name: 'CreateCup', params } } as unknown as ScreenProps<'CreateCup'>)} />,
  );
  return navigation;
}

const next = () => fireEvent.press(screen.getByTestId('create-cup-next'));
const backGesture = { type: 'GO_BACK' };
const back = () => act(async () => mockPrevent.callback?.({ data: { action: backGesture } }));

beforeEach(() => {
  jest.clearAllMocks();
  (fetchCupSetup as jest.Mock).mockResolvedValue({ ok: true, view: draft() });
});

describe('en ny cup', () => {
  it('sender navn, lag og poeng, med punktum, og går videre', async () => {
    const navigation = await renderWizard();
    expect(screen.getByTestId('create-cup-progress')).toHaveTextContent('Steg 1 av 4 · Navn og lag');

    await fireEvent.changeText(screen.getByTestId('create-cup-name-input'), 'Høstcupen');
    await fireEvent.changeText(screen.getByTestId('create-cup-team1'), 'Nord');
    await fireEvent.changeText(screen.getByTestId('create-cup-team2'), 'Sør');
    await fireEvent.changeText(screen.getByTestId('create-cup-tie'), '0,5');
    await next();

    expect(createCup).toHaveBeenCalledWith({ name: 'Høstcupen', team1Name: 'Nord', team2Name: 'Sør', winPoints: '', tiePoints: '0.5' });
    expect(navigation.setParams).toHaveBeenCalledWith({ cupId: 'ny' });
    expect(screen.getByTestId('create-cup-progress')).toHaveTextContent('Steg 2 av 4 · Bane og oppsett');
  });

  it('tilbake etter navn og lag går til cupen. Det lages ingen cup til', async () => {
    const navigation = await renderWizard();
    expect(mockPrevent.enabled).toBe(false);
    await next();
    expect(mockPrevent.enabled).toBe(true);

    await back();
    expect(navigation.replace).toHaveBeenCalledWith('Cup', { cupId: 'ny' });
    expect(screen.queryByTestId('create-cup-details')).toBeNull();
    expect(createCup).toHaveBeenCalledTimes(1);

    // Navigasjonen som kommer etterpå, slipper forbi vakten.
    await back();
    expect(navigation.dispatch).toHaveBeenCalledWith(backGesture);
  });

  it('banevalget har ikke døra til «Ny bane», som går tilbake til «Nytt spill»', async () => {
    await renderWizard();
    await next();
    await screen.findByTestId('create-course-bane');
    expect(screen.queryByTestId('create-course-new')).toBeNull();
  });

  it('tilbake mens cupen lages: du blir stående, og går videre når den er laget', async () => {
    let answer: (value: { ok: true; id: string }) => void = () => {};
    (createCup as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const navigation = await renderWizard();
    expect(mockPrevent.enabled).toBe(false);
    await next();
    expect(mockPrevent.enabled).toBe(true);

    await back();
    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(screen.getByTestId('create-cup-details')).toBeTruthy();

    await act(async () => answer({ ok: true, id: 'ny' }));
    expect(screen.getByTestId('create-cup-plan')).toBeTruthy();
  });

  it('to trykk på «Neste» før skjermen er tegnet på nytt: én cup', async () => {
    let answer: (value: { ok: true; id: string }) => void = () => {};
    (createCup as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    await renderWizard();
    const button = screen.getByTestId('create-cup-next');
    await act(async () => {
      button.props.onClick?.({ preventDefault() {} });
      button.props.onClick?.({ preventDefault() {} });
    });
    expect(createCup).toHaveBeenCalledTimes(1);
    await act(async () => answer({ ok: true, id: 'ny' }));
    expect(screen.getByTestId('create-cup-plan')).toBeTruthy();
  });

  it('serverens nei stopper steget, i nettets ord', async () => {
    (createCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'cup_team_dup' });
    await renderWizard();
    await next();
    expect(screen.getByTestId('create-cup-error')).toHaveTextContent('Lagene må ha forskjellige navn.');
    expect(screen.getByTestId('create-cup-details')).toBeTruthy();
  });

  it('uten nett: setningen, og du står på steget', async () => {
    (createCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'offline' });
    await renderWizard();
    await next();
    expect(screen.getByTestId('create-cup-error')).toHaveTextContent(/trenger nett/);
  });
});

describe('et utkast', () => {
  it('hopper over navn og lag, og fyller inn det som er lagret', async () => {
    await renderWizard({ cupId: 'utkast' });

    expect(fetchCupSetup).toHaveBeenCalledWith('utkast');
    expect(screen.getByTestId('create-cup-name')).toHaveTextContent('Klubbmesterskapet');
    expect(screen.getByTestId('create-cup-progress')).toHaveTextContent('Steg 1 av 3 · Bane og oppsett');

    await next();

    expect(saveCupPlan).toHaveBeenCalledWith('utkast', {
      courseId: 'bane',
      teeBoxId: 'tee',
      teeOffAt: null,
      presetId: 'singler',
      customSessions: null,
      strategy: 'random',
      bestBallAllowancePct: null,
    });
    expect(createCup).not.toHaveBeenCalled();
  });

  it('starttiden er valgfri: slått på sendes den som UTC', async () => {
    await renderWizard({ cupId: 'utkast' });
    await fireEvent(screen.getByTestId('create-teeoff-toggle'), 'valueChange', true);
    await next();
    const body = (saveCupPlan as jest.Mock).mock.calls[0][1];
    expect(new Date(body.teeOffAt).toISOString()).toBe(body.teeOffAt);
  });

  it('en plan med egne økter fra nettet går tilbake som den er', async () => {
    (fetchCupSetup as jest.Mock).mockResolvedValue({
      ok: true,
      view: draft({ plan: { ...draft().plan!, presetId: 'tilpasset', customSessions: ['singles_matchplay'] } }),
    });
    await renderWizard({ cupId: 'utkast' });
    expect(screen.getByTestId('create-cup-preset-tilpasset')).toBeTruthy();
    await next();
    expect((saveCupPlan as jest.Mock).mock.calls[0][1]).toMatchObject({
      presetId: 'tilpasset',
      customSessions: ['singles_matchplay'],
    });
  });

  it('velger du et av de fire, forsvinner de egne øktene', async () => {
    (fetchCupSetup as jest.Mock).mockResolvedValue({
      ok: true,
      view: draft({ plan: { ...draft().plan!, presetId: 'tilpasset', customSessions: ['singles_matchplay'] } }),
    });
    await renderWizard({ cupId: 'utkast' });
    await fireEvent.press(screen.getByTestId('create-cup-preset-klassisk'));
    expect(screen.queryByTestId('create-cup-preset-tilpasset')).toBeNull();
    await next();
    expect((saveCupPlan as jest.Mock).mock.calls[0][1]).toMatchObject({ presetId: 'klassisk', customSessions: null });
  });

  it('splittet dag spør om best ball, og bare den', async () => {
    await renderWizard({ cupId: 'utkast' });
    expect(screen.queryByTestId('create-cup-best-ball')).toBeNull();
    await fireEvent.press(screen.getByTestId('create-cup-preset-splittet-cup-dag'));
    await fireEvent.changeText(screen.getByTestId('create-cup-best-ball'), '90');
    await next();
    expect((saveCupPlan as jest.Mock).mock.calls[0][1]).toMatchObject({ presetId: 'splittet-cup-dag', bestBallAllowancePct: 90 });
  });

  it('serverens nei på planen stopper steget', async () => {
    (saveCupPlan as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'plan_tee' });
    await renderWizard({ cupId: 'utkast' });
    await next();
    expect(screen.getByTestId('create-cup-error')).toHaveTextContent('Velg en tee som hører til banen.');
    expect(screen.getByTestId('create-cup-plan')).toBeTruthy();
  });

  it('sidepoengene: det lagrede står, kan endres, og hele lista sendes', async () => {
    await renderWizard({ cupId: 'utkast' });
    await next();
    expect(screen.getByTestId('create-cup-progress')).toHaveTextContent('Steg 2 av 3 · Sidepoeng');

    await fireEvent.changeText(screen.getByTestId('create-cup-award-hole-lagret-0'), '9');
    await fireEvent.press(screen.getByTestId('create-cup-award-add'));
    await fireEvent.press(screen.getByTestId('create-cup-award-kind-gir-ny-0'));
    await fireEvent.changeText(screen.getByTestId('create-cup-award-hole-ny-0'), '12');
    await fireEvent.changeText(screen.getByTestId('create-cup-award-points-ny-0'), '0,5');
    await fireEvent.changeText(screen.getByTestId('create-cup-award-count-ny-0'), '4');
    await next();

    expect(saveCupSideAwards).toHaveBeenCalledWith('utkast', [
      { kind: 'ctp', holeNumber: 9, points: 1, winnerCount: 2 },
      { kind: 'gir', holeNumber: 12, points: 0.5, maxPerTeam: 4 },
    ]);
    expect(screen.getByTestId('players-body')).toHaveTextContent(/utkast/);
  });

  it('en rad du fjerner, sendes ikke, og en tom liste er lov', async () => {
    await renderWizard({ cupId: 'utkast' });
    await next();
    await fireEvent.press(screen.getByTestId('create-cup-award-remove-lagret-0'));
    expect(screen.getByTestId('create-cup-awards-empty')).toBeTruthy();
    await next();
    expect(saveCupSideAwards).toHaveBeenCalledWith('utkast', []);
  });

  it('serverens nei på sidepoengene stopper steget', async () => {
    (saveCupSideAwards as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'duplicate_side_award' });
    await renderWizard({ cupId: 'utkast' });
    await next();
    await next();
    expect(screen.getByTestId('create-cup-error')).toHaveTextContent(/Én rad per type og hull/);
    expect(screen.getByTestId('create-cup-awards')).toBeTruthy();
  });

  it('steget åpner øverst, også når du trykket «Neste» nederst på det forrige', async () => {
    await renderWizard({ cupId: 'utkast' });
    const before = screen.getByTestId('create-cup-screen');
    await next();
    expect(screen.getByTestId('create-cup-screen')).not.toBe(before);
  });

  it('tilbake går ett steg om gangen, og uten vakt fra første steg', async () => {
    const navigation = await renderWizard({ cupId: 'utkast' });
    expect(mockPrevent.enabled).toBe(false);
    await next();
    await next();
    expect(screen.getByTestId('create-cup-progress')).toHaveTextContent('Steg 3 av 3 · Spillere');

    await back();
    expect(screen.getByTestId('create-cup-progress')).toHaveTextContent('Steg 2 av 3 · Sidepoeng');
    await back();
    expect(screen.getByTestId('create-cup-progress')).toHaveTextContent('Steg 1 av 3 · Bane og oppsett');
    expect(mockPrevent.enabled).toBe(false);
    expect(navigation.popTo).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('tilbake mens et steg lagres: du blir stående', async () => {
    let answer: (value: { ok: true }) => void = () => {};
    (saveCupSideAwards as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    await renderWizard({ cupId: 'utkast' });
    await next();
    await next();
    await back();
    expect(screen.getByTestId('create-cup-progress')).toHaveTextContent('Steg 2 av 3 · Sidepoeng');
    await act(async () => answer({ ok: true }));
    expect(screen.getByTestId('create-cup-progress')).toHaveTextContent('Steg 3 av 3 · Spillere');
  });

  it('«Ferdig» går til cupen', async () => {
    const navigation = await renderWizard({ cupId: 'utkast' });
    await next();
    await next();
    expect(screen.getByTestId('create-cup-progress')).toHaveTextContent('Steg 3 av 3 · Spillere');

    await fireEvent.press(screen.getByTestId('create-cup-done'));
    expect(navigation.popTo).toHaveBeenCalledWith('Cup', { cupId: 'utkast' });
  });

  it('kvitteringen etter en fjerning går til lista', async () => {
    await renderWizard({ cupId: 'utkast', notice: 'participant_removed' });
    await next();
    await next();
    expect(screen.getByTestId('players-body')).toHaveTextContent(/Spilleren er fjernet\./);
  });

  it('kvitteringen kommer ikke igjen når du går tilbake fra lista', async () => {
    const navigation = await renderWizard({ cupId: 'utkast', notice: 'participant_removed' });
    await next();
    await next();
    await back();
    expect(navigation.setParams).toHaveBeenCalledWith({ notice: undefined });
  });

  it('en cup som har startet: låst, uten skjema', async () => {
    (fetchCupSetup as jest.Mock).mockResolvedValue({ ok: true, view: draft({ status: 'active' }) });
    await renderWizard({ cupId: 'utkast' });
    expect(screen.getByTestId('create-cup-locked')).toBeTruthy();
    expect(screen.queryByTestId('create-cup-next')).toBeNull();
  });

  it('den som ikke styrer cupen: en setning, uten «Prøv igjen»', async () => {
    (fetchCupSetup as jest.Mock).mockResolvedValue({ ok: false, reason: 'not_manager' });
    await renderWizard({ cupId: 'utkast' });
    expect(screen.getByTestId('create-cup-failed')).toHaveTextContent('Det er arrangøren som setter opp cupen.');
    expect(screen.queryByTestId('create-cup-retry')).toBeNull();
  });

  it('uten nett: «Prøv igjen»', async () => {
    (fetchCupSetup as jest.Mock).mockResolvedValue({ ok: false, reason: 'offline' });
    await renderWizard({ cupId: 'utkast' });
    expect(screen.getByTestId('create-cup-retry')).toBeTruthy();
  });
});
