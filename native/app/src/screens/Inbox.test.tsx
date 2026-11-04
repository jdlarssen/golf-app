// native/app/src/screens/Inbox.test.tsx
// #2759: innboksen i appen (Type C).
//
// Tekstene er `inboxCopy.test.ts` sine, stiene `inboxTarget.test.ts` sine, og hva
// hver handling sender, er `data/inbox.test.ts` sitt. Her låses koblingene bare en
// render kan bekrefte: et trykk på en sak som venter, merker ingenting, knappen følger
// `hasUnread`, en handling venter på svar og er låst mens den går, og en feilet lesing
// er aldri en tom innboks.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import {
  clearReadRows,
  decideRegistration,
  loadInbox,
  markAllRead,
  type InboxData,
  type InboxEntry,
} from '../data/inbox';
import { markNotificationIdsRead } from '../data/markRead';
import { openScreenTarget } from '../lib/openPushTarget';
import { openWeb } from '../lib/webLink';
import type { ScreenProps } from '../navigation';
import { Inbox } from './Inbox';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../lib/useOnResume', () => ({
  useOnResume: (callback: () => void) => {
    mockResume = callback;
  },
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));
jest.mock('../data/inbox', () => ({
  ...jest.requireActual('../data/inbox'),
  loadInbox: jest.fn(),
  decideRegistration: jest.fn(),
  markAllRead: jest.fn(),
  clearReadRows: jest.fn(),
}));
jest.mock('../data/markRead', () => ({ markNotificationIdsRead: jest.fn(async () => undefined) }));
jest.mock('../lib/openPushTarget', () => ({ openScreenTarget: jest.fn() }));
jest.mock('../lib/webLink', () => ({
  ...jest.requireActual('../lib/webLink'),
  openWeb: jest.fn(async () => ({ ok: true })),
}));

let mockFocus: () => void = () => {};
let mockResume: () => void = () => {};

const loadMock = loadInbox as jest.Mock;
const decideMock = decideRegistration as jest.Mock;
const markAllMock = markAllRead as jest.Mock;
const clearMock = clearReadRows as jest.Mock;
const markIdsMock = markNotificationIdsRead as jest.Mock;
const openMock = openScreenTarget as jest.Mock;
const openWebMock = openWeb as jest.Mock;

function entry(over: Partial<InboxEntry> & { key: string; title: string }): InboxEntry {
  return {
    subtitle: 'Lørdagsrunden',
    subtitleIsFreeText: false,
    quote: null,
    body: null,
    cta: null,
    avatar: { kind: 'icon', icon: 'konvolutt' },
    placeLabel: null,
    destination: null,
    actionKey: null,
    unread: false,
    unreadIds: [],
    friend: false,
    decidable: false,
    ...over,
  };
}

const CARDS = entry({
  key: 'peer',
  title: '2 scorekort venter på deg',
  destination: '/games/g1/approve',
  actionKey: 'review',
  unread: true,
});
const SIGNUP = entry({
  key: 'signup',
  title: 'Kristian vil bli med',
  destination: '/admin/games/g2/signups',
  actionKey: 'decide',
  unread: true,
  decidable: true,
});
const DELIVERED = entry({
  key: 'delivered',
  title: '4 scorekort levert',
  destination: '/games/g1',
  unread: true,
  unreadIds: ['d1', 'd2'],
  avatar: { kind: 'people', initials: ['ML', 'JB'], more: 2 },
});
const FRIEND = entry({
  key: 'friend',
  title: 'Anders la deg til som venn',
  destination: '/profile/venner',
  friend: true,
  avatar: { kind: 'people', initials: ['AM'], more: 0 },
});
const RESULT = entry({
  key: 'result',
  title: 'Resultatet er klart',
  destination: '/games/g3/leaderboard',
  avatar: { kind: 'place', rank: 2 },
  placeLabel: '2. plass av 12',
});
const CANCELLED = entry({ key: 'cancelled', title: 'Runden er avlyst', unread: true, unreadIds: ['c1'] });

const BOARD: InboxData = {
  actionCount: 2,
  hasUnread: true,
  unreadCount: 5,
  sections: { action: [CARDS, SIGNUP], today: [DELIVERED, FRIEND], earlier: [RESULT, CANCELLED] },
};
const ONLY_WAITING: InboxData = {
  actionCount: 1,
  hasUnread: false,
  unreadCount: 1,
  sections: { action: [CARDS], today: [], earlier: [] },
};
const EMPTY: InboxData = {
  actionCount: 0,
  hasUnread: false,
  unreadCount: 0,
  sections: { action: [], today: [], earlier: [] },
};

const NAVIGATION = {} as unknown as ScreenProps<'Inbox'>['navigation'];

async function renderInbox(first: InboxData = BOARD) {
  loadMock.mockResolvedValue({ ok: true, data: first });
  await render(<Inbox {...({ navigation: NAVIGATION, route: {} } as unknown as ScreenProps<'Inbox'>)} />);
  await screen.findByTestId('inbox-screen');
}

const refocus = () =>
  act(async () => {
    mockFocus();
  });

beforeEach(() => {
  jest.clearAllMocks();
  markAllMock.mockResolvedValue(true);
  clearMock.mockResolvedValue(true);
  decideMock.mockResolvedValue({ ok: true, outcome: 'approved', gameName: 'Onsdagsgolfen', teamName: null, name: 'Kristian' });
});

describe('tavla', () => {
  it('seksjonene i rekkefølge, med tallet på brikka', async () => {
    await renderInbox();
    expect(within(screen.getByTestId('inbox-section-action')).getByText('Krever handling')).toBeTruthy();
    expect(within(screen.getByTestId('inbox-section-today')).getByText('I dag')).toBeTruthy();
    expect(within(screen.getByTestId('inbox-section-earlier')).getByText('Tidligere')).toBeTruthy();
    expect(screen.getByText('Krever handling · 2')).toBeTruthy();
    expect(screen.getByText('Se over')).toBeTruthy();
  });

  it('brikkene filtrerer, og «Venner» viser det webben viser', async () => {
    await renderInbox();
    await fireEvent.press(screen.getByTestId('inbox-filter-action'));
    expect(screen.getByTestId('inbox-section-action')).toBeTruthy();
    expect(screen.queryByTestId('inbox-section-today')).toBeNull();

    await fireEvent.press(screen.getByTestId('inbox-filter-friends'));
    expect(screen.queryByTestId('inbox-section-action')).toBeNull();
    expect(screen.getByText('Anders la deg til som venn')).toBeTruthy();
    expect(screen.queryByText('4 scorekort levert')).toBeNull();
  });

  it('et filter uten rader sier det, og brikka uten tall virker fortsatt', async () => {
    await renderInbox({ ...ONLY_WAITING, actionCount: 0, sections: { action: [], today: [DELIVERED], earlier: [] } });
    expect(screen.getByTestId('inbox-filter-action')).toHaveTextContent('Krever handling');
    await fireEvent.press(screen.getByTestId('inbox-filter-action'));
    expect(screen.getByTestId('inbox-empty-filter')).toHaveTextContent('Ingenting her nå.');
  });

  it('tom innboks: tekstene fra nettet, uten pille og brikker', async () => {
    await renderInbox(EMPTY);
    expect(screen.getByTestId('inbox-empty')).toHaveTextContent(/Ingen nye varsler\./);
    expect(screen.getByText('«Innboksen er ren.»')).toBeTruthy();
    expect(screen.queryByTestId('inbox-mark-all')).toBeNull();
    expect(screen.queryByTestId('inbox-clear-read')).toBeNull();
    expect(screen.queryByTestId('inbox-filter-all')).toBeNull();
  });

  it('skiva viser plass, initialer eller ikon, og skjermleseren får plassen i ord', async () => {
    await renderInbox();
    expect(screen.getByTestId('inbox-place-disc')).toHaveTextContent('2');
    expect(screen.getByTestId('inbox-initials-stack')).toHaveTextContent('MLJB+2');
    expect(screen.getByTestId('inbox-initials')).toHaveTextContent('AM');
    expect(screen.getByTestId('inbox-icon-disc')).toBeTruthy();
    expect(screen.getByLabelText(/Resultatet er klart.*2\. plass av 12/)).toBeTruthy();
  });

  it('tap-flatene er minst 44 pt', async () => {
    await renderInbox();
    for (const id of ['inbox-mark-all', 'inbox-filter-all', 'inbox-approve', 'inbox-reject', 'inbox-action-button']) {
      expect(screen.getByTestId(id)).toHaveStyle({ height: 44 });
    }
  });

  it('henter på nytt når skjermen får fokus igjen', async () => {
    await renderInbox();
    expect(loadMock).toHaveBeenCalledTimes(1);
    loadMock.mockResolvedValue({ ok: true, data: EMPTY });
    await refocus();
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId('inbox-empty')).toBeTruthy();
  });

  it('henter på nytt når appen kommer tilbake', async () => {
    await renderInbox();
    loadMock.mockResolvedValue({ ok: true, data: EMPTY });
    await act(async () => {
      mockResume();
    });
    expect(screen.getByTestId('inbox-empty')).toBeTruthy();
  });

  it('et tregt svar fra forrige fokus legger seg ikke over et nyere', async () => {
    await renderInbox(EMPTY);
    let slow: (value: unknown) => void = () => {};
    loadMock.mockReturnValueOnce(new Promise((resolve) => (slow = resolve)));
    await refocus();
    loadMock.mockResolvedValueOnce({ ok: true, data: BOARD });
    await refocus();
    expect(await screen.findByText('Se over')).toBeTruthy();
    await act(async () => {
      slow({ ok: true, data: EMPTY });
    });
    expect(screen.getByText('Se over')).toBeTruthy();
  });
});

describe('et trykk', () => {
  it('på en sak som venter, merker ingenting og åpner skjermen', async () => {
    await renderInbox();
    await fireEvent.press(screen.getByTestId('inbox-action-button'));
    expect(markIdsMock).not.toHaveBeenCalled();
    expect(openMock).toHaveBeenCalledWith(NAVIGATION, { name: 'Approve', params: { gameId: 'g1' } });
    expect(screen.getByText('2 scorekort venter på deg')).toBeTruthy();
  });

  it('på en gruppe merker alle de uleste og åpner skjermen, uten å vente', async () => {
    markIdsMock.mockReturnValueOnce(new Promise(() => {}));
    await renderInbox();
    await fireEvent.press(screen.getByText('4 scorekort levert'));
    expect(markIdsMock).toHaveBeenCalledWith(['d1', 'd2']);
    expect(openMock).toHaveBeenCalledWith(NAVIGATION, { name: 'GameHome', params: { gameId: 'g1' } });
  });

  it('på en lest rad skriver ingenting', async () => {
    await renderInbox();
    await fireEvent.press(screen.getByText('Anders la deg til som venn'));
    expect(markIdsMock).not.toHaveBeenCalled();
    expect(openMock).toHaveBeenCalledWith(NAVIGATION, { name: 'Friends', params: { from: 'notification' } });
  });

  it('uten mål navigerer ikke, merker og henter på nytt', async () => {
    await renderInbox();
    await fireEvent.press(screen.getByText('Runden er avlyst'));
    expect(markIdsMock).toHaveBeenCalledWith(['c1']);
    expect(openMock).not.toHaveBeenCalled();
    expect(openWebMock).not.toHaveBeenCalled();
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it('uten mål har raden ingen pil, med mål har den', async () => {
    await renderInbox({
      ...BOARD,
      sections: { action: [], today: [CANCELLED], earlier: [] },
    });
    expect(screen.queryByTestId('inbox-row-arrow')).toBeNull();
  });

  it('på noe appen ikke har, åpner nettsiden', async () => {
    const team = entry({ key: 't', title: 'Lag', destination: '/signup/abcd1234/team' });
    await renderInbox({ ...BOARD, sections: { action: [], today: [team], earlier: [] } });
    await fireEvent.press(screen.getByText('Lag'));
    expect(openWebMock).toHaveBeenCalledWith('/signup/abcd1234/team');
  });

  it('en lenke som ikke kunne åpnes, sier fra', async () => {
    openWebMock.mockResolvedValueOnce({ ok: false, reason: 'open-failed' });
    const team = entry({ key: 't', title: 'Lag', destination: '/signup/abcd1234/team' });
    await renderInbox({ ...BOARD, sections: { action: [], today: [team], earlier: [] } });
    await fireEvent.press(screen.getByText('Lag'));
    expect(await screen.findByTestId('inbox-action-error')).toBeTruthy();
  });

  it('nyheter viser brødteksten og knappen, som går dit lenka sier', async () => {
    const news = entry({
      key: 'news',
      title: 'Nytt i Tørny',
      body: 'Det er kommet noe nytt.',
      cta: { href: '/games/g9', label: 'Se det' },
      unread: true,
      unreadIds: ['news'],
    });
    await renderInbox({ ...BOARD, sections: { action: [], today: [news], earlier: [] } });
    expect(screen.getByText('Det er kommet noe nytt.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('inbox-row-cta'));
    expect(markIdsMock).toHaveBeenCalledWith(['news']);
    expect(openMock).toHaveBeenCalledWith(NAVIGATION, { name: 'GameHome', params: { gameId: 'g9' } });
  });
});

describe('«Marker alt lest» og «Tøm leste»', () => {
  it('knappen er «Marker alt lest» når noe kan merkes', async () => {
    await renderInbox();
    expect(screen.getByTestId('inbox-mark-all')).toHaveTextContent('Marker alt lest');
  });

  it('bare saker som venter: knappen er «Tøm leste», og den rører dem ikke', async () => {
    await renderInbox(ONLY_WAITING);
    expect(screen.queryByTestId('inbox-mark-all')).toBeNull();
    await fireEvent.press(screen.getByTestId('inbox-clear-read'));
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(markAllMock).not.toHaveBeenCalled();
    expect(screen.getByText('2 scorekort venter på deg')).toBeTruthy();
  });

  it('venter på svaret, og lista følger serveren etterpå', async () => {
    await renderInbox();
    let answer: (value: boolean) => void = () => {};
    markAllMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await fireEvent.press(screen.getByTestId('inbox-mark-all'));
    expect(screen.getByTestId('inbox-mark-all').props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(screen.getByText('4 scorekort levert')).toBeTruthy();

    loadMock.mockResolvedValue({ ok: true, data: ONLY_WAITING });
    await act(async () => {
      answer(true);
    });
    expect(screen.getByTestId('inbox-clear-read')).toBeTruthy();
    expect(screen.queryByText('4 scorekort levert')).toBeNull();
  });

  it.each([
    ['inbox-mark-all', markAllMock],
    ['inbox-clear-read', clearMock],
  ])('%s som feiler: lista står, og feillinja sier fra', async (id, mock) => {
    mock.mockResolvedValue(false);
    await renderInbox(id === 'inbox-mark-all' ? BOARD : ONLY_WAITING);
    await fireEvent.press(screen.getByTestId(id));
    expect(await screen.findByTestId('inbox-action-error')).toHaveTextContent('Fikk ikke lagret — prøv igjen.');
    expect(screen.getByText('2 scorekort venter på deg')).toBeTruthy();
    expect(loadMock).toHaveBeenCalledTimes(1);
  });
});

describe('«Godta» og «Avslå»', () => {
  it('sender svaret, sier hvem som er med, og henter på nytt', async () => {
    await renderInbox();
    await fireEvent.press(screen.getByTestId('inbox-approve'));
    expect(decideMock).toHaveBeenCalledWith('signup', 'approve');
    expect(await screen.findByTestId('inbox-status')).toHaveTextContent('Kristian er med i Onsdagsgolfen');
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it('«Avslå» sender nei', async () => {
    decideMock.mockResolvedValue({ ok: true, outcome: 'rejected', gameName: 'G', teamName: null, name: 'Kristian' });
    await renderInbox();
    await fireEvent.press(screen.getByTestId('inbox-reject'));
    expect(decideMock).toHaveBeenCalledWith('signup', 'reject');
    expect(await screen.findByTestId('inbox-status')).toHaveTextContent('Kristian fikk beskjed om at det ble nei');
  });

  // Rød uten låsen: en state slår først inn ved neste bilde, og to trykk i samme
  // bilde ville sendt to svar.
  it('to trykk i samme bilde sender ett svar', async () => {
    await renderInbox();
    let answer: (value: unknown) => void = () => {};
    decideMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const approve = screen.getByTestId('inbox-approve');
    await act(async () => {
      void fireEvent.press(approve);
      void fireEvent.press(approve);
    });
    expect(decideMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer({ ok: true, outcome: 'approved', gameName: 'G', teamName: null, name: null });
    });
  });

  it('knappene og pillen står stille mens et svar går, og låsen slippes etterpå', async () => {
    await renderInbox();
    let answer: (value: unknown) => void = () => {};
    decideMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await fireEvent.press(screen.getByTestId('inbox-approve'));
    expect(screen.getByTestId('inbox-reject').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('inbox-mark-all').props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      answer({ ok: false, reason: 'failed' });
    });
    expect(screen.getByTestId('inbox-approve').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it.each([
    ['not_pending', 'Den er allerede avgjort'],
    ['request_not_found', 'Den er allerede avgjort'],
    ['game_not_found', 'Den er allerede avgjort'],
    ['game_locked', 'Spillet er startet eller avsluttet. Påmeldinger kan ikke endres lenger.'],
  ])('%s: statuslinja forklarer, og lista hentes på nytt', async (reason, text) => {
    decideMock.mockResolvedValue({ ok: false, reason });
    await renderInbox();
    await fireEvent.press(screen.getByTestId('inbox-approve'));
    expect(await screen.findByTestId('inbox-status')).toHaveTextContent(text);
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['no_team_slot', 'Spillet har ingen ledige lag igjen.'],
    ['forbidden', 'Du har ikke tilgang til å svare på denne påmeldingen.'],
    ['failed', 'Fikk ikke lagret — prøv igjen.'],
    ['offline', 'Fikk ikke lagret — prøv igjen.'],
  ])('%s: raden står, og feillinja sier hvorfor', async (reason, text) => {
    decideMock.mockResolvedValue({ ok: false, reason });
    await renderInbox();
    await fireEvent.press(screen.getByTestId('inbox-approve'));
    expect(await screen.findByTestId('inbox-action-error')).toHaveTextContent(text);
    expect(screen.getByTestId('inbox-approve')).toBeTruthy();
    expect(loadMock).toHaveBeenCalledTimes(1);
  });
});

describe('uten nett og med feil', () => {
  it('uten nett står setningen og «Prøv igjen», uten rå feiltekst', async () => {
    loadMock.mockResolvedValue({ ok: false, reason: 'offline' });
    await render(<Inbox {...({ navigation: NAVIGATION, route: {} } as unknown as ScreenProps<'Inbox'>)} />);
    expect(await screen.findByTestId('inbox-load-error')).toHaveTextContent(
      'Du må være på nett for å se innboksen. Koble til og prøv igjen.',
    );
    expect(screen.queryByTestId('inbox-empty')).toBeNull();
    loadMock.mockResolvedValue({ ok: true, data: BOARD });
    await fireEvent.press(screen.getByTestId('inbox-retry'));
    expect(await screen.findByText('Se over')).toBeTruthy();
    expect(screen.queryByTestId('inbox-load-error')).toBeNull();
  });

  it('load_failed er en feil, aldri en tom innboks (#1392)', async () => {
    loadMock.mockResolvedValue({ ok: false, reason: 'load_failed' });
    await render(<Inbox {...({ navigation: NAVIGATION, route: {} } as unknown as ScreenProps<'Inbox'>)} />);
    expect(await screen.findByTestId('inbox-load-error')).toHaveTextContent('Fikk ikke hentet innboksen. Prøv igjen.');
    expect(screen.queryByTestId('inbox-empty')).toBeNull();
    expect(screen.queryByText('Ingen nye varsler.')).toBeNull();
  });

  it('lista som alt er hentet, blir stående', async () => {
    await renderInbox();
    loadMock.mockResolvedValue({ ok: false, reason: 'offline' });
    await refocus();
    expect(await screen.findByTestId('inbox-load-error')).toBeTruthy();
    expect(screen.getByText('2 scorekort venter på deg')).toBeTruthy();
  });
});
