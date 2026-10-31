import { useLocale, useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import { isHandicapStale } from '@/lib/handicap/staleness';

/**
 * Alltid-synlig profil-pille på hjem-siden: «{navn} · HCP 12,0». Speil av
 * spillerens master `users.hcp_index`. Stale-tilstand (≥ 4 uker per
 * `isHandicapStale`) gir subtil champagne-accent-styling så spilleren oppdager
 * passivt at verdien er gammel. Uten handicap står bare fornavnet, så
 * profilen aldri blir uten dør.
 *
 * Tap → /profile?next={nextPath} så spilleren havner tilbake der de var
 * etter lagring. `nextPath` valideres med `safeInternalPath` på mottaker-siden
 * (server-action i app/profile/actions.ts) — vi sender bare path-en
 * inn her.
 */
export function HandicapChip({
  name,
  hcpIndex,
  handicapUpdatedAt,
  nextPath,
}: {
  name: string;
  hcpIndex?: number | null;
  handicapUpdatedAt?: string | null;
  nextPath: string;
}) {
  const t = useTranslations('home');
  const locale = useLocale();
  const href = `/profile?next=${encodeURIComponent(nextPath)}`;
  const nameEl = (
    <span className="font-sans text-[13px] font-medium text-text truncate max-w-[7rem]">
      {name}
    </span>
  );

  // Samme regel som før: pillen viser handicapet bare når både tall og dato
  // finnes. Ellers er den en ren profil-lenke med navnet.
  if (hcpIndex == null || !handicapUpdatedAt) {
    return (
      <SmartLink
        href={href}
        aria-label={t('profileChipAria', { name })}
        className="inline-flex items-center rounded-full border border-border bg-surface min-h-[44px] px-3.5 transition-colors hover:bg-primary-soft"
      >
        {nameEl}
      </SmartLink>
    );
  }

  const stale = isHandicapStale(handicapUpdatedAt);
  const hcpDisplay = formatHcpDisplay(hcpIndex, locale);

  const containerClasses = stale
    ? 'border-accent/60 bg-surface'
    : 'border-border bg-surface';
  // Ringen er dekor (--accent), tallet er info → tekst-tokenen (#1374).
  const numberClasses = stale ? 'text-accent-text' : 'text-text';

  return (
    <SmartLink
      href={href}
      aria-label={t('handicapChipAria', { hcp: hcpDisplay })}
      className={`inline-flex items-center gap-2 rounded-full border min-h-[44px] px-3.5 transition-colors hover:bg-primary-soft ${containerClasses}`}
    >
      {nameEl}
      <span aria-hidden className="text-muted">
        ·
      </span>
      <span className="font-sans text-xs font-semibold text-muted">
        HCP
      </span>
      <span className={`font-serif text-[15px] tabular-nums ${numberClasses}`}>
        {hcpDisplay}
      </span>
    </SmartLink>
  );
}
