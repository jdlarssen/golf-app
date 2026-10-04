'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { elapsedParts } from '@/lib/games/organizerDesk';

/**
 * «I gang · 2 t 14 min» in the desk's green header (#2268). The first render
 * uses the server's clock (`renderedAt`), so server and client print the same
 * text; after that the pill ticks once a minute. Without `startedAt` it reads
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
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
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
