'use client';

import { useState } from 'react';

/**
 * Client-component for «Kopier lenke»-knappen i Påmelding-seksjonen (#199).
 * Bruker `navigator.clipboard.writeText` med en kort suksess-tilstand.
 * Fallback til `document.execCommand('copy')` finnes ikke — Safari/Chrome
 * på iPhone/macOS støtter Clipboard API på sikre kontekster (https). Hvis
 * API-et feiler (sjeldent: ikke-sikker kontekst) viser vi en feiltekst og
 * lar bruker kopiere lenken manuelt fra det viste tekst-feltet.
 */
export function CopyShareLinkButton({ shareUrl }: { shareUrl: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setState('copied');
      window.setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      console.error('[CopyShareLinkButton] copy failed', err);
      setState('error');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-[12px] tabular-nums text-text"
          aria-label="Påmeldings-lenke"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-medium tracking-tight text-white transition-colors hover:bg-primary-hover dark:text-bg"
        >
          {state === 'copied' ? '✓ Kopiert' : 'Kopier lenke'}
        </button>
      </div>
      {state === 'error' && (
        <p className="text-xs text-danger">
          Klarte ikke å kopiere automatisk. Marker lenken over og kopier
          manuelt.
        </p>
      )}
    </div>
  );
}
