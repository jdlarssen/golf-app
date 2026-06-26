import { SmartLink } from '@/components/ui/SmartLink';

type Props = {
  /** Lenke til spillets resultatliste (med `?from=` så «Tilbake» lander her). */
  href: string;
  /** Kort dato («21. jun»), ankeret i raden. */
  dateLabel: string | null;
  /** Banenavn til under-linja (ofte gjentatt → sekundært). */
  courseName: string | null;
  formatLabel: string;
  /** Ferdig-rendret utfallstekst (#572), inkl. 🥇 for seier. `null` = ingen. */
  resultText: string | null;
  /** True → gull-accent på utfallsteksten (egen seier). */
  resultIsWin: boolean;
  /** Total brutto — hero-tallet. `null` (uten scorer) → «—». */
  brutto: number | null;
  /** Ferdig-rendret netto-etikett («77 netto»), eller `null`. */
  nettoLabel: string | null;
};

/**
 * Én kompakt, trykkbar rad i «Runder»-fanen (#962) — hele raden lenker til
 * resultatlista (ingen egen fot-lenke). Brutto er hero-tallet, netto lite under;
 * dato + utfall ankrer venstre side, bane · spillform er den dempede under-linja.
 *
 * Rent presentasjonelt: kallstedet gjør all i18n/formatering og sender inn
 * strenger (samme mønster som `CoursePerformancePanel`). Rendres som delte rader
 * i ett `Card`, ikke som frittstående kort.
 */
export function GameHistoryRow({
  href,
  dateLabel,
  courseName,
  formatLabel,
  resultText,
  resultIsWin,
  brutto,
  nettoLabel,
}: Props) {
  const subline = [courseName, formatLabel].filter(Boolean).join(' · ');

  return (
    <SmartLink
      href={href}
      className="flex min-h-[44px] items-center gap-3 px-5 py-3 transition-colors hover:bg-bg/50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 font-sans text-sm leading-snug">
          {dateLabel && (
            <span className="font-medium text-text capitalize">{dateLabel}</span>
          )}
          {resultText && (
            <span
              className={
                resultIsWin
                  ? 'font-medium text-accent'
                  : 'text-[13px] text-muted'
              }
            >
              {resultIsWin ? resultText : `· ${resultText}`}
            </span>
          )}
        </div>
        {subline && (
          <p className="mt-0.5 truncate font-sans text-xs text-muted">{subline}</p>
        )}
      </div>

      <div className="shrink-0 text-right leading-tight">
        <p className="font-sans text-lg font-semibold tabular-nums text-text">
          {brutto != null ? brutto : '—'}
        </p>
        {nettoLabel && (
          <p className="font-sans text-[11px] tabular-nums text-muted">
            {nettoLabel}
          </p>
        )}
      </div>

      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className="shrink-0 text-muted"
      >
        <path
          d="M6 3l5 5-5 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </SmartLink>
  );
}
