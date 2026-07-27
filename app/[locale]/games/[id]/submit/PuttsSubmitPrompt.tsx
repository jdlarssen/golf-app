'use client';

import { useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { PuttsChips } from '@/components/hole/PuttsChips';
import { writeScore } from '@/lib/sync/writeScore';

interface MissingHole {
  holeNumber: number;
  par: number;
  strokes: number;
}

/**
 * «Putter ført på X av Y hull — fyll inn det siste?» prompt on the submit review
 * (#1290 del B). Shown only when the player already recorded ≥1 putt this round
 * (the behavioural opt-in) but left some played holes blank. The game is still
 * active, so each chip writes through the offline-first `writeScore` path — the
 * strokes are passed alongside the putts so a cold local DB can never clobber
 * them (writeScore's merge preserves the pair). Dismissible and never blocks the
 * delivery below it — putt-keeping is voluntary.
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

  function onSelect(hole: MissingHole, putts: number) {
    // Optimistic: mark recorded immediately; writeScore queues the sync.
    setRecorded((prev) => new Map(prev).set(hole.holeNumber, putts));
    void writeScore({
      gameId,
      userId,
      holeNumber: hole.holeNumber,
      strokes: hole.strokes,
      putts,
      enteredBy: userId,
    });
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
          className="shrink-0 font-sans text-xs text-muted underline underline-offset-2 hover:text-text"
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
                  onSelect={(putts) => onSelect(h, putts)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
