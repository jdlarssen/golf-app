'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from '@/i18n/navigation';
import { localDb } from '@/lib/sync/db';
import { drainQueue } from '@/lib/sync/syncWorker';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  submitAction: () => void | Promise<void>;
  missingHoles: number;
};

/**
 * Wraps the final «Lever ✓» button in a confirm() guard. If the player has
 * unplayed holes, the confirm message warns that those will be recorded as
 * not played.
 *
 * #668: also drains the offline sync queue on mount and blocks the submit
 * while strokes are still queued. The review preview is server-rendered from
 * Postgres, so a stroke still sitting in Dexie shows up as a missing hole —
 * and if the player submits, RLS freezes their card and the queued write is
 * rejected and lost. Draining first pushes those strokes to the server while
 * the card is still un-frozen; once the queue empties we refresh so the
 * preview (and missing-hole count) reflects the now-synced holes. Quarantined
 * (abandonedAt) items are ignored here — they never drain, so blocking on them
 * would trap the player forever.
 */
export function SubmitForm({ submitAction, missingHoles }: Props) {
  const t = useTranslations('game.submit');
  const router = useRouter();

  const pendingCount =
    useLiveQuery(
      () => localDb.syncQueue.filter((i) => i.abandonedAt == null).count(),
      [],
    ) ?? 0;
  const syncing = pendingCount > 0;

  // Kick a drain as soon as the review screen mounts so any strokes entered
  // offline reach the server before the card can be frozen by submit.
  useEffect(() => {
    void drainQueue();
  }, []);

  // When the queue empties after having been non-empty, the server-rendered
  // preview is stale (computed before those strokes synced). Refresh so the
  // missing-hole count and scorecard reflect the now-synced state.
  const wasPending = useRef(false);
  useEffect(() => {
    if (syncing) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      router.refresh();
    }
  }, [syncing, router]);

  return (
    <form
      action={submitAction}
      onSubmit={(event) => {
        // Never submit while strokes are still syncing — they'd be frozen out.
        if (syncing) {
          event.preventDefault();
          return;
        }
        const base = t('confirmBase');
        const msg =
          missingHoles > 0
            ? `${base}\n\n${t('confirmMissing', { count: missingHoles })}`
            : base;
        if (!window.confirm(msg)) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton
        data-testid="submit-scorecard"
        className="w-full"
        pendingLabel={t('submitPending')}
        disabled={syncing}
      >
        {syncing ? t('syncingPending') : t('submitButton')}
      </SubmitButton>
    </form>
  );
}
