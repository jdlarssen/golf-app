'use client';

import { useTranslations } from 'next-intl';
import { formatKr } from '@/lib/format/formatKr';
import type { Settlement } from '@/lib/scoring/settlement';

export interface SettlementPlayerInfo {
  name: string;
  nickname: string | null;
}

interface SettlementTableProps {
  settlement: Settlement;
  playersById: Map<string, SettlementPlayerInfo>;
}

/**
 * Pengeoppgjør (#937) på leaderboardet for veddemålsformatene. To deler:
 *  - Netto per spiller (pott-modell: (enheter − snitt) × kr), grønn = til gode,
 *    rød = skylder.
 *  - «Hvem betaler hvem» (grådig min-transaksjons-oppgjør).
 * Rendres av hver format-View når `settlement != null` (kr_per_unit > 0), både
 * live og når spillet er ferdig.
 */
export function SettlementTable({ settlement, playersById }: SettlementTableProps) {
  const t = useTranslations('leaderboard.common.settlement');
  const name = (userId: string) => {
    const info = playersById.get(userId);
    return info?.nickname || info?.name || userId;
  };

  return (
    <section className="space-y-3 rounded-md border border-border bg-surface px-4 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
        <span className="text-xs text-muted tabular-nums">
          {t('stake', { kr: settlement.krPerUnit, unit: settlement.unitLabel })}
        </span>
      </div>

      <ul className="space-y-1">
        {settlement.perPlayer.map((p) => (
          <li
            key={p.userId}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-foreground">{name(p.userId)}</span>
            <span
              className={`font-semibold tabular-nums ${
                p.netKr > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : p.netKr < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-muted'
              }`}
            >
              {p.netKr > 0 ? '+' : ''}
              {formatKr(p.netKr)}
            </span>
          </li>
        ))}
      </ul>

      {settlement.payments.length === 0 ? (
        <p className="text-xs text-muted">{t('empty')}</p>
      ) : (
        <ul className="space-y-1 border-t border-border pt-2">
          {settlement.payments.map((pay, i) => (
            <li
              key={`${pay.fromUserId}-${pay.toUserId}-${i}`}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-muted">
                {t('owes', {
                  from: name(pay.fromUserId),
                  to: name(pay.toUserId),
                })}
              </span>
              <span className="font-medium tabular-nums text-foreground">
                {formatKr(pay.kr)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
