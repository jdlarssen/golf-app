'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * «Del resultat»-knapp på ferdige leaderboards (#942). Mounted once in
 * `LeaderboardShell`, so every finished format gets it with one wiring.
 *
 * Self-gating: on mount it prefetches the recap-card PNG from the sibling
 * `share-image` route. That route 404s for non-finished games, so the button
 * stays hidden everywhere except finished leaderboards — no status prop needed.
 * Prefetching also sidesteps the iOS Web Share transient-activation trap: the
 * blob is ready, so the tap handler calls `navigator.share` synchronously
 * inside the user-gesture window.
 *
 * Personalization is handled server-side via the session cookie, so the button
 * passes no viewer id. When Web Share (with files) is unavailable — desktop —
 * it falls back to downloading the PNG.
 */
export function ShareResultButton() {
  const t = useTranslations('leaderboard.common');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    const match = window.location.pathname.match(/\/games\/[^/]+\/leaderboard/);
    if (!match) return;
    // Preserve any locale prefix; strip anything after `/leaderboard`
    // (e.g. the hole-by-hole drilldown) to reach the route's base.
    const base = window.location.pathname.split('/leaderboard')[0];
    const imgUrl = `${base}/leaderboard/share-image`;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(imgUrl);
        if (cancelled || !res.ok) return; // 404 on active games → stay hidden
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('image/png')) return;
        const blob = await res.blob();
        if (cancelled) return;
        blobRef.current = blob;
        setVisible(true);
      } catch {
        // Network/abort → stay hidden; sharing is a best-effort enhancement.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  async function onShare() {
    const blob = blobRef.current;
    if (!blob || busy) return;
    const file = new File([blob], 'torny-resultat.png', { type: 'image/png' });

    const canShareFiles =
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] });

    if (canShareFiles && typeof navigator.share === 'function') {
      try {
        setBusy(true);
        await navigator.share({
          files: [file],
          title: 'Tørny',
          text: t('shareText'),
        });
        return;
      } catch (err) {
        // User dismissed the share sheet → not an error, just stop.
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('[ShareResultButton] share failed, falling back', err);
        // fall through to download
      } finally {
        setBusy(false);
      }
    }

    // Fallback: download the PNG (desktop / no Web Share file support).
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'torny-resultat.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ShareResultButton] download failed', err);
    }
  }

  return (
    <div className="flex justify-center px-6 pb-6 pt-2">
      <button
        type="button"
        onClick={onShare}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-medium tracking-tight text-white transition-[background-color,transform,opacity] duration-100 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 dark:text-bg"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M12 3v13" />
          <path d="m7 8 5-5 5 5" />
        </svg>
        {t('shareResult')}
      </button>
    </div>
  );
}
