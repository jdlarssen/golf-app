import { getTranslations } from 'next-intl/server';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatKr } from '@/lib/format/formatKr';

/**
 * #1049: kompakt betaling-telle-kort på admin-spillsiden. Vises kun når spillet
 * har en startkontingent (`entryFeeKr > 0`). Speiler `/signups`-IA-en: et kort
 * med telling → egen underside (`/betaling`) der arrangøren huker av og purrer.
 * Tellingen regnes ut hos caller fra den allerede hentede players-fetchen —
 * ingen ny round-trip her.
 */
export async function BetalingOverviewSection({
  gameId,
  entryFeeKr,
  paidCount,
  totalCount,
}: {
  gameId: string;
  entryFeeKr: number;
  paidCount: number;
  totalCount: number;
}) {
  const t = await getTranslations('admin.game.betaling');

  return (
    <section className="mt-1.5">
      <MiniRibbon>{t('sectionLabel')}</MiniRibbon>
      <div
        className="overflow-hidden rounded-xl border border-border bg-surface"
        style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
      >
        <div className="space-y-3 px-3.5 pb-3.5 pt-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                {t('feeLabel')}
              </p>
              <p className="mt-0.5 font-serif text-[15px] tabular-nums text-text">
                {formatKr(entryFeeKr)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                {t('paidLabel')}
              </p>
              <p className="mt-0.5 font-serif text-[20px] font-medium tabular-nums text-text">
                {paidCount} / {totalCount}
              </p>
            </div>
          </div>

          <SmartLink
            href={`/admin/games/${gameId}/betaling`}
            className="block min-h-[44px] rounded-full border border-border bg-surface px-4 py-3 text-center text-sm font-medium tracking-tight text-text transition-colors hover:bg-primary-soft"
          >
            {t('viewAll')}
          </SmartLink>
        </div>
      </div>
    </section>
  );
}
