import { Card } from '@/components/ui/Card';
import { MIN_STREAK_WEEKS, type StreakSummary } from '@/lib/stats/streak';

type Props = {
  /** Streak-tilstanden fra `computeStreak` (Type A). */
  summary: StreakSummary;
  heading: string;
  subtitle: string;
  /** «uker på rad» — vises ved siden av det store streak-tallet. */
  weeksLabel: string;
  /** Nøytral, positiv linje når ingen streak er pågående (aldri skam/press). */
  dormantLine: string;
  /** «{n} runder i {år}» — ferdig-interpolert ved kallstedet. */
  seasonText: string;
};

/**
 * «Serie» (#1194) — konsistens-seksjon i Statistikk-fanen. To tilstander, begge
 * POSITIVE: en pågående ukentlig streak (≥{@link MIN_STREAK_WEEKS} uker) feires
 * med et champagne-uthevet tall; ellers en varm, presset-fri linje om at serien
 * starter neste runde. Ingen nedtelling, ingen «du mister streaken» — et brudd er
 * en stille reset (`weeklyStreakActive === false`). Rent presentasjonelt; tallene
 * er regnet i `computeStreak`, strengene sendes inn ferdig oversatt.
 */
export function StreakPanel({
  summary,
  heading,
  subtitle,
  weeksLabel,
  dormantLine,
  seasonText,
}: Props) {
  const showStreak =
    summary.weeklyStreakActive && summary.weeklyStreak >= MIN_STREAK_WEEKS;

  return (
    <section>
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="font-serif text-base font-medium text-text leading-snug">
            {heading}
          </h2>
          <p className="font-sans text-sm text-muted mt-0.5">{subtitle}</p>
        </div>
        <div className="border-t border-border px-5 py-4">
          {showStreak ? (
            <div
              data-testid="streak-active"
              className="flex items-baseline gap-2"
            >
              <span aria-hidden className="text-2xl leading-none">
                🔥
              </span>
              <span className="font-serif text-3xl font-medium tabular-nums leading-none text-accent">
                {summary.weeklyStreak}
              </span>
              <span className="font-sans text-sm text-muted">{weeksLabel}</span>
            </div>
          ) : (
            <p
              data-testid="streak-dormant"
              className="font-sans text-sm text-muted leading-relaxed"
            >
              {dormantLine}
            </p>
          )}
          <p className="mt-2 font-sans text-sm text-text">{seasonText}</p>
        </div>
      </Card>
    </section>
  );
}
