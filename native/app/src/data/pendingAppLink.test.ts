// native/app/src/data/pendingAppLink.test.ts
// #2627, #2748: lenka som åpnet appen, til navigatoren tar den. Type A.
//
// Lenka kan komme før noen er logget inn. Da står den her mens Login vises, og
// navigatoren tar den når den er montert. Det som må bevises: bare våre lenker
// blir stående, både lenka som startet appen og en som kommer mens appen er
// åpen leses, og lenka tas bare én gang.
import { Linking } from 'react-native';
import {
  appLinkScreen,
  appLinkStep,
  listenForAppLinks,
  offerAppLink,
  pendingAppLink,
  subscribePendingAppLink,
  takePendingAppLink,
} from './pendingAppLink';

const LINK = 'https://tornygolf.no/venner/legg-til/abcd1234';
const LEAGUE_LINK = 'https://tornygolf.no/liga/bli-med/abcd2345';
const FRIEND = { kind: 'friend', code: 'abcd1234' } as const;
const LEAGUE = { kind: 'league', code: 'abcd2345' } as const;

let urlHandler: ((event: { url: string }) => void) | null = null;
const removeMock = jest.fn();
const ORIGINAL_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL;

beforeEach(() => {
  process.env.EXPO_PUBLIC_WEB_BASE_URL = 'https://tornygolf.no';
  takePendingAppLink();
  urlHandler = null;
  removeMock.mockClear();
  jest.spyOn(Linking, 'addEventListener').mockImplementation(((
    _type: string,
    handler: (event: { url: string }) => void,
  ) => {
    urlHandler = handler;
    return { remove: removeMock };
  }) as never);
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
  if (ORIGINAL_BASE === undefined) delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
  else process.env.EXPO_PUBLIC_WEB_BASE_URL = ORIGINAL_BASE;
});

describe('offerAppLink / takePendingAppLink', () => {
  it.each([
    ['en venne-lenke', LINK, FRIEND],
    ['en ligalenke', LEAGUE_LINK, LEAGUE],
  ])('holder %s til den tas, og gir den bare én gang', (_label, url, link) => {
    expect(offerAppLink(url)).toBe(true);
    expect(pendingAppLink()).toEqual(link);
    expect(takePendingAppLink()).toEqual(link);
    expect(takePendingAppLink()).toBeNull();
  });

  it('lar en annen lenke være, og beholder den som venter', () => {
    offerAppLink(LINK);
    expect(offerAppLink('https://tornygolf.no/login')).toBe(false);
    expect(pendingAppLink()).toEqual(FRIEND);
  });

  it('lar den siste lenka vinne, også mellom to slags', () => {
    offerAppLink(LINK);
    offerAppLink('https://tornygolf.no/venner/legg-til/zzzz9999');
    expect(pendingAppLink()).toEqual({ kind: 'friend', code: 'zzzz9999' });
    offerAppLink(LEAGUE_LINK);
    expect(takePendingAppLink()).toEqual(LEAGUE);
  });

  it('sier fra til den som lytter, når en lenke kommer og når den tas', () => {
    const listener = jest.fn();
    const stop = subscribePendingAppLink(listener);
    offerAppLink(LINK);
    takePendingAppLink();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    offerAppLink(LINK);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('listenForAppLinks', () => {
  it('leser lenka som startet appen', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(LINK);
    const stop = listenForAppLinks();
    await Promise.resolve();
    await Promise.resolve();
    expect(pendingAppLink()).toEqual(FRIEND);
    stop();
  });

  it('leser en lenke som kommer mens appen er åpen, og slutter å lytte når den stoppes', () => {
    const stop = listenForAppLinks();
    urlHandler?.({ url: LINK });
    expect(pendingAppLink()).toEqual(FRIEND);
    stop();
    expect(removeMock).toHaveBeenCalled();
  });

  it('lar en feil i getInitialURL aldri velte appen', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockRejectedValue(new Error('nei'));
    const stop = listenForAppLinks();
    await Promise.resolve();
    await Promise.resolve();
    expect(pendingAppLink()).toBeNull();
    stop();
  });

  it('bryr seg ikke om lenka som startet appen når lyttingen er stoppet før den kom', async () => {
    let resolve: (url: string) => void = () => {};
    jest.spyOn(Linking, 'getInitialURL').mockReturnValue(
      new Promise<string>((r) => {
        resolve = r;
      }) as never,
    );
    const stop = listenForAppLinks();
    stop();
    resolve(LINK);
    await Promise.resolve();
    await Promise.resolve();
    expect(pendingAppLink()).toBeNull();
  });
});

// Navigatorens avgjørelse (#2627, review-runde 1): når en ventende lenke åpner
// skjermen, og når den bare brukes opp.
describe('appLinkStep', () => {
  const home = { name: 'Home' };
  const sameCode = { name: 'FriendLink', params: { code: 'abcd1234' } };
  const otherCode = { name: 'FriendLink', params: { code: 'zzzz9999' } };
  const sameLeague = { name: 'LeagueJoin', params: { code: 'abcd2345' } };

  it('venter så lenge navigatoren ikke er klar, så lenka ikke går tapt', () => {
    expect(appLinkStep(false, undefined, FRIEND)).toBe('wait');
    expect(appLinkStep(false, home, LEAGUE)).toBe('wait');
  });

  it('venter når ingen lenke venter', () => {
    expect(appLinkStep(true, home, null)).toBe('wait');
  });

  it('hopper over når samme skjerm med samme kode alt står øverst (oppstarts-lenke + hendelse)', () => {
    expect(appLinkStep(true, sameCode, FRIEND)).toBe('skip');
    expect(appLinkStep(true, sameLeague, LEAGUE)).toBe('skip');
  });

  it.each([
    ['en annen skjerm', home],
    ['skjermen med en annen kode', otherCode],
    ['ingen skjerm ennå', undefined],
  ])('åpner venne-skjermen over %s', (_label, current) => {
    expect(appLinkStep(true, current, FRIEND)).toBe('push');
  });

  it('åpner ligaskjermen over en annen skjerm, også over venne-skjermen med samme kode', () => {
    expect(appLinkStep(true, home, LEAGUE)).toBe('push');
    expect(appLinkStep(true, { name: 'FriendLink', params: { code: 'abcd2345' } }, LEAGUE)).toBe('push');
    expect(appLinkStep(true, { name: 'LeagueJoin', params: { code: 'zzzz9999' } }, LEAGUE)).toBe('push');
  });
});

describe('appLinkScreen', () => {
  it('venne-lenka åpner «Bli venn med …», ligalenka åpner «Bli med i liga»', () => {
    expect(appLinkScreen(FRIEND)).toEqual({ name: 'FriendLink', params: { code: 'abcd1234' } });
    expect(appLinkScreen(LEAGUE)).toEqual({ name: 'LeagueJoin', params: { code: 'abcd2345' } });
  });
});
