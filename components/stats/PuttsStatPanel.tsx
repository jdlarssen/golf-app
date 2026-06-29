import { Card } from '@/components/ui/Card';
import type { PuttsStats } from '@/lib/stats/puttsStats';

type Props = {
  stats: PuttsStats;
  heading: string;
  subtitle: string;
  /** Locale-formatert snitt (f.eks. «31,5») — kun brukt når stats kvalifiserer. */
  avgDisplay: string;
  avgLabel: string;
  bestLabel: string;
  roundsLabel: string;
  emptyLabel: string;
};

/**
 * «Putte-snitt»-panelet (#939) — snitt putter per komplett runde + beste runde +
 * antall runder talt. Rent presentasjonelt; tallene er regnet i
 * `computePuttsStats`. Tom-tilstand når spilleren ennå ikke har ført putter på
 * en hel runde. Stat-clusteret speiler `CoursePerformancePanel` så stats-fanen
 * ser lik ut på tvers.
 */
export function PuttsStatPanel({
  stats,
  heading,
  subtitle,
  avgDisplay,
  avgLabel,
  bestLabel,
  roundsLabel,
  emptyLabel,
}: Props) {
  return (
    <section className="space-y-3">
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="font-serif text-base font-medium text-text leading-snug">
            {heading}
          </h2>
          <p className="font-sans text-sm text-muted mt-0.5">{subtitle}</p>
        </div>
        {stats.roundsCounted === 0 ? (
          <p className="border-t border-border px-5 py-4 font-sans text-sm text-muted leading-relaxed">
            {emptyLabel}
          </p>
        ) : (
          <div className="flex items-center justify-end gap-4 border-t border-border px-5 py-3">
            <PuttsStatCell label={avgLabel} value={avgDisplay} />
            <PuttsStatCell label={bestLabel} value={stats.bestRoundPutts ?? 0} />
            <PuttsStatCell label={roundsLabel} value={stats.roundsCounted} />
          </div>
        )}
      </Card>
    </section>
  );
}

function PuttsStatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-right">
      <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-muted leading-none mb-1">
        {label}
      </p>
      <p className="font-sans tabular-nums text-base font-semibold text-text leading-none">
        {value}
      </p>
    </div>
  );
}
