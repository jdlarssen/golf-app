'use client';

import { useMemo, useState, useTransition, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PuttsChips } from '@/components/hole/PuttsChips';
import { backfillPutts, type PuttsBackfillEntry } from './actions';

export interface PutterHoleRow {
  holeNumber: number;
  par: number;
  strokes: number;
  putts: number | null;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saved'; count: number }
  | { kind: 'error'; code: 'unauthenticated' | 'not_finished' | 'invalid' | 'db' };

/**
 * Client form behind `/putter` (#1290 del B). Holds a local putts value per hole,
 * lets the player fill missing ones via chips, and saves the changed holes
 * through `backfillPutts`. Partial fill is fine — PPH counts everything, the
 * per-round average still needs all 18 (del A semantics).
 */
export function PutterForm({
  gameId,
  rows,
}: {
  gameId: string;
  rows: PutterHoleRow[];
}): JSX.Element {
  const t = useTranslations('game.putter');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });

  const initial = useMemo(
    () => new Map(rows.map((r) => [r.holeNumber, r.putts])),
    [rows],
  );
  const [values, setValues] = useState<Map<number, number | null>>(initial);

  const dirty: PuttsBackfillEntry[] = [];
  for (const r of rows) {
    const v = values.get(r.holeNumber) ?? null;
    if (v != null && v !== initial.get(r.holeNumber)) {
      dirty.push({ holeNumber: r.holeNumber, putts: v });
    }
  }

  function setHole(holeNumber: number, next: number) {
    setSave({ kind: 'idle' });
    setValues((prev) => {
      const copy = new Map(prev);
      copy.set(holeNumber, next);
      return copy;
    });
  }

  function onSave() {
    if (dirty.length === 0 || pending) return;
    const entries = dirty;
    startTransition(async () => {
      const res = await backfillPutts(gameId, entries);
      if (res.ok) {
        setSave({ kind: 'saved', count: res.updated });
        router.refresh();
      } else {
        setSave({ kind: 'error', code: res.code });
      }
    });
  }

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const v = values.get(r.holeNumber) ?? null;
            const holeName = t('holeName', { hole: r.holeNumber });
            return (
              <li key={r.holeNumber} className="px-5 py-4">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="font-sans text-sm font-medium text-text">
                    {holeName}
                  </span>
                  <span className="font-sans text-xs text-muted">
                    {t('holeAnchor', { par: r.par, strokes: r.strokes })}
                  </span>
                </div>
                <PuttsChips
                  value={v}
                  ariaName={holeName}
                  disabled={pending}
                  onSelect={(next) => setHole(r.holeNumber, next)}
                />
              </li>
            );
          })}
        </ul>
      </Card>

      {save.kind === 'saved' && (
        <Banner tone="success">{t('saved', { count: save.count })}</Banner>
      )}
      {save.kind === 'error' && (
        <Banner tone="error">
          {t(`errors.${save.code}` as Parameters<typeof t>[0])}
        </Banner>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={dirty.length === 0 || pending}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-primary px-[18px] py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t('saving') : t('saveButton', { count: dirty.length })}
      </button>
    </>
  );
}
