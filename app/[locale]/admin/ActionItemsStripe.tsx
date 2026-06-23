import { getTranslations } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { getActionItemCounts } from '@/lib/admin/actionItems';

/**
 * «Krever handling»-stripe (#864): surfaces the two endGame finish-blockers —
 * uleverte scorekort (`ready_not_delivered`) og ventende peer-godkjenninger —
 * på tvers av alle aktive spill, som trykkbare rader. Egen Suspense-grense i
 * dashboardet. **Rendrer ingenting når begge tellingene er 0** så rolige dager
 * forblir rolige. Admin-gated (siden brancher på rolle før dette mountes).
 *
 * Deler `getActionItemCounts()` (cache()-wrappet) med Spill-tile-badgen, så de
 * to flatene koster én query-runde til sammen.
 */
export async function ActionItemsStripe() {
  const counts = await getActionItemCounts();
  const t = await getTranslations('admin.dashboard');

  const rows: { key: string; label: string; href: string }[] = [];

  if (counts.unsubmitted.length > 0) {
    rows.push({
      key: 'unsubmitted',
      label: t('actionItemsUnsubmitted', { count: counts.unsubmitted.length }),
      // count==1 → rett til det spesifikke spillets status-side; ellers
      // til den filtrerte spill-lista.
      href:
        counts.unsubmitted.length === 1
          ? `/admin/games/${counts.unsubmitted[0].gameId}/status`
          : '/admin/games?status=active',
    });
  }
  if (counts.pendingApproval.length > 0) {
    rows.push({
      key: 'pendingApproval',
      label: t('actionItemsPendingApproval', {
        count: counts.pendingApproval.length,
      }),
      href:
        counts.pendingApproval.length === 1
          ? `/admin/games/${counts.pendingApproval[0].gameId}/status`
          : '/admin/games?status=active',
    });
  }

  if (rows.length === 0) return null; // quiet days stay quiet

  return (
    <section className="mb-4">
      <p className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {t('actionItemsHeading')}
      </p>
      <div className="overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.05]">
        {rows.map((row, i) => (
          <SmartLink
            key={row.key}
            href={row.href}
            className={`flex min-h-[44px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
              i > 0 ? 'border-t border-accent/20' : ''
            }`}
          >
            <span className="text-[13px] font-medium text-text">{row.label}</span>
            <span aria-hidden className="shrink-0 text-muted">
              →
            </span>
          </SmartLink>
        ))}
      </div>
    </section>
  );
}
