import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { LinkButton } from '@/components/ui/Button';

export type ClubLeagueRow = {
  id: string;
  name: string;
  status: string;
};

const LEAGUE_STATUS_LABELS: Record<string, string> = {
  draft: 'Utkast',
  active: 'Aktiv',
  finished: 'Avsluttet',
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
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        Klubbens ligaer
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
                    {LEAGUE_STATUS_LABELS[liga.status] ?? liga.status}
                  </span>
                  {canManage && (
                    <SmartLink
                      href={`/admin/liga/${liga.id}`}
                      className="min-h-[44px] flex items-center font-sans text-xs text-primary hover:underline"
                    >
                      Styr
                    </SmartLink>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p className="font-sans text-sm text-muted">Ingen ligaer i klubben ennå.</p>
      )}
      {canCreate && (
        <div className="mt-3">
          <LinkButton href={`/klubber/${clubId}/liga/ny`} full>
            Ny liga
          </LinkButton>
        </div>
      )}
    </section>
  );
}
