// #2752: cup-rommet som skjerm (Type C).
//
// Ruta (`GET /api/cup/[id]`) regner alt; her låses det skjermen svarer for: at en
// cup som pågår verken viser poeng eller vinner (#1468), at dine kamper står først,
// at bare kamper RLS lar deg lese har en knapp inn (#1542), resultatene i en ferdig
// cup, og tilstandene uten nett.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { startCup } from '../data/cupSetup';
import type { AppCupView } from '../../../../lib/cup/appCupView';
import type { CupResult } from '../data/cup';
import type { ScreenProps } from '../navigation';
import { cupMatch, finishedCup, liveCup, ME, RESULTS } from '../test/cupFixtures';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import { Cup } from './Cup';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../lib/useMarkVisitRead');
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'user-me', email: 'meg@example.test' }),
}));
jest.mock('../data/cup', () => ({
  fetchCup: jest.fn(async () => mockResults.shift() ?? mockLast),
}));
jest.mock('../data/cupSetup', () => ({ startCup: jest.fn(async () => ({ ok: true })) }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// Fokuset kjøres som en effekt, og testen kan fokusere skjermen igjen.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));

// Navnene må starte med `mock`: jest.mock-factoryene heises over importene.
let mockFocus: () => void = () => {};
let mockResults: CupResult[] = [];
let mockLast: CupResult = { ok: false, reason: 'offline' };

function answer(...results: CupResult[]) {
  mockResults = [...results];
  mockLast = results[results.length - 1];
}

function cupProps(navigate: jest.Mock, cupId = 'cup-1', extra: Record<string, unknown> = {}) {
  return {
    navigation: {
      navigate,
      setParams: jest.fn(),
      addListener: jest.fn(() => () => {}),
      getState: () => ({ index: 1, routes: [{ name: 'Home' }, { name: 'Cup', params: { cupId } }] }),
    },
    route: { key: 'cup', name: 'Cup', params: { cupId, ...extra } },
  } as unknown as ScreenProps<'Cup'>;
}

async function renderCup(params: Record<string, unknown> = {}) {
  const navigate = jest.fn();
  const view = await render(<Cup {...cupProps(navigate, 'cup-1', params)} />);
  return { navigate, view };
}

const refocus = async () => {
  await act(async () => {
    mockFocus();
  });
};

describe('Cup — mens cupen pågår (#1468)', () => {
  it('viser poengmålet, fremdriften og kampene, uten poeng og vinner', async () => {
    answer({ ok: true, view: liveCup() });
    await renderCup();

    expect(await screen.findByTestId('cup-name')).toHaveTextContent('Klubbmesterskapet');
    expect(screen.getByTestId('cup-points-to-win')).toHaveTextContent('Først til 14,5 poeng vinner');
    expect(screen.getByTestId('cup-progress')).toHaveTextContent('3 av 8 matcher spilt');
    expect(screen.getByTestId('cup-results-pending')).toHaveTextContent('Resultatene kommer når cupen avsluttes');
    expect(screen.queryByTestId('cup-results')).toBeNull();
    expect(screen.queryByTestId('cup-winner')).toBeNull();
    expect(screen.queryByTestId('cup-tied')).toBeNull();
  });

  it('som spiller: dine kamper står først, og bare de har en knapp inn', async () => {
    answer({ ok: true, view: liveCup() });
    const { navigate } = await renderCup();

    const mine = await screen.findByTestId('cup-my-matches');
    expect(within(mine).getByText('Dine kamper')).toBeTruthy();
    expect(within(mine).getByTestId('cup-match-status-mine-1')).toHaveTextContent('Pågår');
    const rest = screen.getByTestId('cup-other-matches');
    expect(within(rest).getByText('Andre kamper')).toBeTruthy();
    expect(within(rest).getByTestId('cup-match-status-other-1')).toHaveTextContent('Scorekort levert');

    expect(screen.getByTestId('cup-match-mine-1').props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('cup-match-other-1').props.accessibilityRole).toBeUndefined();

    await fireEvent.press(screen.getByTestId('cup-match-other-1'));
    expect(navigate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('cup-match-mine-1'));
    expect(navigate).toHaveBeenCalledWith('GameHome', { gameId: 'mine-1' });
  });

  it('en kamp du leser uten å spille (arrangøren, admin) har også en knapp inn', async () => {
    answer({ ok: true, view: liveCup({ matches: [cupMatch({ gameId: 'other-1', canOpen: true })] }) });
    const { navigate } = await renderCup();

    expect(await screen.findByTestId('cup-other-matches')).toBeTruthy();
    expect(screen.getByTestId('cup-match-other-1').props.accessibilityRole).toBe('button');
    await fireEvent.press(screen.getByTestId('cup-match-other-1'));
    expect(navigate).toHaveBeenCalledWith('GameHome', { gameId: 'other-1' });
  });

  it('din egen kamp uten lesetilgang (utkast) har ingen knapp', async () => {
    answer({ ok: true, view: liveCup({ matches: [cupMatch({ gameId: 'mine-1', mine: true, canOpen: false })] }) });
    const { navigate } = await renderCup();

    expect(await screen.findByTestId('cup-my-matches')).toBeTruthy();
    expect(screen.getByTestId('cup-match-mine-1').props.accessibilityRole).toBeUndefined();
    await fireEvent.press(screen.getByTestId('cup-match-mine-1'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('uten egne kamper heter lista «Matcher»', async () => {
    answer({ ok: true, view: liveCup({ matches: [cupMatch()] }) });
    await renderCup();
    expect(await screen.findByText('Matcher')).toBeTruthy();
    expect(screen.queryByTestId('cup-my-matches')).toBeNull();
    expect(screen.queryByText('Andre kamper')).toBeNull();
  });

  it('åpent uttak sier at kapteinene setter opp lagene, og uten kamper står det', async () => {
    answer({ ok: true, view: liveCup({ lineupPending: true, matches: [] }) });
    await renderCup();
    expect(await screen.findByTestId('cup-lineup-pending')).toHaveTextContent('Kapteinene setter opp lagene');
    expect(screen.getByTestId('cup-no-matches')).toHaveTextContent('Ingen matcher er opprettet ennå.');
  });

  it('en trukket spiller og en som spiller alene står på kampen', async () => {
    answer({
      ok: true,
      view: liveCup({
        matches: [
          cupMatch({ gameId: 'solo', soloPartnerName: 'Kari', status: 'inProgress' }),
          cupMatch({ gameId: 'halved', status: 'decidedHalved', withdrawnName: 'Per' }),
        ],
      }),
    });
    await renderCup();
    expect(await screen.findByTestId('cup-match-solo-solo')).toHaveTextContent('Kari spiller alene');
    expect(screen.getByTestId('cup-match-status-halved')).toHaveTextContent('Halvert — Per trakk seg');
  });

  it('en cup uten poengmål sier hva som gjelder', async () => {
    answer({ ok: true, view: liveCup({ status: 'draft', pointsToWin: null }) });
    await renderCup();
    expect(await screen.findByTestId('cup-points-to-win')).toHaveTextContent(
      'Poengmålet er klart når cupen starter',
    );
  });
});

describe('Cup — dørene', () => {
  it('den som styrer cupen får «Styr cupen», andre ikke', async () => {
    answer({ ok: true, view: liveCup({ canManage: true }) });
    const { navigate } = await renderCup();
    await fireEvent.press(await screen.findByTestId('cup-open-manage'));
    expect(navigate).toHaveBeenCalledWith('CupManage', { cupId: 'cup-1' });
  });

  it('uten rollen: ingen dør', async () => {
    answer({ ok: true, view: liveCup() });
    await renderCup();
    await screen.findByTestId('cup-name');
    expect(screen.queryByTestId('cup-open-manage')).toBeNull();
    expect(screen.queryByTestId('cup-withdraw-self')).toBeNull();
  });

  it('spilleren med en kamp igjen får «Trekk meg fra cupen»', async () => {
    answer({ ok: true, view: liveCup({ canWithdrawSelf: true }) });
    const { navigate } = await renderCup();
    const link = await screen.findByTestId('cup-withdraw-self');
    expect(link).toHaveTextContent('Trekk meg fra cupen');
    await fireEvent.press(link);
    expect(navigate).toHaveBeenCalledWith('CupWithdraw', { cupId: 'cup-1' });
  });

  it('den som har trukket seg, får nettets banner', async () => {
    answer({ ok: true, view: liveCup({ selfWithdrawn: true }) });
    await renderCup();
    expect(await screen.findByTestId('cup-self-withdrawn')).toHaveTextContent(
      'Du er trukket fra cupen. Arrangøren ser det her på cup-siden.',
    );
  });

  it('uten nett: ingen dør som krever nett', async () => {
    answer({ ok: true, view: liveCup({ canManage: true, canWithdrawSelf: true }) }, { ok: false, reason: 'offline' });
    await renderCup();
    await screen.findByTestId('cup-open-manage');
    await refocus();
    expect(screen.queryByTestId('cup-open-manage')).toBeNull();
    expect(screen.queryByTestId('cup-withdraw-self')).toBeNull();
  });
});

describe('Cup — ferdig cup', () => {
  it('vinneren, lagenes poeng og linja under', async () => {
    answer({ ok: true, view: finishedCup() });
    await renderCup();

    expect(await screen.findByTestId('cup-winner')).toHaveTextContent('Team Nord vant');
    expect(screen.getByTestId('cup-team-1')).toHaveTextContent('Team Nord15,5');
    expect(screen.getByTestId('cup-team-2')).toHaveTextContent('Team Sør12,5');
    expect(screen.getByTestId('cup-summary')).toHaveTextContent('8 av 8 matcher spilt · Sidepoeng: 2–1');
    expect(screen.queryByTestId('cup-points-to-win')).toBeNull();
    expect(screen.queryByTestId('cup-results-pending')).toBeNull();
  });

  it('delt seier, og en cup uten sidepoeng har ingen sidepoeng i linja', async () => {
    answer({
      ok: true,
      view: finishedCup({
        results: { ...RESULTS, winner: null, winnerName: null, team1Points: 14, team2Points: 14, sideAwardPoints: null },
      }),
    });
    await renderCup();
    expect(await screen.findByTestId('cup-tied')).toHaveTextContent('Uavgjort');
    expect(screen.queryByTestId('cup-winner')).toBeNull();
    expect(screen.getByTestId('cup-summary')).toHaveTextContent('8 av 8 matcher spilt');
    expect(screen.getByTestId('cup-summary')).not.toHaveTextContent('Sidepoeng');
  });

  it('kåringene og spillerpoengene, med dine poeng merket og den trukne merket', async () => {
    answer({ ok: true, view: finishedCup() });
    await renderCup();

    const awards = await screen.findByTestId('cup-awards');
    expect(awards).toHaveTextContent(/MVP.*Ola Kompis.*4 poeng · flest i cupen/);
    expect(awards).toHaveTextContent(/Dro ned mest.*Per Å\..*7 slag over eget handicap/);

    expect(screen.getByText('Spillerpoeng · Team Nord')).toBeTruthy();
    expect(screen.getByText('Spillerpoeng · Team Sør')).toBeTruthy();
    const mine = screen.getByTestId(`cup-player-${ME}`);
    expect(mine).toHaveTextContent(/Dine poeng/);
    expect(mine).toHaveTextContent(/Vant mot Kari · \+1/);
    expect(mine).toHaveTextContent(/Nærmest pinnen, hull 7 · \+1/);
    const withdrawn = screen.getByTestId('cup-player-kari');
    expect(withdrawn).toHaveTextContent(/Trukket/);
    expect(withdrawn).toHaveTextContent(/2,5/);
    expect(withdrawn).not.toHaveTextContent(/Dine poeng/);
  });

  it('sidepoengene hull for hull: vinner, ingen vinner og GIR', async () => {
    answer({ ok: true, view: finishedCup() });
    await renderCup();

    expect(await screen.findByTestId('cup-side-award-side-ctp')).toHaveTextContent(
      /hull 7 · Nærmest pinnen.*Ola Kompis · Team Nord.*\+1/,
    );
    const noWinner = screen.getByTestId('cup-side-award-side-ld');
    expect(noWinner).toHaveTextContent(/hull 7 · Lengste drive \(2 av 3\).*Ingen vant/);
    expect(noWinner).not.toHaveTextContent(/\+1/);
    expect(screen.getByTestId('cup-side-award-side-gir')).toHaveTextContent(
      /hull 12 · GIR.*Team Nord: 2 av 4 · \+1.*Team Sør: 0 av 4 · \+0/,
    );
  });

  it('kampene har resultatet, og din kamp kan åpnes', async () => {
    answer({ ok: true, view: finishedCup() });
    const { navigate } = await renderCup();

    expect(await screen.findByTestId('cup-match-status-mine-1')).toHaveTextContent('1–0');
    expect(screen.getByTestId('cup-match-outcome-mine-1')).toHaveTextContent('3&2 til Team Nord');
    expect(screen.getByTestId('cup-match-status-other-1')).toHaveTextContent('0,5–0,5');
    expect(screen.getByTestId('cup-match-outcome-other-1')).toHaveTextContent('Delt (AS)');
    await fireEvent.press(screen.getByTestId('cup-match-mine-1'));
    expect(navigate).toHaveBeenCalledWith('GameHome', { gameId: 'mine-1' });
  });

  it('merker varslene om cupen og resultatet som lest', async () => {
    answer({ ok: true, view: finishedCup() });
    await renderCup();
    await screen.findByTestId('cup-winner');
    expect(useMarkVisitRead).toHaveBeenCalledWith('cup', 'cup-1');
    expect(useMarkVisitRead).toHaveBeenCalledWith('cupResults', 'cup-1');
  });
});

describe('Cup — lasting og feil', () => {
  it('borte for deg (404), så uten nett: den gamle cupen kommer ikke tilbake', async () => {
    answer({ ok: true, view: liveCup() }, { ok: false, reason: 'not_found' }, { ok: false, reason: 'offline' });
    await renderCup();
    await screen.findByTestId('cup-name');
    await refocus();
    expect(screen.getByTestId('cup-not-found')).toBeTruthy();
    await refocus();
    expect(screen.queryByTestId('cup-stale')).toBeNull();
    expect(screen.queryByTestId('cup-name')).toBeNull();
    expect(screen.getByTestId('cup-load-failed')).toBeTruthy();
  });

  it('et varsel om en annen cup uten nett viser ikke den forrige under den nye id-en', async () => {
    answer({ ok: true, view: liveCup() }, { ok: false, reason: 'offline' });
    const { navigate, view } = await renderCup();
    await screen.findByTestId('cup-name');

    await view.rerender(<Cup {...cupProps(navigate, 'cup-2')} />);
    expect(screen.queryByTestId('cup-name')).toBeNull();
    expect(screen.getByTestId('cup-load-failed')).toBeTruthy();
  });


  it('står med lasting til svaret kommer', async () => {
    let resolve: (result: CupResult) => void = () => {};
    const { fetchCup } = jest.requireMock('../data/cup') as { fetchCup: jest.Mock };
    fetchCup.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    await renderCup();
    expect(screen.getByTestId('cup-loading')).toBeTruthy();
    await act(async () => resolve({ ok: true, view: liveCup() }));
    expect(screen.getByTestId('cup-name')).toBeTruthy();
    expect(screen.queryByTestId('cup-loading')).toBeNull();
  });

  it('uten nett beholder skjermen det den alt har hentet, med en merknad', async () => {
    answer({ ok: true, view: liveCup() }, { ok: false, reason: 'offline' });
    await renderCup();
    expect(await screen.findByTestId('cup-name')).toBeTruthy();
    expect(screen.queryByTestId('cup-stale')).toBeNull();

    await refocus();
    expect(screen.getByTestId('cup-stale')).toHaveTextContent('Viser lagret cup. Fikk ikke kontakt med serveren.');
    expect(screen.getByTestId('cup-match-mine-1')).toBeTruthy();

    answer({ ok: true, view: liveCup() });
    await refocus();
    expect(screen.queryByTestId('cup-stale')).toBeNull();
  });

  it('uten noe hentet står feilen, og «Prøv igjen» henter på nytt', async () => {
    answer({ ok: false, reason: 'offline' }, { ok: true, view: liveCup() });
    await renderCup();
    expect(await screen.findByTestId('cup-load-failed')).toHaveTextContent(
      /^Fikk ikke tak i cupen\. Sjekk nettet og prøv igjen\.Prøv igjen$/,
    );
    await fireEvent.press(screen.getByTestId('cup-retry'));
    expect(await screen.findByTestId('cup-name')).toBeTruthy();
  });

  it('en feil hos serveren ber deg ikke sjekke nettet', async () => {
    answer({ ok: false, reason: 'load_failed' });
    await renderCup();
    expect(await screen.findByTestId('cup-load-failed')).toHaveTextContent(/^Fikk ikke tak i cupen\. Prøv igjen\.Prøv igjen$/);
  });

  it('en cup du ikke har tilgang til: feilteksten uten knapp, og det skjermen hadde forsvinner', async () => {
    answer({ ok: true, view: liveCup() }, { ok: false, reason: 'not_found' });
    await renderCup();
    await screen.findByTestId('cup-name');
    await refocus();
    expect(screen.getByTestId('cup-not-found')).toHaveTextContent(
      'Fant ikke cupen. Den finnes ikke, eller du har ikke tilgang.',
    );
    expect(screen.queryByTestId('cup-retry')).toBeNull();
    expect(screen.queryByTestId('cup-name')).toBeNull();
  });
});

describe('tavla til andres ferdige kamper (eierens svar 02.11)', () => {
  it('en ferdig kamp du ikke kan åpne, fører til tavla', async () => {
    answer({
      ok: true,
      view: liveCup({ matches: [cupMatch({ gameId: 'andres', status: 'played', boardOpen: true })] }),
    });
    const { navigate } = await renderCup();

    await fireEvent.press(screen.getByTestId('cup-match-andres'));

    expect(navigate).toHaveBeenCalledWith('CupMatchBoard', {
      cupId: 'cup-1',
      gameId: 'andres',
      label: 'Singel 1',
      names: 'Anne mot Jonas',
    });
  });

  it('en kamp som pågår, har ingen vei inn', async () => {
    answer({ ok: true, view: liveCup({ matches: [cupMatch({ gameId: 'pagar', status: 'inProgress' })] }) });
    await renderCup();
    expect(screen.getByTestId('cup-match-pagar').props.accessibilityRole).toBeUndefined();
  });
});

describe('kvitteringen etter en avslutning (#2752)', () => {
  it('står når du kommer fra avslutningen', async () => {
    answer({ ok: true, view: liveCup() });
    await renderCup({ notice: 'cup_finished' });
    expect(screen.getByTestId('cup-notice')).toHaveTextContent(
      'Cupen er avsluttet. Resultatet er sendt til alle deltakere.',
    );
  });

  it('står ikke ellers', async () => {
    answer({ ok: true, view: liveCup() });
    await renderCup();
    expect(screen.queryByTestId('cup-notice')).toBeNull();
  });
});

describe('dørene i et utkast (#2752)', () => {
  const draft = (over: Partial<AppCupView> = {}) =>
    liveCup({ status: 'draft', canManage: true, participantCount: 6, matches: [], ...over });

  it('arrangøren fortsetter oppsettet og åpner spillerlista, med tallet', async () => {
    answer({ ok: true, view: draft() });
    const { navigate } = await renderCup();

    expect(screen.getByTestId('cup-open-players')).toHaveTextContent(/6 påmeldte/);
    await fireEvent.press(screen.getByTestId('cup-open-setup'));
    expect(navigate).toHaveBeenCalledWith('CreateCup', { cupId: 'cup-1' });
    await fireEvent.press(screen.getByTestId('cup-open-players'));
    expect(navigate).toHaveBeenCalledWith('CupParticipants', { cupId: 'cup-1' });
  });

  it('uten kamper er det ingenting å styre ennå', async () => {
    answer({ ok: true, view: draft() });
    await renderCup();
    expect(screen.queryByTestId('cup-open-manage')).toBeNull();
  });

  it('med kamper står «Styr cupen» også', async () => {
    answer({ ok: true, view: draft({ matches: [cupMatch()] }) });
    await renderCup();
    expect(screen.getByTestId('cup-open-manage')).toBeTruthy();
  });

  it('en spiller har ingen av dem', async () => {
    answer({ ok: true, view: draft({ canManage: false }) });
    await renderCup();
    expect(screen.queryByTestId('cup-open-setup')).toBeNull();
    expect(screen.queryByTestId('cup-open-players')).toBeNull();
  });

  it('en cup som går, har ikke oppsettet', async () => {
    answer({ ok: true, view: liveCup({ canManage: true }) });
    await renderCup();
    expect(screen.queryByTestId('cup-open-setup')).toBeNull();
    expect(screen.getByTestId('cup-open-manage')).toBeTruthy();
  });

  it('uten nett: ingen dører', async () => {
    answer({ ok: true, view: draft() }, { ok: false, reason: 'offline' });
    await renderCup();
    await refocus();
    expect(screen.queryByTestId('cup-open-setup')).toBeNull();
  });
});

describe('fra utkast til start (#2752)', () => {
  const draft = (over: Partial<AppCupView> = {}) =>
    liveCup({ status: 'draft', canManage: true, participantCount: 4, matches: [], ...over });
  const twoMatches = [cupMatch({ gameId: 'g1' }), cupMatch({ gameId: 'g2' })];

  beforeEach(() => {
    (startCup as jest.Mock).mockClear();
  });

  it('arrangøren har døra til «Fordel & generer»', async () => {
    answer({ ok: true, view: draft() });
    const { navigate } = await renderCup();
    await fireEvent.press(await screen.findByTestId('cup-open-generate'));
    expect(navigate).toHaveBeenCalledWith('CupGenerate', { cupId: 'cup-1' });
  });

  it('under to kamper er starten av, og sier hvorfor', async () => {
    answer({ ok: true, view: draft({ matches: [cupMatch({ gameId: 'g1' })] }) });
    await renderCup();
    expect(await screen.findByTestId('cup-start')).toBeDisabled();
    expect(screen.getByTestId('cup-start-hint')).toHaveTextContent('Du må opprette minst 2 matcher før du kan starte cupen.');
  });

  it('starter, kvitterer og leser rommet på nytt', async () => {
    answer({ ok: true, view: draft({ matches: twoMatches }) }, { ok: true, view: liveCup({ canManage: true, matches: twoMatches }) });
    const props = cupProps(jest.fn());
    await render(<Cup {...props} />);
    expect(await screen.findByTestId('cup-start')).toBeEnabled();
    expect(screen.queryByTestId('cup-start-hint')).toBeNull();
    await fireEvent.press(screen.getByTestId('cup-start'));
    expect(startCup).toHaveBeenCalledWith('cup-1');
    expect(props.navigation.setParams).toHaveBeenCalledWith({ notice: 'cup_started' });
    expect(screen.queryByTestId('cup-start')).toBeNull();
    expect(screen.queryByTestId('cup-open-generate')).toBeNull();
    expect(screen.getByTestId('cup-open-manage')).toBeTruthy();
  });

  it('to trykk før skjermen er tegnet på nytt: ett kall', async () => {
    let finish: (value: { ok: true }) => void = () => {};
    (startCup as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    answer({ ok: true, view: draft({ matches: twoMatches }) });
    await renderCup();
    const button = await screen.findByTestId('cup-start');
    await act(async () => {
      button.props.onClick?.({ preventDefault() {} });
      button.props.onClick?.({ preventDefault() {} });
    });
    expect(startCup).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('cup-start')).toHaveTextContent('Starter …');
    await act(async () => finish({ ok: true }));
  });

  it('et nei står, og er cupen i gang likevel, viser rommet det', async () => {
    (startCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'start_failed' });
    answer({ ok: true, view: draft({ matches: twoMatches }) });
    await renderCup();
    await fireEvent.press(await screen.findByTestId('cup-start'));
    expect(screen.getByTestId('cup-start-error')).toHaveTextContent('Klarte ikke å starte cupen.');

    (startCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'wrong_status' });
    answer({ ok: true, view: liveCup({ canManage: true, matches: twoMatches }) });
    await fireEvent.press(screen.getByTestId('cup-start'));
    expect(screen.queryByTestId('cup-start')).toBeNull();
    expect(screen.queryByTestId('cup-start-error')).toBeNull();
  });

  it('et nei på starten står ikke igjen når du kommer tilbake til rommet', async () => {
    (startCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'offline' });
    answer({ ok: true, view: draft({ matches: twoMatches }) });
    const props = cupProps(jest.fn());
    await render(<Cup {...props} />);
    await fireEvent.press(await screen.findByTestId('cup-start'));
    expect(screen.getByTestId('cup-start-error')).toHaveTextContent(/Sjekk nettet/);
    const [, onBlur] = (props.navigation.addListener as jest.Mock).mock.calls.find(([event]) => event === 'blur');
    await act(async () => onBlur());
    expect(screen.queryByTestId('cup-start-error')).toBeNull();
  });

  it('en spiller har verken døra eller starten', async () => {
    answer({ ok: true, view: draft({ canManage: false, matches: twoMatches }) });
    await renderCup();
    await screen.findByTestId('cup-name');
    expect(screen.queryByTestId('cup-open-generate')).toBeNull();
    expect(screen.queryByTestId('cup-start')).toBeNull();
  });

  it('uten nett står verken døra eller starten', async () => {
    answer({ ok: true, view: draft({ matches: twoMatches }) }, { ok: false, reason: 'offline' });
    await renderCup();
    await screen.findByTestId('cup-start');
    await refocus();
    expect(screen.queryByTestId('cup-start')).toBeNull();
    expect(screen.queryByTestId('cup-open-generate')).toBeNull();
  });

  it.each([
    ['cup_started', 'Cupen er startet. Spillerne får varsel.'],
    ['matches_generated', 'Matchene er opprettet. Se gjennom listen under.'],
    ['matches_changed', 'Antallet matcher i cupen er endret. Se gjennom listen under før du lager flere.'],
  ])('kvitteringen %s', async (notice, text) => {
    answer({ ok: true, view: draft({ matches: twoMatches }) });
    await renderCup({ notice });
    expect(await screen.findByTestId('cup-notice')).toHaveTextContent(text);
  });
});
