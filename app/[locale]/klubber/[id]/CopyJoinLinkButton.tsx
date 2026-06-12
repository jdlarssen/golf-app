'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Client component for the «Kopier lenke» button on the club detail page.
 * Copies the /klubber/bli-med/[short_id] join URL to the clipboard.
 *
 * Mirrors CopyShareLinkButton in app/admin/games/[id]/CopyShareLinkButton.tsx.
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export function CopyJoinLinkButton({ joinUrl }: { joinUrl: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const t = useTranslations('klubb.copyLink');

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setState('copied');
      window.setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      console.error('[CopyJoinLinkButton] copy failed', err);
      setState('error');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={joinUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-[12px] tabular-nums text-text"
          aria-label={t('ariaLabel')}
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-medium tracking-tight text-white transition-colors hover:bg-primary-hover dark:text-bg"
        >
          {state === 'copied' ? t('copiedButton') : t('copyButton')}
        </button>
      </div>
      {state === 'error' && (
        <p className="text-xs text-danger">
          {t('copyError')}
        </p>
      )}
    </div>
  );
}
