'use client';

import { useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { PuttsChips } from '@/components/hole/PuttsChips';
import { writeScore } from '@/lib/sync/writeScore';
import { drainQueue } from '@/lib/sync/syncWorker';

interface MissingHole {
  holeNumber: number;
  par: number;
  strokes: number;
}

/**
 * «Putter ført på X av Y hull — fyll inn det siste?» prompt on the submit review
 * (#1290 del B). Shown only when the player already recorded ≥1 putt this round
 * (the behavioural opt-in) but left some played holes blank. The game is still
 * active, so each chip writes through the offline-first `writeScore` path.
 *
 * A chip changes putts only (#2211). The page's strokes are a server snapshot:
 * passing them as `strokes` wrote a stale number back over a mate's later
 * correction (or the player's own queued edit). They ride as `fallbackStrokes`,
 * used only when the local DB has no row, so a cold DB still keeps the strokes.
 * Each chip drains at once, like the hole page, so «Lever ✓» does not wait for
 * the next sync tick. Dismissible and never blocks the delivery below it —
 * putt-keeping is voluntary.
 */
export function PuttsSubmitPrompt({
  gameId,
  userId,
  puttedCount,
  playedCount,
  holes,
}: {
  gameId: string;
  userId: string;
  puttedCount: number;
  playedCount: number;
  holes: MissingHole[];
}): JSX.Element | null {
  const t = useTranslations('game.submit.puttsPrompt');
  const [dismissed, setDismissed] = useState(false);
  const [recorded, setRecorded] = useState<Map<number, number>>(new Map());

  if (dismissed) return null;

  const remaining = holes.filter((h) => !recorded.has(h.holeNumber));
  const done = puttedCount + recorded.size;

  async function onSelect(hole: MissingHole, putts: number) {
    // Optimistic: mark recorded immediately; writeScore queues the sync.
    setRecorded((prev) => new Map(prev).set(hole.holeNumber, putts));
    await writeScore({
      gameId,
      userId,
      holeNumber: hole.holeNumber,
      putts,
      fallbackStrokes: hole.strokes,
      enteredBy: userId,
    });
    void drainQueue();
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-text">
          {remaining.length === 0
            ? t('allDone')
            : t('heading', { done, total: playedCount })}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="tap-extend shrink-0 font-sans text-xs text-muted underline underline-offset-2 hover:text-text [--tap-extend:-14px_-8px]"
        >
          {t('dismiss')}
        </button>
      </div>

      {remaining.length > 0 && (
        <ul className="mt-3 space-y-3">
          {remaining.map((h) => {
            const holeName = t('holeName', { hole: h.holeNumber });
            return (
              <li key={h.holeNumber}>
                <p className="mb-1.5 font-sans text-xs text-muted">
                  {t('holeAnchor', {
                    hole: h.holeNumber,
                    par: h.par,
                    strokes: h.strokes,
                  })}
                </p>
                <PuttsChips
                  value={recorded.get(h.holeNumber) ?? null}
                  ariaName={holeName}
                  onSelect={(putts) => void onSelect(h, putts)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
