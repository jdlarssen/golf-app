import { useTranslations } from 'next-intl';

/**
 * Statisk regelpåminnelse for Chapman matchplay (#290), vist øverst på hver
 * hull-side. Rent presentasjonskomponent — ingen logikk, ingen API-kall, ingen
 * animasjon (reduced-motion-trygt). Chapman (også kjent som Pinehurst) har en
 * mer involvert sekvens enn vanlig alternate shot, så stripa minner flighten på
 * de fire fasene midt i runden. Appen sporer ikke slag, så teksten er ren
 * veiledning — ikke noe komponenten regner ut.
 */
export function ChapmanPhaseReminder() {
  const t = useTranslations('holes.chapman');
  return (
    <div
      data-testid="chapman-phase-reminder"
      className="mb-3 rounded-md border border-border bg-bg/60 px-3 py-2.5"
    >
      <span className="font-serif text-sm font-semibold text-primary">
        {t('reminderTitle')}
      </span>
      <p className="mt-0.5 text-xs text-muted">
        {t('reminderText')}
      </p>
    </div>
  );
}
