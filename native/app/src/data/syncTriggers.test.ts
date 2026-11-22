// Native #1980: forgrunns-lytteren som Hole bruker til å hente slag på nytt.
// AppState stubbes: det er overgangen til `active` som skal fyre, ikke
// bakgrunn og ikke inaktiv.
import { AppState, type AppStateStatus } from 'react-native';
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { addConnectivityListener, addForegroundListener, startSyncTriggers } from './syncTriggers';

jest.mock('./syncWorker', () => ({ drainQueue: jest.fn(async () => undefined) }));
jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true })),
}));

describe('addForegroundListener', () => {
  it('fyrer bare når appen blir aktiv, og slutter etter avmelding', () => {
    let handler: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    const spy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, cb) => {
        handler = cb as (state: AppStateStatus) => void;
        return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
      });
    const listener = jest.fn();

    const stop = addForegroundListener(listener);
    handler!('background');
    handler!('inactive');
    expect(listener).not.toHaveBeenCalled();

    handler!('active');
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    expect(remove).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('addConnectivityListener', () => {
  it('fyrer når nettet går og når det kommer tilbake, bare ved endring, og slutter etter avmelding', async () => {
    // jest-expo sin AppState gir ingen avmelding; triggerne trenger én for å stoppe.
    const appState = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>);
    const listener = jest.fn();
    const stopListening = addConnectivityListener(listener);
    const stopTriggers = startSyncTriggers();
    // Oppstartslesingen (tilkoblet) er ingen endring fra det optimistiske flagget.
    await Promise.resolve();
    const applyState = (addNetworkStateListener as jest.Mock).mock.calls[0][0] as (s: NetworkState) => void;

    applyState({ isConnected: false });
    applyState({ isConnected: false });
    expect(listener.mock.calls).toEqual([[false]]);

    applyState({ isConnected: true });
    expect(listener.mock.calls).toEqual([[false], [true]]);

    stopListening();
    applyState({ isConnected: false });
    expect(listener).toHaveBeenCalledTimes(2);

    // Rydd opp: flagget tilbake til tilkoblet, og triggerne stoppes.
    applyState({ isConnected: true });
    stopTriggers();
    appState.mockRestore();
  });
});

describe('startSyncTriggers: nettstatus ved oppstart', () => {
  it('den første lesingen overskriver ikke en hendelse som kom før den svarte', async () => {
    const appState = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>);
    let answerRead: (s: NetworkState) => void = () => {};
    (getNetworkStateAsync as jest.Mock).mockImplementationOnce(
      () => new Promise<NetworkState>((resolve) => { answerRead = resolve; }),
    );
    const listener = jest.fn();
    const stopListening = addConnectivityListener(listener);
    const stopTriggers = startSyncTriggers();
    const calls = (addNetworkStateListener as jest.Mock).mock.calls;
    const applyEvent = calls[calls.length - 1][0] as (s: NetworkState) => void;

    applyEvent({ isConnected: false });
    answerRead({ isConnected: true }); // den eldre lesingen svarer sist
    await Promise.resolve();
    await Promise.resolve();
    expect(listener.mock.calls).toEqual([[false]]);

    applyEvent({ isConnected: true });
    stopListening();
    stopTriggers();
    appState.mockRestore();
  });
});
