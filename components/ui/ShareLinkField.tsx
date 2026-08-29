'use client';

import { useState } from 'react';

/**
 * Delt «vis lenke + kopier»-primitiv (#1803): readonly-felt med den absolutte
 * URL-en og en kopier-knapp med kort «Kopiert!»-bekreftelse. Feiler Clipboard
 * API-et (sjeldent: ikke-sikker kontekst) vises feilteksten, og lenken kan
 * kopieres manuelt fra feltet — onFocus markerer hele verdien.
 *
 * Tar ferdig oversatte strenger som props i stedet for et namespace:
 * call-sitene eier sine egne kataloger (admin.game.registration,
 * klubb.copyLink, cup.participants.share), og next-intl-namespaces skal
 * kunne analyseres statisk per call-site.
 */
export function ShareLinkField({
  url,
  ariaLabel,
  copyLabel,
  copiedLabel,
  errorText,
  testId,
}: {
  url: string;
  /** aria-label for det readonly URL-feltet. */
  ariaLabel: string;
  copyLabel: string;
  copiedLabel: string;
  errorText: string;
  /** data-testid på feltet; kopier-knappen får `${testId}-copy`. */
  testId?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      window.setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      console.error('[ShareLinkField] copy failed', err);
      setState('error');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          data-testid={testId}
          className="flex-1 min-w-0 rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-[12px] tabular-nums text-text"
          aria-label={ariaLabel}
        />
        <button
          type="button"
          onClick={copy}
          data-testid={testId ? `${testId}-copy` : undefined}
          className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-medium tracking-tight text-white transition-colors hover:bg-primary-hover dark:text-bg"
        >
          {state === 'copied' ? copiedLabel : copyLabel}
        </button>
      </div>
      {state === 'error' && <p className="text-xs text-danger">{errorText}</p>}
    </div>
  );
}
