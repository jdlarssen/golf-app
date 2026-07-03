'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { GuestBadge } from '@/components/ui/GuestBadge';
import { togglePlayerPaid, remindUnpaidPlayers } from './actions';

export type BetalingPlayer = {
  userId: string;
  displayName: string;
  isGuest: boolean;
  paid: boolean;
  withdrawn: boolean;
};

/**
 * #1049: per-spiller betalt-avhuking i arrangørens betaling-cockpit.
 *
 * Optimistisk toggle — huker av lokalt umiddelbart, kaller togglePlayerPaid i
 * en transition, og ruller tilbake + viser en feiltekst hvis skrivingen feiler
 * (f.eks. 0-rad-skriv fordi spilleren trakk seg samtidig). Withdrawn spillere
 * vises dempet, men kan fortsatt hukes av (de kan ha betalt før de trakk seg).
 */
export function BetalingClient({
  gameId,
  players,
}: {
  gameId: string;
  players: BetalingPlayer[];
}) {
  const t = useTranslations('admin.game.betaling');
  const [pending, startTransition] = useTransition();
  const [reminding, startReminding] = useTransition();
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(false);
  const [remindedCount, setRemindedCount] = useState<number | null>(null);

  function isPaid(p: BetalingPlayer): boolean {
    return optimistic[p.userId] ?? p.paid;
  }

  const unpaidCount = players.filter((p) => !p.withdrawn && !isPaid(p)).length;

  function purre() {
    setRemindedCount(null);
    setError(false);
    startReminding(async () => {
      try {
        const r = await remindUnpaidPlayers(gameId);
        setRemindedCount(r.count);
      } catch (err) {
        console.error('[BetalingClient] purre failed', err);
        setError(true);
      }
    });
  }

  function toggle(p: BetalingPlayer) {
    const next = !isPaid(p);
    setOptimistic((o) => ({ ...o, [p.userId]: next }));
    setError(false);
    startTransition(async () => {
      try {
        await togglePlayerPaid(gameId, p.userId, next);
      } catch (err) {
        console.error('[BetalingClient] toggle failed', err);
        setOptimistic((o) => {
          const rest = { ...o };
          delete rest[p.userId];
          return rest;
        });
        setError(true);
      }
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-danger" role="alert">
          {t('toggleError')}
        </p>
      )}

      {unpaidCount > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={purre}
            disabled={reminding}
            className="min-h-[44px] w-full rounded-full border border-border bg-surface px-4 py-3 text-center text-sm font-medium tracking-tight text-text transition-colors hover:bg-primary-soft disabled:opacity-60"
          >
            {t('remindButton', { count: unpaidCount })}
          </button>
          {remindedCount !== null && (
            <p className="text-center text-xs text-success" role="status">
              {t('remindDone', { count: remindedCount })}
            </p>
          )}
        </div>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {players.map((p) => {
          const paid = isPaid(p);
          return (
            <li
              key={p.userId}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span
                className={`flex flex-wrap items-center gap-2 font-sans text-sm ${
                  p.withdrawn ? 'text-muted' : 'text-text'
                }`}
              >
                {p.displayName}
                {p.isGuest && <GuestBadge />}
                {p.withdrawn && (
                  <span className="text-xs text-muted">({t('withdrawn')})</span>
                )}
              </span>
              <label className="flex cursor-pointer items-center gap-2">
                <span
                  className={`font-sans text-xs tabular-nums ${
                    paid ? 'text-success' : 'text-muted'
                  }`}
                >
                  {paid ? t('paid') : t('unpaid')}
                </span>
                <input
                  type="checkbox"
                  checked={paid}
                  onChange={() => toggle(p)}
                  disabled={pending}
                  className="h-5 w-5 accent-primary"
                  aria-label={t('markPaidAria', { name: p.displayName })}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
