// #2748: påmeldingen fra den delte lenka som skjerm (Type C).
//
// Regelen (`signupOffer`), skrivingen og teksten har sine egne Type A-tester. Her låses
// det skjermen svarer for: hvilken tilstand hvert svar gir, hvor knappene fører etter
// tilbake-regelen, at hver feilkode har sin tekst, og at et dobbelt trykk bare er ett kall.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AppRoundInviteView } from '../../../../lib/games/appRoundInviteView';
import type { RoundInviteAnswerResult, RoundInviteLoadResult } from '../data/roundInvite';
import { ROUND_INVITE_TEXT } from '../lib/roundInviteCopy';
import { OFFLINE_NOTE } from '../lib/rosterCopy';
import type { ScreenProps } from '../navigation';
import { stackNavigation } from '../test/stackNavigation';
import { RoundInvite } from './RoundInvite';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/roundInvite', () => ({
  fetchRoundInvite: jest.fn(async () => mockLoads.shift() ?? mockLoad),
  joinRound: jest.fn(async () => mockAnswer()),
  requestToJoin: jest.fn(async () => mockAnswer()),
  cancelRequest: jest.fn(async () => mockAnswer()),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));
const mockOpenWeb = jest.fn(async () => ({ ok: true }));
jest.mock('../lib/webLink', () => ({
  ...jest.requireActual('../lib/webLink'),
  openWeb: (path: string) => (mockOpenWeb as unknown as (path: string) => Promise<unknown>)(path),
}));

// #2840: lagflatene har egne tester (`components/signup/*.test.tsx`). Her står de som
// stubber, så testene låser hvilken flate hvert svar gir og hva skjermen gjør etterpå.
jest.mock('../components/signup/TeamSignupForm', () => ({
  TeamSignupForm: (props: Record<string, unknown>) => {
    mockTeamProps = props;
    const { View } = require('react-native');
    return <View testID="stub-team-form" />;
  },
}));
jest.mock('../components/signup/TeamAnswer', () => ({
  TeamInviteAnswer: (props: Record<string, unknown>) => {
    mockTeamProps = props;
    const { View } = require('react-native');
    return <View testID="stub-team-invite" />;
  },
  TeamRoundFull: () => {
    const { View } = require('react-native');
    return <View testID="stub-team-full" />;
  },
  TeamSent: (props: Record<string, unknown>) => {
    mockTeamProps = props;
    const { View } = require('react-native');
    return <View testID="stub-team-sent" />;
  },
}));

let mockTeamProps: Record<string, unknown> = {};
let mockFocus: () => void = () => {};
let mockLoads: RoundInviteLoadResult[] = [];
let mockLoad: RoundInviteLoadResult = { ok: false, reason: 'load_failed' };
let mockAnswer: () => Promise<RoundInviteAnswerResult> | RoundInviteAnswerResult = () => ({
  ok: true,
  status: 'requested',
});

const { fetchRoundInvite, joinRound, requestToJoin, cancelRequest } = jest.requireMock('../data/roundInvite') as {
  fetchRoundInvite: jest.Mock;
  joinRound: jest.Mock;
  requestToJoin: jest.Mock;
  cancelRequest: jest.Mock;
};

const SHORT_ID = 'abcd2345';
const GAME_ID = 'spill-1';
const ROUTE = { name: 'RoundInvite', params: { shortId: SHORT_ID, src: null } };

function view(overrides: Partial<AppRoundInviteView> = {}): AppRoundInviteView {
  return {
    offer: 'join',
    round: {
      name: 'Lørdagsrunden',
      modeLabel: 'Stableford',
      courseName: 'Larvik GK',
      teeName: 'Gul',
      teeOffAt: new Date(2026, 10, 21, 9, 20).toISOString(),
      entryFeeKr: 150,
    },
    playerCount: 7,
    seats: null,
    canCancelRequest: false,
    signupPath: `/signup/${SHORT_ID}`,
    ...overrides,
  };
}

function answer(result: RoundInviteLoadResult) {
  mockLoads = [];
  mockLoad = result;
}

/** The first load, then what the route answers once the write is in. */
function answerThen(first: AppRoundInviteView, after: AppRoundInviteView) {
  mockLoads = [{ ok: true, view: first }];
  mockLoad = { ok: true, view: after };
}

async function renderInvite(src: string | null = null, routes: Array<{ name: string; params?: object }> = [{ name: 'Home' }, ROUTE], focused = true) {
  const navigation = { ...stackNavigation(routes), popToTop: jest.fn() };
  navigation.isFocused.mockReturnValue(focused);
  const props = {
    navigation,
    route: { key: 'invite', name: 'RoundInvite', params: { shortId: SHORT_ID, src } },
  };
  await render(<RoundInvite {...(props as unknown as ScreenProps<'RoundInvite'>)} />);
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
  answer({ ok: true, view: view() });
  mockAnswer = () => ({ ok: true, status: 'joined', gameId: GAME_ID });
});

// #2757: en lenke kan åpne skjermen oppå veiviseren. Var skjermen lukket da svaret
// kom, traff `backTo` veiviseren, som gikk ett steg tilbake av seg selv. Selve
// feilen er kjørt i ekte navigator; her er det sperra.
describe('svaret kommer etter at skjermen er lukket', () => {
  it('«du er alt med» flytter ingenting', async () => {
    answer({ ok: true, view: view({ offer: 'in_game', gameId: GAME_ID }) });
    const navigation = await renderInvite(null, undefined, false);
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it('en påmelding som går gjennom, flytter ingenting', async () => {
    const navigation = await renderInvite();
    navigation.isFocused.mockReturnValue(false);
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(joinRound).toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.popTo).not.toHaveBeenCalled();
  });
});

describe('du kan melde deg på', () => {
  it('viser runden, antallet og knappen, og spør om lenkas kode', async () => {
    await renderInvite();
    expect(fetchRoundInvite).toHaveBeenCalledWith(SHORT_ID);
    expect(screen.getByTestId('round-invite-name')).toHaveTextContent('Lørdagsrunden');
    expect(screen.getByTestId('round-invite-place')).toHaveTextContent('Stableford · Larvik GK · Gul tee');
    expect(screen.getByTestId('round-invite-when')).toHaveTextContent('Lørdag 21. november · kl. 09:20');
    expect(screen.getByTestId('round-invite-count')).toHaveTextContent('7 påmeldt');
    expect(screen.getByTestId('round-invite-button')).toHaveTextContent(ROUND_INVITE_TEXT.joinButton);
    expect(screen.queryByTestId('round-invite-message')).toBeNull();
  });

  // #2749: kontingenten står i appen, så ingen melder seg på uten å vite hva det koster.
  it('kontingenten står på påmeldingen', async () => {
    await renderInvite();
    expect(screen.getByTestId('round-invite-fee')).toHaveTextContent('Startkontingent 150 kr');
  });

  it('[Hjem, Påmelding] blir [Hjem, Spillet], og kilden følger med', async () => {
    const navigation = await renderInvite('plakat');
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(joinRound).toHaveBeenCalledWith(SHORT_ID, 'plakat');
    expect(navigation.replace).toHaveBeenCalledWith('GameHome', { gameId: GAME_ID });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('et dobbelt trykk er ett kall, og knappen er av mens det går', async () => {
    let finish: (result: RoundInviteAnswerResult) => void = () => {};
    mockAnswer = () =>
      new Promise<RoundInviteAnswerResult>((resolve) => {
        finish = resolve;
      });
    await renderInvite();
    const button = screen.getByTestId('round-invite-button');
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(joinRound).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(ROUND_INVITE_TEXT.joinPending);
    await act(async () => {
      finish({ ok: true, status: 'joined', gameId: GAME_ID });
    });
  });

  it('nettfeil gir teksten og «Prøv igjen», og et nytt trykk prøver igjen', async () => {
    mockAnswer = () => ({ ok: false, reason: 'offline' });
    await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByTestId('round-invite-error')).toHaveTextContent(OFFLINE_NOTE);
    expect(screen.getByTestId('round-invite-button')).toHaveTextContent(ROUND_INVITE_TEXT.retry);
    mockAnswer = () => ({ ok: true, status: 'joined', gameId: GAME_ID });
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(joinRound).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('round-invite-error')).toBeNull();
  });

  it('for mange forsøk har sin tekst, og knappen står', async () => {
    mockAnswer = () => ({ ok: false, reason: 'rate_limited' });
    await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByTestId('round-invite-error')).toHaveTextContent(ROUND_INVITE_TEXT.rateLimited);
    expect(screen.getByTestId('round-invite-button')).toHaveTextContent(ROUND_INVITE_TEXT.joinButton);
  });
});

describe('du kan be om plass', () => {
  beforeEach(() => {
    answerThen(view({ offer: 'request' }), view({ offer: 'pending', canCancelRequest: true }));
    mockAnswer = () => ({ ok: true, status: 'requested' });
  });

  it('skjemaet er borte, siden sier at forespørselen er sendt, og den kan trekkes', async () => {
    await renderInvite();
    await fireEvent.changeText(screen.getByTestId('round-invite-message'), '  Plass til meg?  ');
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(requestToJoin).toHaveBeenCalledWith(SHORT_ID, 'Plass til meg?');
    expect(screen.getByTestId('round-invite-sent')).toHaveTextContent(ROUND_INVITE_TEXT.sentTitle);
    expect(screen.queryByTestId('round-invite-message')).toBeNull();
    expect(screen.queryByTestId('round-invite-button')).toBeNull();
    // #2837: ruta vet om forespørselen kan trekkes, så skjermen spør på nytt.
    expect(fetchRoundInvite).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('round-invite-cancel')).toHaveTextContent(ROUND_INVITE_TEXT.cancelButton);
  });

  it('svarer ikke ruta når skjermen spør igjen, står «sendt» uten knapp', async () => {
    mockLoads = [{ ok: true, view: view({ offer: 'request' }) }];
    mockLoad = { ok: false, reason: 'network' };
    await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByTestId('round-invite-sent')).toBeTruthy();
    expect(screen.queryByTestId('round-invite-cancel')).toBeNull();
  });

  it('uten hilsen sendes ingen hilsen', async () => {
    await renderInvite();
    await fireEvent.changeText(screen.getByTestId('round-invite-message'), '   ');
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(requestToJoin).toHaveBeenCalledWith(SHORT_ID, null);
  });

  it('feltet tar ikke mer enn nettsidens tak', async () => {
    await renderInvite();
    expect(screen.getByTestId('round-invite-message').props.maxLength).toBe(200);
  });

  it('en for lang hilsen har sin tekst, og hilsenen står', async () => {
    mockAnswer = () => ({ ok: false, reason: 'message_too_long' });
    await renderInvite();
    await fireEvent.changeText(screen.getByTestId('round-invite-message'), 'Plass?');
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByTestId('round-invite-error')).toHaveTextContent(ROUND_INVITE_TEXT.messageTooLong);
    expect(screen.getByTestId('round-invite-message').props.value).toBe('Plass?');
  });

  it('er du godkjent i mellomtiden, går du til spillet', async () => {
    mockAnswer = () => ({ ok: true, status: 'joined', gameId: GAME_ID });
    const navigation = await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(navigation.replace).toHaveBeenCalledWith('GameHome', { gameId: GAME_ID });
  });
});

describe('svar som stopper skjemaet', () => {
  it.each([
    ['wrong_mode', ROUND_INVITE_TEXT.wrongMode],
  ] as const)('%s har sin tekst, ingen knapp som aldri virker, og vei til Hjem', async (reason, text) => {
    answer({ ok: true, view: view({ offer: 'request' }) });
    mockAnswer = () => ({ ok: false, reason });
    const navigation = await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByTestId('round-invite-stop')).toHaveTextContent(text);
    expect(screen.queryByTestId('round-invite-button')).toBeNull();
    expect(screen.queryByTestId('round-invite-message')).toBeNull();
    await fireEvent.press(screen.getByTestId('round-invite-home'));
    expect(navigation.popToTop).toHaveBeenCalled();
  });

  it('en profil uten handicap går til profilskjemaet', async () => {
    mockAnswer = () => ({ ok: false, reason: 'profile_incomplete' });
    const navigation = await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByTestId('round-invite-stop')).toHaveTextContent(ROUND_INVITE_TEXT.profileIncomplete);
    await fireEvent.press(screen.getByTestId('round-invite-profile'));
    expect(navigation.navigate).toHaveBeenCalledWith('EditProfile', undefined);
  });

  it.each([
    ['game_locked', ROUND_INVITE_TEXT.locked],
    ['signup_closed', ROUND_INVITE_TEXT.closed],
  ] as const)('%s bytter til teksten om stengt', async (reason, text) => {
    mockAnswer = () => ({ ok: false, reason });
    await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByTestId('round-invite-button')).toBeNull();
  });

  it('use_web bytter til knappen for nettsiden', async () => {
    mockAnswer = () => ({ ok: false, reason: 'use_web' });
    await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByTestId('round-invite-open-web')).toBeTruthy();
    expect(screen.queryByTestId('round-invite-button')).toBeNull();
  });

  it('er runden borte, står teksten og veien til Hjem', async () => {
    mockAnswer = () => ({ ok: false, reason: 'not_found' });
    await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByTestId('round-invite-not-found')).toHaveTextContent(ROUND_INVITE_TEXT.notFound);
  });
});

describe('tilstandene uten skjema', () => {
  it('står du alt på lista, går du rett til spillet uten mellomskjerm', async () => {
    answer({ ok: true, view: view({ offer: 'in_game', gameId: GAME_ID }) });
    const navigation = await renderInvite();
    expect(navigation.replace).toHaveBeenCalledWith('GameHome', { gameId: GAME_ID });
    expect(screen.queryByTestId('round-invite-name')).toBeNull();
  });

  it('forespørselen er alt sendt: ingen knapp', async () => {
    answer({ ok: true, view: view({ offer: 'pending' }) });
    await renderInvite();
    expect(screen.getByTestId('round-invite-sent')).toHaveTextContent(ROUND_INVITE_TEXT.sentTitle);
    expect(screen.queryByTestId('round-invite-button')).toBeNull();
  });

  it.each([
    ['locked', ROUND_INVITE_TEXT.locked],
    ['closed', ROUND_INVITE_TEXT.closed],
  ] as const)('%s har sin tekst', async (offer, text) => {
    answer({ ok: true, view: view({ offer }) });
    await renderInvite();
    expect(screen.getByTestId(`round-invite-${offer}`)).toBeTruthy();
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByTestId('round-invite-button')).toBeNull();
  });

  it('lag og sidevalg åpner nettsiden, med kilden', async () => {
    answer({ ok: true, view: view({ offer: 'web' }) });
    await renderInvite('plakat');
    expect(screen.getByText(ROUND_INVITE_TEXT.webIntro)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('round-invite-open-web'));
    expect(mockOpenWeb).toHaveBeenCalledWith(`/signup/${SHORT_ID}?src=plakat`);
  });

  it('uten kilde er det bare stien', async () => {
    answer({ ok: true, view: view({ offer: 'web' }) });
    await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-open-web'));
    expect(mockOpenWeb).toHaveBeenCalledWith(`/signup/${SHORT_ID}`);
  });

  it('en runde uten tee-off har ingen tidslinje', async () => {
    answer({
      ok: true,
      view: view({ round: { ...view().round, teeOffAt: null } }),
    });
    await renderInvite();
    expect(screen.queryByTestId('round-invite-when')).toBeNull();
    expect(screen.getByTestId('round-invite-count')).toHaveTextContent('7 påmeldt');
  });
});

describe('henting', () => {
  it('404 gir teksten og veien til Hjem', async () => {
    answer({ ok: false, reason: 'not_found' });
    const navigation = await renderInvite();
    expect(screen.getByTestId('round-invite-not-found')).toHaveTextContent(ROUND_INVITE_TEXT.notFound);
    await fireEvent.press(screen.getByTestId('round-invite-home'));
    expect(navigation.popToTop).toHaveBeenCalled();
  });

  it('nettfeil gir «Prøv igjen», og et nytt forsøk viser runden', async () => {
    answer({ ok: false, reason: 'network' });
    await renderInvite();
    expect(screen.getByTestId('round-invite-load-error')).toHaveTextContent(ROUND_INVITE_TEXT.loadFailed);
    answer({ ok: true, view: view() });
    await fireEvent.press(screen.getByTestId('round-invite-retry'));
    expect(screen.getByTestId('round-invite-name')).toHaveTextContent('Lørdagsrunden');
  });

  it('en henting som går når du sender, tar ikke skjemaet tilbake etter «sendt»', async () => {
    answerThen(view({ offer: 'request' }), view({ offer: 'pending', canCancelRequest: true }));
    mockAnswer = () => ({ ok: true, status: 'requested' });
    await renderInvite();
    let finish: (result: RoundInviteLoadResult) => void = () => {};
    fetchRoundInvite.mockImplementationOnce(
      () =>
        new Promise<RoundInviteLoadResult>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      mockFocus();
    });
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByTestId('round-invite-sent')).toBeTruthy();
    await act(async () => {
      finish({ ok: true, view: view({ offer: 'request' }) });
    });
    expect(screen.getByTestId('round-invite-sent')).toBeTruthy();
    expect(screen.queryByTestId('round-invite-button')).toBeNull();
  });

  it('en henting som går når sendingen feiler, tar ikke bort feilteksten', async () => {
    answer({ ok: true, view: view({ offer: 'request' }) });
    mockAnswer = () => ({ ok: false, reason: 'network' });
    await renderInvite();
    let finish: (result: RoundInviteLoadResult) => void = () => {};
    fetchRoundInvite.mockImplementationOnce(
      () =>
        new Promise<RoundInviteLoadResult>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      mockFocus();
    });
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByTestId('round-invite-error')).toBeTruthy();
    await act(async () => {
      finish({ ok: true, view: view({ offer: 'request' }) });
    });
    expect(screen.getByTestId('round-invite-error')).toBeTruthy();
  });

  it('en ny henting beholder hilsenen du har skrevet', async () => {
    answer({ ok: true, view: view({ offer: 'request' }) });
    await renderInvite();
    await fireEvent.changeText(screen.getByTestId('round-invite-message'), 'Plass?');
    await act(async () => {
      mockFocus();
    });
    expect(screen.getByTestId('round-invite-message').props.value).toBe('Plass?');
  });

  it('kommer du tilbake til skjermen, spør den på nytt og slipper stoppen', async () => {
    answer({ ok: true, view: view({ offer: 'request' }) });
    mockAnswer = () => ({ ok: false, reason: 'profile_incomplete' });
    await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(screen.getByTestId('round-invite-stop')).toBeTruthy();
    await act(async () => {
      mockFocus();
    });
    expect(screen.queryByTestId('round-invite-stop')).toBeNull();
    expect(screen.getByTestId('round-invite-button')).toBeTruthy();
  });
});

// #2837: en full runde, og forespørselen som kan trekkes.
describe('full runde', () => {
  const FULL = { kind: 'capped', cap: 12, held: 12 } as const;

  it('viser plassene, at runden er full, og «Be om plass»', async () => {
    answerThen(
      view({ offer: 'request', seats: FULL, playerCount: 12 }),
      view({ offer: 'pending', seats: FULL, playerCount: 12, canCancelRequest: true }),
    );
    mockAnswer = () => ({ ok: true, status: 'requested' });
    await renderInvite();
    expect(screen.getByTestId('round-invite-seats')).toHaveTextContent('12 av 12 plasser · fullt');
    expect(screen.queryByTestId('round-invite-count')).toBeNull();
    expect(screen.getByText(ROUND_INVITE_TEXT.fullIntro)).toBeTruthy();
    expect(screen.getByTestId('round-invite-button')).toHaveTextContent(ROUND_INVITE_TEXT.fullButton);
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(requestToJoin).toHaveBeenCalledWith(SHORT_ID, null);
    expect(screen.getByTestId('round-invite-sent')).toHaveTextContent(ROUND_INVITE_TEXT.sentTitle);
  });

  it('med plass igjen står tallene, og du melder deg på som før', async () => {
    answer({ ok: true, view: view({ seats: { kind: 'capped', cap: 12, held: 9 } }) });
    await renderInvite();
    expect(screen.getByTestId('round-invite-seats')).toHaveTextContent('9 av 12 plasser');
    expect(screen.getByTestId('round-invite-button')).toHaveTextContent(ROUND_INVITE_TEXT.joinButton);
  });

  it('noen tok siste plass mens du så på: skjermen spør på nytt og viser «Be om plass»', async () => {
    answer({ ok: true, view: view({ seats: { kind: 'capped', cap: 12, held: 11 } }) });
    mockAnswer = () => ({ ok: false, reason: 'game_full' });
    await renderInvite();
    mockLoads = [{ ok: true, view: view({ offer: 'request', seats: FULL }) }];
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(fetchRoundInvite).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('round-invite-stop')).toBeNull();
    expect(screen.getByTestId('round-invite-button')).toHaveTextContent(ROUND_INVITE_TEXT.fullButton);
  });

  it('sier ruta fortsatt «Meld meg på» etter game_full, står teksten om full runde', async () => {
    answer({ ok: true, view: view({ seats: { kind: 'capped', cap: 12, held: 11 } }) });
    mockAnswer = () => ({ ok: false, reason: 'game_full' });
    await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-button'));
    expect(fetchRoundInvite).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('round-invite-error')).toHaveTextContent(ROUND_INVITE_TEXT.gameFull);
    expect(screen.getByTestId('round-invite-button')).toHaveTextContent(ROUND_INVITE_TEXT.joinButton);
  });
});

describe('trekk forespørselen', () => {
  beforeEach(() => {
    answer({ ok: true, view: view({ offer: 'pending', canCancelRequest: true }) });
    mockAnswer = () => ({ ok: true, status: 'cancelled' });
  });

  it('knappen står under «Forespørselen er sendt», og trekker med lenkas kode', async () => {
    await renderInvite();
    expect(screen.getByTestId('round-invite-sent')).toHaveTextContent(ROUND_INVITE_TEXT.sentTitle);
    expect(screen.getByTestId('round-invite-cancel')).toHaveTextContent(ROUND_INVITE_TEXT.cancelButton);
    mockLoads = [{ ok: true, view: view({ offer: 'request', seats: { kind: 'capped', cap: 12, held: 12 } }) }];
    await fireEvent.press(screen.getByTestId('round-invite-cancel'));
    expect(cancelRequest).toHaveBeenCalledWith(SHORT_ID);
    // Trukket: skjermen spør på nytt, og du kan be igjen.
    expect(fetchRoundInvite).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('round-invite-sent')).toBeNull();
    expect(screen.getByTestId('round-invite-button')).toHaveTextContent(ROUND_INVITE_TEXT.fullButton);
  });

  it('uten flagget er det ingen knapp (lag, kaptein)', async () => {
    answer({ ok: true, view: view({ offer: 'pending', canCancelRequest: false }) });
    await renderInvite();
    expect(screen.getByTestId('round-invite-sent')).toBeTruthy();
    expect(screen.queryByTestId('round-invite-cancel')).toBeNull();
  });

  it('et dobbelt trykk er ett kall, og knappen er av mens det går', async () => {
    let finish: (result: RoundInviteAnswerResult) => void = () => {};
    mockAnswer = () =>
      new Promise<RoundInviteAnswerResult>((resolve) => {
        finish = resolve;
      });
    await renderInvite();
    const button = screen.getByTestId('round-invite-cancel');
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(cancelRequest).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(ROUND_INVITE_TEXT.cancelPending);
    await act(async () => {
      finish({ ok: true, status: 'cancelled' });
    });
  });

  it('arrangøren rakk å svare: skjermen spør på nytt og viser det som gjelder', async () => {
    mockAnswer = () => ({ ok: false, reason: 'not_pending' });
    const navigation = await renderInvite();
    mockLoads = [{ ok: true, view: view({ offer: 'in_game', gameId: GAME_ID }) }];
    await fireEvent.press(screen.getByTestId('round-invite-cancel'));
    expect(fetchRoundInvite).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledWith('GameHome', { gameId: GAME_ID });
  });

  it('uten nett står teksten, forespørselen står, og knappen kan prøves igjen', async () => {
    mockAnswer = () => ({ ok: false, reason: 'offline' });
    await renderInvite();
    await fireEvent.press(screen.getByTestId('round-invite-cancel'));
    expect(screen.getByTestId('round-invite-error')).toHaveTextContent(OFFLINE_NOTE);
    expect(screen.getByTestId('round-invite-sent')).toBeTruthy();
    expect(screen.getByTestId('round-invite-cancel')).toHaveTextContent(ROUND_INVITE_TEXT.cancelButton);
  });
});

// #2840: lagpåmeldingen i appen.
describe('lag', () => {
  const FORM = {
    kind: 'form' as const,
    teamSize: 4,
    nameMin: 3,
    nameMax: 40,
    suggestedName: 'Martins lag',
    unavailableFriendIds: [],
  };
  const INVITED = {
    kind: 'invited' as const,
    requestId: 'req-1',
    captainName: 'Kari Nord',
    teamName: 'Birdie-jegerne',
    joinEffect: 'instant' as const,
    members: [],
  };

  it('`form` gir lagskjemaet med lenkas kode, ikke nettknappen', async () => {
    answer({ ok: true, view: view({ offer: 'web', teamSignup: FORM }) });
    await renderInvite();
    expect(screen.getByTestId('stub-team-form')).toBeTruthy();
    expect(mockTeamProps.shortId).toBe(SHORT_ID);
    expect(mockTeamProps.form).toEqual(FORM);
    expect(screen.queryByTestId('round-invite-open-web')).toBeNull();
  });

  it('en full runde gir «Runden er full» i stedet for skjemaet', async () => {
    answer({ ok: true, view: view({ offer: 'web', teamSignup: FORM, seats: { kind: 'capped', cap: 12, held: 12 } }) });
    await renderInvite();
    expect(screen.getByTestId('stub-team-full')).toBeTruthy();
    expect(screen.queryByTestId('stub-team-form')).toBeNull();
  });

  it('`invited` gir svaret på invitasjonen', async () => {
    answer({ ok: true, view: view({ offer: 'web', teamSignup: INVITED }) });
    await renderInvite();
    expect(screen.getByTestId('stub-team-invite')).toBeTruthy();
    expect(mockTeamProps.invited).toEqual(INVITED);
  });

  it('uten lagskjerm står nettknappen som før', async () => {
    answer({ ok: true, view: view({ offer: 'web', teamSignup: null }) });
    await renderInvite();
    expect(screen.getByTestId('round-invite-open-web')).toBeTruthy();
  });

  it('åpen påmelding: etter sendingen spør skjermen på nytt og går til runden', async () => {
    answerThen(view({ offer: 'web', teamSignup: FORM }), view({ offer: 'in_game', gameId: GAME_ID }));
    const navigation = await renderInvite();
    await act(async () => {
      (mockTeamProps.onRegistered as (effect: string, sent: unknown) => void)('instant', { teamName: 'X', rows: [] });
    });
    expect(fetchRoundInvite).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledWith('GameHome', { gameId: GAME_ID });
  });

  it('godkjenning: «Laget er sendt» står, også når skjermen spør på nytt', async () => {
    answer({ ok: true, view: view({ offer: 'web', teamSignup: FORM }) });
    await renderInvite();
    const sent = { teamName: 'Birdie-jegerne', rows: [] };
    await act(async () => {
      (mockTeamProps.onRegistered as (effect: string, sent: unknown) => void)('approval', sent);
    });
    expect(screen.getByTestId('stub-team-sent')).toBeTruthy();
    expect(mockTeamProps.sent).toEqual(sent);
    answer({ ok: true, view: view({ offer: 'pending' }) });
    await act(async () => mockFocus());
    expect(screen.getByTestId('stub-team-sent')).toBeTruthy();
  });

  it('et svar på invitasjonen gir ny lasting', async () => {
    answer({ ok: true, view: view({ offer: 'web', teamSignup: INVITED }) });
    await renderInvite();
    await act(async () => {
      (mockTeamProps.onDone as () => void)();
    });
    expect(fetchRoundInvite).toHaveBeenCalledTimes(2);
  });
});
