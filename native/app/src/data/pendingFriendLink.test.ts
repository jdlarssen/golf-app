// native/app/src/data/pendingFriendLink.test.ts
// #2627: venne-koden fra lenka som åpnet appen, til navigatoren tar den.
// Type A.
//
// Lenka kan komme før noen er logget inn. Da står koden her mens Login vises,
// og navigatoren tar den når den er montert. Det som må bevises: bare en
// venne-lenke blir en kode, både lenka som startet appen og en som kommer
// mens appen er åpen leses, og koden tas bare én gang.
import { Linking } from 'react-native';
import {
  listenForFriendLinks,
  offerFriendLink,
  pendingFriendCode,
  subscribePendingFriendCode,
  takePendingFriendCode,
} from './pendingFriendLink';

const LINK = 'https://tornygolf.no/venner/legg-til/abcd1234';

let urlHandler: ((event: { url: string }) => void) | null = null;
const removeMock = jest.fn();
const ORIGINAL_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL;

beforeEach(() => {
  process.env.EXPO_PUBLIC_WEB_BASE_URL = 'https://tornygolf.no';
  takePendingFriendCode();
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

describe('offerFriendLink / takePendingFriendCode', () => {
  it('holder koden fra en venne-lenke til den tas, og gir den bare én gang', () => {
    expect(offerFriendLink(LINK)).toBe(true);
    expect(pendingFriendCode()).toBe('abcd1234');
    expect(takePendingFriendCode()).toBe('abcd1234');
    expect(takePendingFriendCode()).toBeNull();
  });

  it('lar en annen lenke være, og beholder koden som venter', () => {
    offerFriendLink(LINK);
    expect(offerFriendLink('https://tornygolf.no/login')).toBe(false);
    expect(pendingFriendCode()).toBe('abcd1234');
  });

  it('lar den siste venne-lenka vinne', () => {
    offerFriendLink(LINK);
    offerFriendLink('https://tornygolf.no/venner/legg-til/zzzz9999');
    expect(takePendingFriendCode()).toBe('zzzz9999');
  });

  it('sier fra til den som lytter, når en kode kommer og når den tas', () => {
    const listener = jest.fn();
    const stop = subscribePendingFriendCode(listener);
    offerFriendLink(LINK);
    takePendingFriendCode();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    offerFriendLink(LINK);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('listenForFriendLinks', () => {
  it('leser lenka som startet appen', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(LINK);
    const stop = listenForFriendLinks();
    await Promise.resolve();
    await Promise.resolve();
    expect(pendingFriendCode()).toBe('abcd1234');
    stop();
  });

  it('leser en lenke som kommer mens appen er åpen, og slutter å lytte når den stoppes', () => {
    const stop = listenForFriendLinks();
    urlHandler?.({ url: LINK });
    expect(pendingFriendCode()).toBe('abcd1234');
    stop();
    expect(removeMock).toHaveBeenCalled();
  });

  it('lar en feil i getInitialURL aldri velte appen', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockRejectedValue(new Error('nei'));
    const stop = listenForFriendLinks();
    await Promise.resolve();
    await Promise.resolve();
    expect(pendingFriendCode()).toBeNull();
    stop();
  });

  it('bryr seg ikke om lenka som startet appen når lyttingen er stoppet før den kom', async () => {
    let resolve: (url: string) => void = () => {};
    jest.spyOn(Linking, 'getInitialURL').mockReturnValue(
      new Promise<string>((r) => {
        resolve = r;
      }) as never,
    );
    const stop = listenForFriendLinks();
    stop();
    resolve(LINK);
    await Promise.resolve();
    await Promise.resolve();
    expect(pendingFriendCode()).toBeNull();
  });
});
