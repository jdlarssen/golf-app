import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Button, LinkButton } from '@/components/ui/Button';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import { formatRelativeLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { confirmHandicap } from '@/app/[locale]/games/[id]/actions';

/**
 * Inline kort i scheduled-venterommet som ber spilleren bekrefte
 * handicapet før freeze. Vises kun når
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
  const t = useTranslations('game.home.handicapCard');
  const locale = useLocale() as AppLocale;
  const hcpDisplay = formatHcpDisplay(hcpIndex, locale);
  const relative = formatRelativeLocale(handicapUpdatedAt, locale);
  const confirmAction = confirmHandicap.bind(null, gameId);

  return (
    <Card className="mx-4 mb-4">
      <h2 className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
        {t('title')}
      </h2>
      <p className="mt-1.5 text-sm text-text">
        {t.rich('body', {
          hcp: hcpDisplay,
          relative,
          num: (chunks) => <span className="tabular-nums font-medium">{chunks}</span>,
        })}
      </p>
      <div className="mt-4 flex items-center gap-3">
        <form action={confirmAction}>
          <Button type="submit">{t('confirm')}</Button>
        </form>
        <LinkButton
          variant="secondary"
          href={`/profile?next=${encodeURIComponent(`/games/${gameId}`)}`}
        >
          {t('update')}
        </LinkButton>
      </div>
    </Card>
  );
}
