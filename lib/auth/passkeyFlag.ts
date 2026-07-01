/**
 * Rollout gate for native Supabase passkeys (issue #63).
 *
 * Passkey support is a Supabase Beta API on a live production app, so it ships
 * behind a three-state env flag `NEXT_PUBLIC_PASSKEYS`:
 *
 * - `off`   (default / unset): no passkey UI anywhere.
 * - `admin`: only admins may enroll a passkey. The "Logg inn med Face ID"
 *   button renders for everyone on `/login` (that page is pre-auth, so we
 *   can't know who is admin there) — but sign-in only succeeds for users who
 *   have actually enrolled. During this phase that's admins only, which keeps
 *   the real WebAuthn ceremony off non-admin devices.
 * - `on`:   everyone may enroll and sign in with a passkey.
 *
 * OTP-kode stays available as fallback/recovery in every state.
 */
export type PasskeyFlag = 'off' | 'admin' | 'on';

export interface PasskeyAccess {
  /** May this user create (enroll) a new passkey? */
  canEnroll: boolean;
  /** Should the "Logg inn med Face ID" button render on `/login`? */
  showLoginButton: boolean;
}

/** Normalise the raw env value to a known flag; anything else is `off`. */
export function parsePasskeyFlag(raw: string | undefined | null): PasskeyFlag {
  return raw === 'on' ? 'on' : raw === 'admin' ? 'admin' : 'off';
}

/**
 * Resolve what a given user may do, from the raw flag value and their admin
 * status. `isAdmin` is only meaningful in the `admin` phase.
 */
export function resolvePasskeyAccess(
  raw: string | undefined | null,
  isAdmin: boolean,
): PasskeyAccess {
  switch (parsePasskeyFlag(raw)) {
    case 'on':
      return { canEnroll: true, showLoginButton: true };
    case 'admin':
      return { canEnroll: isAdmin, showLoginButton: true };
    case 'off':
      return { canEnroll: false, showLoginButton: false };
  }
}
