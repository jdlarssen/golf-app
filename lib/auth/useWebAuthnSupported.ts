import { useSyncExternalStore } from 'react';
import { supportsWebAuthn } from './webauthn';

// WebAuthn support never changes within a session, so the store never notifies.
const subscribe = () => () => {};

/**
 * Client hook for WebAuthn availability. Returns `false` during SSR and the
 * hydration pass (server snapshot), then the real value on the client — via
 * `useSyncExternalStore`, which React handles without a hydration mismatch and
 * without the set-state-in-effect anti-pattern. (#63)
 */
export function useWebAuthnSupported(): boolean {
  return useSyncExternalStore(subscribe, supportsWebAuthn, () => false);
}
