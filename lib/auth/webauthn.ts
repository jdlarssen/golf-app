/**
 * True when the browser exposes the WebAuthn API. Client-safe — returns false
 * during SSR (no `window`). Used to gate passkey UI so buttons never render
 * where the ceremony can't run. (#63)
 */
export function supportsWebAuthn(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined'
  );
}
