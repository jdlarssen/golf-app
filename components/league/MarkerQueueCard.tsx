import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';

export type MarkerQueueRow = {
  key: string;
  href: string;
  playerName: string;
  roundLabel: string;
  /** The organiser's list also says whose answer the card waits for. */
  waitsFor?: string;
};

/**
 * #2661: the cards in a simulator league that wait for an answer, at the top
 * of the league page. The marker sees «Venter på deg som markør»; the league's
 * organiser sees the cards that wait for any marker, since they may approve
 * in the marker's stead. One row per card, linking to the marker's page.
 */
export function MarkerQueueCard({
  heading,
  reviewLabel,
  rows,
  testId,
}: {
  heading: string;
  reviewLabel: string;
  rows: MarkerQueueRow[];
  testId: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-8" data-testid={testId}>
      <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {heading}
      </h2>
      <Card className="overflow-hidden p-0">
        <ul>
          {rows.map((row, i) => (
            <li key={row.key} className={i > 0 ? 'border-t border-border' : undefined}>
              <SmartLink
                href={row.href}
                className="flex min-h-[44px] items-center gap-3 px-4 py-3 transition-colors hover:bg-primary-soft/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans text-sm font-medium text-text">{row.playerName}</span>
                  <span className="block truncate text-xs text-muted">
                    {row.waitsFor ? `${row.roundLabel} · ${row.waitsFor}` : row.roundLabel}
                  </span>
                </span>
                <span className="shrink-0 font-sans text-sm font-medium text-primary">{reviewLabel}</span>
                <span aria-hidden className="shrink-0 text-muted">
                  ›
                </span>
              </SmartLink>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
