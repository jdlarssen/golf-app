// Native N2 (#1823): speil av `startSyncListener` i webbens syncWorker.
//
// Web lytter på window-eventene `online` og `focus` pluss et 30 s-intervall.
// I appen er motstykkene expo-network (nett tilbake) og AppState (appen kommer
// i forgrunnen); intervallet og oppstarts-drainen er like.
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from 'expo-network';
import { AppState, type AppStateStatus } from 'react-native';
import { drainQueue } from './syncWorker';

const DRAIN_INTERVAL_MS = 30_000;

/**
 * Optimistisk true til første nett-lesing svarer: en falsk «offline» ville
 * parkert realtime-gjenoppbygging før appen i det hele tatt har sjekket.
 */
let connected = true;

const onlineListeners = new Set<() => void>();

/** Siste kjente nett-status. Realtime bruker den til å parkere retries. */
export function isDeviceOnline(): boolean {
  return connected;
}

/**
 * Fyr når nettet kommer tilbake — motstykket til webbens
 * `window.addEventListener('online', ...)`.
 */
export function addOnlineListener(listener: () => void): () => void {
  onlineListeners.add(listener);
  return () => {
    onlineListeners.delete(listener);
  };
}

function applyNetworkState(state: NetworkState): void {
  // iOS-forbeholdet fra expo-network: `isInternetReachable` er der bare et ekko
  // av `isConnected`, så `isConnected` ER signalet. Ukjent (undefined) leses som
  // tilkoblet — heller en drain for mye enn en kø som står stille.
  const next = state.isConnected ?? true;
  const cameBack = next && !connected;
  connected = next;
  if (!cameBack) return;
  for (const listener of onlineListeners) listener();
  void drainQueue('nett tilbake');
}

let stopActive: (() => void) | null = null;

/**
 * Start alle drain-triggerne. Idempotent — et nytt kall mens de kjører gir
 * tilbake den samme stopp-funksjonen i stedet for å doble lytterne.
 */
export function startSyncTriggers(): () => void {
  if (stopActive) return stopActive;

  const networkSub = addNetworkStateListener(applyNetworkState);

  const appStateSub = AppState.addEventListener(
    'change',
    (state: AppStateStatus) => {
      if (state === 'active') void drainQueue('app i forgrunnen');
    },
  );

  const interval = setInterval(() => {
    void drainQueue('intervall');
  }, DRAIN_INTERVAL_MS);

  // Les nett-status én gang så flagget ikke står optimistisk feil, og ta en
  // drain med det samme (webbens «try once on bootstrap»).
  void getNetworkStateAsync()
    .then(applyNetworkState)
    .catch(() => {
      // Klarer vi ikke lese nettstatus, står det optimistiske flagget — en
      // mislykket drain er billigere enn en kø som aldri prøver.
    });
  void drainQueue('oppstart');

  const stop = () => {
    networkSub.remove();
    appStateSub.remove();
    clearInterval(interval);
    stopActive = null;
  };
  stopActive = stop;
  return stop;
}
