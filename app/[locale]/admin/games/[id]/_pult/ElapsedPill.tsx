'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { elapsedParts } from '@/lib/games/elapsed';

/**
 * «I gang · 2 t 14 min» in the desk's green header (#2268). The first render
 * uses the server's clock (`renderedAt`), so server and client print the same
 * text; after that the pill ticks once a minute. It also reads the clock when
 * the effect starts and when the page becomes visible again: Next 16's
 * Activity re-runs effects on «Tilbake», and a PWA resumed from the background
 * would otherwise show a time up to a minute old. Without `startedAt` it reads
 * «I gang» and never ticks.
 */
export function ElapsedPill({
  startedAt,
  renderedAt,
}: {
  startedAt: string | null;
  renderedAt: string;
}) {
  const t = useTranslations('admin.game.pult');
  const [now, setNow] = useState(() => new Date(renderedAt));

  useEffect(() => {
    if (startedAt == null) return;
    const tick = () => setNow(new Date());
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [startedAt]);

  const parts = elapsedParts(startedAt, now);
  const label =
    parts == null
      ? t('elapsedNone')
      : parts.hours > 0
        ? t('elapsedHours', parts)
        : t('elapsedMinutes', { minutes: parts.minutes });

  return (
    <span
      data-testid="pult-elapsed"
      className="flex h-6 items-center gap-1.5 rounded-full bg-on-strong/14 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] tabular-nums"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-live-dot" />
      {label}
    </span>
  );
}
