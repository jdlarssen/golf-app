'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { setFoursomesTeeStarter } from '../../foursomesActions';

/**
 * Banner som vises på hull 1 i en foursomes-match når sidens tee-starter
 * ikke er valgt ennå. Flighten klikker på navnet til den som teer ut først,
 * verdien persisterer for resten av runden (driver hint-chip per hull
 * deretter).
 *
 * Authz og lagring i `setFoursomesTeeStarter`-server-actionen.
 */
export function FoursomesTeeStarterBanner({
  gameId,
  sideNumber,
  options,
}: {
  gameId: string;
  sideNumber: 1 | 2;
  /**
   * Begge partnere på siden. Etiketten viser fornavn — server-action setter
   * den valgte `userId` på riktig kolonne.
   */
  options: { userId: string; displayName: string }[];
}) {
  const t = useTranslations('holes.foursomes');
  const [isPending, startTransition] = useTransition();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handlePick(userId: string) {
    setError(null);
    setPendingUserId(userId);
    startTransition(async () => {
      try {
        const res = await setFoursomesTeeStarter(gameId, sideNumber, userId);
        if (!res.ok) {
          const errKey = (res.error === 'unauthenticated' || res.error === 'wrong_side')
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
 * Hint-chip som vises per hull etter at tee-starter er valgt. Viser hvilken
 * partner som teer på det gjeldende hullet:
 *  - Odd-hull (1, 3, 5, ...) → tee-starter
 *  - Even-hull (2, 4, 6, ...) → den andre partneren
 *
 * Foursomes-tradisjon: tee-rotasjonen er fast hele runden, så valget på hull
 * 1 driver hintet på alle hull. Hintet er ren UI — Tørny validerer ikke
 * faktiske slag.
 */
export function FoursomesTeeHint({
  holeNumber,
  teeStarterUserId,
  partners,
}: {
  holeNumber: number;
  teeStarterUserId: string;
  partners: { userId: string; displayName: string }[];
}) {
  const t = useTranslations('holes.foursomes');
  const isOdd = holeNumber % 2 === 1;
  const targetId = isOdd
    ? teeStarterUserId
    : partners.find((p) => p.userId !== teeStarterUserId)?.userId ??
      teeStarterUserId;
  const target = partners.find((p) => p.userId === targetId);
  if (!target) return null;

  return (
    <p className="mb-2 text-center text-xs text-muted">
      {t('teeHint', { name: target.displayName })}
    </p>
  );
}
