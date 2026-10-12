import { getTranslations } from 'next-intl/server';
import type { SignupCapacity as Capacity } from '@/lib/games/signupInbox';

const QUEUE_STRIPES =
  'repeating-linear-gradient(45deg, var(--warning) 0 4px, var(--warning-stripe) 4px 8px)';

/**
 * The status row, the capacity line and its legend (#2288): «8 av 12», those
 * who are in in forest green, the queue striped amber, and the numbers in
 * words under it. The line is decoration (`aria-hidden`); the legend carries
 * the numbers. Without a cap there is no line and no «ledig», just the count.
 * The counts come from `signupCapacity`/`inboxCounts` — no rules here.
 */
export async function SignupCapacity({
  statusLine,
  capacity,
  cap,
  rosterCount,
  queued,
}: {
  statusLine: string;
  capacity: Capacity | null;
  cap: number | null;
  rosterCount: number;
  queued: number;
}) {
  const t = await getTranslations('admin.game.signups');
  const withPct = capacity && cap ? Math.min((capacity.taken / cap) * 100, 100) : 0;
  const queuePct = capacity && cap ? Math.min((capacity.queued / cap) * 100, 100 - withPct) : 0;

  return (
    <div className="leading-[normal]">
      <div className="mt-[10px] flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted">{statusLine}</span>
        <span className="shrink-0 text-[13px] text-text">
          <span className="font-serif text-[18px] font-semibold">{rosterCount}</span>
          {capacity && cap !== null && <> {t('capacityOf', { cap })}</>}
        </span>
      </div>

      {capacity && (
        <div aria-hidden className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-meter-track">
          <span className="bg-primary" style={{ width: `${withPct}%` }} />
          <span style={{ width: `${queuePct}%`, background: QUEUE_STRIPES }} />
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap gap-x-[14px] text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px] bg-primary" />
          {t('legendWith', { count: rosterCount })}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px] bg-warning" />
          {t('legendWaiting', { count: queued })}
        </span>
        {capacity &&
          (capacity.over > 0 ? (
            <span className="text-warning-text">{t('legendOver', { count: capacity.over })}</span>
          ) : (
            <span>{t('legendFree', { count: capacity.free })}</span>
          ))}
      </div>
    </div>
  );
}
