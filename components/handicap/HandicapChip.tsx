import { SmartLink } from '@/components/ui/SmartLink';
import { isHandicapStale } from '@/lib/handicap/staleness';

/**
 * Alltid-synlig handicap-chip på hjem-siden. Speil av spillerens master
 * `users.hcp_index`. Stale-tilstand (≥ 4 uker per `isHandicapStale`) gir
 * subtil champagne-accent-styling så spilleren oppdager passivt at
 * verdien er gammel.
 *
 * Tap → /profile?next={nextPath} så spilleren havner tilbake der de var
 * etter lagring. `nextPath` valideres med `safeNextPath` på mottaker-siden
 * (server-action i app/profile/actions.ts) — vi sender bare path-en
 * inn her.
 */
export function HandicapChip({
  hcpIndex,
  handicapUpdatedAt,
  nextPath,
}: {
  hcpIndex: number;
  handicapUpdatedAt: string;
  nextPath: string;
}) {
  const stale = isHandicapStale(handicapUpdatedAt);
  const hcpDisplay = hcpIndex.toLocaleString('nb-NO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const containerClasses = stale
    ? 'border-accent/60 bg-surface'
    : 'border-border bg-surface';
  const numberClasses = stale ? 'text-accent' : 'text-text';

  return (
    <SmartLink
      href={`/profile?next=${encodeURIComponent(nextPath)}`}
      aria-label={`Handicap ${hcpDisplay}. Trykk for å oppdatere.`}
      className={`inline-flex items-center gap-2 rounded-full border min-h-[44px] px-3.5 transition-colors hover:bg-primary-soft ${containerClasses}`}
    >
      <span className="font-sans text-[10px] uppercase tracking-[0.16em] text-muted">
        HCP
      </span>
      <span className={`font-serif text-[15px] tabular-nums ${numberClasses}`}>
        {hcpDisplay}
      </span>
    </SmartLink>
  );
}
