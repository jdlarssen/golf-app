import { Card } from '@/components/ui/Card';
import type { PuttsStats } from '@/lib/stats/puttsStats';

type Props = {
  stats: PuttsStats;
  heading: string;
  subtitle: string;
  /** Locale-formatert PPH (putter per hull, f.eks. «1,9») — alltid vist. */
  pphDisplay: string;
  pphLabel: string;
  /** Locale-formatert snitt (f.eks. «31,5») — kun brukt når stats kvalifiserer. */
  avgDisplay: string;
  avgLabel: string;
  bestLabel: string;
  roundsLabel: string;
  /**
   * Statuslinje under cellene når ingen komplett runde kvalifiserer ennå:
   * «nesten»-teksten (delvis førte runder) eller den generiske tom-teksten.
   */
  statusLabel: string;
};

/**
 * «Putte-snitt»-panelet (#939, #1290) — PPH (putter per hull, gate-fri) +
 * snitt/beste/runder når en hel runde kvalifiserer. Rent presentasjonelt;
 * tallene er regnet i `computePuttsStats`. PPH-cellen vises alltid (panelet
 * rendres kun når spilleren har ført minst én putt); snitt/beste/runder faller
 * bort til en statuslinje til en komplett 18-hulls-runde foreligger. Stat-
 * clusteret speiler `CoursePerformancePanel` så stats-fanen ser lik ut på tvers.
 */
export function PuttsStatPanel({
  stats,
  heading,
  subtitle,
  pphDisplay,
  pphLabel,
  avgDisplay,
  avgLabel,
  bestLabel,
  roundsLabel,
  statusLabel,
}: Props) {
  // #1290: skjul panelet helt for spillere som aldri har ført en putt —
  // frivillig statistikk skal ikke mase. Dataene er signalet, ikke
  // localStorage-bryteren (som ikke finnes server-side).
  if (stats.holesCounted === 0) return null;

  const hasQualifying = stats.roundsCounted > 0;
  return (
    <section className="space-y-3">
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="font-serif text-base font-medium text-text leading-snug">
            {heading}
          </h2>
          <p className="font-sans text-sm text-muted mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-4 border-t border-border px-5 py-3">
          <PuttsStatCell label={pphLabel} value={pphDisplay} />
          {hasQualifying && (
            <>
              <PuttsStatCell label={avgLabel} value={avgDisplay} />
              <PuttsStatCell label={bestLabel} value={stats.bestRoundPutts ?? 0} />
              <PuttsStatCell label={roundsLabel} value={stats.roundsCounted} />
            </>
          )}
        </div>
        {!hasQualifying && (
          <p className="border-t border-border px-5 py-4 font-sans text-sm text-muted leading-relaxed">
            {statusLabel}
          </p>
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
