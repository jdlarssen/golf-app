// native/app/src/screens/Inbox.test.tsx
// #2759: innboksen (Type C).
//
// Reglene er serverens (`lib/notifications/inboxWire.test.ts`), tekstene
// `inboxCopy.test.ts` sine og målene `inboxTarget.test.ts` sine. Her låses
// koblingene bare en render kan bekrefte: hva skjermen viser i hver tilstand, at
// knappene venter på svar og sier fra, og at et trykk merker og navigerer.
//
// Flere renders og ikke én: tavle, tom, uten nett og feilet lasting er tilstander
// skjermen ikke kan være i samtidig (samme grunn som Friends.test.tsx).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { InboxWire, InboxWireEntry } from '../../../../lib/notifications/inboxWire';
import { clearRead, decideRequest, loadInbox, markAllRead } from '../data/inbox';
import { markNotificationIdsRead } from '../data/markRead';
import { INBOX_TEXT } from '../lib/inboxCopy';
import { openWeb } from '../lib/webLink';
import type { ScreenProps } from '../navigation';
import { Inbox } from './Inbox';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
jest.mock('../data/syncTriggers', () => require('../test/syncTriggersMock'));
jest.mock('../data/inbox', () => ({
  loadInbox: jest.fn(),
  decideRequest: jest.fn(),
  markAllRead: jest.fn(),
  clearRead: jest.fn(),
}));
jest.mock('../data/markRead', () => ({ markNotificationIdsRead: jest.fn(async () => undefined) }));
jest.mock('../lib/webLink', () => ({
  ...jest.requireActual('../lib/webLink'),
  openWeb: jest.fn(async () => ({ ok: true })),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

const loadMock = loadInbox as jest.Mock;
const decideMock = decideRequest as jest.Mock;
const markAllMock = markAllRead as jest.Mock;
const clearMock = clearRead as jest.Mock;
const markIdsMock = markNotificationIdsRead as jest.Mock;
const openWebMock = openWeb as jest.Mock;

function entry(over: Partial<InboxWireEntry> & { key: string }): InboxWireEntry {
  return {
    title: 'Tittel',
    subtitle: 'Underlinje',
    subtitleIsFreeText: false,
    quote: null,
    body: null,
    cta: null,
    avatar: { kind: 'people', initials: ['ML'], more: 0 },
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

const REVIEW = entry({
  key: 'peer_approval_request:g1',
  title: '2 scorekort venter på deg',
  destination: '/games/g1/approve',
  actionKey: 'review',
  unread: true,
  unreadIds: ['a', 'b'],
});
const REQUEST = entry({
  key: 'req',
  title: 'Kristian vil bli med',
  destination: '/admin/games/g1/signups',
  actionKey: 'decide',
  unread: true,
  unreadIds: ['req'],
  decidable: true,
});
const FRIEND = entry({
  key: 'friend',
  title: 'Anders la deg til som venn',
  destination: '/profile/venner',
  friend: true,
});
const CLUB = entry({ key: 'club', title: 'Du er admin', destination: '/klubber/k1', unread: true, unreadIds: ['club'] });
const CANCELLED = entry({ key: 'cancel', title: 'Spillet er avlyst', unread: true, unreadIds: ['cancel'] });
const NEWS = entry({
  key: 'news',
  title: 'Nytt i Tørny',
  body: 'Brødtekst',
  cta: { href: '/liga/l1', label: 'Se ligaen' },
});

const BOARD: InboxWire = {
  actionCount: 2,
  hasUnread: true,
  unreadCount: 3,
  sections: { action: [REVIEW, REQUEST], today: [FRIEND, CLUB, CANCELLED], earlier: [NEWS] },
};
const EMPTY: InboxWire = { actionCount: 0, hasUnread: false, unreadCount: 0, sections: { action: [], today: [], earlier: [] } };

const NAV_ROUTES = [{ name: 'Home' }, { name: 'Inbox' }];
function renderScreen() {
  const navigation = {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    getState: () => ({ index: 1, routes: NAV_ROUTES }),
  };
  return {
    navigation,
    view: render(<Inbox {...({ navigation, route: {} } as unknown as ScreenProps<'Inbox'>)} />),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  loadMock.mockResolvedValue({ ok: true, board: BOARD });
  markAllMock.mockResolvedValue(true);
  clearMock.mockResolvedValue(true);
});

describe('tavla', () => {
  it('viser seksjonene, tallet på brikka og radene serveren sendte', async () => {
    await renderScreen().view;
    expect(screen.getByTestId('inbox-filter-action')).toBeTruthy();
    expect(screen.getByText('Krever handling · 2')).toBeTruthy();
    expect(screen.getByText('2 scorekort venter på deg')).toBeTruthy();
    expect(screen.getByTestId('inbox-section-action')).toBeTruthy();
    expect(screen.getByTestId('inbox-section-today')).toBeTruthy();
    expect(screen.getByText('I dag')).toBeTruthy();
    expect(screen.getByText('Tidligere')).toBeTruthy();
    expect(screen.getByTestId('inbox-mark-all')).toBeTruthy();
  });

  it('filteret «Venner» viser bare vennerader, og et tomt filter sier det', async () => {
    await renderScreen().view;
    await fireEvent.press(screen.getByTestId('inbox-filter-friends'));
    expect(screen.getByText('Anders la deg til som venn')).toBeTruthy();
    expect(screen.queryByText('2 scorekort venter på deg')).toBeNull();
  });

  it('«Krever handling» uten noe å gjøre har brikke uten tall, og sier at det er tomt', async () => {
    loadMock.mockResolvedValue({
      ok: true,
      board: { actionCount: 0, hasUnread: false, unreadCount: 0, sections: { action: [], today: [FRIEND], earlier: [] } },
    });
    await renderScreen().view;
    expect(screen.getByText('Krever handling')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('inbox-filter-action'));
    expect(screen.getByTestId('inbox-empty-filter')).toBeTruthy();
  });

  it('en tom innboks viser tomtilstanden og ingen knapp eller brikker', async () => {
    loadMock.mockResolvedValue({ ok: true, board: EMPTY });
    await renderScreen().view;
    expect(screen.getByText(INBOX_TEXT.emptyHeading)).toBeTruthy();
    // Appen har ikke et kursivt Fraunces-snitt, og da ville Android tegnet systemfonten.
    const quote = StyleSheet.flatten(screen.getByText(`«${INBOX_TEXT.cleanPullQuote}»`).props.style);
    expect(quote.fontStyle).toBeUndefined();
    expect(quote.fontFamily).toMatch(/^Fraunces/);
    expect(screen.queryByTestId('inbox-mark-all')).toBeNull();
    expect(screen.queryByTestId('inbox-filter-all')).toBeNull();
  });
});

describe('uten svar', () => {
  it('uten nett står setningen og «Prøv igjen», og et nytt forsøk henter', async () => {
    loadMock.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    await renderScreen().view;
    expect(screen.getByTestId('inbox-load-error').props.children).toBe(INBOX_TEXT.offline);
    expect(screen.queryByText(INBOX_TEXT.emptyHeading)).toBeNull();

    await fireEvent.press(screen.getByTestId('inbox-retry'));
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('2 scorekort venter på deg')).toBeTruthy();
  });

  it('`load_failed` er en feil, aldri en tom innboks (#1392)', async () => {
    loadMock.mockResolvedValue({ ok: false, reason: 'load_failed' });
    await renderScreen().view;
    expect(screen.getByTestId('inbox-load-error').props.children).toBe(INBOX_TEXT.loadFailed);
    expect(screen.queryByText(INBOX_TEXT.emptyHeading)).toBeNull();
  });

  it('en feilet ny henting lar lista stå, med setningen over', async () => {
    await renderScreen().view;
    loadMock.mockResolvedValue({ ok: false, reason: 'offline' });
    await fireEvent.press(screen.getByTestId('inbox-mark-all'));
    expect(screen.getByText('2 scorekort venter på deg')).toBeTruthy();
    expect(screen.getByTestId('inbox-load-error').props.children).toBe(INBOX_TEXT.offline);
  });
});

describe('et trykk', () => {
  it('merker alle uleste i gruppen og åpner skjermen med spillet under', async () => {
    const { navigation, view } = renderScreen();
    await view;
    await fireEvent.press(screen.getAllByTestId('inbox-action-open')[0]!);
    expect(markIdsMock).toHaveBeenCalledWith(['a', 'b']);
    expect(navigation.navigate.mock.calls.map((call) => call[0])).toEqual(['GameHome', 'Approve']);
  });

  it('en rad som alt er lest, skrives ikke på nytt (#1665)', async () => {
    const { navigation, view } = renderScreen();
    await view;
    await fireEvent.press(screen.getByText('Anders la deg til som venn'));
    expect(markIdsMock).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('Friends', { from: 'notification' });
  });

  it('en sti uten skjerm i appen åpner nettsiden', async () => {
    const { navigation, view } = renderScreen();
    await view;
    await fireEvent.press(screen.getByText('Du er admin'));
    expect(markIdsMock).toHaveBeenCalledWith(['club']);
    expect(openWebMock).toHaveBeenCalledWith('/klubber/k1');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('en nettside som ikke åpner seg, sier fra', async () => {
    openWebMock.mockResolvedValueOnce({ ok: false, reason: 'open-failed' });
    await renderScreen().view;
    await fireEvent.press(screen.getByText('Du er admin'));
    expect(screen.getByTestId('inbox-action-error')).toBeTruthy();
  });

  it('uten mål navigerer den ikke, den merker bare lest', async () => {
    const { navigation, view } = renderScreen();
    await view;
    await fireEvent.press(screen.getByText('Spillet er avlyst'));
    expect(markIdsMock).toHaveBeenCalledWith(['cancel']);
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(openWebMock).not.toHaveBeenCalled();
  });

  it('nyheten har brødteksten i raden, og knappen fører til lenka', async () => {
    const { navigation, view } = renderScreen();
    await view;
    expect(screen.getByText('Brødtekst')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('inbox-row-cta'));
    expect(navigation.navigate).toHaveBeenCalledWith('League', { leagueId: 'l1' });
  });
});

describe('knappene øverst', () => {
  it('«Marker alt lest» venter, og henter på nytt etterpå', async () => {
    await renderScreen().view;
    await fireEvent.press(screen.getByTestId('inbox-mark-all'));
    expect(markAllMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('inbox-action-error')).toBeNull();
  });

  it('en feil lar lista stå, med feillinja, og knappen virker igjen', async () => {
    markAllMock.mockResolvedValue(false);
    await renderScreen().view;
    await fireEvent.press(screen.getByTestId('inbox-mark-all'));
    expect(screen.getByTestId('inbox-action-error').props.children).toBe(INBOX_TEXT.actionFailed);
    expect(screen.getByText('2 scorekort venter på deg')).toBeTruthy();
    expect(screen.getByTestId('inbox-mark-all').props.accessibilityState.disabled).toBe(false);
  });

  it('er alt lest, heter knappen «Tøm leste»', async () => {
    loadMock.mockResolvedValue({
      ok: true,
      board: { actionCount: 0, hasUnread: false, unreadCount: 0, sections: { action: [], today: [FRIEND], earlier: [] } },
    });
    await renderScreen().view;
    await fireEvent.press(screen.getByTestId('inbox-clear-read'));
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it('«Tøm leste» som feiler, viser feillinja', async () => {
    clearMock.mockResolvedValue(false);
    loadMock.mockResolvedValue({
      ok: true,
      board: { actionCount: 0, hasUnread: false, unreadCount: 0, sections: { action: [], today: [FRIEND], earlier: [] } },
    });
    await renderScreen().view;
    await fireEvent.press(screen.getByTestId('inbox-clear-read'));
    expect(screen.getByTestId('inbox-action-error').props.children).toBe(INBOX_TEXT.actionFailed);
    expect(screen.getByText('Anders la deg til som venn')).toBeTruthy();
  });
});

describe('«Godta» og «Avslå»', () => {
  it('svarer på varselet, sier hvordan det gikk og fjerner raden', async () => {
    decideMock.mockResolvedValue({
      ok: true,
      outcome: 'approved',
      gameName: 'Onsdagsgolfen',
      teamName: null,
      name: 'Kristian',
    });
    await renderScreen().view;
    loadMock.mockResolvedValue({ ok: false, reason: 'offline' });
    await fireEvent.press(screen.getByTestId('inbox-approve'));
    expect(decideMock).toHaveBeenCalledWith('req', 'approve');
    expect(screen.getByTestId('inbox-status').props.children).toBe('Kristian er med i Onsdagsgolfen');
    expect(screen.queryByText('Kristian vil bli med')).toBeNull();
    expect(screen.getByText('Krever handling · 1')).toBeTruthy();
  });

  it('knappene er låst mens svaret er på vei', async () => {
    let finish: (value: unknown) => void = () => undefined;
    decideMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderScreen().view;
    await fireEvent.press(screen.getByTestId('inbox-reject'));
    expect(screen.getByTestId('inbox-approve').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('inbox-mark-all').props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      finish({ ok: false, reason: 'error' });
    });
    expect(screen.getByTestId('inbox-approve').props.accessibilityState.disabled).toBe(false);
  });

  it('to trykk i samme bilde sender bare ett kall', async () => {
    decideMock.mockResolvedValue({ ok: false, reason: 'error' });
    await renderScreen().view;
    const button = screen.getByTestId('inbox-approve');
    await act(async () => {
      button.props.onClick?.({ preventDefault() {} });
      button.props.onClick?.({ preventDefault() {} });
    });
    expect(decideMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not_pending', INBOX_TEXT.status.alreadyDecided],
    ['request_not_found', INBOX_TEXT.status.alreadyDecided],
    ['game_not_found', INBOX_TEXT.status.alreadyDecided],
    ['game_locked', INBOX_TEXT.signupErrors.game_locked],
  ])('%s: statuslinja forklarer, og lista hentes på nytt', async (reason, text) => {
    decideMock.mockResolvedValue({ ok: false, reason });
    await renderScreen().view;
    await fireEvent.press(screen.getByTestId('inbox-approve'));
    expect(screen.getByTestId('inbox-status').props.children).toBe(text);
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['no_team_slot', INBOX_TEXT.signupErrors.no_team_slot],
    ['forbidden', INBOX_TEXT.status.forbidden],
    ['offline', INBOX_TEXT.actionFailed],
    ['error', INBOX_TEXT.actionFailed],
  ])('%s: raden står, med feillinja', async (reason, text) => {
    decideMock.mockResolvedValue({ ok: false, reason });
    await renderScreen().view;
    await fireEvent.press(screen.getByTestId('inbox-approve'));
    expect(screen.getByTestId('inbox-action-error').props.children).toBe(text);
    expect(screen.getByText('Kristian vil bli med')).toBeTruthy();
    expect(loadMock).toHaveBeenCalledTimes(1);
  });
});
