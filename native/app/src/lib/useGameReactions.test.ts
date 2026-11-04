// #2754: reaksjonene inn i tavla. Type C med falsk datalag og falsk kanal:
// optimistisk trykk, feil som går tilbake, sent svar, tapt varsel og formater
// som ikke skal koste en lesing.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factoryen heises over importene og må bruke require */
import { act, renderHook } from '@testing-library/react-native';
import { fetchGameReactions, toggleReaction } from '../data/reactions';
import { subscribeGameReactions } from '../data/realtime';
import { useGameReactions, type ReactionFailure } from './useGameReactions';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react') as typeof import('react');
    useEffect(callback, [callback]);
  },
}));
jest.mock('../data/reactions', () => ({ fetchGameReactions: jest.fn(), toggleReaction: jest.fn() }));
jest.mock('../data/realtime', () => ({ subscribeGameReactions: jest.fn() }));

const mockResume: { current: (() => unknown) | null } = { current: null };
jest.mock('./useOnResume', () => ({
  useOnResume: (callback: () => unknown) => {
    mockResume.current = callback;
  },
}));

const fetchMock = fetchGameReactions as jest.Mock;
const toggleMock = toggleReaction as jest.Mock;
const subscribeMock = subscribeGameReactions as jest.Mock;

const MATE = { userId: 'mate', name: 'Marte' };
const one = (n: number, mine: string[] = []) => ({ mate: { counts: { '🔥': n }, mine } });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

async function setup(overrides: Partial<Parameters<typeof useGameReactions>[0]> = {}) {
  return await renderHook(() =>
    useGameReactions({ gameId: 'g', userId: 'me', enabled: true, canReact: true, ...overrides }),
  );
}

let stopChannel: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  stopChannel = jest.fn();
  subscribeMock.mockReturnValue(stopChannel);
  fetchMock.mockResolvedValue({});
  toggleMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('et format uten reaksjoner', () => {
  it('leser ingenting og åpner ingen kanal', async () => {
    await setup({ enabled: false });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('leser heller ikke ved forgrunn', async () => {
    await setup({ enabled: false });
    await act(async () => { await mockResume.current?.(); });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('lesing', () => {
  it('leser ved åpning og lukker kanalen når skjermen forsvinner', async () => {
    fetchMock.mockResolvedValue(one(2));
    const { result, unmount } = await setup();
    await flush();
    expect(result.current.getRow('mate').counts['🔥']).toBe(2);
    expect(result.current.loaded).toBe(true);
    await unmount();
    expect(stopChannel).toHaveBeenCalled();
  });

  it('samler en byge hendelser til én lesing etter 300 ms', async () => {
    const { result } = await setup();
    await flush();
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(one(5));
    const { onChange } = subscribeMock.mock.calls[0][1];
    await act(async () => { onChange(); onChange(); });
    await act(async () => { jest.advanceTimersByTime(299); });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.getRow('mate').counts['🔥']).toBe(5);
  });

  it('leser det bruddet tok, når kanalen er tilbake (#2093)', async () => {
    const { result } = await setup();
    await flush();
    fetchMock.mockResolvedValue(one(3));
    const { onResubscribed } = subscribeMock.mock.calls[0][1];
    await act(async () => { onResubscribed(); });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(result.current.getRow('mate').counts['🔥']).toBe(3);
  });

  it('leser det bakgrunnen tok, ved forgrunn', async () => {
    const { result } = await setup();
    await flush();
    fetchMock.mockResolvedValue(one(4));
    await act(async () => { await mockResume.current?.(); });
    expect(result.current.getRow('mate').counts['🔥']).toBe(4);
  });

  it('et tapt varsel rettes når stripa åpnes', async () => {
    const { result } = await setup();
    await flush();
    fetchMock.mockResolvedValue(one(6));
    await act(async () => { result.current.openFor(MATE); });
    expect(result.current.getRow('mate').counts['🔥']).toBe(6);
  });

  it('en feilet lesing tømmer ingenting og sier ingenting', async () => {
    fetchMock.mockResolvedValue(one(2));
    const { result } = await setup();
    await flush();
    fetchMock.mockRejectedValue(new Error('nede'));
    await act(async () => { await mockResume.current?.(); });
    expect(result.current.getRow('mate').counts['🔥']).toBe(2);
    expect(result.current.failure).toBeNull();
  });

  it('et gammelt svar overskriver aldri et nyere (#2094)', async () => {
    const { result } = await setup();
    await flush();
    const slow = deferred<unknown>();
    const fast = deferred<unknown>();
    fetchMock.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    await act(async () => { void mockResume.current?.(); void mockResume.current?.(); });
    await act(async () => { fast.resolve(one(9)); });
    await act(async () => { slow.resolve(one(1)); });
    expect(result.current.getRow('mate').counts['🔥']).toBe(9);
  });
});

describe('trykk', () => {
  it('vises straks, og en lesing fra før trykket blir droppet', async () => {
    const { result } = await setup();
    await flush();
    const before = deferred<unknown>();
    fetchMock.mockReturnValueOnce(before.promise);
    await act(async () => { void mockResume.current?.(); });
    const write = deferred<unknown>();
    toggleMock.mockReturnValue(write.promise);
    await act(async () => { result.current.toggle('mate', '🔥'); });
    expect(result.current.getRow('mate')).toEqual({ counts: { '🔥': 1 }, mine: ['🔥'] });
    await act(async () => { before.resolve({}); });
    expect(result.current.getRow('mate').mine).toEqual(['🔥']);
    await act(async () => { write.resolve({ ok: true }); });
  });

  it('skriver med egen bruker, og leser på nytt etter lagring', async () => {
    const { result } = await setup();
    await flush();
    fetchMock.mockClear();
    await act(async () => { result.current.toggle('mate', '🔥'); });
    expect(toggleMock).toHaveBeenCalledWith({
      gameId: 'g',
      userId: 'me',
      targetUserId: 'mate',
      emoji: '🔥',
    });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('to raske trykk på samme reaksjon gir én skriving', async () => {
    const { result } = await setup();
    await flush();
    const write = deferred<unknown>();
    toggleMock.mockReturnValue(write.promise);
    await act(async () => { result.current.toggle('mate', '🔥'); result.current.toggle('mate', '🔥'); });
    expect(toggleMock).toHaveBeenCalledTimes(1);
    expect(result.current.getRow('mate').mine).toEqual(['🔥']);
    await act(async () => { write.resolve({ ok: true }); });
  });

  it('en lesing mens en skriving er underveis, tar ikke bort trykket', async () => {
    const { result } = await setup();
    await flush();
    const write = deferred<unknown>();
    toggleMock.mockReturnValue(write.promise);
    await act(async () => { result.current.toggle('mate', '🔥'); });
    fetchMock.mockResolvedValue({});
    await act(async () => { await mockResume.current?.(); });
    expect(result.current.getRow('mate').mine).toEqual(['🔥']);
    await act(async () => { write.resolve({ ok: true }); });
  });

  it('ingenting skjer for den som ikke kan reagere', async () => {
    const { result } = await setup({ canReact: false });
    await flush();
    await act(async () => { result.current.toggle('mate', '🔥'); result.current.openFor(MATE); });
    expect(toggleMock).not.toHaveBeenCalled();
    expect(result.current.target).toBeNull();
  });
});

describe('feil', () => {
  it.each<[string, ReactionFailure]>([
    ['db_error', 'save'],
    ['no_rows', 'save'],
    ['rls_denied', 'denied'],
  ])('%s går tilbake til riktig tilstand og sier fra (%s)', async (failure, shown) => {
    fetchMock.mockResolvedValue(one(2));
    const { result } = await setup();
    await flush();
    toggleMock.mockResolvedValue({ ok: false, failure });
    fetchMock.mockRejectedValue(new Error('uten nett'));
    await act(async () => { result.current.toggle('mate', '🔥'); });
    expect(result.current.getRow('mate')).toEqual({ counts: { '🔥': 2 }, mine: [] });
    expect(result.current.failure).toBe(shown);
  });

  it('en kastet skriving behandles som en feilet lagring', async () => {
    const { result } = await setup();
    await flush();
    toggleMock.mockRejectedValue(new Error('nett'));
    await act(async () => { result.current.toggle('mate', '🔥'); });
    expect(result.current.getRow('mate').mine).toEqual([]);
    expect(result.current.failure).toBe('save');
  });

  it('to feilede trykk går begge tilbake', async () => {
    const { result } = await setup();
    await flush();
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    toggleMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    fetchMock.mockRejectedValue(new Error('uten nett'));
    await act(async () => { result.current.toggle('mate', '🔥'); result.current.toggle('mate', '👏'); });
    await act(async () => { first.resolve({ ok: false, failure: 'db_error' }); });
    await act(async () => { second.resolve({ ok: false, failure: 'db_error' }); });
    expect(result.current.getRow('mate')).toEqual({ counts: {}, mine: [] });
  });

  it('meldingen går bort ved neste trykk og når stripa lukkes', async () => {
    const { result } = await setup();
    await flush();
    toggleMock.mockResolvedValueOnce({ ok: false, failure: 'db_error' });
    await act(async () => { result.current.openFor(MATE); });
    await act(async () => { result.current.toggle('mate', '🔥'); });
    expect(result.current.failure).toBe('save');
    await act(async () => { result.current.toggle('mate', '🔥'); });
    expect(result.current.failure).toBeNull();

    toggleMock.mockResolvedValueOnce({ ok: false, failure: 'db_error' });
    await act(async () => { result.current.toggle('mate', '👏'); });
    expect(result.current.failure).toBe('save');
    await act(async () => { result.current.close(); });
    expect(result.current.failure).toBeNull();
  });
});

describe('stripa', () => {
  it('åpnes på raden, flyttes til en annen, og lukkes av samme rad', async () => {
    const { result } = await setup();
    await flush();
    await act(async () => { result.current.openFor(MATE); });
    expect(result.current.target).toEqual(MATE);
    const other = { userId: 'other', name: 'Jonas' };
    await act(async () => { result.current.openFor(other); });
    expect(result.current.target).toEqual(other);
    await act(async () => { result.current.openFor(other); });
    expect(result.current.target).toBeNull();
  });
});

describe('hjelpelinja', () => {
  it('står på en tom tavle, og aldri før første svar', async () => {
    const pending = deferred<unknown>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const { result } = await setup();
    expect(result.current.showHint).toBe(false);
    await act(async () => { pending.resolve({}); });
    expect(result.current.showHint).toBe(true);
  });

  it('går bort når du gir din første reaksjon, og kommer tilbake når tavla er tom igjen', async () => {
    const { result } = await setup();
    await flush();
    await act(async () => { result.current.toggle('mate', '👏'); });
    expect(result.current.showHint).toBe(false);
    await act(async () => { result.current.toggle('mate', '👏'); });
    expect(result.current.showHint).toBe(true);
  });

  it('står ikke når andre har fått reaksjoner, selv om du ikke har gitt noen', async () => {
    fetchMock.mockResolvedValue(one(2));
    const { result } = await setup();
    await flush();
    expect(result.current.loaded).toBe(true);
    expect(result.current.showHint).toBe(false);
  });

  it('vises ikke for den som ikke kan reagere', async () => {
    const { result } = await setup({ canReact: false });
    await flush();
    expect(result.current.loaded).toBe(true);
    expect(result.current.showHint).toBe(false);
  });
});
