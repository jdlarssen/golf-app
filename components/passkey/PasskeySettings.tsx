'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { getBrowserClient } from '@/lib/supabase/client';
import { useWebAuthnSupported } from '@/lib/auth/useWebAuthnSupported';

type Passkey = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

/**
 * Profil-seksjon for passkeys (#63): lists the user's enrolled passkeys with
 * rename/delete, plus a "Slå på Face ID" enroll button. The heading lives inside
 * the component (like {@link PushToggle}) so nothing dangles when the browser
 * has no WebAuthn support (the component returns null). The page only mounts
 * this when the rollout flag allows enrollment for the user.
 */
export function PasskeySettings() {
  const t = useTranslations('passkey');
  const locale = useLocale();
  const supported = useWebAuthnSupported();
  const [keys, setKeys] = useState<Passkey[] | null>(null); // null = loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await getBrowserClient().auth.passkey.list();
    setKeys((data ?? []) as Passkey[]);
  }, []);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    getBrowserClient()
      .auth.passkey.list()
      .then(({ data }) => {
        if (!cancelled) setKeys((data ?? []) as Passkey[]);
      })
      .catch(() => {
        if (!cancelled) setKeys([]);
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  if (!supported) return null;

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await getBrowserClient().auth.registerPasskey();
      if (e) {
        setError(e.code === 'webauthn_credential_exists' ? t('enrollExists') : t('enrollError'));
      } else {
        await refresh();
      }
    } catch {
      setError(t('enrollError'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t('deleteConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await getBrowserClient().auth.passkey.delete({ passkeyId: id });
      if (e) setError(t('deleteError'));
      else await refresh();
    } catch {
      setError(t('deleteError'));
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: string, current?: string) {
    const name = window.prompt(t('renamePrompt'), current ?? '')?.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await getBrowserClient().auth.passkey.update({
        passkeyId: id,
        friendlyName: name.slice(0, 120),
      });
      if (e) setError(t('renameError'));
      else await refresh();
    } catch {
      setError(t('renameError'));
    } finally {
      setBusy(false);
    }
  }

  const heading = (
    <p className="mb-2 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
      {t('sectionHeading')}
    </p>
  );

  if (keys === null) {
    return (
      <>
        {heading}
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-muted">{t('loading')}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {heading}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="font-serif text-base font-medium text-text">{t('settingsTitle')}</p>
        {keys.length === 0 ? (
          <p className="mt-1 text-xs text-text-muted leading-relaxed">{t('settingsEmpty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-text">
                    {k.friendly_name || t('unnamed')}
                  </p>
                  <p className="text-xs text-text-muted tabular-nums">
                    {k.last_used_at
                      ? t('lastUsed', {
                          date: new Date(k.last_used_at).toLocaleDateString(locale, DATE_OPTS),
                        })
                      : t('added', {
                          date: new Date(k.created_at).toLocaleDateString(locale, DATE_OPTS),
                        })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => rename(k.id, k.friendly_name)}
                    disabled={busy}
                    className="min-h-11 px-2 text-xs text-primary disabled:opacity-50"
                  >
                    {t('renameAction')}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(k.id)}
                    disabled={busy}
                    className="min-h-11 px-2 text-xs text-danger-deep disabled:opacity-50"
                  >
                    {t('deleteAction')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={enroll}
          disabled={busy}
          className="mt-3 w-full min-h-11 rounded-full bg-primary px-4 py-2 text-sm font-medium text-bg-tint disabled:opacity-50"
        >
          {t('enrollButton')}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger-deep">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
