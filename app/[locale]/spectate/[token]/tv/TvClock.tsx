'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';

/**
 * The big screen's clock (#2275), in the viewer's own time like the spectate
 * banner (`SpectateLiveStatus`): the TV stands in the clubhouse, so its own
 * clock is the right one. Starts empty (no hydration mismatch) at a fixed
 * height, so nothing moves when the time arrives. Ticks every second but only
 * sets state when the minute changes.
 */
export function TvClock() {
  const locale = useLocale();
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    let shown: string | null = null;
    const tick = () => {
      const next = new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      if (next === shown) return;
      shown = next;
      setTime(next);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [locale]);

  return (
    <p
      data-testid="tv-clock"
      className="h-[54px] text-right font-serif text-[54px] leading-none font-medium"
    >
      {time}
    </p>
  );
}
