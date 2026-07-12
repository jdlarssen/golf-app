
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { LinkButton } from '@/components/ui/Button';

export type ClubCupRow = {
  id: string;
  name: string;
  status: string;
};

/**
 * «Klubbens cuper»-seksjonen på klubb-detaljsiden (#524, #480 Fase 2).
 *
 * Speiler ClubLeaguesSection: alle medlemmer ser lista (RLS «tournaments select
 * scoped» slipper medlemmer til klubb-scopede cuper). «Ny cup» vises kun for
 * klubb-eier/-admin og kun når klubben ikke er frossen; «Styr» fører til den
 * dedikerte klubb-flaten (ingen admin-chrome).
 *
 * Cup status labels reuse cup.status.* (byte-identical with the old local map).
 */
export function ClubCupsSection({
  cups,
  clubId,
  canCreate,
  canManage,
}: {
  cups: ClubCupRow[];
  clubId: string;
  /** Owner/admin and club not frozen → may set up a new cup. */
  canCreate: boolean;
  /** Owner/admin → may manage existing cups (generate/start/finish), even frozen. */
  canManage: boolean;
}) {
  const t = useTranslations('klubb.cups');
  const tCup = useTranslations('cup.status');

  // #1135: samme som ClubLeaguesSection — skjul den døde overskriften for
  // vanlige medlemmer i en klubb uten cuper. Admin (ikke frossen) beholder
  // tomtekst + «Ny cup».
  if (cups.length === 0 && !canCreate) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {t('heading')}
      </h2>
      {cups.length > 0 ? (
        <div className="space-y-2">
          {cups.map((cup) => (
            <Card key={cup.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <SmartLink
                  href={`/cup/${cup.id}`}
                  className="truncate font-sans text-[15px] font-medium text-text hover:underline"
                >
                  {cup.name}
                </SmartLink>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-border px-2.5 py-0.5 font-sans text-xs text-muted">
                    {tCup(`${cup.status}` as Parameters<typeof tCup>[0])}
                  </span>
                  {canManage && (
                    <SmartLink
                      href={`/klubber/${clubId}/cup/${cup.id}`}
                      className="min-h-[44px] flex items-center font-sans text-xs text-primary hover:underline"
                    >
                      {t('manageLink')}
                    </SmartLink>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p className="font-sans text-sm text-muted">{t('empty')}</p>
      )}
      {canCreate && (
        <div className="mt-3">
          <LinkButton href={`/klubber/${clubId}/cup/ny`} full>
            {t('newButton')}
          </LinkButton>
        </div>
      )}
    </section>
  );
}
