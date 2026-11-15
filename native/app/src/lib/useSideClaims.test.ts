// #2283: hentingen bak raden på hullet. Det som kan gå galt uten at noen ser
// det: en vanlig runde som poller for ingenting, et svar for forrige hull som
// havner på dette, og en feilet henting som visker ut et svar vi alt har.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factoryen heises over importene og må bruke require */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useSideClaims } from './useSideClaims';

jest.mock('../supabase', () => require('../test/supabaseMock'));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react') as typeof import('react');
    useEffect(callback, [callback]);
  },
}));

jest.mock('../data/sideClaims', () => ({
  fetchSideClaims: jest.fn(),
  fetchGirClaims: jest.fn(),
}));

const { fetchSideClaims, fetchGirClaims } = require('../data/sideClaims') as {
  fetchSideClaims: jest.Mock;
  fetchGirClaims: jest.Mock;
};

const CLAIM = {
  category: 'closest_to_pin',
  holeNumber: 7,
  winnerUserId: 'marte',
  distanceM: 2.5,
  enteredBy: 'tore',
  updatedAt: 't',
};

beforeEach(() => {
  fetchSideClaims.mockReset();
  fetchGirClaims.mockReset();
});

describe('useSideClaims', () => {
  it('henter ingenting på et hull uten konkurranse', async () => {
    const { result } = await renderHook(() => useSideClaims('g', 6, { side: false, gir: false }));
    expect(fetchSideClaims).not.toHaveBeenCalled();
    expect(fetchGirClaims).not.toHaveBeenCalled();
    expect(result.current.side).toBeUndefined();
    expect(result.current.failed).toBe(false);
  });

  it('henter bare tabellene hullet trenger', async () => {
    fetchSideClaims.mockResolvedValue([CLAIM]);
    const { result } = await renderHook(() => useSideClaims('g', 7, { side: true, gir: false }));
    await waitFor(() => expect(result.current.side).toEqual([CLAIM]));
    expect(fetchSideClaims).toHaveBeenCalledWith('g', 7);
    expect(fetchGirClaims).not.toHaveBeenCalled();
    expect(result.current.gir).toBeUndefined();
  });

  it('en feil før første svar gir «failed»; et senere svar tar den bort', async () => {
    fetchGirClaims.mockRejectedValueOnce(new Error('nett'));
    const { result } = await renderHook(() => useSideClaims('g', 5, { side: false, gir: true }));
    await waitFor(() => expect(result.current.failed).toBe(true));

    fetchGirClaims.mockResolvedValueOnce([]);
    await act(() => result.current.refresh());
    expect(result.current.failed).toBe(false);
    expect(result.current.gir).toEqual([]);
  });

  it('en feil etter et svar lar svaret stå', async () => {
    fetchSideClaims.mockResolvedValueOnce([CLAIM]);
    const { result } = await renderHook(() => useSideClaims('g', 7, { side: true, gir: false }));
    await waitFor(() => expect(result.current.side).toEqual([CLAIM]));

    fetchSideClaims.mockRejectedValueOnce(new Error('nett'));
    await act(() => result.current.refresh());
    expect(result.current.side).toEqual([CLAIM]);
    expect(result.current.failed).toBe(false);
  });

  it('svaret for forrige hull vises aldri på det nye', async () => {
    fetchSideClaims.mockResolvedValueOnce([CLAIM]);
    const { result, rerender } = await renderHook(
      ({ hole }: { hole: number }) => useSideClaims('g', hole, { side: true, gir: false }),
      { initialProps: { hole: 7 } },
    );
    await waitFor(() => expect(result.current.side).toEqual([CLAIM]));

    // Hull 9 svarer ikke ennå.
    fetchSideClaims.mockReturnValueOnce(new Promise(() => undefined));
    await rerender({ hole: 9 });
    expect(result.current.side).toBeUndefined();
    expect(fetchSideClaims).toHaveBeenLastCalledWith('g', 9);
  });

  it('løpenumrene: snapshotSeq er hentingen som står, startedSeq den siste som gikk ut', async () => {
    fetchSideClaims.mockResolvedValueOnce([]);
    const { result } = await renderHook(() => useSideClaims('g', 7, { side: true, gir: false }));
    await waitFor(() => expect(result.current.side).toEqual([]));
    expect(result.current.snapshotSeq).toBe(1);
    expect(result.current.startedSeq()).toBe(1);

    // En henting som feiler, går ut (2), men endrer ikke det som står.
    fetchSideClaims.mockRejectedValueOnce(new Error('nett'));
    await act(() => result.current.refresh());
    expect(result.current.startedSeq()).toBe(2);
    expect(result.current.snapshotSeq).toBe(1);

    fetchSideClaims.mockResolvedValueOnce([CLAIM]);
    await act(() => result.current.refresh());
    expect(result.current.snapshotSeq).toBe(3);
    expect(result.current.side).toEqual([CLAIM]);
  });

  it('nyeste henting vinner når to svar krysser hverandre', async () => {
    let releaseOld: (value: unknown) => void = () => undefined;
    fetchSideClaims.mockReturnValueOnce(new Promise((resolve) => (releaseOld = resolve)));
    const { result } = await renderHook(() => useSideClaims('g', 7, { side: true, gir: false }));

    const fresh = { ...CLAIM, winnerUserId: 'jonas' };
    fetchSideClaims.mockResolvedValueOnce([fresh]);
    await act(() => result.current.refresh());
    expect(result.current.side).toEqual([fresh]);

    await act(async () => releaseOld([CLAIM]));
    expect(result.current.side).toEqual([fresh]);
  });
});
