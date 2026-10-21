// Delt mock for `data/syncTriggers` (#2228). Hver skjermtest bruker én linje:
//
//   jest.mock('../data/syncTriggers', () => require('../test/syncTriggersMock'));
//
// Lytterne huskes mens de er registrert, og avregistreringen fjerner dem. Da
// kan en test fyre «appen kom i forgrunnen» og «nettet er tilbake» med
// `fireForeground()` og `fireOnline()`, og bare skjermene som faktisk lytter
// akkurat da, svarer. Ingen fil limer inn sin egen fabrikk eller sin egen
// «fyr alle lyttere»-løkke (docs/test-discipline.md: aldri duplikat
// mock-oppsett).
//
// Produktkoden henter fire verdier fra `data/syncTriggers`, og alle fire står
// her.

type Listener = () => void;

const foregroundListeners = new Set<Listener>();
const onlineListeners = new Set<Listener>();

export const isDeviceOnline = jest.fn(() => true);

export const addForegroundListener = jest.fn((listener: Listener) => {
  foregroundListeners.add(listener);
  return () => {
    foregroundListeners.delete(listener);
  };
});

export const addOnlineListener = jest.fn((listener: Listener) => {
  onlineListeners.add(listener);
  return () => {
    onlineListeners.delete(listener);
  };
});

export const startSyncTriggers = jest.fn(() => () => undefined);

/** Hvor mange forgrunns-lyttere som er registrert akkurat nå. */
export function foregroundListenerCount(): number {
  return foregroundListeners.size;
}

/** Appen kommer i forgrunnen: alle aktive forgrunns-lyttere fyres. */
export function fireForeground(): void {
  for (const listener of [...foregroundListeners]) listener();
}

/** Nettet er tilbake: alle aktive nett-lyttere fyres. */
export function fireOnline(): void {
  for (const listener of [...onlineListeners]) listener();
}
