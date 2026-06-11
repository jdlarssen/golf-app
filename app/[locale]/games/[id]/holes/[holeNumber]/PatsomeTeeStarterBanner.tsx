'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { setPatsomeTeeStarter } from '../../patsomeActions';

/**
 * Velger hvem på Patsome-laget som teer ut i foursomes-segmentet (hull 13–18).
 * Vises på hull 13 når ingen er valgt ennå. Etter valg erstattes banneret av
 * `PatsomeTeeHint` som viser hvem som teer på hvert enkelt hull.
 *
 * Authz og lagring håndteres av `setPatsomeTeeStarter`-server-action.
 */
export function PatsomeTeeStarterBanner({
  gameId,
  teamNumber,
  options,
}: {
  gameId: string;
  teamNumber: number;
  /** Begge lagmedlemmene. Etiketten viser fornavn. */
  options: { userId: string; displayName: string }[];
}) {
  const t = useTranslations('holes.patsome');
  const [isPending, startTransition] = useTransition();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handlePick(userId: string) {
    setError(null);
    setPendingUserId(userId);
    startTransition(async () => {
      try {
        const res = await setPatsomeTeeStarter(gameId, teamNumber, userId);
        if (!res.ok) {
          const errKey = (res.error === 'unauthenticated' || res.error === 'wrong_team')
            ? res.error
            : 'unknown';
          setError(t(`teeStarterErrors.${errKey}` as Parameters<typeof t>[0]));
        }
      } finally {
        setPendingUserId(null);
      }
    });
  }

  return (
    <div className="mb-3 rounded-md border border-accent/40 bg-accent/5 px-3 py-3">
      <p className="mb-2 font-serif text-sm text-text">
        {t('teeStarterQuestion')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <Button
            key={o.userId}
            type="button"
            onClick={() => handlePick(o.userId)}
            pending={pendingUserId === o.userId}
            disabled={isPending}
            pendingLabel={t('teeStarterSelectPending')}
            className="min-h-[44px] rounded-md border border-border bg-surface px-3 py-2 text-center text-sm font-medium text-primary transition-colors hover:border-primary/40 disabled:opacity-60"
          >
            {o.displayName}
          </Button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

/**
 * Hint-chip per hull i foursomes-segmentet (13–18) etter at tee-starter er valgt.
 * Paritetssregelen er den samme som i foursomes matchplay:
 *  - Oddetallshull (13, 15, 17) → valgt tee-starter slår ut.
 *  - Partallshull (14, 16, 18) → makkeren slår ut.
 */
export function PatsomeTeeHint({
  holeNumber,
  teeStarterUserId,
  partners,
}: {
  holeNumber: number;
  teeStarterUserId: string;
  partners: { userId: string; displayName: string }[];
}) {
  const t = useTranslations('holes.patsome');
  const isOdd = holeNumber % 2 === 1;
  const targetId = isOdd
    ? teeStarterUserId
    : (partners.find((p) => p.userId !== teeStarterUserId)?.userId ??
      teeStarterUserId);
  const target = partners.find((p) => p.userId === targetId);
  if (!target) return null;

  return (
    <p className="mb-2 text-center text-xs text-muted">
      {t('teeHint', { name: target.displayName })}
    </p>
  );
}
