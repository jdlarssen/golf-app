'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getBrowserClient } from '@/lib/supabase/client';
import { useWebAuthnSupported } from '@/lib/auth/useWebAuthnSupported';

const DISMISS_KEY = 'torny-passkey-nudge-dismissed';

/**
 * One-tap "Slå på Face ID" nudge shown on Hjem right after a returning user has
 * signed in (#63). Only appears when WebAuthn is supported, the user has no
 * passkey yet, and they haven't dismissed it. Enrollment is a user gesture
 * (button tap) — WebAuthn requires user activation, so it never auto-fires.
 * The rollout/role gate is handled by the server wrapper `PasskeyEnrollmentNudge`.
 */
export function PasskeyEnrollmentPrompt() {
  const t = useTranslations('passkey');
  const supported = useWebAuthnSupported();
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      /* private mode */
    }
    if (dismissed) return;
    let cancelled = false;
    getBrowserClient()
      .auth.passkey.list()
      .then(({ data }) => {
        if (!cancelled && (!data || data.length === 0)) setShow(true);
      })
      .catch(() => {
        /* Beta hiccup — just don't nudge */
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  async function enroll() {
    setBusy(true);
    try {
      const { error } = await getBrowserClient().auth.registerPasskey();
      if (error) {
        // Cancelled or Beta failure — don't nag here; the Profil section
        // offers a retry with a visible error.
        setShow(false);
      } else {
        setDone(true);
        dismiss();
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
        <p className="font-medium text-sm text-text">{t('nudgeDoneTitle')}</p>
        <p className="text-xs text-text-muted mt-0.5">{t('nudgeDoneBody')}</p>
      </div>
    );
  }
  if (!show) return null;

  return (
    <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 p-4">
      <p className="font-medium text-sm text-text">{t('nudgeTitle')}</p>
      <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{t('nudgeBody')}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={enroll}
          disabled={busy}
          className="rounded-full bg-primary text-bg-tint px-4 py-2 text-sm font-medium min-h-11 disabled:opacity-50"
        >
          {t('nudgeEnable')}
        </button>
        <button type="button" onClick={dismiss} className="text-text-muted text-sm px-3 min-h-11">
          {t('nudgeLater')}
        </button>
      </div>
    </div>
  );
}
