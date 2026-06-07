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
}: {
  leagues: ClubLeagueRow[];
  clubId: string;
  canCreate: boolean;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        Klubbens ligaer
      </h2>
      {leagues.length > 0 ? (
        <div className="space-y-2">
          {leagues.map((liga) => (
            <SmartLink key={liga.id} href={`/liga/${liga.id}`} className="block">
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-sans text-[15px] font-medium text-text">
                    {liga.name}
                  </span>
                  <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 font-sans text-xs text-muted">
                    {LEAGUE_STATUS_LABELS[liga.status] ?? liga.status}
                  </span>
                </div>
              </Card>
            </SmartLink>
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
