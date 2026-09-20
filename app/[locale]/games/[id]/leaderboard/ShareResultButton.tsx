'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSharePng } from '@/lib/share/useSharePng';

/**
 * The sibling `share-image` route for the leaderboard we are standing on.
 * `null` on the server (no `window`) and on any path that is not a
 * leaderboard — the hook then prefetches nothing and the button stays hidden.
 */
function shareImageUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  if (!/\/games\/[^/]+\/leaderboard/.test(path)) return null;
  // Preserve any locale prefix; strip anything after `/leaderboard`
  // (e.g. the hole-by-hole drilldown) to reach the route's base.
  return `${path.split('/leaderboard')[0]}/leaderboard/share-image`;
}

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
 *
 * All of that now lives in `lib/share/useSharePng` (#2130), shared with
 * Kavalkadens card button. This component only decides which URL to prefetch
 * and how the button looks.
 */
export function ShareResultButton() {
  const t = useTranslations('leaderboard.common');
  // Lazy initializer: runs once, after hydration on the client. The rendered
  // output is identical on both sides (`ready` starts false → nothing), so
  // reading `window` here cannot produce a hydration mismatch.
  const [imageUrl] = useState<string | null>(shareImageUrl);

  const { ready, busy, share } = useSharePng({
    imageUrl,
    fileName: 'torny-resultat.png',
    shareText: t('shareText'),
  });

  if (!ready) return null;

  return (
    <div className="flex justify-center px-6 pb-6 pt-2">
      <button
        type="button"
        onClick={() => void share()}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-medium tracking-tight text-white transition-[background-color,transform,opacity] duration-100 hover:bg-primary-hover disabled:opacity-60 dark:text-bg"
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
