// #2752: spillerlista som skjerm (Type C). Serveren avgjør hvem som kan legges til; her
// låses hva lista viser, hva knappene sender, og at en startet cup er låst.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import type { AppCupParticipantsView } from '../../../../lib/cup/appCupSetupView';
import { addCupParticipant, fetchCupParticipants, setCupParticipantRole } from '../data/cupSetup';
import type { ScreenProps } from '../navigation';
import { CupParticipants } from './CupParticipants';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../lib/useMarkVisitRead', () => ({ useMarkVisitRead: (...args: unknown[]) => mockMarkRead(...args) }));
jest.mock('../lib/webLink', () => ({
  ...jest.requireActual('../lib/webLink'),
  webBaseUrl: () => 'https://tornygolf.no',
}));
jest.mock('../data/cupSetup', () => ({
  fetchCupParticipants: jest.fn(async () => mockResults.shift() ?? mockLast),
  addCupParticipant: jest.fn(async () => ({ ok: true })),
  setCupParticipantRole: jest.fn(async () => ({ ok: true })),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));

type Load = { ok: true; view: AppCupParticipantsView } | { ok: false; reason: string };
const mockMarkRead = jest.fn();
let mockFocus: () => void = () => {};
let mockResults: Load[] = [];
let mockLast: Load = { ok: false, reason: 'offline' };

function answer(...results: Load[]) {
  mockResults = [...results];
  mockLast = results[results.length - 1];
}

const room = (over: Partial<AppCupParticipantsView> = {}): AppCupParticipantsView => ({
  id: 'cup-1',
  name: 'Klubbmesterskapet',
  status: 'draft',
  team1Name: 'Team Nord',
  team2Name: 'Team Sør',
  shortId: 'abcd2345',
  cap: 40,
  participants: [{ userId: 'ola', name: 'Ola Kompis', hcpIndex: 12.4, teamNumber: 1, isCaptain: true }],
  candidates: [
    { userId: 'per', name: 'Per Putter', hcpIndex: 20, pending: false },
    { userId: 'tapp', name: 'Testspiller Tapp', hcpIndex: 0, pending: true },
  ],
  ...over,
});

async function renderList(params: Record<string, unknown> = {}) {
  const navigation = {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    getState: () => ({
      index: 2,
      routes: [{ name: 'Home' }, { name: 'Cup', params: { cupId: 'cup-1' } }, { name: 'CupParticipants', params: { cupId: 'cup-1' } }],
    }),
  };
  await render(
    <CupParticipants
      {...({
        navigation,
        route: { key: 'p', name: 'CupParticipants', params: { cupId: 'cup-1', ...params } },
      } as unknown as ScreenProps<'CupParticipants'>)}
    />,
  );
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CupParticipants', () => {
  it('å åpne lista merker varselet om påmeldingen som lest', async () => {
    answer({ ok: true, view: room() });
    await renderList();
    expect(mockMarkRead).toHaveBeenCalledWith('cupParticipants', 'cup-1');
  });

  it('viser påmeldte med tak og handicap, og hvem du kan legge til', async () => {
    answer({ ok: true, view: room() });
    await renderList();

    expect(screen.getByTestId('cup-players-count')).toHaveTextContent('1 av 40 påmeldte');
    expect(screen.getByTestId('cup-player-ola')).toHaveTextContent(/HCP 12,4/);
    expect(screen.getByTestId('cup-candidate-per')).toHaveTextContent(/Per Putter/);
  });

  it('«Legg til» sender spilleren, kvitterer og henter lista på nytt', async () => {
    answer({ ok: true, view: room() }, { ok: true, view: room({ candidates: [] }) });
    await renderList();

    await fireEvent.press(screen.getByTestId('cup-candidate-add-per'));

    expect(addCupParticipant).toHaveBeenCalledWith('cup-1', 'per');
    expect(screen.getByTestId('cup-players-notice')).toHaveTextContent('Spilleren er lagt til.');
    expect(screen.queryByTestId('cup-candidate-per')).toBeNull();
  });

  it('søket er tømt etter at du la til den du søkte etter', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ userId: `p${i}`, name: `Spiller ${i}`, hcpIndex: 1, pending: false }));
    answer({ ok: true, view: room({ candidates: many }) });
    await renderList();

    await fireEvent.changeText(screen.getByTestId('cup-players-search'), 'Spiller 29');
    await fireEvent.press(screen.getByTestId('cup-candidate-add-p29'));

    expect(screen.getByTestId('cup-players-search').props.value).toBe('');
    expect(screen.queryByTestId('cup-players-no-match')).toBeNull();
  });

  it('kvitteringen for å legge til forsvinner når du går videre til å fjerne', async () => {
    answer({ ok: true, view: room() });
    await renderList({ notice: 'participant_removed' });
    await fireEvent.press(screen.getByTestId('cup-candidate-add-per'));
    expect(screen.getByTestId('cup-players-notice')).toHaveTextContent('Spilleren er lagt til.');

    await fireEvent.press(screen.getByTestId('cup-player-remove-ola'));

    expect(screen.getByTestId('cup-players-notice')).toHaveTextContent('Spilleren er fjernet.');
  });

  it('en venn uten profil står, men kan ikke legges til', async () => {
    answer({ ok: true, view: room() });
    await renderList();
    expect(screen.getByTestId('cup-candidate-tapp')).toHaveTextContent(/Venter på profil/);
    expect(screen.queryByTestId('cup-candidate-add-tapp')).toBeNull();
  });

  it('serverens nei står, med taket', async () => {
    answer({ ok: true, view: room() });
    (addCupParticipant as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'too_many_players' });
    await renderList();
    await fireEvent.press(screen.getByTestId('cup-candidate-add-per'));
    expect(screen.getByTestId('cup-players-error')).toHaveTextContent('Cupen er full. Den tar 40 spillere.');
  });

  it('«Fjern» åpner bekreftelsen med det den trenger', async () => {
    answer({ ok: true, view: room() });
    const navigation = await renderList();
    await fireEvent.press(screen.getByTestId('cup-player-remove-ola'));
    expect(navigation.navigate).toHaveBeenCalledWith('CupRemovePlayer', {
      cupId: 'cup-1',
      userId: 'ola',
      name: 'Ola Kompis',
      cupName: 'Klubbmesterskapet',
      captain: true,
      returnTo: 'CupParticipants',
    });
    // Kvitteringen hører til forrige fjerning. Angrer du denne, skal den ikke stå der.
    expect(navigation.setParams).toHaveBeenCalledWith({ notice: undefined });
  });

  it('«Fjern» er smal, men trykkflaten er 44 pt', async () => {
    answer({ ok: true, view: room() });
    await renderList();
    expect(screen.getByTestId('cup-player-remove-ola').props.hitSlop).toEqual({ left: 8, right: 8 });
  });

  it('et nei på «Legg til»: feilen står alene, uten kvitteringen du kom tilbake med', async () => {
    answer({ ok: true, view: room() });
    (addCupParticipant as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'already_in_cup' });
    await renderList({ notice: 'participant_removed' });
    expect(screen.getByTestId('cup-players-notice')).toHaveTextContent('Spilleren er fjernet.');

    await fireEvent.press(screen.getByTestId('cup-candidate-add-per'));

    expect(screen.getByTestId('cup-players-error')).toBeTruthy();
    expect(screen.queryByTestId('cup-players-notice')).toBeNull();
  });

  it('kvitteringen etter en fjerning', async () => {
    answer({ ok: true, view: room() });
    await renderList({ notice: 'participant_removed' });
    expect(screen.getByTestId('cup-players-notice')).toHaveTextContent('Spilleren er fjernet.');
  });

  it('«Del lenka» deler cup-lenka', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    answer({ ok: true, view: room() });
    await renderList();
    await fireEvent.press(screen.getByTestId('cup-share-button'));
    expect(share).toHaveBeenCalledWith({ message: 'https://tornygolf.no/cup/bli-med/abcd2345' });
    share.mockRestore();
  });

  it('en lang liste har søk', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ userId: `p${i}`, name: `Spiller ${i}`, hcpIndex: 1, pending: false }));
    answer({ ok: true, view: room({ candidates: many }) });
    await renderList();
    expect(screen.queryByTestId('cup-candidate-p29')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('cup-players-search'), 'Spiller 29');
    expect(screen.getByTestId('cup-candidate-p29')).toBeTruthy();
  });

  it('alle er med: det står', async () => {
    answer({ ok: true, view: room({ candidates: [] }) });
    await renderList();
    expect(screen.getByTestId('cup-players-no-candidates')).toHaveTextContent('Alle tilgjengelige spillere er påmeldt.');
  });

  it('ingen å legge til ennå: det står', async () => {
    answer({ ok: true, view: room({ candidates: [], participants: [] }) });
    await renderList();
    expect(screen.getByTestId('cup-players-empty')).toBeTruthy();
    expect(screen.getByTestId('cup-players-no-candidates')).toHaveTextContent(/Inviter spillere/);
  });

  it('en cup som har startet: lista står, uten knappene', async () => {
    answer({ ok: true, view: room({ status: 'active', candidates: [] }) });
    await renderList();
    expect(screen.getByTestId('cup-players-locked')).toBeTruthy();
    expect(screen.queryByTestId('cup-player-remove-ola')).toBeNull();
    expect(screen.queryByTestId('cup-share')).toBeNull();
  });

  it('uten nett: det skjermen har, uten knappene', async () => {
    answer({ ok: true, view: room() }, { ok: false, reason: 'offline' });
    await renderList();
    await act(async () => {
      mockFocus();
    });
    expect(screen.getByTestId('cup-players-stale')).toBeTruthy();
    expect(screen.queryByTestId('cup-candidate-add-per')).toBeNull();
    expect(screen.queryByTestId('cup-player-remove-ola')).toBeNull();
  });

  it('en feil hos serveren sier ikke at det er nettet ditt, og «Prøv igjen» henter lista', async () => {
    answer({ ok: true, view: room() }, { ok: false, reason: 'load_failed' }, { ok: true, view: room() });
    await renderList();
    await act(async () => {
      mockFocus();
    });
    expect(screen.getByTestId('cup-players-stale')).toHaveTextContent('Fikk ikke tak i cupen. Prøv igjen.');
    expect(screen.queryByTestId('cup-candidate-add-per')).toBeNull();

    await fireEvent.press(screen.getByTestId('cup-players-retry'));

    expect(screen.queryByTestId('cup-players-stale')).toBeNull();
    expect(screen.getByTestId('cup-candidate-add-per')).toBeTruthy();
  });

  describe('lag og kaptein', () => {
    it('«Lagre» kommer først når noe er endret, og sender lag og kaptein', async () => {
      answer({ ok: true, view: room() });
      await renderList();
      const save = 'cup-player-save-role-ola';
      expect(screen.queryByTestId(save)).toBeNull();
      await fireEvent.press(screen.getByTestId('cup-player-team-ola-2'));
      await fireEvent.press(screen.getByTestId(save));
      expect(setCupParticipantRole).toHaveBeenCalledWith('cup-1', 'ola', { teamNumber: 2, isCaptain: true });
    });

    it('uten lag kan ingen være kaptein: bryteren er borte, og flagget følger med', async () => {
      answer({ ok: true, view: room() });
      await renderList();
      expect(screen.getByTestId('cup-player-captain-ola')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('cup-player-team-ola-0'));
      expect(screen.queryByTestId('cup-player-captain-ola')).toBeNull();
      await fireEvent.press(screen.getByTestId('cup-player-save-role-ola'));
      expect(setCupParticipantRole).toHaveBeenCalledWith('cup-1', 'ola', { teamNumber: null, isCaptain: false });
    });

    it('et nei står med nettets setning, og lista leses på nytt', async () => {
      answer({ ok: true, view: room() });
      (setCupParticipantRole as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'team_taken' });
      await renderList();
      await fireEvent.press(screen.getByTestId('cup-player-team-ola-2'));
      const reads = (fetchCupParticipants as jest.Mock).mock.calls.length;
      await fireEvent.press(screen.getByTestId('cup-player-save-role-ola'));
      expect(screen.getByTestId('cup-player-role-error-ola')).toHaveTextContent('Laget har allerede en kaptein.');
      expect(screen.queryByTestId('cup-players-error')).toBeNull();
      expect((fetchCupParticipants as jest.Mock).mock.calls.length).toBe(reads + 1);
    });

    it('er spilleren borte etter lesingen, står neiet øverst', async () => {
      answer({ ok: true, view: room() }, { ok: true, view: room({ participants: [] }) });
      (setCupParticipantRole as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'not_participant' });
      await renderList();
      await fireEvent.press(screen.getByTestId('cup-player-team-ola-2'));
      await fireEvent.press(screen.getByTestId('cup-player-save-role-ola'));
      expect(screen.getByTestId('cup-players-error')).toHaveTextContent('Spilleren står ikke på deltakerlista.');
    });

    it('lagret står uten «Lagre», når lista har lest det nye', async () => {
      const saved = room();
      saved.participants = saved.participants.map((p) => (p.userId === 'ola' ? { ...p, teamNumber: 2 as const } : p));
      answer({ ok: true, view: room() }, { ok: true, view: saved });
      await renderList();
      await fireEvent.press(screen.getByTestId('cup-player-team-ola-2'));
      await fireEvent.press(screen.getByTestId('cup-player-save-role-ola'));
      expect(screen.queryByTestId('cup-player-save-role-ola')).toBeNull();
    });

    it('etter start: både lista og rollene er låst, som på nettet', async () => {
      const started = room();
      started.status = 'active';
      answer({ ok: true, view: started });
      await renderList();
      expect(screen.getByTestId('cup-players-locked')).toHaveTextContent('Cupen er startet, så spillerlista er låst.');
      expect(screen.queryByTestId('cup-player-role-ola')).toBeNull();
      expect(screen.queryByTestId('cup-player-remove-ola')).toBeNull();
    });

    it('en ferdig cup: ingen valg', async () => {
      const finished = room();
      finished.status = 'finished';
      answer({ ok: true, view: finished });
      await renderList();
      expect(screen.getByTestId('cup-players-locked')).toHaveTextContent('Cupen er startet, så spillerlista er låst.');
      expect(screen.queryByTestId('cup-player-role-ola')).toBeNull();
    });

    it('uten ferske tall: ingen valg', async () => {
      answer({ ok: true, view: room() }, { ok: false, reason: 'offline' });
      await renderList();
      await act(async () => {
        mockFocus();
      });
      expect(screen.queryByTestId('cup-player-role-ola')).toBeNull();
    });
  });

  it('den som ikke styrer cupen: en setning, uten «Prøv igjen»', async () => {
    answer({ ok: false, reason: 'not_manager' });
    await renderList();
    expect(screen.getByTestId('cup-players-failed')).toHaveTextContent('Det er arrangøren som setter opp cupen.');
    expect(screen.queryByTestId('cup-players-retry')).toBeNull();
  });
});
