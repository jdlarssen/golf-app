import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { SocialProofLine } from '@/components/games/SocialProofLine';

/**
 * Kontekstkort over kodeskjemaet på `/login?invite=<token>` (#1169):
 * en invitert spiller skal se hva de blir med på FØR kode-veggen
 * (resiprositet — mønsteret fra `PublicLandingView`). Ren presentasjons-
 * komponent: all data kommer ferdig formatert som props, så Type C-testen
 * slipper Supabase/route-mocks. Props-settet ER felt-whitelisten — kortet
 * kan aldri vise roster, premier, e-poster eller handicap.
 *
 * #1193: den besøkende er UAUTENTISERT her, så kortet får kun et aggregert
 * `joinedCount` — aldri venne-navn (samme grense som antallet den offentlige
 * plakaten alt viser). Navn-signalet er forbeholdt innloggede flater.
 */
export function InviteContextCard({
  inviterName,
  gameName,
  modeLabel,
  courseName,
  teeOff,
  expiresLine,
  joinedCount,
}: {
  inviterName: string | null;
  gameName: string;
  modeLabel: string | null;
  courseName: string | null;
  teeOff: string | null;
  /**
   * Ferdig-formulert frist-linje (#1179 — mild tap-aversjon), f.eks.
   * «Invitasjonen din utløper om 3 dager». Page-en velger tier og copy;
   * kortet er ren presentasjon, så `null` → ingen linje.
   */
  expiresLine: string | null;
  /**
   * #1193: aggregert antall påmeldte (ekskl. ingen — den besøkende er ikke
   * påmeldt ennå). Kun et tall, aldri navn, siden besøkeren er anonym. `null`
   * eller 0 → ingen sosialt-bevis-linje.
   */
  joinedCount: number | null;
}) {
  const t = useTranslations('auth.inviteCard');

  return (
    <div className="mb-4" data-testid="invite-context-card">
      <Card>
        <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
          {inviterName
            ? t('invitedBy', { name: inviterName })
            : t('invitedByFallback')}
        </p>
        <h2 className="mt-1 font-serif text-[22px] font-medium leading-snug tracking-[-0.015em] text-text">
          {gameName}
        </h2>
        <dl className="mt-3 space-y-1 font-sans text-sm text-text">
          {modeLabel && (
            <div className="flex gap-2">
              <dt className="text-muted">{t('formatLabel')}</dt>
              <dd>{modeLabel}</dd>
            </div>
          )}
          {courseName && (
            <div className="flex gap-2">
              <dt className="text-muted">{t('courseLabel')}</dt>
              <dd>{courseName}</dd>
            </div>
          )}
          {teeOff && (
            <div className="flex gap-2">
              <dt className="text-muted">{t('teeOffLabel')}</dt>
              <dd>{teeOff}</dd>
            </div>
          )}
        </dl>
        {expiresLine && (
          <p
            className="mt-3 font-sans text-sm text-muted"
            data-testid="invite-expiry"
          >
            {expiresLine}
          </p>
        )}
        {/* #1193: aggregert-bare sosialt bevis — anonym besøkende får aldri
            venne-navn (tom navneliste sikrer det strukturelt); 0 → ingenting. */}
        <SocialProofLine
          joinedCount={joinedCount ?? 0}
          knownFriendNames={[]}
          knownFriendOverflow={0}
          className="mt-3"
        />
      </Card>
    </div>
  );
}
