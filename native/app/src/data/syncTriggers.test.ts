// Native #1980: forgrunns-lytteren som Hole bruker til å hente slag på nytt.
// AppState stubbes: det er overgangen til `active` som skal fyre, ikke
// bakgrunn og ikke inaktiv.
import { AppState, type AppStateStatus } from 'react-native';
import { addForegroundListener } from './syncTriggers';

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
