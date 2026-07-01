'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { getBrowserClient } from '@/lib/supabase/client';
import { useWebAuthnSupported } from '@/lib/auth/useWebAuthnSupported';

/** Only same-origin absolute paths are safe post-login redirect targets. */
function safeNext(next: string): string {
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/**
 * "Logg inn med Face ID" on the login page's email step (#63). Uses discoverable
 * credentials — no email needed. Rendered only when the rollout flag allows the
 * button (server-resolved `showLoginButton`) and the browser supports WebAuthn.
 *
 * On success we do a HARD navigation so `proxy.ts` picks up the session cookie
 * that the browser client just wrote — a client-side `router.push` would not
 * carry the fresh cookie through to the server on the next request. On any
 * failure (no passkey on this device, user cancelled, Beta hiccup) we surface a
 * short message and leave the OTP form below untouched as the fallback.
 */
export function PasskeyLoginButton({ next }: { next: string }) {
  const t = useTranslations('passkey');
  const supported = useWebAuthnSupported();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!supported) return null;

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const supabase = getBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPasskey();
      if (signInError || !data?.session) {
        setError(
          signInError?.code === 'webauthn_credential_not_found'
            ? t('loginNoCredential')
            : t('loginError'),
        );
        setBusy(false);
        return;
      }
      window.location.assign(safeNext(next));
    } catch {
      setError(t('loginError'));
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="w-full min-h-11 rounded-full border border-primary/40 bg-surface px-4 py-2.5 font-sans text-sm font-medium text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
      >
        {t('loginButton')}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-danger-deep">
          {error}
        </p>
      )}
      <div className="mt-4 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        {t('loginDivider')}
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
    </div>
  );
}
