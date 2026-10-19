// useGameBundle (Type A for hooken, #1954 Del B): på en golfbane med dårlig
// dekning kan hentingen henge (i ekte flymodus på Android sto spillsiden og
// lastet i over 18 s, fordi ingen ledd har en timeout). Hooken gir opp etter
// GAME_BUNDLE_TIMEOUT_MS, så skjermen kan si «Fikk ikke tak i spillet» og la
// spilleren prøve igjen. Og et spill som er borte, er borte også når en eldre
// kopi ligger lagret: kopien slettes, og skjermen får vite det.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factoryen heises over importene og må bruke require */
import { act, renderHook } from '@testing-library/react-native';
import { GameNotFoundError } from '../data/gameNotFound';
import { GAME_BUNDLE_TIMEOUT_MS, useGameBundle } from './useGameData';

jest.mock('../supabase', () => require('../test/supabaseMock'));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react') as typeof import('react');
    useEffect(callback, [callback]);
  },
}));

jest.mock('./useOnResume', () => ({ useOnResume: () => undefined }));

jest.mock('../data/gameBundle', () => ({
  loadGameBundle: jest.fn(),
  refreshGameBundle: jest.fn(),
  forgetGameBundle: jest.fn(async () => undefined),
}));

const { loadGameBundle, refreshGameBundle, forgetGameBundle } = require('../data/gameBundle') as {
  loadGameBundle: jest.Mock;
  refreshGameBundle: jest.Mock;
  forgetGameBundle: jest.Mock;
};

const CACHED = { game: { id: 'g1' }, players: [], fetchedAt: '2026-10-19T08:00:00.000Z' };

beforeEach(() => {
  loadGameBundle.mockReset();
  refreshGameBundle.mockReset();
  forgetGameBundle.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('gir opp en henting som henger, og en ny henting kan lykkes', async () => {
  jest.useFakeTimers();
  loadGameBundle.mockResolvedValue(undefined);
  refreshGameBundle.mockReturnValueOnce(new Promise(() => undefined)); // henger for alltid
  const { result } = await renderHook(() => useGameBundle('g1'));
  expect(result.current.loading).toBe(true);

  await act(async () => {
    jest.advanceTimersByTime(GAME_BUNDLE_TIMEOUT_MS - 1);
  });
  expect(result.current.loading).toBe(true);

  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(result.current.loading).toBe(false);
  expect(result.current.bundle).toBeNull();
  expect(result.current.errorText).not.toBeNull();
  expect(result.current.notFound).toBe(false);

  // «Prøv igjen»: neste henting kommer fram.
  refreshGameBundle.mockResolvedValueOnce(CACHED);
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.bundle).toBe(CACHED);
  expect(result.current.errorText).toBeNull();
});

it('et spill som er borte, er borte også med en lagret kopi: kopien glemmes', async () => {
  loadGameBundle.mockResolvedValue(CACHED);
  refreshGameBundle.mockRejectedValue(new GameNotFoundError('g1'));
  const { result } = await renderHook(() => useGameBundle('g1'));
  await act(async () => undefined);

  expect(result.current.notFound).toBe(true);
  expect(result.current.bundle).toBeNull();
  expect(forgetGameBundle).toHaveBeenCalledWith('g1');
});

it('en vanlig feil lar den lagrede kopien stå', async () => {
  loadGameBundle.mockResolvedValue(CACHED);
  refreshGameBundle.mockRejectedValue(new TypeError('Network request failed'));
  const { result } = await renderHook(() => useGameBundle('g1'));
  await act(async () => undefined);

  expect(result.current.notFound).toBe(false);
  expect(result.current.bundle).toBe(CACHED);
  expect(forgetGameBundle).not.toHaveBeenCalled();
});
