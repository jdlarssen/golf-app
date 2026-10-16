// #2580: utslagene hentes på de samme tidspunktene som slagene, i samme hook
// (ingen egen catch-up ved siden av), og bare for spill med innstillingen.
import { renderHook, waitFor } from '@testing-library/react-native';
import { useScoreCatchUp } from './useScoreCatchUp';

const mockFocus: { callback: (() => void) | null } = { callback: null };
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus.callback = callback;
  },
}));
jest.mock('./useOnResume', () => ({ useOnResume: () => undefined }));

const mockSeedScores = jest.fn(async () => 0);
const mockSeedTeeShots = jest.fn(async () => 0);
jest.mock('../data/seedScores', () => ({
  seedGameScores: () => mockSeedScores(),
  seedGameTeeShots: () => mockSeedTeeShots(),
}));
const mockSubscribeScores = jest.fn((_gameId: string, _handlers: unknown) => () => undefined);
const mockSubscribeTeeShots = jest.fn(
  (_gameId: string, _handlers: { onMerge?: () => void }) => () => undefined,
);
jest.mock('../data/realtime', () => ({
  subscribeGameScores: (gameId: string, handlers: unknown) => mockSubscribeScores(gameId, handlers),
  subscribeGameTeeShots: (gameId: string, handlers: { onMerge?: () => void }) => mockSubscribeTeeShots(gameId, handlers),
}));

const GAME = 'game-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus.callback = null;
});

describe('useScoreCatchUp', () => {
  it('uten innstillingen spørres det aldri etter utslag', async () => {
    const reload = jest.fn(async () => undefined);
    await renderHook(() => useScoreCatchUp(GAME, reload, { live: true }));
    mockFocus.callback?.();

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(mockSeedScores).toHaveBeenCalledTimes(1);
    expect(mockSeedTeeShots).not.toHaveBeenCalled();
    expect(mockSubscribeTeeShots).not.toHaveBeenCalled();
  });

  it('med innstillingen hentes utslagene ved fokus og leses på nytt, og kanalen åpnes', async () => {
    const reload = jest.fn(async () => undefined);
    const reloadTeeShots = jest.fn(async () => undefined);
    await renderHook(() => useScoreCatchUp(GAME, reload, { live: true, reloadTeeShots }));
    mockFocus.callback?.();

    await waitFor(() => expect(reloadTeeShots).toHaveBeenCalled());
    expect(mockSeedTeeShots).toHaveBeenCalledTimes(1);
    expect(mockSubscribeTeeShots).toHaveBeenCalledWith(GAME, expect.any(Object));

    // En merge fra kanalen leser utslagene på nytt.
    reloadTeeShots.mockClear();
    mockSubscribeTeeShots.mock.calls[0]![1].onMerge?.();
    expect(reloadTeeShots).toHaveBeenCalledTimes(1);
  });

  it('uten live åpnes ingen kanal, men utslagene hentes fortsatt ved fokus', async () => {
    const reloadTeeShots = jest.fn(async () => undefined);
    await renderHook(() => useScoreCatchUp(GAME, jest.fn(async () => undefined), { reloadTeeShots }));
    mockFocus.callback?.();

    await waitFor(() => expect(mockSeedTeeShots).toHaveBeenCalledTimes(1));
    expect(mockSubscribeTeeShots).not.toHaveBeenCalled();
  });
});
