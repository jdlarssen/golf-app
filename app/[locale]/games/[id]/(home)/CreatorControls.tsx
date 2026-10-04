import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { SmartLink } from '@/components/ui/SmartLink';
import { type GameStatus } from '@/lib/games/status';
import { startScheduledGameAction } from '@/app/[locale]/admin/games/[id]/actions';
import { StartScheduledGameButton } from '@/app/[locale]/admin/games/[id]/StartScheduledGameButton';

/**
 * Arrangør-kontroll for spillets oppretter: Styr spillere, Start runden nå,
 * rediger + slett. Rediger og slett kun draft/scheduled — når runden har
 * startet er handicaps frosset og scores finnes, så spillet er effektivt låst
 * (sletting av active/finished er admin-only, eier-beslutning #428). Returnerer
 * null for finished, så den kan rendres ubetinget (gated på isCreator av
 * kalleren) i venterommet, hovedvisningen og arrangørvisningen.
 *
 * #2202: «Start runden nå» for scheduled. Utkast får ingen start (#1062).
 * Tekstene til knappen løses her på serveren: spillsiden har ikke
 * `admin`-namespacet på klienten (#2227).
 */
export function CreatorControls({
  gameId,
  status,
}: {
  gameId: string;
  status: GameStatus;
}) {
  const t = useTranslations('game.home');
  const tButtons = useTranslations('admin.game.buttons');
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
        {status === 'scheduled' && (
          <StartScheduledGameButton
            startAction={startScheduledGameAction.bind(null, gameId)}
            label={tButtons('startRoundNow')}
            confirmText={tButtons('startRoundConfirm')}
          />
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
