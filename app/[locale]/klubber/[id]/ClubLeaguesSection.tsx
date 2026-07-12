
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { LinkButton } from '@/components/ui/Button';

export type ClubLeagueRow = {
  id: string;
  name: string;
  status: string;
};

/**
 * «Klubbens ligaer»-seksjonen på klubb-detaljsiden (#480 Fase 1).
 *
 * Alle medlemmer ser lista (RLS slipper medlemmer til klubb-scopede ligaer).
 * «Ny liga»-knappen vises kun for klubb-eier/-admin og kun når klubben ikke er
 * frossen (utløpt avtale → ingen nye ligaer, speiler «Sett opp runde»).
 */
export function ClubLeaguesSection({
  leagues,
  clubId,
  canCreate,
  canManage,
}: {
  leagues: ClubLeagueRow[];
  clubId: string;
  /** Owner/admin and club not frozen → may set up a new league. */
  canCreate: boolean;
  /** Owner/admin → may manage existing leagues (start/finish/edit), even frozen. */
  canManage: boolean;
}) {
  const t = useTranslations('klubb.leagues');

  // #1135: skjul den døde overskriften for vanlige medlemmer i en klubb uten
  // ligaer. En som verken kan opprette (canCreate) eller se noen liste har
  // ingenting å hente her. Admin (ikke frossen) beholder tomtekst + «Ny liga».
  if (leagues.length === 0 && !canCreate) return null;

  return (
    <section className="mb-8" data-testid="club-leagues-section">
      <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {t('heading')}
      </h2>
      {leagues.length > 0 ? (
        <div className="space-y-2">
          {leagues.map((liga) => (
            <Card key={liga.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <SmartLink
                  href={`/liga/${liga.id}`}
                  className="truncate font-sans text-[15px] font-medium text-text hover:underline"
                >
                  {liga.name}
                </SmartLink>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-border px-2.5 py-0.5 font-sans text-xs text-muted">
                    {t(`status.${liga.status}` as Parameters<typeof t>[0])}
                  </span>
                  {canManage && (
                    <SmartLink
                      href={`/klubber/${clubId}/liga/${liga.id}`}
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
          <LinkButton href={`/klubber/${clubId}/liga/ny`} full>
            {t('newButton')}
          </LinkButton>
        </div>
      )}
    </section>
  );
}
