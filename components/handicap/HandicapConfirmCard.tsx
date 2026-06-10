import { useLocale } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Button, LinkButton } from '@/components/ui/Button';
import { formatNumber } from '@/lib/i18n/format';
import { formatRelativeNb } from '@/lib/format/relativeTimeNb';
import { confirmHandicap } from '@/app/[locale]/games/[id]/actions';

/**
 * Inline kort i scheduled-venterommet som ber spilleren bekrefte
 * handicapen før freeze. Vises kun når
 * `isHandicapStale(handicapUpdatedAt)` (se lib/handicap/staleness.ts).
 *
 * Layout: tittel + brødtekst med relativ tid, to knapper («Ja, stemmer»
 * og «Oppdater»). «Ja»-knappen er en server-action via <form>; «Oppdater»
 * lenker til /profile?next=/games/[id] så spilleren havner tilbake i
 * venterommet etter lagring.
 */
export function HandicapConfirmCard({
  gameId,
  hcpIndex,
  handicapUpdatedAt,
}: {
  gameId: string;
  hcpIndex: number;
  handicapUpdatedAt: string;
}) {
  const locale = useLocale();
  const hcpDisplay = formatNumber(hcpIndex, locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const relative = formatRelativeNb(handicapUpdatedAt);
  const confirmAction = confirmHandicap.bind(null, gameId);

  return (
    <Card className="mx-4 mb-4">
      <h2 className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
        Sjekk handicapen din
      </h2>
      <p className="mt-1.5 text-sm text-text">
        Handicapen din er{' '}
        <span className="tabular-nums font-medium">{hcpDisplay}</span>, sist
        oppdatert {relative}. Stemmer det?
      </p>
      <div className="mt-4 flex items-center gap-3">
        <form action={confirmAction}>
          <Button type="submit">Ja, stemmer</Button>
        </form>
        <LinkButton
          variant="secondary"
          href={`/profile?next=${encodeURIComponent(`/games/${gameId}`)}`}
        >
          Oppdater
        </LinkButton>
      </div>
    </Card>
  );
}
