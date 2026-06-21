import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { SmartLink } from '@/components/ui/SmartLink';
import { type GameStatus } from '@/lib/games/status';

/**
 * Arrangør-kontroll for spillets oppretter: rediger + slett. Kun draft/scheduled
 * — når runden har startet er handicaps frosset og scores finnes, så spillet er
 * effektivt låst (sletting av active/finished er admin-only, eier-beslutning
 * #428). Returnerer null for active/finished, så den kan rendres ubetinget
 * (gated på isCreator av kalleren) i både venterom- og hovedvisningen.
 */
export function CreatorControls({
  gameId,
  status,
}: {
  gameId: string;
  status: GameStatus;
}) {
  const t = useTranslations('game.home');
  // Pre-start: edit + delete the whole game. Roster management («Styr spillere»)
  // opens once registration is live and stays available through active play
  // (where it becomes withdraw + approval-override). Finished → nothing.
  const preStart = status === 'draft' || status === 'scheduled';
  const showRoster = status === 'scheduled' || status === 'active';
  if (!preStart && !showRoster) return null;
  return (
    <div className="pt-2">
      <Kicker tone="muted" className="mb-2">
        {t('arrangerSection')}
      </Kicker>
      <div className="space-y-2">
        {showRoster && (
          <SmartLink href={`/games/${gameId}/spillere`} className="block">
            <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
              <span className="text-base font-medium text-text">
                {t('managePlayersLink')}
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        )}
        {preStart && (
          <SmartLink href={`/games/${gameId}/rediger`} className="block">
            <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
              <span className="text-base font-medium text-text">
                {t('editGameLink')}
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        )}
        {preStart && (
          <SmartLink href={`/games/${gameId}/slett`} className="block">
            <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-danger/40">
              <span className="text-base font-medium text-danger">
                {t('deleteGameLink')}
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        )}
      </div>
    </div>
  );
}
